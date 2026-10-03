import { expect, test } from '@playwright/test';
import { allPages, collectErrors, overlappingText } from './helpers';

/** What a visitor does: navigate, open the menu, filter, fill in forms, use the keyboard. */

test('header navigation works for this screen size', async ({ page }) => {
  await page.goto('/');
  const toggle = page.locator('[data-nav-toggle]');
  const links = page.locator('.nav__link');
  const width = page.viewportSize()!.width;

  if (width < 1024) {
    // Phones and tablets: menu button.
    await expect(toggle).toBeVisible();
    await expect(links.first()).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(links).toHaveCount(5);
    for (const link of await links.all()) await expect(link).toBeVisible();
    await expect(page.locator('.nav__cta')).toBeVisible();

    // Escape closes it and returns focus to the button.
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();

    // Tapping a link navigates.
    await toggle.click();
    await page.getByRole('link', { name: 'Case studies' }).first().click();
    await expect(page).toHaveURL(/\/case-studies\/$/);
    await expect(page.locator('h1')).toContainText('agentic workflows');
  } else {
    // Laptops and desktops: full navigation, no menu button.
    await expect(toggle).toBeHidden();
    for (const link of await links.all()) await expect(link).toBeVisible();
    await page.getByRole('link', { name: 'About', exact: true }).first().click();
    await expect(page).toHaveURL(/\/about\/$/);
    await expect(page.locator('.nav__link[aria-current="page"]')).toHaveText('About');
  }
});

test('header stays reachable while scrolling, and the open menu fits the screen', async ({ page }) => {
  await page.goto('/services/servicenow-ai/');
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'instant' }));
  await page.waitForTimeout(300);
  const top = await page.locator('.site-header').evaluate((el) => el.getBoundingClientRect().top);
  expect(top, 'header pinned to the top').toBe(0);

  const toggle = page.locator('[data-nav-toggle]');
  if (await toggle.isVisible()) {
    await toggle.click();
    const cta = page.locator('.nav__cta');
    await cta.scrollIntoViewIfNeeded();
    await expect(cta).toBeInViewport();
    await cta.click();
    await expect(page).toHaveURL(/\/contact\/$/);
  }
});

test('jump links land below the sticky header', async ({ page }) => {
  await page.goto('/contact/#message');
  await page.waitForTimeout(500);
  const formTop = await page.locator('#message').evaluate((el) => el.getBoundingClientRect().top);
  const headerBottom = await page.locator('.site-header').evaluate((el) => el.getBoundingClientRect().bottom);
  expect(formTop, 'form starts below the header').toBeGreaterThanOrEqual(headerBottom - 1);
});

test('every internal link and asset on every page resolves', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'laptop-1366', 'site-wide crawl runs once');
  const seen = new Set<string>();
  for (const path of allPages()) {
    await page.goto(path);
    const urls = await page.$$eval('a[href^="/"], img[src^="/"], link[href^="/"], script[src^="/"]', (els) =>
      els.map((el) => el.getAttribute('href') ?? el.getAttribute('src') ?? ''),
    );
    for (const url of urls) {
      const clean = url.split('#')[0]!;
      if (!clean || seen.has(clean) || clean.startsWith('/api/')) continue;
      seen.add(clean);
      const res = await request.get(clean);
      expect(res.status(), `${clean} (linked from ${path})`).toBe(200);
    }
  }
  expect(seen.size).toBeGreaterThan(20);
});

test('keyboard users can skip to content and see focus', async ({ page }, testInfo) => {
  test.skip(!!testInfo.project.use.hasTouch, 'keyboard test on laptops/desktops');
  await page.goto('/services/');
  await page.keyboard.press('Tab');
  const skip = page.locator('.skip-link');
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);

  // Next Tab stops land on visible elements with a visible focus ring.
  await page.goto('/');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, outline: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
    });
    if (focus.tag === 'BODY') continue;
    expect(focus.outline, `focus ring on ${focus.tag}`).not.toBe('none');
    expect(focus.width).toBeGreaterThanOrEqual(2);
  }
});

test('about diagram labels every circle, readable on this screen', async ({ page }) => {
  await page.goto('/about/');
  const diagram = page.locator('.diagram');
  await diagram.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1600); // labels rise in one after another

  const labels = page.locator('.diagram .spec');
  await expect(labels).toHaveCount(9);
  const card = (await page.locator('.diagram-card').boundingBox())!;
  for (const label of await labels.all()) {
    await expect(label).toBeVisible();
    const box = (await label.boundingBox())!;
    const name = (await label.textContent())?.trim();
    expect(box.x, `${name} inside card (left)`).toBeGreaterThanOrEqual(card.x);
    expect(box.x + box.width, `${name} inside card (right)`).toBeLessThanOrEqual(card.x + card.width);
    const fontSize = await label.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize, `${name} font size`).toBeGreaterThanOrEqual(10);
  }
  expect(await overlappingText(page, '.diagram'), 'labels overlapping each other').toEqual([]);

  // Screen readers get the same list as text.
  await expect(page.locator('.spec-list li')).toHaveCount(9);
});

