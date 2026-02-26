import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export default defineConfig({
  site: 'https://realseriousbusiness.pages.dev',
  output: 'static',
  integrations: [sitemap()],
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
