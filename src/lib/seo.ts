import { site } from '../config/site';

type JsonLd = Record<string, unknown>;

/**
 * Serialises JSON-LD for a <script> data block. `<` is escaped so content can
 * never close the script element early.
 */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function organizationSchema(siteUrl: URL): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': new URL('/#organization', siteUrl).href,
    name: site.name,
    description: site.description,
    slogan: site.tagline,
    url: siteUrl.href,
    logo: new URL('/favicon.png', siteUrl).href,
    image: new URL('/og-image.png', siteUrl).href,
    address: {
      '@type': 'PostalAddress',
      addressLocality: site.location.city,
      addressCountry: site.location.countryCode,
    },
    areaServed: 'Worldwide',
    knowsAbout: ['ServiceNow', 'Now Assist', 'AI Agents', 'CMDB', 'CSDM', 'ITOM', 'ITSM'],
  };
}

export function breadcrumbSchema(siteUrl: URL, items: { name: string; path: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: new URL(item.path, siteUrl).href,
    })),
  };
}

export function serviceSchema(
  siteUrl: URL,
  service: { name: string; description: string; path: string },
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description,
    url: new URL(service.path, siteUrl).href,
    provider: { '@id': new URL('/#organization', siteUrl).href },
    areaServed: 'Worldwide',
  };
}
