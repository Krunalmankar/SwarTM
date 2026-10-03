# SwarTM website

Marketing site for SwarTM (ServiceNow AI transformation), built with **Astro + TypeScript** and hosted on **GoDaddy**.

- **Fast and secure by design.** Every page is pre-rendered to static HTML, so there is no server-side code on public pages and nothing to exploit. A strict Content-Security-Policy allows only this site's own files plus inline code whose SHA-256 hash it lists.
- **Light.** About 60–80 KB per page on a first visit (compressed, fonts included) in 5–8 requests. Lighthouse: 100 in every category on desktop; mobile Performance 98–100 and 100 for Accessibility, Best Practices and SEO.
- **Content-driven.** Services, case studies and insights are data files. To add a page, add a file; you never edit HTML.
- **Forms that work everywhere.** The contact and newsletter forms post to small, hardened PHP endpoints on the same host. They work with or without JavaScript.

## Quick start

Requires Node.js 22.12+ (see `.nvmrc`).

```bash
npm install
cp .env.example .env      # then set SITE_URL to the live domain
npm run dev               # http://localhost:4321
```

| Command           | What it does                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`     | Local dev server with hot reload                                                                                                                                              |
| `npm run build`   | Type-check, build to `dist/`, fill the CSP hashes, then run the quality gate, HTML validation (html-validate), SEO audit and page-weight budget. Any failure stops the build. |
| `npm run preview` | Serve the production build locally                                                                                                                                            |
| `npm run check`   | TypeScript and Astro diagnostics                                                                                                                                              |
| `npm run verify`  | Re-run the quality gate, HTML validation and SEO audit on `dist/`                                                                                                             |
| `npm run size`    | Page-weight report (fails above 200 KB per page)                                                                                                                              |
| `npm run format`  | Format the code with Prettier                                                                                                                                                 |

The forms need PHP, so in `npm run dev` / `preview` they show an error. Test them on the live host (see below).

## Test it on your laptop

**Easiest:** double-click `preview-site.cmd` in File Explorer. It builds the site, starts it and opens it in your browser (http://localhost:4173, or the next free port if that one is busy). The server sends the same security headers as GoDaddy. Close the window, or press Ctrl+C, to stop.

**From a terminal in the project folder**, type it with `.\` in front. This works in both Command Prompt and PowerShell, and is required in PowerShell and in terminals opened inside the Claude app:

```
.\preview-site.cmd
.\preview-site.cmd phone
```

**From a terminal:** `npm run build` then `npm run serve`, then open http://localhost:4173. (On this laptop Node.js is a portable install. If `npm` is not found in PowerShell, first run `$env:Path = "$env:LOCALAPPDATA\Programs\nodejs;$env:Path"`.)

**What to try:**

1. Click through every page from the header and footer.
2. Scroll each page to the bottom. Every section should fade in fully, and the timeline bars on the service pages should draw to their full length.
3. Phone and tablet sizes: press F12, then Ctrl+Shift+M (device toolbar), and pick e.g. iPhone SE, Pixel 7 or iPad. Reload after switching. Open and close the ☰ menu, and check the page never scrolls sideways.
4. Insights: click the topic filters. Contact: submit the form empty, then with a bad email. Fields should be highlighted; sending only works on the live host (needs PHP).
5. Keyboard: press Tab from the top of a page. "Skip to content" should appear and every focused item should show an outline.

**On your real phone or tablet (same Wi-Fi, or the laptop on the phone's hotspot):** run `.\preview-site.cmd phone` (or set `HOST=0.0.0.0` before `npm run serve`). The window prints an address like `http://192.168.0.115:4173/`; open it on the phone. If Windows asks whether Node.js may use the network, allow **Private networks** only.

**Automated checks:**

