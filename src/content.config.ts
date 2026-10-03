import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { icons, type IconName } from './components/ui/icons';
import { insightTopics } from './config/insights';

const iconName = z.enum(Object.keys(icons) as [IconName, ...IconName[]]);

const services = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/services' }),
  schema: z.object({
    order: z.number().int(),
    flagship: z.boolean().default(false),
    icon: iconName,
    /** Breadcrumb, contact-form option. */
    shortName: z.string(),
    /** Home page card and footer link. */
    homeTitle: z.string(),
    homeSummary: z.string(),
    /** Services overview card. */
    cardTitle: z.string(),
    cardSummary: z.string(),
    tags: z.array(z.string()).min(1),
    /**
     * Position in the "How our practices build on each other" diagram on /services/.
     * Levels stack bottom-up (1 = foundation); `wrap` sits beside the stack and supports every layer.
     */
    stack: z.object({
      level: z.union([z.number().int().min(1).max(5), z.literal('wrap')]),
      caption: z.string(),
    }),
    seo: z.object({
      title: z.string().max(70),
      description: z.string().min(50).max(170),
    }),
    hero: z.object({
      title: z.string(),
      lead: z.string(),
      cta: z.string(),
      iconStyle: z.enum(['tint', 'navy']).default('tint'),
    }),
    glance: z
      .array(z.object({ icon: iconName, label: z.string(), text: z.string() }))
      .min(1)
      .max(4),
    problem: z.object({
      heading: z.string(),
      items: z.array(z.object({ icon: iconName, title: z.string(), text: z.string() })).min(1),
    }),
    approach: z.object({
      heading: z.string(),
      steps: z.array(z.object({ title: z.string(), text: z.string() })).min(2),
    }),
    deliverables: z.array(z.string()).min(1),
    timeline: z
      .array(
        z
          .object({
            label: z.string(),
            duration: z.string(),
            /** Bar position in percent of the track (multiples of 5). */
            start: z.number().int().min(0).max(95).multipleOf(5).default(0),
            width: z.number().int().min(5).max(100).multipleOf(5),
            tone: z.enum(['grey', 'blue', 'deep', 'green']),
          })
          .refine((phase) => phase.start + phase.width <= 100, {
            message: 'start + width must not exceed 100',
          }),
      )
      .min(1),
    cta: z.object({ heading: z.string(), label: z.string() }),
  }),
});

const caseStudies = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/case-studies' }),
  schema: z.object({
    order: z.number().int(),
    title: z.string(),
    practice: z.string(),
    client: z.string(),
    icon: iconName,
    problem: z.string(),
    approach: z.string(),
    outcome: z.string(),
    /** The service this work belongs to (file name in content/services); shown as a link. */
    service: reference('services').optional(),
    /** Optional step-by-step flow diagram shown under the outcome. */
    flow: z
      .object({
        title: z.string(),
        steps: z
          .array(
            z.object({
              icon: iconName,
              title: z.string(),
              text: z.string(),
              tone: z.enum(['tint', 'deep', 'green']).default('tint'),
            }),
          )
          .min(2)
          .max(6),
      })
      .optional(),
  }),
});

const insights = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/insights' }),
  schema: z.object({
    title: z.string(),
    topic: z.enum(insightTopics),
    summary: z.string().optional(),
    icon: iconName.default('sparkle'),
    featured: z.boolean().default(false),
    /** Estimated reading time in minutes, shown until the article is published. */
    readingTime: z.number().int().positive(),
    /** Only `published` articles get their own page and link. */
    status: z.enum(['published', 'coming-soon']).default('coming-soon'),
    publishDate: z.coerce.date().optional(),
    updatedDate: z.coerce.date().optional(),
    order: z.number().int().default(100),
  }),
});

export const collections = { services, caseStudies, insights };
