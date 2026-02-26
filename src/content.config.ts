import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    featured_image: z.string().optional(),
    featured_image_alt: z.string().optional(),
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

export const collections = { posts, programs };
