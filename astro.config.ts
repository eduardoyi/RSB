import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import matter from 'gray-matter';

function cloudflareRedirects() {
  return {
    name: 'cloudflare-redirects',
    hooks: {
      'astro:build:done': ({ dir }: { dir: URL }) => {
        const redirectsDir = resolve('./src/content/redirects');
        const lines: string[] = [];
        try {
          const files = readdirSync(redirectsDir).filter(f => f.endsWith('.md'));
          for (const file of files) {
            const raw = readFileSync(join(redirectsDir, file), 'utf-8');
            const { data } = matter(raw);
            if (data.from && data.to) {
              lines.push(`${data.from} ${data.to} ${data.status || 301}`);
            }
          }
        } catch {
          // No redirects directory or files — that's fine
        }
        if (lines.length > 0) {
          const outPath = join(dir.pathname, '_redirects');
          writeFileSync(outPath, lines.join('\n') + '\n');
        }
      },
    },
  };
}

export default defineConfig({
  site: 'https://realseriousbusiness.com',
  output: 'static',
  integrations: [sitemap(), cloudflareRedirects()],
  markdown: {
    syntaxHighlight: false,
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
