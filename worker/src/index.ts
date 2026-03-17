import { fromMarkdown } from 'mdast-util-from-markdown';
import { visit } from 'unist-util-visit';

export interface Env {
  MEDIA_BUCKET: R2Bucket;
  ADMIN_TOKEN: string;
  PUBLISH_TOKEN: string;
  GITHUB_TOKEN: string;
  ALLOWED_ORIGIN: string;
  KIT_API_KEY: string;
  PUBLIC_R2_URL: string; // e.g. https://pub-54fd8d7ed7d74876bf7af598d20e0c7b.r2.dev
  LEGACY_PUBLIC_R2_URLS?: string; // comma-separated public R2 base URLs to treat as already hosted
}

type PublishStatus = 'draft' | 'published';
type AssetKind = 'featured_image' | 'body_image' | 'podcast_audio';
type AssetFamily = 'image' | 'audio';

interface PublishPayload {
  title?: unknown;
  body?: unknown;
  slug?: unknown;
  date?: unknown;
  description?: unknown;
  featured_image?: unknown;
  featured_image_alt?: unknown;
  podcast_audio?: unknown;
  status?: unknown;
}

interface NormalizedPublishPayload {
  title: string;
  body: string;
  slug: string;
  date: string;
  description: string;
  featuredImage?: string;
  featuredImageAlt?: string;
  podcastAudio?: string;
  status: PublishStatus;
}

interface ImportedAsset {
  kind: AssetKind;
  sourceUrl: string;
  r2Url: string;
}

interface FailedAsset {
  kind: AssetKind;
  sourceUrl: string;
  reason: string;
}

interface BodyImageCandidate {
  start: number;
  end: number;
  sourceUrl: string;
}

interface AssetUploadDetails {
  key: string;
  publicUrl: string;
}

type AssetResolution =
  | ({ status: 'uploaded'; kind: AssetKind; sourceUrl: string } & AssetUploadDetails)
  | { status: 'skipped'; sourceUrl: string; publicUrl: string }
  | { status: 'failed'; kind: AssetKind; sourceUrl: string; reason: string };

interface ImportContext {
  cache: Map<string, Promise<AssetResolution>>;
  importedAssets: ImportedAsset[];
  failedAssets: FailedAsset[];
  uploadedKeys: string[];
  nextAssetIndex: number;
}

class RouteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const SITE_ORIGIN = 'https://realseriousbusiness.com';
const GITHUB_OWNER = 'eduardoyi';
const GITHUB_REPO = 'RSB';
const GITHUB_BRANCH = 'main';
const MAX_REDIRECTS = 3;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_AUDIO_BYTES = 200 * 1024 * 1024;

const corsHeaders = (origin: string, allowedOrigin: string) => ({
  'Access-Control-Allow-Origin': origin === allowedOrigin ? allowedOrigin : '',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
});

// Public media assets are open to any origin (images, audio — no auth needed)
const publicMediaCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
};

function isBearerAuthorized(request: Request, token: string): boolean {
  const auth = request.headers.get('Authorization');
  return auth === `Bearer ${token}`;
}

function isAdminAuthorized(request: Request, env: Env): boolean {
  return isBearerAuthorized(request, env.ADMIN_TOKEN);
}

function isPublishAuthorized(request: Request, env: Env): boolean {
  return isBearerAuthorized(request, env.PUBLISH_TOKEN);
}

function jsonResponse(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function guessContentType(filename: string, mimeType: string): string {
  if (mimeType) return mimeType;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  };
  return map[ext] || 'application/octet-stream';
}

function extractMimeType(contentType: string | null): string {
  return (contentType ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function extensionFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    'audio/flac': 'flac',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
  };
  return map[contentType] ?? 'bin';
}

function sanitizeFileComponent(value: string, fallback = 'asset'): string {
  const sanitized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^[_\-.]+|[_\-.]+$/g, '')
    .slice(0, 120);
  return sanitized || fallback;
}

