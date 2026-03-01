import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    slug: z.string().optional(),
    title: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    author: z.string().optional(),
    featured_image: z.string().optional(),
    featured_image_alt: z.string().optional(),
    podcast_audio: z.string().optional(),
  }),
});

const redirects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/redirects' }),
  schema: z.object({
    from: z.string(),
    to: z.string(),
    status: z.coerce.number().default(301),
  }),
});

const programs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/programs' }),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    version: z.string(),
    description: z.string(),
    splash_image: z.string().optional(),
    launch_url: z.string().url(),
  }),
});

export const collections = { posts, programs, redirects };
