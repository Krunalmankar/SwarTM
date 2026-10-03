import { expect, test } from '@playwright/test';
import {
  allPages,
  clippedText,
  collectErrors,
  horizontalProblems,
  overlappingText,
  scrollLikeAReader,
  slug,
  textLinesOffScreen,
} from './helpers';

/**
 * Visits every page on every device project like a reader: loads it, scrolls to
 * the bottom, and checks what a visitor would notice.
 */
for (const path of allPages()) {
  test(`page ${path} loads and reads cleanly`, async ({ page }, testInfo) => {
    const errors = collectErrors(page);

    const response = await page.goto(path);
    expect(response?.status(), 'HTTP status').toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toBeVisible();

    // Header fits on one line on every device.
    const navHeight = await page.locator('.nav').evaluate((el) => el.getBoundingClientRect().height);
    expect(navHeight, 'header height').toBeLessThan(90);

    await scrollLikeAReader(page);

    // Every entrance animation finished in its final state, wherever the scroll stopped.
    const pending = await page.$$eval('[data-reveal-pending]', (els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.tagName.toLowerCase()}.${el.className.split(' ').slice(0, 3).join('.')} top=${Math.round(r.top + scrollY)} h=${Math.round(r.height)}`;
      }),
    );
    expect(pending, 'elements still waiting to reveal').toEqual([]);
    const unfinished = await page.$$eval('.in-view, .layer', (els) =>
      els
        .filter((el) => {
          const cs = getComputedStyle(el);
          return cs.opacity !== '1' || cs.transform !== 'none';
        })
        .map((el) => el.className),
    );
    expect(unfinished, 'sections not fully shown').toEqual([]);

    // Timeline bars: fully drawn, true pill shape, inside their track.
    const bars = await page.$$eval('.phase__bar', (els) =>
      els.map((el) => {
        const bar = el.getBoundingClientRect();
        const track = el.parentElement!.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          drawn: !cs.clipPath.includes('100%'),
          pill: cs.borderTopLeftRadius === '9999px' && bar.height === 8,
          inside: bar.left >= track.left - 0.5 && bar.right <= track.right + 0.5 && bar.width > 0,
        };
      }),
    );
    for (const bar of bars) expect(bar).toEqual({ drawn: true, pill: true, inside: true });

    // All images loaded (lazy ones included, after scrolling).
    const brokenImages = await page.$$eval('img', (imgs) =>
      imgs.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.currentSrc || img.src),
    );
    expect(brokenImages, 'images that failed to load').toEqual([]);

    // Measure from the top: once scrolled, the sticky header sits over content by design.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    expect(await horizontalProblems(page), 'content outside the screen').toEqual([]);
    expect(await clippedText(page), 'cut-off text').toEqual([]);
    expect(await textLinesOffScreen(page), 'text lines running off the screen').toEqual([]);
    expect(await overlappingText(page), 'text overlapping other text').toEqual([]);
    expect(errors, 'console errors / CSP violations').toEqual([]);

    // Full-page screenshot in its final state, for visual review.
    await page.screenshot({
      path: `test-results/screens/${testInfo.project.name}/${slug(path)}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  });
}

test('unknown URL shows the 404 page with status 404', async ({ page }) => {
  const errors = collectErrors(page, [/404 \(Not Found\)/]);
  const response = await page.goto('/this-page-does-not-exist/');
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText(/doesn.t exist/);
  await expect(page.getByRole('link', { name: /home page/i })).toBeVisible();
  expect(errors).toEqual([]);
});