function buildPublicAssetUrl(env: Env, key: string): string {
  return `${env.PUBLIC_R2_URL.replace(/\/+$/, '')}/${key}`;
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new RouteError(400, 'Optional fields must be strings when provided');
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeDateValue(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return new Date().toISOString().slice(0, 10);
  }

  if (typeof value !== 'string') {
    throw new RouteError(400, 'date must be a string');
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return new Date().toISOString().slice(0, 10);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== trimmed) {
      throw new RouteError(400, 'date must be a valid YYYY-MM-DD value');
    }
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.valueOf())) {
    throw new RouteError(400, 'date must be a valid ISO date string or YYYY-MM-DD');
  }
  return trimmed;
}

function normalizePublishPayload(input: unknown): NormalizedPublishPayload {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RouteError(400, 'Request body must be a JSON object');
  }

  const payload = input as PublishPayload;

  if (typeof payload.title !== 'string' || !payload.title.trim()) {
    throw new RouteError(400, 'title is required');
  }

  if (typeof payload.body !== 'string' || !payload.body.trim()) {
    throw new RouteError(400, 'body is required');
  }

  const rawStatus = payload.status === undefined ? 'draft' : payload.status;
  if (rawStatus !== 'draft' && rawStatus !== 'published') {
    throw new RouteError(400, 'status must be either "draft" or "published"');
  }

  const rawSlug = normalizeOptionalString(payload.slug);
  const slug = slugify(rawSlug ?? payload.title);
  if (!slug) {
    throw new RouteError(400, 'slug could not be derived from title');
  }

  const featuredImage = normalizeOptionalString(payload.featured_image);
  const featuredImageAlt = featuredImage ? normalizeOptionalString(payload.featured_image_alt) : undefined;

  return {
    title: payload.title.trim(),
    body: payload.body,
    slug,
    date: normalizeDateValue(payload.date),
    description: normalizeOptionalString(payload.description) ?? '',
    featuredImage,
    featuredImageAlt,
    podcastAudio: normalizeOptionalString(payload.podcast_audio),
    status: rawStatus,
  };
}

function serializeFrontmatterValue(value: string): string {
  return JSON.stringify(value);
}

function serializePostMarkdown(post: NormalizedPublishPayload): string {
  const lines = [
    '---',
    `status: ${serializeFrontmatterValue(post.status)}`,
    `title: ${serializeFrontmatterValue(post.title)}`,
    `slug: ${serializeFrontmatterValue(post.slug)}`,
    `date: ${serializeFrontmatterValue(post.date)}`,
    `description: ${serializeFrontmatterValue(post.description)}`,
  ];

  if (post.featuredImage) {
    lines.push(`featured_image: ${serializeFrontmatterValue(post.featuredImage)}`);
  }

  if (post.featuredImage && post.featuredImageAlt) {
    lines.push(`featured_image_alt: ${serializeFrontmatterValue(post.featuredImageAlt)}`);
  }

  if (post.podcastAudio) {
    lines.push(`podcast_audio: ${serializeFrontmatterValue(post.podcastAudio)}`);
  }

  lines.push('---');

  const body = post.body.replace(/^\uFEFF/, '');
  return `${lines.join('\n')}\n${body}${body.endsWith('\n') ? '' : '\n'}`;
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function githubHeaders(env: Env): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'rsb-publish-worker',
  };
}

function extractGitHubMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'GitHub request failed';
  const message = (payload as { message?: unknown }).message;
  return typeof message === 'string' && message ? message : 'GitHub request failed';
}

async function checkGitHubPathExists(env: Env, path: string): Promise<boolean> {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}` +
      `?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
    { headers: githubHeaders(env) }
  );

  if (response.status === 404) return false;
  if (response.ok) return true;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Ignore JSON parse errors here.
  }

  throw new RouteError(502, `Failed to check existing post slug: ${extractGitHubMessage(payload)}`);
}

