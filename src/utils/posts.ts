import { getCollection, type CollectionEntry } from 'astro:content';

export type PostEntry = CollectionEntry<'posts'>;

export function isPublishedPost(post: PostEntry) {
  return post.data.status === 'published';
}

export async function getPublishedPosts() {
  return (await getCollection('posts', isPublishedPost)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );
}
