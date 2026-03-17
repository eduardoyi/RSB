# Publish API

This document is for external tools that want to create blog posts directly in Real Serious Business through the Cloudflare Worker.

## Endpoint

`POST /api/posts`

Example production base URL:

`https://rsb-assets.eduardoyi.workers.dev/api/posts`

## Authentication

Send the publish token in the `Authorization` header:

```http
Authorization: Bearer <PUBLISH_TOKEN>
```

This token is separate from the admin asset token.

## Request Body

Content type:

```http
Content-Type: application/json
```

Supported JSON fields:

- `title`: string, required
- `body`: string, required
- `slug`: string, optional
- `date`: string, optional
- `description`: string, optional
- `featured_image`: string, optional
- `featured_image_alt`: string, optional
- `podcast_audio`: string, optional
- `status`: `"draft"` or `"published"`, optional

Defaults applied by the worker:

- `slug`: generated from `title` when omitted
- `date`: current UTC date in `YYYY-MM-DD` when omitted
- `description`: `""` when omitted
- `status`: `"draft"` when omitted
- `featured_image_alt`: ignored if `featured_image` is missing

## Minimal Example

```json
{
  "title": "My New Draft",
  "body": "## Hello\n\nThis is a draft."
}
```

## Full Example

```json
{
  "title": "My Post",
  "slug": "my-post",
  "date": "2026-03-17",
  "description": "A short summary for cards and RSS.",
  "status": "published",
  "featured_image": "https://example.com/cover.webp",
  "featured_image_alt": "Cover image alt text",
  "podcast_audio": "https://example.com/audio.m4a",
  "body": "## Intro\n\n![Chart](https://example.com/chart.png)\n\n<img src=\"https://example.com/photo.jpg\" alt=\"Photo\">"
}
```

## Media Mirroring Behavior

Before the worker writes the post to GitHub, it attempts to mirror remote media into the site’s R2 bucket.

The worker tries to import:

- `featured_image`
- inline Markdown images like `![alt](https://example.com/image.png)`
- raw HTML images like `<img src="https://example.com/image.png">`
- `podcast_audio`

Rules:

- Only absolute `http://` and `https://` URLs are eligible
- URLs already on the site’s current public R2 host, or on any configured older public R2 hosts, are left unchanged
- The same asset URL is only fetched/uploaded once per request
- Successful imports are rewritten to the new R2 URL before the post is committed
- Failed imports do not block post creation; the original URL stays in place

Safety limits:

- non-http/https URLs are rejected
- localhost, private-network, and link-local targets are rejected
- redirects are followed up to 3 hops
- image imports must return `image/*`
- audio imports must return `audio/*`
- max image size: 25 MB
- max audio size: 200 MB

## Response

### Success

On success, the endpoint returns `201 Created`.

Example:

```json
{
  "slug": "my-post",
  "status": "draft",
  "repoPath": "src/content/posts/my-post.md",
  "commitSha": "abc123...",
  "sitePath": "/post/my-post",
  "fullyMirrored": false,
  "importedAssets": [
    {
      "kind": "featured_image",
      "sourceUrl": "https://example.com/cover.webp",
      "r2Url": "https://pub-...r2.dev/posts/my-post/..."
    }
  ],
  "failedAssets": [
    {
      "kind": "body_image",
      "sourceUrl": "https://example.com/missing.png",
      "reason": "Asset source responded with HTTP 404"
    }
  ]
}
```

Fields:

- `slug`: final slug used for the post file and route
- `status`: `draft` or `published`
- `repoPath`: file path written into the GitHub repo
- `commitSha`: GitHub commit SHA created by the worker
- `sitePath`: expected route path on the site
- `publicUrl`: included only when `status` is `published`
- `fullyMirrored`: `true` when all eligible assets were mirrored successfully
- `importedAssets`: assets successfully imported into R2
- `failedAssets`: assets that failed to import and were left as original URLs

Important:

- `publicUrl` means “this is the final site URL once the normal site deploy completes”
- this site is static, so a published post is not live until the repo change has been deployed

## Errors

Common error responses:

- `400 Bad Request`: invalid JSON, missing `title`/`body`, invalid `status`, invalid `date`
- `401 Unauthorized`: missing or invalid `PUBLISH_TOKEN`
- `409 Conflict`: a post with the target slug already exists
- `502 Bad Gateway`: GitHub write failure or another upstream failure during commit

Example:

```json
{
  "error": "A post with that slug already exists"
}
```

## Create-Only Semantics

This endpoint is create-only in v1.

- It will not update an existing draft
- It will not overwrite an existing published post
- If the resolved slug already exists, the worker returns `409 Conflict`

If your tool needs “edit existing draft” support later, that should be added as a separate endpoint or explicit upsert flow.

## Example cURL

```bash
curl -X POST https://rsb-assets.eduardoyi.workers.dev/api/posts \
  -H "Authorization: Bearer YOUR_PUBLISH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Worker Publish Test",
    "body": "## Hello\n\nThis post was created through the API.",
    "status": "draft"
  }'
```
