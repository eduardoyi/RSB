// rsb-presence: the multiplayer side of the Win98 desktop.
//
// Every visitor's desktop opens one WebSocket to a single Durable Object,
// "desktop", which relays live cursors and who's online, and keeps the chat,
// the guestbook and the hit counter in its SQLite storage. Sockets use the
// Hibernation API, so an idle room costs nothing while people stay connected.
//
// Protocol: JSON messages with a `t` (type) field; see ClientMessage and the
// sends below. The site's side is src/scripts/presence.ts.

import { DurableObject } from 'cloudflare:workers';

const ROOM_NAME = 'desktop';
const MAX_CONNECTIONS = 60;          // past this, new visitors just don't join
const MAX_MESSAGE_BYTES = 2_000;
const NAME_MAX = 20;
const CHAT_MAX = 200;
const GUESTBOOK_MAX = 500;
const CHAT_KEEP = 100;               // messages kept in storage
const CHAT_HISTORY = 50;             // messages sent when the chat opens
const GUESTBOOK_PAGE = 50;
const CHAT_INTERVAL_MS = 1_500;      // per visitor
const CHAT_ROOM_PER_MINUTE = 60;     // everyone together
const NAME_INTERVAL_MS = 1_000;
const SIGN_INTERVAL_MS = 10 * 60_000; // per IP address
const SIGN_ROOM_PER_HOUR = 30;

// Cursor and name colours: readable on both the teal desktop and silver windows
const COLORS = [
  '#c00000', '#0000c0', '#007000', '#800080', '#b05000', '#000000',
  '#a000a0', '#606000', '#ff2020', '#0060ff', '#00a000', '#e000e0',
];

interface Conn {
  id: string;
  name: string;
  color: string;
  x: number | null;    // cursor position as a fraction of the visitor's desktop
  y: number | null;
  joined: boolean;     // has sent "hello"
  lastChat: number;
  lastName: number;
  ip: string;          // salted hash, only used to rate-limit the guestbook
}

type ClientMessage =
  | { t: 'hello'; name?: string; visit?: boolean }
  | { t: 'cur'; x: number | null; y: number | null }
  | { t: 'name'; name: string }
  | { t: 'chat'; text: string }
  | { t: 'chat-history' }
  | { t: 'gb' }
  | { t: 'sign'; name: string; text: string };

// Type aliases (not interfaces) so they satisfy sql.exec's row constraint
type ChatRow = { id: number; name: string; color: string; text: string; ts: number };
type GuestbookRow = { id: number; name: string; text: string; ts: number };

/** Strip control and invisible characters, collapse whitespace. */
function clean(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Links are the main thing spammers want; keep them out. */
function noLinks(s: string): string {
  return s.replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link]');
}

function publicUser(c: Conn) {
  return { id: c.id, name: c.name, color: c.color, x: c.x, y: c.y };
}

function fraction(v: unknown): number | null {
  return typeof v === 'number' && v >= 0 && v <= 1 ? Math.round(v * 10_000) / 10_000 : null;
}

