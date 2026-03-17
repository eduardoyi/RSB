# Real Serious Business

Astro-powered personal site for [realseriousbusiness.com](https://realseriousbusiness.com), with blog content stored as Markdown in `src/content/posts`, Sveltia CMS for authoring, and Cloudflare Workers handling OAuth and publishing workflows.

## Project Structure

- `src/content/posts`: blog posts as Markdown with frontmatter
- `src/content/redirects`: redirect definitions that become Cloudflare `_redirects`
- `public/admin`: primary Sveltia CMS admin
- `worker`: Cloudflare Worker for publishing and public media delivery
- `worker-oauth`: GitHub OAuth worker used by the admin UI

## Local Site Development

```bash
cd /Users/eduardoyi/Coding/RSB
npm install
npm run dev
```

## Blog Content Model

Posts live in `src/content/posts/*.md` and support these frontmatter fields:

- `status`: `draft` or `published`
- `title`: required
- `slug`: optional in the schema, but always written by the publish worker
- `date`: required
- `description`: optional, defaults to `""`
- `author`: optional, defaults to `Eduardo Yi` when omitted
- `featured_image`: optional
- `featured_image_alt`: optional
- `podcast_audio`: optional

Only `published` posts appear on the public site, in generated `/post/*` routes, and in the RSS feed.

## CMS Setup

The live CMS entrypoint is `/admin/`.

### GitHub Auth

The Sveltia admin continues to use the GitHub OAuth worker at `worker-oauth`.

### Native Cloudflare R2 Media

Sveltia is configured to use Cloudflare R2 directly for images and audio uploads.

Before using media uploads, update these placeholders in the CMS config file:

- `account_id` in `public/admin/config.yml`
- `access_key_id` in `public/admin/config.yml`

Use:

- `account_id`: your Cloudflare account ID
- `access_key_id`: your bucket-scoped R2 access key ID

Editors are prompted for the matching R2 Secret Access Key in the browser the first time they upload or select media.

### R2 CORS

Allow the admin origins that will upload media directly to R2, including:

- `https://realseriousbusiness.com`
- local dev origins such as `http://localhost:4321`
- any preview origin you use to validate the site admin

## Worker Setup

The `worker` package has its own dependencies and should be installed from the worker directory:

```bash
cd /Users/eduardoyi/Coding/RSB/worker
npm install
```

If `package.json` changes inside `worker`, run that command again so `worker/package-lock.json` stays in sync.

### Wrangler Login

```bash
cd /Users/eduardoyi/Coding/RSB/worker
npx wrangler login
```

### Required Worker Secrets

Set these in the `worker` directory:

```bash
cd /Users/eduardoyi/Coding/RSB/worker
npx wrangler secret put PUBLISH_TOKEN
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put KIT_API_KEY
```

What they are for:

- `PUBLISH_TOKEN`: protects the external `POST /api/posts` publish endpoint
- `GITHUB_TOKEN`: GitHub token with repository contents write access for `eduardoyi/RSB`
- `KIT_API_KEY`: newsletter subscription proxy key

### GitHub Token Scope

Use a GitHub fine-grained personal access token scoped to `eduardoyi/RSB` with:

- Repository permission: `Contents: Read and write`

The token owner must also be allowed to push directly to `main`, since the worker creates post files on `main`.

### Worker Vars

The worker keeps one primary R2 public URL and an optional allowlist for older public R2 hosts:

- `PUBLIC_R2_URL`: current public R2 base URL used for newly uploaded/published assets
- `LEGACY_PUBLIC_R2_URLS`: comma-separated older public R2 base URLs that should also count as already-hosted assets during publish mirroring

### Generate a Strong Publish Token

```bash
openssl rand -base64 48
```

Use the generated value when `wrangler secret put PUBLISH_TOKEN` prompts you.

## Worker Development and Deploy

```bash
cd /Users/eduardoyi/Coding/RSB/worker
npx wrangler dev
```

```bash
cd /Users/eduardoyi/Coding/RSB/worker
npx wrangler deploy
```

## External Publish API

The external publish endpoint is documented in [`docs/publish-api.md`](./docs/publish-api.md).

This is the endpoint your other tool should call when it wants to create a new draft or published post directly in the repo.

## Quick Smoke Test

After setting `PUBLISH_TOKEN` and running `wrangler dev`:

```bash
curl -X POST http://127.0.0.1:8787/api/posts \
  -H "Authorization: Bearer YOUR_PUBLISH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test draft",
    "body": "Hello world",
    "status": "draft"
  }'
```

Then verify the site still builds:

```bash
cd /Users/eduardoyi/Coding/RSB
npm run build
```
