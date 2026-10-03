#!/usr/bin/env node
/**
 * Post-build quality gate. Fails (exit 1) when the static build would break the
 * Content-Security-Policy, SEO basics or internal links.
 *
 *   node scripts/verify-build.mjs [distDir]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

const dist = process.argv[2] ?? 'dist';
const errors = [];
const warnings = [];

if (!existsSync(dist)) {
  console.error(`✖ ${dist}/ not found. Run "npm run build" first.`);
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(dist);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const rel = (f) => relative(dist, f).split(sep).join('/');

// Files the server needs.
for (const required of [
  '.htaccess',
  'api/.htaccess',
  'api/_bootstrap.php',
  'api/contact.php',
  'api/subscribe.php',
  '404.html',
  'robots.txt',
  'sitemap-index.xml',
]) {
  if (!existsSync(join(dist, required))) errors.push(`missing required file: ${required}`);
}

// Secrets must never be in the web root.
for (const f of files) {
  if (/swartm-config\.php$|\.env($|\.)/.test(f)) errors.push(`secret/config file in build output: ${rel(f)}`);
}

// The CSP the server will send (filled in by scripts/csp-header.mjs).
const htaccess = existsSync(join(dist, '.htaccess')) ? readFileSync(join(dist, '.htaccess'), 'utf8') : '';
const headerCsp = htaccess.match(/Content-Security-Policy "([^"]+)"/)?.[1] ?? '';
if (!headerCsp) errors.push('.htaccess: no Content-Security-Policy header');
if (/__CSP_[A-Z_]+__/.test(htaccess))
  errors.push('.htaccess: CSP hash placeholders not filled in (run scripts/csp-header.mjs)');
const webConfig = existsSync(join(dist, 'web.config')) ? readFileSync(join(dist, 'web.config'), 'utf8') : '';
if (/__CSP_[A-Z_]+__/.test(webConfig)) errors.push('web.config: CSP hash placeholders not filled in');

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('base64');

function resolves(href) {
  const clean = decodeURI(href.split('#')[0].split('?')[0]);
  if (clean === '' || clean === '/') return existsSync(join(dist, 'index.html'));
  const target = join(dist, clean);
  if (clean.endsWith('/')) return existsSync(join(target, 'index.html'));
  return existsSync(target) || existsSync(join(target, 'index.html'));
}

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const name = rel(file);

  // CSP: every inline <script>/<style> must be allowed by hash in the server header.
  // (JSON-LD blocks are data, not script, so CSP does not apply to them.)
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/type=["']application\/ld\+json["']/i.test(attrs) || /\bsrc=/i.test(attrs)) continue;
    if (!headerCsp.includes(`'sha256-${sha256(m[2])}'`))
      errors.push(`${name}: inline <script> not in CSP header`);
  }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (!headerCsp.includes(`'sha256-${sha256(m[1])}'`))
      errors.push(`${name}: inline <style> not in CSP header`);
  }
  // Hashes cannot allow these, so they must never appear.
  if (/\sstyle=["']/i.test(html)) errors.push(`${name}: style="" attribute (blocked by CSP)`);
  if (/\son[a-z]+=["']/i.test(html)) errors.push(`${name}: inline event handler (blocked by CSP)`);
  const external = [
    ...html.matchAll(/<(?!link rel="canonical")[^>]*\s(?:src|href)=["'](https?:\/\/[^"']+)["']/gi),
  ].map((x) => x[1]);
  if (external.length) warnings.push(`${name}: external URLs ${[...new Set(external)].join(', ')}`);

  // SEO basics.
  const isNoindex = /<meta name="robots" content="noindex/i.test(html);
  if (!/<title>[^<]{5,}<\/title>/i.test(html)) errors.push(`${name}: missing <title>`);
  if (!/<meta name="description" content="[^"]{30,}"/i.test(html))
    errors.push(`${name}: missing/short meta description`);
  if (!/<link rel="canonical"/i.test(html)) errors.push(`${name}: missing canonical link`);
  const h1s = (html.match(/<h1[\s>]/gi) ?? []).length;
  if (h1s !== 1) errors.push(`${name}: expected exactly one <h1>, found ${h1s}`);
  if (!/<html lang="/i.test(html)) errors.push(`${name}: missing <html lang>`);

  // Accessibility basics.
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    // A bare `alt` attribute is the same as alt="" (decorative image).
    if (!/\salt(?:=|[\s/>])/i.test(m[0])) errors.push(`${name}: <img> without alt`);
  }

  // Internal links and assets must resolve.
  for (const m of html.matchAll(/\s(?:href|src)=["'](\/[^"']*)["']/gi)) {
    const href = m[1];
    if (href.startsWith('//') || href.startsWith('/api/')) continue;
    if (!resolves(href)) errors.push(`${name}: broken internal link ${href}`);
  }
  for (const m of html.matchAll(/\ssrcset=["']([^"']+)["']/gi)) {
    for (const candidate of m[1].split(',')) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url.startsWith('/') && !resolves(url)) errors.push(`${name}: broken srcset ${url}`);
    }
  }

  if (/\[[A-Z][A-Z ]{3,}\]/.test(html) && !isNoindex) {
    warnings.push(`${name}: contains [PLACEHOLDER] text to fill in before launch`);
  }
}

for (const w of warnings) console.warn(`⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`✖ ${e}`);
  console.error(`\nBuild verification failed with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(`✔ Build verified: ${htmlFiles.length} pages, CSP-safe, links and SEO basics OK.`);
