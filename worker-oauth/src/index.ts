export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ALLOWED_ORIGIN: string;
}

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // GET /auth → redirect to GitHub OAuth
    if (url.pathname === '/auth') {
      const params = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: `${url.origin}/callback`,
        scope: 'repo',
      });
      return Response.redirect(`${GITHUB_AUTH_URL}?${params}`, 302);
    }

    // GET /callback?code=...
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      if (!code) {
        return htmlResponse(errorPage('Missing OAuth code'));
      }

      try {
        const tokenRes = await fetch(GITHUB_TOKEN_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
            redirect_uri: `${url.origin}/callback`,
          }),
        });

        const data = await tokenRes.json() as { access_token?: string; error?: string };

        if (data.error || !data.access_token) {
          return htmlResponse(errorPage(data.error ?? 'OAuth failed'));
        }

        return htmlResponse(successPage(data.access_token));
      } catch (err) {
        return htmlResponse(errorPage('Internal error'));
      }
    }

    return new Response('Not found', { status: 404 });
  },
};

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

function successPage(token: string): string {
  // Post message back to Decap CMS opener
  const safeToken = token.replace(/[<>"']/g, '');
  return `<!doctype html>
<html>
<head><title>Auth Success</title></head>
<body>
<p>Authentication successful. You may close this window.</p>
<script>
(function() {
  function receiveMessage(e) {
    window.opener.postMessage(
      'authorization:github:success:{"token":"${safeToken}","provider":"github"}',
      e.origin
    );
  }
  window.addEventListener('message', receiveMessage, false);
  window.opener.postMessage('authorizing:github', '*');
})();
</script>
</body>
</html>`;
}

function errorPage(message: string): string {
  const safeMsg = String(message).replace(/[<>"']/g, '');
  return `<!doctype html>
<html>
<head><title>Auth Error</title></head>
<body>
<p>Authentication failed: ${safeMsg}</p>
<script>
window.opener?.postMessage('authorization:github:error:${safeMsg}', '*');
</script>
</body>
</html>`;
}
