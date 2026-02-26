export interface Env {
  MEDIA_BUCKET: R2Bucket;
  ADMIN_TOKEN: string;
  ALLOWED_ORIGIN: string;
  KIT_API_KEY: string;
}

const corsHeaders = (origin: string, allowedOrigin: string) => ({
  'Access-Control-Allow-Origin': origin === allowedOrigin ? allowedOrigin : '',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
});

function isAuthorized(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization');
  return auth === `Bearer ${env.ADMIN_TOKEN}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    function json(data: unknown, status = 200): Response {
      return new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { pathname } = url;

    // GET /api/assets — list objects
    if (request.method === 'GET' && pathname === '/api/assets') {
      const listed = await env.MEDIA_BUCKET.list();
      const items = listed.objects.map(obj => ({
        key: obj.key,
        size: obj.size,
        url: `${url.origin}/media/${obj.key}`,
      }));
      return json(items);
    }

    // POST /api/assets/upload — upload file
    if (request.method === 'POST' && pathname === '/api/assets/upload') {
      if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, 401);

      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) return json({ error: 'No file provided' }, 400);

      const key = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await env.MEDIA_BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
      });

      return json({ key, url: `${url.origin}/media/${key}` });
    }

    // DELETE /api/assets/:key
    if (request.method === 'DELETE' && pathname.startsWith('/api/assets/')) {
      if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, 401);

      const key = decodeURIComponent(pathname.slice('/api/assets/'.length));
      await env.MEDIA_BUCKET.delete(key);
      return new Response(null, { status: 204, headers: cors });
    }

    // GET /media/:key — serve R2 object (public)
    if (request.method === 'GET' && pathname.startsWith('/media/')) {
      const key = decodeURIComponent(pathname.slice('/media/'.length));
      const object = await env.MEDIA_BUCKET.get(key);
      if (!object) return new Response('Not found', { status: 404 });

      const headers = new Headers(cors);
      object.writeHttpMetadata(headers);
      headers.set('Cache-Control', 'public, max-age=31536000');
      return new Response(object.body, { headers });
    }

    // POST /api/subscribe — proxy to Kit API v4
    if (request.method === 'POST' && pathname === '/api/subscribe') {
      let body: { email_address?: string };
      try {
        body = await request.json() as { email_address?: string };
      } catch {
        return json({ error: 'Invalid JSON' }, 400);
      }
      if (!body.email_address) return json({ error: 'email_address required' }, 400);

      const kitRes = await fetch('https://api.kit.com/v4/subscribers', {
        method: 'POST',
        headers: {
          'X-Kit-Api-Key': env.KIT_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email_address: body.email_address }),
      });
      const data = await kitRes.json();
      return json(data, kitRes.status);
    }

    return new Response('Not found', { status: 404 });
  },
};