test('home hero pills never cover the logo or each other', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);
  const rects = await page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, name: el.textContent?.trim() || 'logo' };
    };
    // Measure without the gentle bobbing motion.
    document
      .querySelectorAll<HTMLElement>('.orbit-art .pill, .orbit-art .mark')
      .forEach((el) => (el.style.animation = 'none'));
    const mark = document.querySelector('.orbit-art .mark')!;
    // The logo's visible network sits inside the image box with a small transparent margin.
    const m = box(mark);
    const inset = (m.r - m.l) * 0.08;
    return {
      mark: { ...m, l: m.l + inset, r: m.r - inset, t: m.t + inset, b: m.b - inset },
      pills: [...document.querySelectorAll('.orbit-art .pill')].map(box),
    };
  });
  const overlaps = (a: typeof rects.mark, b: typeof rects.mark) =>
    Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
  for (const pill of rects.pills)
    expect(overlaps(pill, rects.mark), `"${pill.name}" covers the logo`).toBe(false);
  for (let i = 0; i < rects.pills.length; i++)
    for (let j = i + 1; j < rects.pills.length; j++)
      expect(
        overlaps(rects.pills[i]!, rects.pills[j]!),
        `${rects.pills[i]!.name} / ${rects.pills[j]!.name}`,
      ).toBe(false);
});

test('insights topic filters work and are shareable', async ({ page }) => {
  await page.goto('/insights/');
  const cards = page.locator('[data-filter-group] > [data-topic]:not([data-hidden])');
  const total = await cards.count();
  expect(total).toBeGreaterThan(3);

  await page.getByRole('button', { name: 'ITOM' }).click();
  await expect(page.getByRole('button', { name: 'ITOM' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/topic=ITOM/);
  await expect(cards).toHaveCount(1);
  await expect(page.locator('[data-filter-status]')).toHaveText('1 article shown');

  await page.getByRole('button', { name: 'All' }).click();
  await expect(cards).toHaveCount(total);

  // Opening a shared filtered link applies the filter.
  await page.goto('/insights/?topic=ServiceNow%20AI');
  await expect(page.getByRole('button', { name: 'ServiceNow AI' })).toHaveAttribute('aria-pressed', 'true');
  await expect(cards).toHaveCount(2);
});

test('contact form validates input and reports send problems clearly', async ({ page }) => {
  const errors = collectErrors(page, [/404 \(Not Found\)/, /Failed to load resource/]);
  await page.goto('/contact/');
  const form = page.locator('form#message');
  const status = form.locator('[data-form-status]');

  // Empty submit: fields flagged, focus on the first one.
  await form.getByRole('button', { name: /send message/i }).click();
  await expect(status).toHaveText(/check the highlighted fields/i);
  await expect(form.locator('[name="name"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.locator('[name="name"]')).toBeFocused();

  // Bad email.
  await form.getByLabel('Full name').fill('Test Visitor');
  await form.getByLabel('Work email').fill('not-an-email');
  await form.getByLabel(/what are you trying to achieve/i).fill('We would like to improve our CMDB health.');
  await form.getByRole('button', { name: /send message/i }).click();
  await expect(form.locator('[name="email"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.locator('[name="name"]')).toHaveAttribute('aria-invalid', 'false');

  // Valid input. The local test server has no PHP, so the visitor must get a clear
  // "try again" message rather than a misleading "check your fields".
  await form.getByLabel('Work email').fill('visitor@example.com');
  await page.waitForTimeout(2600); // stay above the anti-bot minimum time on page
  await form.getByRole('button', { name: /send message/i }).click();
  await expect(status).toHaveText(/something went wrong on our side|try again/i);
  await expect(status).not.toHaveText(/highlighted/i);
  await expect(form.getByRole('button', { name: /send message/i })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('newsletter form validates the email', async ({ page }) => {
  await page.goto('/insights/');
  const form = page.locator('form[aria-label="Newsletter sign-up"]');
  await form.scrollIntoViewIfNeeded();
  await form.getByRole('button', { name: 'Subscribe' }).click();
  await expect(form.locator('[name="email"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.locator('[data-form-status]')).toHaveText(/check the highlighted/i);
});

test('visitors who prefer reduced motion see everything immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/services/servicenow-ai/');
  expect(await page.locator('[data-reveal-pending]').count()).toBe(0);
  const animated = await page.$$eval(
    '*',
    (els) => els.filter((el) => getComputedStyle(el).animationName !== 'none').length,
  );
  expect(animated).toBe(0);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('all content is visible and every page is reachable', async ({ page }) => {
    await page.goto('/services/servicenow-ai/');
    expect(await page.locator('[data-reveal-pending]').count()).toBe(0);
    await expect(page.locator('.phase__bar').first()).toBeVisible();
    // The footer links reach every section even if the menu button cannot open.
    for (const name of ['About', 'Case studies', 'Insights', 'Contact']) {
      await expect(page.locator('footer').getByRole('link', { name, exact: true })).toBeVisible();
    }
    // Forms still post to the server.
    await page.goto('/contact/');
    await expect(page.locator('form#message')).toHaveAttribute('action', '/api/contact.php');
    await expect(page.locator('form#message')).toHaveAttribute('method', 'post');
  });
});
