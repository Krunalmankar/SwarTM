#!/usr/bin/env node
/**
 * Production-like static server for dist/ (used by the end-to-end tests and for
 * local checks). Mirrors public/.htaccess: CSP read from dist/.htaccess, security
 * headers, gzip, cache headers, directory index and the 404 page. No PHP.
 *
 *   node scripts/serve-dist.mjs              → http://localhost:4173 (this computer only)
 *   HOST=0.0.0.0 node scripts/serve-dist.mjs → also reachable from phones on the same Wi-Fi
 *   --open                                   → open the site in the default browser
 * If PORT is not set and 4173 is busy, the next free port is used.
 */
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const root = resolve(args.find((a) => !a.startsWith('--')) ?? 'dist');
const openBrowser = args.includes('--open') && !process.env.SWARTM_NO_OPEN;
const fixedPort = process.env.PORT !== undefined;
let port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? 'localhost';

if (!existsSync(join(root, 'index.html'))) {
  console.error(`No build found in ${root}. Run "npm run build" first.`);
  process.exit(1);
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const compressible = new Set(['.html', '.css', '.js', '.json', '.webmanifest', '.xml', '.txt', '.svg']);

function csp() {
  const file = join(root, '.htaccess');
  const match = existsSync(file) && readFileSync(file, 'utf8').match(/Content-Security-Policy "([^"]+)"/);
  // upgrade-insecure-requests would break plain-http localhost.
  return match ? match[1].replace(/;\s*upgrade-insecure-requests/, '') : "default-src 'self'";
}

function resolveFile(urlPath) {
  let path = decodeURIComponent(urlPath.split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) return { status: 403 };
  if (existsSync(file) && statSync(file).isFile()) return { status: 200, file };
  if (existsSync(join(file, 'index.html'))) return { status: 301, location: `${urlPath}/` };
  return { status: 404, file: join(root, '404.html') };
}

const server = createServer((req, res) => {
  const { status, file, location } = resolveFile(req.url ?? '/');
  const headers = {
    'Content-Security-Policy': csp(),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
  if (status === 301) {
    res.writeHead(301, { ...headers, Location: location });
    return res.end();
  }
  if (!file) {
    res.writeHead(status, headers);
    return res.end();
  }
  const ext = extname(file);
  let body = readFileSync(file);
  headers['Content-Type'] = types[ext] ?? 'application/octet-stream';
  headers['Cache-Control'] = req.url?.startsWith('/_astro/')
    ? 'public, max-age=31536000, immutable'
    : ext === '.html'
      ? 'no-cache'
      : 'public, max-age=2592000';
  if (compressible.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
    body = gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
});

function open(url) {
  const [cmd, cmdArgs] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).unref();
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && !fixedPort && port < 4183) {
    console.log(`Port ${port} is busy, trying ${port + 1}...`);
    port += 1;
    server.listen(port, host);
    return;
  }
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\nPort ${port} is already in use. Close the other preview window, or set a different PORT.`,
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.on('listening', () => {
  const url = `http://localhost:${port}/`;
  console.log(`\nSwarTM site (production build) is running:`);
  console.log(`  On this computer:  ${url}`);
  if (host === '0.0.0.0') {
    const lan = Object.values(networkInterfaces())
      .flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal)
      .map((n) => n.address);
    for (const ip of lan) console.log(`  On your phone/tablet (same Wi-Fi):  http://${ip}:${port}/`);
    if (!lan.length) console.log('  (No Wi-Fi/network connection found for phone access.)');
  }
  console.log(`\nKeep this window open while testing. Press Ctrl+C to stop.\n`);
  if (openBrowser) open(url);
});

server.listen(port, host);
