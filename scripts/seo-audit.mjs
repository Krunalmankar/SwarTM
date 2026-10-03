#!/usr/bin/env node
/**
 * SEO / metadata audit of the build. Prints a table and fails on hard errors.
 *   node scripts/seo-audit.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dist = 'dist';
const walk = (d) =>
  readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const pages = walk(dist).filter((f) => f.endsWith('.html'));
const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
const meta = (html, attr, name) =>
  decode(html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1] ?? '');

const sitemap = readFileSync(join(dist, 'sitemap-0.xml'), 'utf8');
const inSitemap = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname));
const errors = [];
const warnings = [];
const titles = new Map();
const descriptions = new Map();

console.log('page'.padEnd(34), 'title'.padEnd(5), 'desc'.padEnd(5), 'h1', 'json-ld types');
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const path =
    '/' +
    relative(dist, file)
      .split(sep)
      .join('/')
      .replace(/index\.html$/, '')
      .replace(/\.html$/, '/');
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
  const description = meta(html, 'name', 'description');
  const noindex = /<meta name="robots" content="noindex/.test(html);
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? '';
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  const types = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]);
      for (const item of [data].flat()) types.push(item['@type']);
    } catch {
      errors.push(`${path}: invalid JSON-LD`);
    }
  }
  console.log(
    path.padEnd(34),
    String(title.length).padEnd(5),
    String(description.length).padEnd(5),
    String(h1).padEnd(2),
    types.join(', '),
  );

  if (path === '/404/') continue;
  if (title.length > 60)
    warnings.push(`${path}: title ${title.length} chars (search results show ~60): "${title}"`);
  if (description.length < 70 || description.length > 160)
    warnings.push(`${path}: description ${description.length} chars (aim 70–160)`);
  if (!noindex) {
    if (titles.has(title)) errors.push(`${path}: duplicate title with ${titles.get(title)}`);
    if (descriptions.has(description))
      errors.push(`${path}: duplicate description with ${descriptions.get(description)}`);
    titles.set(title, path);
    descriptions.set(description, path);
    if (!inSitemap.has(path)) errors.push(`${path}: indexable page missing from sitemap`);
    if (!canonical.endsWith(path)) errors.push(`${path}: canonical ${canonical} does not match`);
  } else if (inSitemap.has(path)) {
    errors.push(`${path}: noindex page is in the sitemap`);
  }
  for (const [attr, name] of [
    ['property', 'og:title'],
    ['property', 'og:description'],
    ['property', 'og:image'],
    ['property', 'og:url'],
    ['name', 'twitter:card'],
  ]) {
    if (!meta(html, attr, name)) errors.push(`${path}: missing ${name}`);
  }
}

for (const w of warnings) console.warn('⚠', w);
for (const e of errors) console.error('✖', e);
console.log(errors.length ? `\n${errors.length} SEO error(s)` : '\n✔ SEO audit passed');
process.exitCode = errors.length ? 1 : 0;
