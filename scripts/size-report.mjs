#!/usr/bin/env node
/**
 * Page-weight report for the static build: what each page downloads on first
 * visit (HTML + CSS + JS + images + fonts), raw and gzip-compressed.
 *
 *   node scripts/size-report.mjs [distDir]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = process.argv[2] ?? 'dist';
const BUDGET_KB = 200; // compressed first-visit budget per page (excluding fonts loaded on demand)

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const gz = (buf) => gzipSync(buf, { level: 9 }).length;
const kb = (n) => (n / 1024).toFixed(1).padStart(7);
const textTypes = new Set(['.html', '.css', '.js', '.svg', '.xml', '.txt', '.json']);

function assetSize(path) {
  const buf = readFileSync(path);
  const compressed = textTypes.has(extname(path)) ? gz(buf) : buf.length;
  return { raw: buf.length, gz: compressed };
}

const pages = walk(dist).filter((f) => f.endsWith('.html'));
const rows = [];
let failed = false;

for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const refs = new Set();
  for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) refs.add(m[1]);
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) refs.add(m[1]);
  // Only the 1x candidate of each image (what a typical phone/laptop downloads).
  for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) refs.add(m[1]);
  // Preloaded fonts are fetched on every first visit.
  for (const m of html.matchAll(/<link[^>]+rel="preload"[^>]+href="([^"]+\.woff2)"/g)) refs.add(m[1]);

  const totals = { css: 0, js: 0, img: 0, font: 0 };
  const htmlSize = assetSize(page);
  let gzTotal = htmlSize.gz;
  for (const ref of refs) {
    if (!ref.startsWith('/')) continue;
    const file = join(dist, ref);
    if (!existsSync(file)) continue;
    const size = assetSize(file);
    const kind = ref.endsWith('.css')
      ? 'css'
      : ref.endsWith('.js')
        ? 'js'
        : ref.endsWith('.woff2')
          ? 'font'
          : 'img';
    totals[kind] += size.gz;
    gzTotal += size.gz;
  }

  // CSS may also import further CSS chunks; count them too.
  const name = relative(dist, page).split(sep).join('/');
  rows.push({ name, html: htmlSize.gz, ...totals, total: gzTotal, requests: refs.size + 1 });
  if (gzTotal / 1024 > BUDGET_KB) failed = true;
}

// Fonts: what a page using all weights would fetch (latin only).
const fonts = walk(dist).filter((f) => /\.(woff2?)$/.test(f));
const fontBytes = fonts.reduce((sum, f) => sum + statSync(f).size, 0);

console.log('\nPage weight in KB (gzip; first visit; HTML includes inlined CSS)\n');
console.log('page'.padEnd(42) + '   html     css      js     img    font   total  reqs');
for (const r of rows.sort((a, b) => b.total - a.total)) {
  console.log(
    r.name.padEnd(42) +
      [r.html, r.css, r.js, r.img, r.font, r.total].map(kb).join(' ') +
      String(r.requests).padStart(6),
  );
}
console.log(`\nFont files in build: ${fonts.length} (${(fontBytes / 1024).toFixed(1)} KB on disk)`);
console.log(`Budget: ${BUDGET_KB} KB per page → ${failed ? 'OVER BUDGET' : 'within budget'}`);
process.exitCode = failed ? 1 : 0;
