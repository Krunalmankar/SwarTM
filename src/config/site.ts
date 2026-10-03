/**
 * Site-wide settings. Content lives in src/content; this file holds identity,
 * navigation and integration settings only.
 */

const bookingUrl = (import.meta.env.PUBLIC_BOOKING_URL ?? '').trim();

export const site = {
  name: 'SwarTM',
  tagline: 'ServiceNow AI transformation',
  description:
    'SwarTM designs, builds and runs AI-ready ServiceNow platforms: trusted CMDB data, agentic workflows and Now Assist.',
  locale: 'en',
  location: {
    city: 'Pune',
    country: 'India',
    countryCode: 'IN',
    display: 'Pune, India',
  },
  /** External booking page if configured, otherwise the contact form. */
  bookingUrl: /^https:\/\//.test(bookingUrl) ? bookingUrl : '/contact/#message',
  bookingIsExternal: /^https:\/\//.test(bookingUrl),
  /** Form endpoints (served by the PHP handlers in public/api). */
  forms: {
    contact: '/api/contact.php',
    newsletter: '/api/subscribe.php',
  },
  legal: {
    copyrightHolder: 'SwarTM',
    trademarkNotice: 'ServiceNow is a trademark of ServiceNow, Inc.',
  },
} as const;

export type NavId = 'home' | 'services' | 'cases' | 'about' | 'insights' | 'contact';

export interface NavItem {
  id: NavId;
  label: string;
  href: string;
}

export const mainNav: NavItem[] = [
  { id: 'services', label: 'Services', href: '/services/' },
  { id: 'cases', label: 'Case studies', href: '/case-studies/' },
  { id: 'about', label: 'About', href: '/about/' },
  { id: 'insights', label: 'Insights', href: '/insights/' },
  { id: 'contact', label: 'Contact', href: '/contact/' },
];

export const companyNav: NavItem[] = [
  { id: 'about', label: 'About', href: '/about/' },
  { id: 'cases', label: 'Case studies', href: '/case-studies/' },
  { id: 'insights', label: 'Insights', href: '/insights/' },
  { id: 'contact', label: 'Contact', href: '/contact/' },
];

/** Works out which top-level nav item a path belongs to. */
export function navIdForPath(pathname: string): NavId {
  const first = pathname.split('/').filter(Boolean)[0] ?? '';
  switch (first) {
    case 'services':
      return 'services';
    case 'case-studies':
      return 'cases';
    case 'about':
      return 'about';
    case 'insights':
      return 'insights';
    case 'contact':
      return 'contact';
    default:
      return 'home';
  }
}