async function createGitHubFile(
  env: Env,
  path: string,
  content: string,
  message: string
): Promise<{ commitSha: string }> {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`,
    {
      method: 'PUT',
      headers: githubHeaders(env),
      body: JSON.stringify({
        branch: GITHUB_BRANCH,
        content: utf8ToBase64(content),
        message,
      }),
    }
  );

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Ignore JSON parse errors here.
  }

  if (!response.ok) {
    const messageText = extractGitHubMessage(payload);
    if (response.status === 409 || (response.status === 422 && /sha|already exists/i.test(messageText))) {
      throw new RouteError(409, 'A post with that slug already exists');
    }

    throw new RouteError(502, `Failed to create post in GitHub: ${messageText}`);
  }

  const commitSha =
    (payload as { commit?: { sha?: string } } | null)?.commit?.sha ??
    (payload as { content?: { sha?: string } } | null)?.content?.sha;

  if (!commitSha) {
    throw new RouteError(502, 'GitHub did not return a commit SHA for the created post');
  }

  return { commitSha };
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function normalizeSourceUrlKey(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl.trim());
    url.hash = '';
    return url.toString();
  } catch {
    return sourceUrl.trim();
  }
}

function getKnownPublicR2Bases(env: Env): URL[] {
  const rawUrls = [env.PUBLIC_R2_URL, ...(env.LEGACY_PUBLIC_R2_URLS?.split(',') ?? [])]
    .map((value) => value.trim())
    .filter(Boolean);

  const unique = new Set<string>();
  const bases: URL[] = [];

  for (const rawUrl of rawUrls) {
    try {
      const base = new URL(rawUrl.endsWith('/') ? rawUrl : `${rawUrl}/`);
      const key = base.toString();
      if (unique.has(key)) continue;
      unique.add(key);
      bases.push(base);
    } catch {
      // Ignore invalid legacy URLs so a bad env var does not break publishing.
    }
  }

  return bases;
}

function isPublicR2Url(sourceUrl: string, env: Env): boolean {
  try {
    const url = new URL(sourceUrl);
    return getKnownPublicR2Bases(env).some(
      (base) => url.origin === base.origin && url.pathname.startsWith(base.pathname)
    );
  } catch {
    return false;
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  );
}

function isForbiddenHostname(hostname: string): boolean {
  const normalized = hostname.replace(/\.$/, '').toLowerCase();
  if (!normalized) return true;

  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized === '0.0.0.0'
  ) {
    return true;
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    return isPrivateIpv4(normalized);
  }

  if (normalized.includes(':')) {
    return isPrivateIpv6(normalized);
  }

  return false;
}

function assertSafeRemoteUrl(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only absolute http/https asset URLs can be mirrored');
  }

  if (isForbiddenHostname(url.hostname)) {
    throw new Error('Localhost, private-network, and link-local asset URLs are not allowed');
  }
}

function formatByteLimit(maxBytes: number): string {
  return `${Math.round(maxBytes / (1024 * 1024))} MB`;
}

function createSizeLimitedStream(body: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  let total = 0;

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > maxBytes) {
          throw new Error(`Asset exceeds the ${formatByteLimit(maxBytes)} limit`);
        }
        controller.enqueue(chunk);
      },
    })
  );
}

function filenameFromUrl(url: URL, contentType: string, fallbackStem: string): string {
  const rawName = url.pathname.split('/').filter(Boolean).pop() ?? fallbackStem;
  let decoded = rawName;
  try {
    decoded = decodeURIComponent(rawName);
  } catch {
    decoded = rawName;
  }

  const hasExtension = /\.[a-z0-9]+$/i.test(decoded);
  const baseName = sanitizeFileComponent(decoded, fallbackStem);
  if (hasExtension) {
    return baseName;
  }

  return `${baseName}.${extensionFromContentType(contentType)}`;
}

function buildImportedAssetKey(
  slug: string,
  requestId: string,
  index: number,
  kind: AssetKind,
  filename: string
): string {
  return `posts/${sanitizeFileComponent(slug, 'post')}/${requestId}/${String(index).padStart(2, '0')}-${sanitizeFileComponent(kind, 'asset')}-${filename}`;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|amp|apos|gt|lt|quot);/gi, (entity, code) => {
    const normalized = String(code).toLowerCase();
    if (normalized === 'amp') return '&';
    if (normalized === 'apos') return "'";
    if (normalized === 'gt') return '>';
    if (normalized === 'lt') return '<';
    if (normalized === 'quot') return '"';

    if (normalized.startsWith('#x')) {
      const parsed = Number.parseInt(normalized.slice(2), 16);
      return Number.isNaN(parsed) ? entity : String.fromCodePoint(parsed);
    }

    if (normalized.startsWith('#')) {
      const parsed = Number.parseInt(normalized.slice(1), 10);
      return Number.isNaN(parsed) ? entity : String.fromCodePoint(parsed);
    }

    return entity;
  });
}

function findMarkdownImageUrlBounds(raw: string): { start: number; end: number } | null {
  if (!raw.startsWith('![')) return null;

  let index = 2;
  let altDepth = 1;
  let escaped = false;

  while (index < raw.length) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      index += 1;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      index += 1;
      continue;
    }

    if (char === '[') altDepth += 1;
    if (char === ']') {
      altDepth -= 1;
      if (altDepth === 0) {
        index += 1;
        break;
      }
    }

    index += 1;
  }

  if (raw[index] !== '(') return null;
  index += 1;

  while (index < raw.length && /\s/.test(raw[index])) index += 1;

  if (raw[index] === '<') {
    const start = index + 1;
    index += 1;

    while (index < raw.length && raw[index] !== '>') {
      if (raw[index] === '\\') index += 1;
      index += 1;
    }

    return index > start ? { start, end: index } : null;
  }

  const start = index;
  let parenDepth = 0;
  escaped = false;

  while (index < raw.length) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      index += 1;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      index += 1;
      continue;
    }

    if (char === '(') {
      parenDepth += 1;
      index += 1;
      continue;
    }

    if (char === ')') {
      if (parenDepth === 0) break;
      parenDepth -= 1;
      index += 1;
      continue;
    }

    if (/\s/.test(char) && parenDepth === 0) break;
    index += 1;
  }

  return index > start ? { start, end: index } : null;
}

function findHtmlTagEnd(raw: string, tagStart: number): number {
  let quote: '"' | "'" | null = null;

  for (let index = tagStart; index < raw.length; index += 1) {
    const char = raw[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '>') {
      return index;
    }
  }

  return -1;
}

function findHtmlAttributeValueBounds(tag: string, attributeName: string): { start: number; end: number } | null {
  let index = tag.startsWith('<') ? 1 : 0;

  while (index < tag.length) {
    while (index < tag.length && /[\s/>]/.test(tag[index])) index += 1;
    const nameStart = index;

    while (index < tag.length && /[^\s=/>]/.test(tag[index])) index += 1;
    if (nameStart === index) break;

    const name = tag.slice(nameStart, index).toLowerCase();
    while (index < tag.length && /\s/.test(tag[index])) index += 1;

    if (tag[index] !== '=') {
      continue;
    }

    index += 1;
    while (index < tag.length && /\s/.test(tag[index])) index += 1;
    if (index >= tag.length) break;

    if (tag[index] === '"' || tag[index] === "'") {
      const quote = tag[index];
      const start = index + 1;
      index += 1;
      while (index < tag.length && tag[index] !== quote) index += 1;
      const end = index;
      if (name === attributeName) return { start, end };
      if (index < tag.length) index += 1;
      continue;
    }

    const start = index;
    while (index < tag.length && !/[\s>]/.test(tag[index])) index += 1;
    const end = index;
    if (name === attributeName) return { start, end };
  }

  return null;
}

function findHtmlImageSrcBounds(raw: string): Array<{ start: number; end: number; sourceUrl: string }> {
  const matches: Array<{ start: number; end: number; sourceUrl: string }> = [];
  const lower = raw.toLowerCase();
  let searchIndex = 0;

  while (searchIndex < raw.length) {
    const tagStart = lower.indexOf('<img', searchIndex);
    if (tagStart === -1) break;

    const boundary = raw[tagStart + 4];
    if (boundary && !/[\s/>]/.test(boundary)) {
      searchIndex = tagStart + 4;
      continue;
    }

    const tagEnd = findHtmlTagEnd(raw, tagStart);
    if (tagEnd === -1) break;

    const tag = raw.slice(tagStart, tagEnd + 1);
    const bounds = findHtmlAttributeValueBounds(tag, 'src');
    if (bounds) {
      matches.push({
        start: tagStart + bounds.start,
        end: tagStart + bounds.end,
        sourceUrl: decodeHtmlEntities(tag.slice(bounds.start, bounds.end)),
      });
    }

    searchIndex = tagEnd + 1;
  }

  return matches;
}

function collectBodyImageCandidates(body: string): BodyImageCandidate[] {
  const tree = fromMarkdown(body);
  const candidates: BodyImageCandidate[] = [];

  visit(tree, (node: any) => {
    const start = node?.position?.start?.offset;
    const end = node?.position?.end?.offset;

    if (typeof start !== 'number' || typeof end !== 'number' || start < 0 || end <= start) {
      return;
    }

    if (node.type === 'image' && typeof node.url === 'string') {
      const raw = body.slice(start, end);
      const bounds = findMarkdownImageUrlBounds(raw);
      if (!bounds) return;
      candidates.push({
        start: start + bounds.start,
        end: start + bounds.end,
        sourceUrl: node.url,
      });
      return;
    }

    if (node.type === 'html' && typeof node.value === 'string' && node.value.toLowerCase().includes('<img')) {
      for (const match of findHtmlImageSrcBounds(node.value)) {
        candidates.push({
          start: start + match.start,
          end: start + match.end,
          sourceUrl: match.sourceUrl,
        });
      }
    }
  });

  return candidates.sort((a, b) => b.start - a.start);
}

async function putBucketObject(
  env: Env,
  key: string,
  body: Parameters<R2Bucket['put']>[1],
  contentType: string
): Promise<AssetUploadDetails> {
  await env.MEDIA_BUCKET.put(key, body, {
    httpMetadata: { contentType },
  });

  return {
    key,
    publicUrl: buildPublicAssetUrl(env, key),
  };
}

async function fetchRemoteAsset(
  sourceUrl: string,
  env: Env,
  family: AssetFamily,
  maxBytes: number
): Promise<{ response: Response; contentType: string; finalUrl: URL } | { skippedUrl: string }> {
  let currentUrl = new URL(sourceUrl.trim());
  currentUrl.hash = '';

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    assertSafeRemoteUrl(currentUrl);

    if (isPublicR2Url(currentUrl.toString(), env)) {
      return { skippedUrl: currentUrl.toString() };
    }

    const response = await fetch(currentUrl.toString(), {
      headers: {
        Accept: family === 'image' ? 'image/*,*/*;q=0.8' : 'audio/*,*/*;q=0.8',
      },
      redirect: 'manual',
    });

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get('Location');
      if (!location) {
        throw new Error('Asset redirect response was missing a Location header');
      }

      if (redirectCount === MAX_REDIRECTS) {
        throw new Error('Asset exceeded the maximum redirect limit');
      }

      currentUrl = new URL(location, currentUrl);
      currentUrl.hash = '';
      continue;
    }

    if (!response.ok) {
      throw new Error(`Asset source responded with HTTP ${response.status}`);
    }

    const contentType = extractMimeType(response.headers.get('Content-Type'));
    if (!contentType.startsWith(`${family}/`)) {
      throw new Error(`Expected ${family}/* content, received "${contentType || 'unknown'}"`);
    }

    const contentLengthHeader = response.headers.get('Content-Length');
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (!Number.isNaN(contentLength) && contentLength > maxBytes) {
        throw new Error(`Asset exceeds the ${formatByteLimit(maxBytes)} limit`);
      }
    }

    if (!response.body) {
      throw new Error('Asset source returned an empty body');
    }

    return { response, contentType, finalUrl: currentUrl };
  }

  throw new Error('Asset exceeded the maximum redirect limit');
}

function assetFamilyForKind(kind: AssetKind): AssetFamily {
  return kind === 'podcast_audio' ? 'audio' : 'image';
}

function maxBytesForKind(kind: AssetKind): number {
  return kind === 'podcast_audio' ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
}

async function importRemoteAsset(
  env: Env,
  sourceUrl: string,
  slug: string,
  requestId: string,
  assetIndex: number,
  kind: AssetKind
): Promise<AssetResolution> {
  const trimmedSourceUrl = sourceUrl.trim();
  if (!trimmedSourceUrl) {
    return { status: 'failed', kind, sourceUrl, reason: 'Asset URL was empty' };
  }

  if (isPublicR2Url(trimmedSourceUrl, env)) {
    return { status: 'skipped', sourceUrl: trimmedSourceUrl, publicUrl: trimmedSourceUrl };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedSourceUrl);
  } catch {
    return {
      status: 'failed',
      kind,
      sourceUrl: trimmedSourceUrl,
      reason: 'Asset URL must be an absolute http/https URL',
    };
  }

  try {
    const family = assetFamilyForKind(kind);
    const maxBytes = maxBytesForKind(kind);
    const assetFetch = await fetchRemoteAsset(parsedUrl.toString(), env, family, maxBytes);

    if ('skippedUrl' in assetFetch) {
      return {
        status: 'skipped',
        sourceUrl: trimmedSourceUrl,
        publicUrl: assetFetch.skippedUrl,
      };
    }

    const { response, contentType, finalUrl } = assetFetch;
    const filename = filenameFromUrl(finalUrl, contentType, kind);
    const key = buildImportedAssetKey(slug, requestId, assetIndex, kind, filename);
    const limitedStream = createSizeLimitedStream(response.body as ReadableStream<Uint8Array>, maxBytes);

    const upload = await putBucketObject(env, key, limitedStream, contentType);
    return {
      status: 'uploaded',
      kind,
      sourceUrl: trimmedSourceUrl,
      key: upload.key,
      publicUrl: upload.publicUrl,
    };
  } catch (error) {
    return {
      status: 'failed',
      kind,
      sourceUrl: trimmedSourceUrl,
      reason: error instanceof Error ? error.message : 'Unknown asset import error',
    };
  }
}

async function ensureImportedAsset(
  env: Env,
  context: ImportContext,
  sourceUrl: string,
  slug: string,
  requestId: string,
  kind: AssetKind
): Promise<AssetResolution> {
  const cacheKey = `${assetFamilyForKind(kind)}:${normalizeSourceUrlKey(sourceUrl)}`;
  const cached = context.cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const assetIndex = context.nextAssetIndex;
  context.nextAssetIndex += 1;

  const promise = importRemoteAsset(env, sourceUrl, slug, requestId, assetIndex, kind).then((result) => {
    if (result.status === 'uploaded') {
      context.uploadedKeys.push(result.key);
      context.importedAssets.push({
        kind: result.kind,
        sourceUrl: result.sourceUrl,
        r2Url: result.publicUrl,
      });
    } else if (result.status === 'failed') {
      context.failedAssets.push({
        kind: result.kind,
        sourceUrl: result.sourceUrl,
        reason: result.reason,
      });
    }

    return result;
  });

  context.cache.set(cacheKey, promise);
  return promise;
}

async function rewriteBodyImages(
  body: string,
  env: Env,
  context: ImportContext,
  slug: string,
  requestId: string
): Promise<string> {
  const candidates = collectBodyImageCandidates(body);
  if (candidates.length === 0) {
    return body;
  }

  let rewrittenBody = body;
  for (const candidate of candidates) {
    const result = await ensureImportedAsset(env, context, candidate.sourceUrl, slug, requestId, 'body_image');
    const replacementUrl =
      result.status === 'uploaded' || result.status === 'skipped' ? result.publicUrl : candidate.sourceUrl;

    if (replacementUrl === candidate.sourceUrl) {
      continue;
    }

    rewrittenBody =
      rewrittenBody.slice(0, candidate.start) +
      replacementUrl +
      rewrittenBody.slice(candidate.end);
  }

  return rewrittenBody;
}

async function cleanupUploadedAssets(env: Env, keys: string[]): Promise<void> {
  await Promise.allSettled(keys.map((key) => env.MEDIA_BUCKET.delete(key)));
}

async function handlePublishPost(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!isPublishAuthorized(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401, cors);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, cors);
  }

  let normalized: NormalizedPublishPayload;
  try {
    normalized = normalizePublishPayload(payload);
  } catch (error) {
    if (error instanceof RouteError) {
      return jsonResponse({ error: error.message }, error.status, cors);
    }
    throw error;
  }

  const repoPath = `src/content/posts/${normalized.slug}.md`;
  try {
    const exists = await checkGitHubPathExists(env, repoPath);
    if (exists) {
      return jsonResponse({ error: 'A post with that slug already exists' }, 409, cors);
    }
  } catch (error) {
    if (error instanceof RouteError) {
      return jsonResponse({ error: error.message }, error.status, cors);
    }
    throw error;
  }

  const requestId = crypto.randomUUID();
  const importContext: ImportContext = {
    cache: new Map(),
    importedAssets: [],
    failedAssets: [],
    uploadedKeys: [],
    nextAssetIndex: 1,
  };

  let featuredImage = normalized.featuredImage;
  if (featuredImage) {
    const result = await ensureImportedAsset(env, importContext, featuredImage, normalized.slug, requestId, 'featured_image');
    if (result.status === 'uploaded' || result.status === 'skipped') {
      featuredImage = result.publicUrl;
    }
  }

  let podcastAudio = normalized.podcastAudio;
  if (podcastAudio) {
    const result = await ensureImportedAsset(env, importContext, podcastAudio, normalized.slug, requestId, 'podcast_audio');
    if (result.status === 'uploaded' || result.status === 'skipped') {
      podcastAudio = result.publicUrl;
    }
  }

  const finalPayload: NormalizedPublishPayload = {
    ...normalized,
    body: await rewriteBodyImages(normalized.body, env, importContext, normalized.slug, requestId),
    featuredImage,
    featuredImageAlt: featuredImage ? normalized.featuredImageAlt : undefined,
    podcastAudio,
  };

  const markdown = serializePostMarkdown(finalPayload);

  try {
    const commit = await createGitHubFile(
      env,
      repoPath,
      markdown,
      `Create ${finalPayload.status} post: ${finalPayload.slug}`
    );

    const sitePath = `/post/${finalPayload.slug}`;
    return jsonResponse(
      {
        slug: finalPayload.slug,
        status: finalPayload.status,
        repoPath,
        commitSha: commit.commitSha,
        sitePath,
        publicUrl:
          finalPayload.status === 'published' ? new URL(sitePath, SITE_ORIGIN).toString() : undefined,
        fullyMirrored: importContext.failedAssets.length === 0,
        importedAssets: importContext.importedAssets,
        failedAssets: importContext.failedAssets,
      },
      201,
      cors
    );
  } catch (error) {
    await cleanupUploadedAssets(env, importContext.uploadedKeys);

    if (error instanceof RouteError) {
      return jsonResponse({ error: error.message }, error.status, cors);
    }

    return jsonResponse({ error: 'Failed to create post' }, 502, cors);
  }
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

    const { pathname } = url;

    // GET /api/assets — list objects
    if (request.method === 'GET' && pathname === '/api/assets') {
      if (!isAdminAuthorized(request, env)) return jsonResponse({ error: 'Unauthorized' }, 401, cors);

      const listed = await env.MEDIA_BUCKET.list();
      const items = listed.objects.map((obj) => ({
        key: obj.key,
        size: obj.size,
        url: buildPublicAssetUrl(env, obj.key),
      }));
      return jsonResponse(items, 200, cors);
    }

    // POST /api/assets/upload — upload file
    if (request.method === 'POST' && pathname === '/api/assets/upload') {
      if (!isAdminAuthorized(request, env)) return jsonResponse({ error: 'Unauthorized' }, 401, cors);

      const formData = await request.formData();
      const fileEntry = formData.get('file');
      if (!fileEntry || typeof fileEntry === 'string') {
        return jsonResponse({ error: 'No file provided' }, 400, cors);
      }

      const file = fileEntry as unknown as File;

      const key = `${Date.now()}-${sanitizeFileComponent(file.name, 'upload')}`;
      const upload = await putBucketObject(
        env,
        key,
        file.stream(),
        guessContentType(file.name, file.type)
      );

      return jsonResponse({ key: upload.key, url: upload.publicUrl }, 200, cors);
    }

    // POST /api/posts — create a new draft/published post in GitHub
    if (request.method === 'POST' && pathname === '/api/posts') {
      return handlePublishPost(request, env, cors);
    }

    // DELETE /api/assets/:key
    if (request.method === 'DELETE' && pathname.startsWith('/api/assets/')) {
      if (!isAdminAuthorized(request, env)) return jsonResponse({ error: 'Unauthorized' }, 401, cors);

      const key = decodeURIComponent(pathname.slice('/api/assets/'.length));
      await env.MEDIA_BUCKET.delete(key);
      return new Response(null, { status: 204, headers: cors });
    }

    // GET /media/:key — serve R2 object (public), with Range support for audio seeking
    if (request.method === 'GET' && pathname.startsWith('/media/')) {
      const key = decodeURIComponent(pathname.slice('/media/'.length));
      const rangeHeader = request.headers.get('Range');
      const object = rangeHeader
        ? await env.MEDIA_BUCKET.get(key, { range: rangeHeader })
        : await env.MEDIA_BUCKET.get(key);
      if (!object) return new Response('Not found', { status: 404 });

      const headers = new Headers(publicMediaCors);
      object.writeHttpMetadata(headers);
      headers.set('Cache-Control', 'public, max-age=31536000');
      headers.set('Accept-Ranges', 'bytes');

      if (rangeHeader && object.range) {
        const { offset = 0, length } = object.range as { offset?: number; length?: number };
        const total = object.size;
        headers.set('Content-Range', `bytes ${offset}-${offset + (length ?? total) - 1}/${total}`);
        headers.set('Content-Length', String(length ?? total));
        return new Response(object.body, { status: 206, headers });
      }

      return new Response(object.body, { status: 200, headers });
    }

    // POST /api/subscribe — proxy to Kit API v4
    if (request.method === 'POST' && pathname === '/api/subscribe') {
      let body: { email_address?: string };
      try {
        body = (await request.json()) as { email_address?: string };
      } catch {
        return jsonResponse({ error: 'Invalid JSON' }, 400, cors);
      }
      if (!body.email_address) return jsonResponse({ error: 'email_address required' }, 400, cors);

      const kitHeaders = {
        'Content-Type': 'application/json',
        'X-Kit-Api-Key': env.KIT_API_KEY,
      };

      const kitRes = await fetch('https://api.kit.com/v4/subscribers', {
        method: 'POST',
        headers: kitHeaders,
        body: JSON.stringify({ email_address: body.email_address }),
      });
      const data = (await kitRes.json()) as { subscriber?: { id: number } };

      // Apply "Joined Newsletter" tag
      const subscriberId = data.subscriber?.id;
      if (kitRes.ok && subscriberId) {
        await fetch('https://api.kit.com/v4/tags/17192988/subscribers', {
          method: 'POST',
          headers: kitHeaders,
          body: JSON.stringify({ id: subscriberId }),
        });
      }

      return jsonResponse(data, kitRes.status, cors);
    }

    return new Response('Not found', { status: 404 });
  },
};
