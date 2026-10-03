/**
 * Motion helpers, run once per page from BaseLayout.
 *
 * revealOnScroll(): elements that start below the fold (.in-view, .layer,
 * [data-reveal]) get `data-reveal-pending`, which CSS uses to hide/offset them.
 * When one scrolls into view the attribute is removed and a CSS transition plays
 * once to the final state. Elements already on screen are never hidden, so
 * there is no flash, and every element ends fully visible wherever the visitor
 * stops scrolling.
 *
 * pauseOffscreenMotion(): marks page sections that are off screen with
 * `data-offscreen`, which pauses never-ending decorative animations (see
 * global.css). Saves CPU and battery, especially on phones.
 */

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function revealOnScroll(): void {
  if (!('IntersectionObserver' in window) || reducedMotion()) return;

  const pending = new Set<HTMLElement>();
  const classified = new WeakSet<Element>();
  const reveal = (el: HTMLElement) => {
    el.removeAttribute('data-reveal-pending');
    pending.delete(el);
    observer.unobserve(el);
    if (!pending.size) window.removeEventListener('scroll', onScroll);
  };

  // The observer's first report tells us where each element starts, without
  // forcing a layout from script (no "forced reflow" on page load).
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      if (!classified.has(el)) {
        classified.add(el);
        if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
          observer.unobserve(el); // already on screen (or above): never hidden
        } else {
          el.setAttribute('data-reveal-pending', ''); // below the fold: hide until it arrives
          pending.add(el);
          window.addEventListener('scroll', onScroll, { passive: true });
        }
        continue;
      }
      if (entry.isIntersecting) reveal(el);
    }
  });

  // Fallback for very fast flicks: anything already scrolled past (or into view)
  // is revealed even if the observer never saw it intersect.
  let timer = 0;
  const sweep = () => {
    timer = 0;
    const line = window.innerHeight * 0.9;
    for (const el of [...pending]) if (el.getBoundingClientRect().top < line) reveal(el);
  };
  const onScroll = () => {
    if (!timer) timer = window.setTimeout(sweep, 120);
  };

  for (const el of document.querySelectorAll<HTMLElement>('.in-view, [data-reveal]')) observer.observe(el);
}

export function pauseOffscreenMotion(): void {
  if (!('IntersectionObserver' in window) || reducedMotion()) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) entry.target.toggleAttribute('data-offscreen', !entry.isIntersecting);
    },
    { rootMargin: '200px 0px' },
  );

  for (const section of document.querySelectorAll('main > *, .site-footer')) observer.observe(section);
}
