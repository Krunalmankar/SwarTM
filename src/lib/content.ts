import { getCollection, type CollectionEntry } from 'astro:content';

export type Service = CollectionEntry<'services'>;
export type CaseStudy = CollectionEntry<'caseStudies'>;
export type Insight = CollectionEntry<'insights'>;

const byOrder = <T extends { data: { order: number } }>(a: T, b: T) => a.data.order - b.data.order;

export async function getServices(): Promise<Service[]> {
  return (await getCollection('services')).sort(byOrder);
}

export function servicePath(service: Service): string {
  return `/services/${service.id}/`;
}

export async function getCaseStudies(): Promise<CaseStudy[]> {
  return (await getCollection('caseStudies')).sort(byOrder);
}

export async function getInsights(): Promise<Insight[]> {
  return (await getCollection('insights')).sort(byOrder);
}

export function isPublished(insight: Insight): boolean {
  return insight.data.status === 'published';
}

export function insightPath(insight: Insight): string | undefined {
  return isPublished(insight) ? `/insights/${insight.id}/` : undefined;
}

/** Minutes to read, from the body once published, else the frontmatter estimate. */
export function readingMinutes(insight: Insight): number {
  if (!isPublished(insight) || !insight.body) return insight.data.readingTime;
  const words = insight.body.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}