export class Room extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS chat (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, color TEXT NOT NULL,
          text TEXT NOT NULL, ts INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS guestbook (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
          text TEXT NOT NULL, ts INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS sign_limits (ip TEXT PRIMARY KEY, ts INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      `);
      // Random salt for hashing IP addresses, created once
      this.sql.exec(`INSERT OR IGNORE INTO meta (key, value) VALUES ('pepper', ?)`,
        crypto.randomUUID() + crypto.randomUUID());
    });
  }

  // ── Connections ──────────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    if (this.ctx.getWebSockets().length >= MAX_CONNECTIONS) {
      return new Response('Room is full', { status: 503 });
    }
    const conn: Conn = {
      id: crypto.randomUUID().slice(0, 8),
      name: 'Guest',
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      x: null,
      y: null,
      joined: false,
      lastChat: 0,
      lastName: 0,
      ip: await this.hashIp(request.headers.get('CF-Connecting-IP') ?? ''),
    };
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(conn);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return;
    let msg: ClientMessage;
    try { msg = JSON.parse(raw); } catch { return; }
    const conn = ws.deserializeAttachment() as Conn;
    const now = Date.now();

    switch (msg.t) {
      case 'hello': {
        if (conn.joined) return;
        conn.joined = true;
        conn.name = clean(msg.name, NAME_MAX) || conn.name;
        ws.serializeAttachment(conn);
        const hits = msg.visit ? this.bumpHits() : this.hits();
        this.send(ws, {
          t: 'welcome',
          you: publicUser(conn),
          users: this.users().filter(u => u.id !== conn.id),
          hits,
        });
        this.broadcast({ t: 'join', user: publicUser(conn) }, ws);
        if (msg.visit) this.broadcast({ t: 'hits', hits }, ws);
        return;
      }

      case 'cur': {
        if (!conn.joined) return;
        conn.x = fraction(msg.x);
        conn.y = conn.x === null ? null : fraction(msg.y);
        if (conn.y === null) conn.x = null;
        ws.serializeAttachment(conn);
        this.broadcast({ t: 'cur', id: conn.id, x: conn.x, y: conn.y }, ws);
        return;
      }

      case 'name': {
        const name = clean(msg.name, NAME_MAX);
        if (!conn.joined || !name || now - conn.lastName < NAME_INTERVAL_MS) return;
        conn.name = name;
        conn.lastName = now;
        ws.serializeAttachment(conn);
        this.broadcast({ t: 'name', id: conn.id, name });
        return;
      }

      case 'chat': {
        const text = noLinks(clean(msg.text, CHAT_MAX));
        if (!conn.joined || !text) return;
        if (now - conn.lastChat < CHAT_INTERVAL_MS) {
          this.send(ws, { t: 'err', text: 'Slow down a little.' });
          return;
        }
        const recent = this.sql.exec<{ n: number }>(
          'SELECT COUNT(*) AS n FROM chat WHERE ts > ?', now - 60_000).one().n;
        if (recent >= CHAT_ROOM_PER_MINUTE) {
          this.send(ws, { t: 'err', text: 'The chat is busy. Try again in a minute.' });
          return;
        }
        conn.lastChat = now;
        ws.serializeAttachment(conn);
        const row = this.sql.exec<ChatRow>(
          'INSERT INTO chat (name, color, text, ts) VALUES (?, ?, ?, ?) RETURNING id, name, color, text, ts',
          conn.name, conn.color, text, now).one();
        this.sql.exec('DELETE FROM chat WHERE id <= ?', row.id - CHAT_KEEP);
        this.broadcast({ t: 'chat', msg: row });
        return;
      }

      case 'chat-history': {
        const rows = this.sql.exec<ChatRow>(
          'SELECT id, name, color, text, ts FROM chat ORDER BY id DESC LIMIT ?', CHAT_HISTORY).toArray();
        this.send(ws, { t: 'chat-history', msgs: rows.reverse() });
        return;
      }

      case 'gb': {
        this.send(ws, { t: 'gb', entries: this.guestbook() });
        return;
      }

      case 'sign': {
        const name = clean(msg.name, NAME_MAX);
        const text = noLinks(clean(msg.text, GUESTBOOK_MAX));
        if (!name || !text) {
          this.send(ws, { t: 'err', text: 'Please fill in your name and a message.' });
          return;
        }
        this.sql.exec('DELETE FROM sign_limits WHERE ts < ?', now - SIGN_INTERVAL_MS);
        const last = this.sql.exec<{ ts: number }>('SELECT ts FROM sign_limits WHERE ip = ?', conn.ip).toArray()[0];
        if (last) {
          const minutes = Math.ceil((SIGN_INTERVAL_MS - (now - last.ts)) / 60_000);
          this.send(ws, { t: 'err', text: `You can sign again in ${minutes} minute${minutes === 1 ? '' : 's'}.` });
          return;
        }
        const lastHour = this.sql.exec<{ n: number }>(
          'SELECT COUNT(*) AS n FROM guestbook WHERE ts > ?', now - 3_600_000).one().n;
        if (lastHour >= SIGN_ROOM_PER_HOUR) {
          this.send(ws, { t: 'err', text: 'The guestbook is busy. Try again later.' });
          return;
        }
        const entry = this.sql.exec<GuestbookRow>(
          'INSERT INTO guestbook (name, text, ts) VALUES (?, ?, ?) RETURNING id, name, text, ts',
          name, text, now).one();
        this.sql.exec('INSERT OR REPLACE INTO sign_limits (ip, ts) VALUES (?, ?)', conn.ip, now);
        this.broadcast({ t: 'gb-new', entry });
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  private leave(ws: WebSocket): void {
    const conn = ws.deserializeAttachment() as Conn | null;
    if (conn?.joined) this.broadcast({ t: 'leave', id: conn.id }, ws);
  }

  // ── Admin (called from the Worker's /admin routes) ───────────────────────

  async listChat(): Promise<ChatRow[]> {
    return this.sql.exec<ChatRow>('SELECT id, name, color, text, ts FROM chat ORDER BY id DESC').toArray();
  }

  async listGuestbook(): Promise<GuestbookRow[]> {
    return this.sql.exec<GuestbookRow>('SELECT id, name, text, ts FROM guestbook ORDER BY id DESC').toArray();
  }

  async deleteChat(id: number): Promise<boolean> {
    const n = this.sql.exec('DELETE FROM chat WHERE id = ?', id).rowsWritten;
    if (n) this.broadcast({ t: 'chat-del', id });
    return n > 0;
  }

  async deleteGuestbook(id: number): Promise<boolean> {
    const n = this.sql.exec('DELETE FROM guestbook WHERE id = ?', id).rowsWritten;
    if (n) this.broadcast({ t: 'gb-del', id });
    return n > 0;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private users() {
    return this.ctx.getWebSockets()
      .map(ws => ws.deserializeAttachment() as Conn | null)
      .filter((c): c is Conn => !!c?.joined)
      .map(publicUser);
  }

  private guestbook(): GuestbookRow[] {
    return this.sql.exec<GuestbookRow>(
      'SELECT id, name, text, ts FROM guestbook ORDER BY id DESC LIMIT ?', GUESTBOOK_PAGE).toArray();
  }

  private hits(): number {
    return this.sql.exec<{ value: number }>("SELECT value FROM counters WHERE name = 'visits'").toArray()[0]?.value ?? 0;
  }

  private bumpHits(): number {
    return this.sql.exec<{ value: number }>(
      `INSERT INTO counters (name, value) VALUES ('visits', 1)
       ON CONFLICT(name) DO UPDATE SET value = value + 1 RETURNING value`).one().value;
  }

  private async hashIp(ip: string): Promise<string> {
    const pepper = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'pepper'").one().value;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pepper + ip));
    return [...new Uint8Array(digest)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private send(ws: WebSocket, msg: unknown): void {
    try { ws.send(JSON.stringify(msg)); } catch {}
  }

  private broadcast(msg: unknown, except?: WebSocket): void {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(data); } catch {}
    }
  }
}

// ── Worker ─────────────────────────────────────────────────────────────────

/** `wrangler types` can't see the class behind the binding, so type it here. */
function room(env: Env): DurableObjectStub<Room> {
  return (env.ROOM as unknown as DurableObjectNamespace<Room>).getByName(ROOM_NAME);
}

function allowedOrigin(env: Env, origin: string | null): boolean {
  return !!origin && env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).includes(origin);
}

async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const token = (env as Env & { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
  const given = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  if (!token || !given) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(token)),
    crypto.subtle.digest('SHA-256', enc.encode(given)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/** Moderation, with `Authorization: Bearer <ADMIN_TOKEN>`:
 *    GET    /admin/chat            GET    /admin/guestbook
 *    DELETE /admin/chat/<id>       DELETE /admin/guestbook/<id> */
async function admin(request: Request, env: Env, url: URL): Promise<Response> {
  if (!(await isAdmin(request, env))) return new Response('Forbidden', { status: 403 });
  const stub = room(env);
  const [, , kind, id] = url.pathname.split('/');
  if (kind !== 'chat' && kind !== 'guestbook') return new Response('Not found', { status: 404 });
  if (request.method === 'GET' && !id) {
    return Response.json(kind === 'chat' ? await stub.listChat() : await stub.listGuestbook());
  }
  if (request.method === 'DELETE' && /^\d+$/.test(id ?? '')) {
    const ok = kind === 'chat' ? await stub.deleteChat(Number(id)) : await stub.deleteGuestbook(Number(id));
    return new Response(null, { status: ok ? 204 : 404 });
  }
  return new Response('Method not allowed', { status: 405 });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket', { status: 426 });
      }
      if (!allowedOrigin(env, request.headers.get('Origin'))) {
        return new Response('Forbidden', { status: 403 });
      }
      return room(env).fetch(request);
    }
    if (url.pathname.startsWith('/admin/')) return admin(request, env, url);
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
