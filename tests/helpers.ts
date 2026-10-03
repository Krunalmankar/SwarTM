import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

/** Every indexable page (from the built sitemap) plus the noindex utility pages. */
export function allPages(): string[] {
  const sitemap = readFileSync('dist/sitemap-0.xml', 'utf8');
  const fromSitemap = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  return [...new Set([...fromSitemap, '/thank-you/', '/form-error/'])];
}

export const slug = (path: string) => path.replace(/^\/|\/$/g, '').replace(/\//g, '_') || 'home';

/** Records console errors and uncaught exceptions (CSP violations show up here). */
export function collectErrors(page: Page, ignore: RegExp[] = []): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !ignore.some((re) => re.test(msg.text()))) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/** Scrolls down the page in reader-sized steps, then waits for entrance animations to finish. */
export async function scrollLikeAReader(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const step = Math.round(window.innerHeight * 0.6);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await pause(150);
    }
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    await pause(150);
  });
  // Longest entrance: 0.36s delay + 1.1s timeline bar.
  await page.waitForTimeout(1800);
}

/** Elements that end up outside the viewport horizontally (ignores decorative, aria-hidden art). */
export async function horizontalProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const problems: string[] = [];
    if (document.documentElement.scrollWidth > vw + 1) {
      problems.push(`page scrolls sideways: ${document.documentElement.scrollWidth}px > ${vw}px`);
    }
    for (const el of document.querySelectorAll<HTMLElement>('main *, header *, footer *')) {
      if (el.closest('[aria-hidden="true"], .visually-hidden, .hp-field, .skip-link, .spec-list')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      // Clipped inside an overflow:hidden parent is fine only for decorative shapes.
      if (rect.right > vw + 1 || rect.left < -1) {
        problems.push(
          `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} spans ${Math.round(rect.left)}–${Math.round(rect.right)}px`,
        );
      }
    }
    return problems.slice(0, 5);
  });
}

/** Text that is cut off inside its own box (overflowing a fixed width/height). */
export async function clippedText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      'main h1, main h2, main h3, main p, main a, main button, main span, main li, header a, footer a',
    )) {
      if (el.closest('[aria-hidden="true"], .visually-hidden, .hp-field')) continue;
      if (!el.textContent?.trim() || !el.offsetParent) continue;
      // Containers that deliberately clip decorative shapes are not text boxes.
      const hasPositionedChild = [...el.querySelectorAll('*')].some((c) =>
        ['absolute', 'fixed'].includes(getComputedStyle(c).position),
      );
      if (hasPositionedChild) continue;
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'visible') {
        out.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}"`);
      }
    }
    return out.slice(0, 5);
  });
}

/**
 * Every rendered line of visible text must sit inside the screen. Measures the
 * actual line boxes, so it also catches text hidden by overflow clipping.
 */
export async function textLinesOffScreen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !node.textContent?.trim()) continue;
      if (el.closest('.visually-hidden, .spec-list, .hp-field, .skip-link, script, style')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
          out.push(
            `"${node.textContent.trim().slice(0, 30)}" line at ${Math.round(r.left)}–${Math.round(r.right)}px (screen ${vw}px)`,
          );
          break;
        }
      }
    }
    return out.slice(0, 5);
  });
}

/**
 * Pieces of visible text (including decorative labels) that overlap each other.
 * Compares the rendered text boxes of different elements.
 */
export async function overlappingText(page: Page, scope = 'body'): Promise<string[]> {
  return page.evaluate((scopeSelector) => {
    const root = document.querySelector(scopeSelector) ?? document.body;
    const boxes: { el: Element; r: DOMRect; text: string }[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !node.textContent?.trim()) continue;
      if (el.closest('.visually-hidden, .spec-list, .hp-field, .skip-link, script, style, option')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width > 1 && r.height > 1) boxes.push({ el, r, text: node.textContent.trim().slice(0, 24) });
      }
    }
    const out: string[] = [];
    const shrink = 2; // ignore sub-pixel touching
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if (a.el === b.el) continue;
        const overlapX = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const overlapY = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (overlapX > shrink && overlapY > shrink) out.push(`"${a.text}" overlaps "${b.text}"`);
      }
    }
    return out.slice(0, 5);
  }, scope);
}
