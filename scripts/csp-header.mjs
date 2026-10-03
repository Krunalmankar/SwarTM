#!/usr/bin/env node
/**
 * Copies the CSP hashes Astro generated (one <meta> per page) into the HTTP
 * Content-Security-Policy header in dist/.htaccess and dist/web.config, so the
 * server sends one strict policy that allows exactly this build's inline code.
 *
 * Runs automatically as part of `npm run build`.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const SCRIPT = '__CSP_SCRIPT_HASHES__';
const STYLE = '__CSP_STYLE_HASHES__';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const scriptHashes = new Set();
const styleHashes = new Set();

for (const file of walk(dist).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(file, 'utf8');
  const meta = html.match(/<meta http-equiv="content-security-policy" content="([^"]+)"/i);
  if (!meta) throw new Error(`No CSP <meta> in ${file}. Is security.csp enabled in astro.config.mjs?`);
  for (const directive of meta[1].split(';')) {
    const [name, ...sources] = directive.trim().split(/\s+/);
    const target = name === 'script-src' ? scriptHashes : name === 'style-src' ? styleHashes : null;
    if (!target) continue;
    for (const source of sources) if (source.startsWith("'sha")) target.add(source);
  }
}

const scriptList = [...scriptHashes].sort().join(' ');
const styleList = [...styleHashes].sort().join(' ');

for (const name of ['.htaccess', 'web.config']) {
  const path = join(dist, name);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, 'utf8');
  if (!text.includes(SCRIPT) || !text.includes(STYLE)) {
    throw new Error(`${name} has no ${SCRIPT}/${STYLE} placeholders in its Content-Security-Policy.`);
  }
  writeFileSync(path, text.replaceAll(SCRIPT, scriptList).replaceAll(STYLE, styleList));
}

console.log(
  `✔ CSP header updated: ${scriptHashes.size} script hash(es), ${styleHashes.size} style hash(es).`,
);