| Command                                          | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:e2e`                               | Every page on 11 emulated devices (iPhone SE 320, Galaxy S8 360, iPhone 15 393, Pixel 7 412, iPhone landscape, Galaxy Tab, iPad, iPad Pro landscape, 1366/1920/2560 px). Checks: page loads, scrolls like a reader, sideways overflow, every text line inside the screen, overlapping text, cut-off text, images, animations finishing, timeline bars, About diagram labels, hero pills clear of the logo, console/CSP errors, menu, filters, forms, keyboard, reduced motion, no-JavaScript, sticky header and jump links. Plus an axe-core accessibility audit (WCAG 2.2 AA + best practices) of every page on a phone and a laptop, and a keyboard audit that tabs through every page checking each focus outline is visible (3:1 contrast). Full-page screenshots go to `test-results/screens/`. |
| `npx playwright show-report test-results/report` | Opens the results in the browser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `npx lighthouse http://localhost:4173/ --view`   | Google Lighthouse score for a page (server must be running)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Project structure

```
src/
  config/site.ts            Site identity, navigation, form endpoints, booking link
  config/insights.ts        Insight topics (filters)
  content.config.ts         Content schemas (validated at build time)
  content/
    services/*.yaml         One file per service → /services/<file-name>/
    case-studies/*.yaml     One file per case study
    insights/*.md           One file per article → /insights/<file-name>/
  components/
    layout/                 Header, Footer
    sections/               Page hero, CTA band, timeline, status pages
    forms/                  Contact + newsletter forms
    ui/                     Icon set, buttons, eyebrow labels, lists
  layouts/BaseLayout.astro  <head>, SEO, JSON-LD, skip link
  pages/                    Routes
  styles/tokens.css         Brand design tokens (colours, type, spacing)
  styles/global.css         Base styles, layout utilities, shared components
public/
  .htaccess                 HTTPS, security headers, caching, compression (Apache)
  web.config                Same for Windows/IIS hosting (only if your plan is Windows)
  api/*.php                 Form endpoints
deploy/
  swartm-config.sample.php  Server-side form settings (goes OUTSIDE public_html)
scripts/verify-build.mjs    Post-build checks: CSP safety, links, SEO, required files
```

## Editing content

- **Add a service:** copy a file in `src/content/services/` and edit it. Its page, home-page card, footer link, contact-form option and place in the "How our practices build on each other" diagram (`stack.level`) all appear automatically. If a required field is missing, the build fails with a clear message.
- **Service illustration:** add `src/components/illustrations/<service-file-name>.svg` to show artwork beside "Our approach". Animate it with the `iso-*` classes, never `style="..."` attributes, which the security policy blocks and the build rejects.
- **Add a case study:** add a YAML file to `src/content/case-studies/`. `order` sets the position. The optional `flow` field adds a step-by-step diagram (see `vm-reconciliation.yaml`).
- **Publish an article:** write Markdown in the matching file in `src/content/insights/`, then set `status: published` and `publishDate: 2026-10-15`. Reading time is calculated automatically. Until an article is published, its card shows "Coming soon" and has no link.
- **Add an insight topic:** add it to `src/config/insights.ts`. The Insights filters update automatically.
- **Change colours or fonts:** edit `src/styles/tokens.css` only.

## Deploying to GoDaddy (cPanel)

### One-time server setup

1. **PHP version:** in cPanel, open _Select PHP Version_ or _MultiPHP Manager_ and choose **PHP 8.1 or newer** with the `mbstring` extension.
2. **Mailboxes:** in _Email Accounts_, create the sender address (e.g. `website@your-domain.com`) and make sure the receiving mailbox exists.
3. **Form config:** copy `deploy/swartm-config.sample.php` to `swartm-config.php`, fill in every value (including a new random `ip_salt`), and upload it to your **home folder, one level above `public_html`**. It must not be inside `public_html`.
4. **SSL:** make sure the free GoDaddy/cPanel SSL certificate is active. The site forces HTTPS and sends HSTS.
5. **Canonical host (optional):** in `public/.htaccess`, uncomment the two lines that redirect the bare domain to `www` and set your domain.

### Each release

