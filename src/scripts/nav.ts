/** Mobile menu toggle for the site header (see components/layout/Header.astro). */
export function initNav(desktopQuery: string): void {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  const toggle = nav?.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const label = toggle?.querySelector<HTMLElement>('[data-nav-label]');
  if (!nav || !toggle || !label) return;

  const setOpen = (open: boolean) => {
    nav.toggleAttribute('data-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    label.textContent = open ? 'Close menu' : 'Open menu';
  };

  toggle.addEventListener('click', () => setOpen(!nav.hasAttribute('data-open')));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.hasAttribute('data-open')) {
      setOpen(false);
      toggle.focus();
    }
  });

  window.matchMedia(desktopQuery).addEventListener('change', (event) => {
    if (event.matches) setOpen(false);
  });
}
