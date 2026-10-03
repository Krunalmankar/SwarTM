// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import sitemap from '@astrojs/sitemap';

const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const SITE_URL = env.SITE_URL;

if (!SITE_URL || !/^https:\/\/[^/]+$/.test(SITE_URL)) {
  throw new Error(
    'SITE_URL must be set to the live origin, e.g. SITE_URL=https://www.example.com (no trailing slash). See .env.example.',
  );
}

// Pages that should never appear in search results or the sitemap.
const NOINDEX = ['/thank-you/', '/form-error/', '/404/'];

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // Inline each page's CSS: no render-blocking stylesheet requests, so the
    // first paint needs only the HTML. Every inline block is hashed into the CSP.
    inlineStylesheets: 'always',
    assets: '_astro',
  },
  security: {
    // Emits a per-page CSP <meta> with SHA-256 hashes of every inline script and
    // style. scripts/csp-header.mjs copies the hashes into the HTTP header too.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self'",
        "font-src 'self'",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "manifest-src 'self'",
      ],
    },
  },
  markdown: {
    // Shiki highlighting writes inline style="" attributes, which the CSP blocks.
    syntaxHighlight: false,
  },
  vite: {
    build: {
      // Never turn assets into data: URIs (keeps img-src/font-src strict and files cacheable).
      assetsInlineLimit: 0,
    },
  },
  devToolbar: { enabled: false },
  integrations: [
    sitemap({
      filter: (page) => !NOINDEX.some((path) => page.endsWith(path)),
    }),
  ],
});