1. Set `SITE_URL` in `.env` to the live domain, e.g. `https://www.swartm.com`.
2. Run `npm run build`. It must finish with `✔ Build verified`.
3. Upload the **contents** of `dist/` into `public_html` with the cPanel File Manager (zip, upload, extract) or FTP. The upload must include the hidden `.htaccess` files.
4. Smoke-test: open the site, send a test enquiry and a test newsletter sign-up, then check the mailbox.

An optional GitHub Actions workflow (`.github/workflows/deploy.yml`) can build and upload automatically over FTPS once the code is in a GitHub repository.

## Security overview

| Area           | Measure                                                                                                                                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport      | Forced HTTPS, HSTS (1 year)                                                                                                                                                                                                                                                      |
| Browser policy | CSP `default-src 'self'`; inline styles/scripts allowed only by SHA-256 hash (generated by Astro, copied into the header by `scripts/csp-header.mjs`); no `style=""` attributes or inline handlers; `frame-ancestors 'none'`, nosniff, strict referrer, Permissions-Policy, COOP |
| Third parties  | None. Fonts are self-hosted; no analytics, trackers or CDNs                                                                                                                                                                                                                      |
| Forms          | Same-origin check (Origin/Referer), honeypot, timing check, per-IP rate limit with a salted hash, strict server-side validation and length limits, header-injection-safe email, no error details exposed                                                                         |
| Secrets        | Server config lives outside the web root; `.env` and config are git-ignored; dotfiles and source files are blocked by `.htaccess`                                                                                                                                                |
| Data           | Newsletter list stored outside the web root, with CSV formula-injection protection; rate-limit data is deleted after 24 hours                                                                                                                                                    |
| Build          | `scripts/verify-build.mjs` fails the build if any page would violate the CSP, has broken links or lacks SEO basics                                                                                                                                                               |

## Performance and device support

| Area          | What is done                                                                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First paint   | Each page's CSS is inlined in the HTML (no render-blocking stylesheet requests). JavaScript is one small deferred module per page (~0.5 KB compressed).                                                                     |
| Fonts         | Self-hosted, Latin subset, WOFF2 only: one variable Montserrat file (all weights) plus Cinzel. The two fonts used above the fold are preloaded. Fallback fonts are metric-matched (Capsize) to keep layout shift near zero. |
| Images        | Astro converts images to WebP at build time and serves responsive `srcset`s. The main image is loaded eagerly with high priority; the rest are lazy-loaded.                                                                 |
| Caching       | Fingerprinted files in `/_astro/` are cached for a year (`immutable`); HTML always revalidates. Gzip via `.htaccess`.                                                                                                       |
| Motion        | Animations use `transform`/`opacity` (GPU-composited). Never-ending decorative animations pause while off screen (`src/scripts/motion.ts`), and all motion stops for visitors who prefer reduced motion.                    |
| Screens       | Fluid layout from 320 px phones to 2560 px monitors. The menu button is used below 1024 px (phones and tablets), the full navigation from 1024 px up. Tested at 23 widths with no horizontal scrolling.                     |
| Touch         | Touch targets are at least 24 px (most 44 px or more). Hover lift effects apply only on devices that can hover, so nothing "sticks" after a tap.                                                                            |
| Accessibility | Semantic landmarks and headings, a skip link, visible focus rings, labelled forms with inline errors, `aria-current` navigation, and a text alternative for every diagram. Lighthouse Accessibility is 100 on every page.   |
| Budget        | `npm run build` fails if any page goes over 200 KB compressed on first visit (`scripts/size-report.mjs`).                                                                                                                   |

## Before launch checklist

- [ ] `SITE_URL` set to the real domain
- [ ] `swartm-config.php` uploaded above `public_html` with real values
- [ ] Test enquiry and newsletter sign-up received
- [ ] Privacy notice (`src/pages/privacy.astro`): bracketed placeholders filled in and wording reviewed
- [ ] Optional: `PUBLIC_BOOKING_URL` set for the "Book a call" button
- [ ] Submit `https://<domain>/sitemap-index.xml` in Google Search Console
