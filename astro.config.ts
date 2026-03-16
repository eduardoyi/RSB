import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, writeFileSync, readdirSync, renameSync } from 'fs';
import { resolve, join } from 'path';

function rehypeLazyImages() {
  return function walk(tree: any) {
    (tree.children ?? []).forEach((node: any) => {
      if (node.type === 'element' && node.tagName === 'img') {
        node.properties ??= {};
        node.properties.loading  ??= 'lazy';
        node.properties.decoding ??= 'async';
      }
      walk(node);
    });
  };
}

function rehypeFigure() {
  return function transform(tree: any) {
    (function walk(node: any) {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        // Match <p> containing a single <img> with a title attribute
        if (
          child.type === 'element' &&
          child.tagName === 'p' &&
          child.children?.length === 1 &&
          child.children[0].type === 'element' &&
          child.children[0].tagName === 'img' &&
          child.children[0].properties?.title
        ) {
          const img = child.children[0];
          const caption = img.properties.title;
          delete img.properties.title;
          node.children[i] = {
            type: 'element',
            tagName: 'figure',
            properties: {},
            children: [
              img,
              {
                type: 'element',
                tagName: 'figcaption',
                properties: {},
                children: [{ type: 'text', value: caption }],
              },
            ],
          };
        }
        walk(child);
      }
    })(tree);
  };
}
import matter from 'gray-matter';

function cloudflareRedirects() {
  return {
    name: 'cloudflare-redirects',
    hooks: {
      'astro:build:start': () => {
        // Auto-rename post files to match their frontmatter slug
        const postsDir = resolve('./src/content/posts');
        try {
          const files = readdirSync(postsDir).filter(f => f.endsWith('.md'));
          for (const file of files) {
            const filename = file.replace(/\.md$/, '');
            const raw = readFileSync(join(postsDir, file), 'utf-8');
            const { data } = matter(raw);
            if (data.slug && data.slug !== filename) {
              const newPath = join(postsDir, data.slug + '.md');
              renameSync(join(postsDir, file), newPath);
              console.log(`[redirects] Renamed ${file} → ${data.slug}.md`);
            }
          }
        } catch { /* no posts dir */ }
      },
      'astro:build:done': ({ dir }: { dir: URL }) => {
        const lines: string[] = [];

        // 1. Explicit redirects from the redirects content collection
        const redirectsDir = resolve('./src/content/redirects');
        try {
          const files = readdirSync(redirectsDir).filter(f => f.endsWith('.md'));
          for (const file of files) {
            const raw = readFileSync(join(redirectsDir, file), 'utf-8');
            const { data } = matter(raw);
            if (data.from && data.to) {
              const status = data.status || 301;
              lines.push(`${data.from} ${data.to} ${status}`);
              // Also add trailing-slash variant
              const fromSlash = data.from.endsWith('/') ? data.from : data.from + '/';
              const fromNoSlash = data.from.endsWith('/') ? data.from.slice(0, -1) : data.from;
              lines.push(`${fromSlash} ${data.to} ${status}`);
              lines.push(`${fromNoSlash} ${data.to} ${status}`);
            }
          }
        } catch {
          // No redirects directory or files — that's fine
        }

        // 2. Auto-redirects: if a post filename differs from its frontmatter
        //    slug, redirect /post/{filename} → /post/{slug}
        const postsDir = resolve('./src/content/posts');
        try {
          const files = readdirSync(postsDir).filter(f => f.endsWith('.md'));
          for (const file of files) {
            const filename = file.replace(/\.md$/, '');
            const raw = readFileSync(join(postsDir, file), 'utf-8');
            const { data } = matter(raw);
            if (data.slug && data.slug !== filename) {
              lines.push(`/post/${filename} /post/${data.slug} 301`);
              lines.push(`/post/${filename}/ /post/${data.slug} 301`);
            }
          }
        } catch {
          // No posts directory — that's fine
        }

        const unique = [...new Set(lines)];
        if (unique.length > 0) {
          const outPath = join(dir.pathname, '_redirects');
          writeFileSync(outPath, unique.join('\n') + '\n');
        }
      },
    },
  };
}

export default defineConfig({
  site: 'https://realseriousbusiness.com',
  output: 'static',
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/admin/') &&
        !page.includes('/shutdown') &&
        !page.includes('/ms-dos') &&
        !page.includes('/paint') &&
        !page.includes('/games/'),
    }),
    cloudflareRedirects(),
  ],
  markdown: {
    syntaxHighlight: false,
    rehypePlugins: [rehypeLazyImages, rehypeFigure],
  },
  vite: {
    plugins: [
      {
        name: 'serve-admin-raw',
        configureServer(server) {
          // Intercept /admin and /admin/ BEFORE Vite can inject HMR scripts
          server.middlewares.use((req, res, next) => {
            const url = req.url?.split('?')[0];
            if (url === '/admin' || url === '/admin/') {
              try {
                const html = readFileSync(resolve('./public/admin/index.html'), 'utf-8');
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.end(html);
              } catch {
                next();
              }
              return;
            }
            next();
          });
        },
      },
    ],
  },
});
