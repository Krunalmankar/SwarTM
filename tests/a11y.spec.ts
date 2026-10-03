import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { allPages, scrollLikeAReader } from './helpers';

/**
 * Automated accessibility audit (axe-core) against WCAG 2.0/2.1/2.2 A and AA,
 * on every page, after scrolling so every section is in its final state.
 * Runs on one phone and one laptop size to keep the suite fast.
 */
const AUDIT_PROJECTS = ['phone-360-GalaxyS8', 'laptop-1366'];

for (const path of [...allPages(), '/this-page-does-not-exist/']) {
  test(`accessibility (WCAG 2.2 AA) ${path}`, async ({ page }, testInfo) => {
    test.skip(!AUDIT_PROJECTS.includes(testInfo.project.name), 'audit runs on one phone and one laptop');
    await page.goto(path);
    await scrollLikeAReader(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();

    const problems = results.violations.map(
      (v) =>
        `${v.impact}: ${v.id} – ${v.help} (${v.nodes.length}×) e.g. ${v.nodes[0]?.target.join(' ')} ${v.nodes[0]?.failureSummary?.split('\n')[1] ?? ''}`,
    );
    expect(problems).toEqual([]);
  });
}

/**
 * Keyboard focus must be clearly visible everywhere (WCAG 2.4.7 / 2.4.11 / 1.4.11):
 * tabs through the whole page and checks each focus outline has at least 3:1
 * contrast against the background it is drawn on.
 */
for (const path of allPages()) {
  test(`focus outline visible on every control ${path}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop-1366', 'keyboard audit runs on the laptop size');
    await page.goto(path);
    await scrollLikeAReader(page);
    await page.evaluate(() => window.scrollTo(0, 0));

    const failures = new Set<string>();
    for (let i = 0; i < 200; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        // Stop once focus wraps back to an element already visited.
        if (el.dataset.focusAudited) return 'wrapped' as const;
        el.dataset.focusAudited = '1';
        const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
        const lum = ([r, g, b]: number[]) => {
          const f = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
        };
        // Background behind the outline: first opaque background of the parents.
        let bg = [255, 255, 255];
        for (let p: HTMLElement | null = el.parentElement; p; p = p.parentElement) {
          const c = parse(getComputedStyle(p).backgroundColor);
          if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) {
            bg = c.slice(0, 3);
            break;
          }
        }
        const cs = getComputedStyle(el);
        const outline = parse(cs.outlineColor).slice(0, 3);
        const [l1, l2] = [lum(outline), lum(bg)].sort((a, b) => b - a);
        return {
          visible: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2,
          contrast: (l1! + 0.05) / (l2! + 0.05),
          label: `${el.tagName.toLowerCase()} "${el.textContent?.trim().slice(0, 30)}"`,
        };
      });
      if (!info) continue;
      if (info === 'wrapped') break;
      if (!info.visible) failures.add(`${info.label}: no focus outline`);
      else if (info.contrast < 3)
        failures.add(`${info.label}: focus outline contrast ${info.contrast.toFixed(2)}:1`);
    }
    expect([...failures]).toEqual([]);
  });
}
