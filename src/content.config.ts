import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const work = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/work' }),
  schema: z.object({
    wpt: z.number(),
    title: z.string(),
    subtitle: z.string(),
    status: z.enum(['active', 'awarded', 'shipped', 'merged', 'archived']),
    statusLabel: z.string(),
    date: z.string(),
    role: z.string(),
    summary: z.string(),
    metrics: z.array(z.object({ k: z.string(), v: z.string() })).default([]),
    quote: z.object({ text: z.string(), by: z.string() }).optional(),
    tags: z.array(z.string()).default([]),
    links: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
    tier: z.enum(['primary', 'secondary']),
    detail: z.boolean().default(false),
  }),
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { work, posts };
