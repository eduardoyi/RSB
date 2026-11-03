// Presence: the live, shared side of the desktop (server: worker-presence/).
//
// The top-level desktop page opens one WebSocket per tab. It draws other
// visitors' cursors over the desktop, keeps the "people online" count in the
// taskbar tray, and serves the Chat and Guestbook windows through
// window.__rsbPresence (see presence-client.ts), including from iframes.
//
// To stay inside Cloudflare's free tier, cursor moves are sent at most every
// CURSOR_INTERVAL_MS and only while the mouse moves, and a tab that stays in
// the background disconnects.

import type {
  ChatMessage, GuestbookEntry, PresenceAction, PresenceApi, PresenceEvent, PresenceUser,
} from './presence-client';

const SERVER_URL: string = import.meta.env.PUBLIC_PRESENCE_URL
  || (import.meta.env.DEV ? 'ws://localhost:8787/ws' : 'wss://rsb-presence.eduardoyi.workers.dev/ws');
const CURSOR_INTERVAL_MS = 150;
const HIDDEN_DISCONNECT_MS = 2 * 60_000;
const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
const NAME_KEY = 'rsb:presence-name';
const VISIT_KEY = 'rsb:visited';

type ServerMessage =
  | { t: 'welcome'; you: PresenceUser; users: PresenceUser[]; hits: number }
  | { t: 'join'; user: PresenceUser }
  | { t: 'leave'; id: string }
  | { t: 'cur'; id: string; x: number | null; y: number | null }
  | { t: 'name'; id: string; name: string }
  | { t: 'hits'; hits: number }
  | { t: 'chat'; msg: ChatMessage }
  | { t: 'chat-history'; msgs: ChatMessage[] }
  | { t: 'chat-del'; id: number }
  | { t: 'gb'; entries: GuestbookEntry[] }
  | { t: 'gb-new'; entry: GuestbookEntry }
  | { t: 'gb-del'; id: number }
  | { t: 'err'; text: string };

function storedName(): string {
  try {
    let name = localStorage.getItem(NAME_KEY);
    if (!name) {
      name = 'Guest' + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem(NAME_KEY, name);
    }
    return name;
  } catch {
    return 'Guest';
  }
}

function startPresence(): void {
  const desktop = document.getElementById('desktop');
  if (!desktop || !SERVER_URL) return;

  let ws: WebSocket | null = null;
  let connected = false;
  let me: PresenceUser | null = null;
  const users = new Map<string, PresenceUser>();
  let hits = 0;
  let name = storedName();
  let lastAction: PresenceAction | null = null;
  const listeners = new Set<(e: PresenceEvent) => void>();
  let retryMs = RECONNECT_MIN_MS;
  let retryTimer = 0;
  let hiddenTimer = 0;

  function emit(e: PresenceEvent): void {
    listeners.forEach(fn => {
      try { fn(e); } catch { listeners.delete(fn); }  // listener from a closed iframe
    });
  }

  function send(msg: object): void {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  // ── Connection ───────────────────────────────────────────────────────────

  function connect(): void {
    if (ws || document.hidden) return;
    clearTimeout(retryTimer);
    let socket: WebSocket;
    try { socket = new WebSocket(SERVER_URL); } catch { return; }
    ws = socket;
    socket.addEventListener('open', () => {
      let visit = false;
      try {
        visit = !sessionStorage.getItem(VISIT_KEY);
        sessionStorage.setItem(VISIT_KEY, '1');
      } catch {}
      socket.send(JSON.stringify({ t: 'hello', name, visit }));
    });
    socket.addEventListener('message', (e) => {
      try { handle(JSON.parse(e.data)); } catch {}
    });
    socket.addEventListener('close', () => {
      if (ws !== socket) return;
      ws = null;
      const wasConnected = connected;
      connected = false;
      me = null;
      users.clear();
      renderCursors();
      renderTray();
      if (wasConnected) emit({ t: 'status', connected: false });
      if (!document.hidden) {
        retryTimer = window.setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, RECONNECT_MAX_MS);
      }
    });
  }

  function disconnect(): void {
    const socket = ws;
    if (!socket) return;
    socket.close();
    // Clear state now rather than wait for the close event
    socket.dispatchEvent(new Event('close'));
  }

  // A tab left in the background lets go of its connection after a while
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      sendCursor(null);
      hiddenTimer = window.setTimeout(disconnect, HIDDEN_DISCONNECT_MS);
    } else {
      clearTimeout(hiddenTimer);
      retryMs = RECONNECT_MIN_MS;
      connect();
    }
  });

  function handle(msg: ServerMessage): void {
    switch (msg.t) {
      case 'welcome':
        me = msg.you;
        hits = msg.hits;
        users.clear();
        msg.users.forEach(u => users.set(u.id, u));
        connected = true;
        retryMs = RECONNECT_MIN_MS;
        emit({ t: 'status', connected: true });
        emit({ t: 'hits', hits });
        break;
      case 'join':
        users.set(msg.user.id, msg.user);
        emit({ t: 'join', user: msg.user });
        break;
      case 'leave': {
        const user = users.get(msg.id);
        users.delete(msg.id);
        if (user) emit({ t: 'leave', user });
        break;
      }
      case 'cur': {
        const user = users.get(msg.id);
        if (user) { user.x = msg.x; user.y = msg.y; }
        renderCursor(msg.id);
        return;
      }
      case 'name': {
        const user = msg.id === me?.id ? me : users.get(msg.id);
        if (!user) return;
        const old = user.name;
        user.name = msg.name;
        emit({ t: 'rename', user, old });
        break;
      }
      case 'hits':
        hits = msg.hits;
        emit({ t: 'hits', hits });
        break;
      case 'err':
        emit({ t: 'err', text: msg.text, for: lastAction });
        return;
      default:
        emit(msg);
        return;
    }
    renderCursors();
    renderTray();
  }

  // ── Cursors ──────────────────────────────────────────────────────────────

  const canPoint = window.innerWidth >= 768 && matchMedia('(pointer: fine)').matches;
  const layer = document.createElement('div');
  layer.className = 'rsb-cursors';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  const cursorEls = new Map<string, HTMLElement>();

  function renderCursor(id: string): void {
    const user = users.get(id);
    let el = cursorEls.get(id);
    if (!user || user.x === null || user.y === null || !canPoint) {
      el?.remove();
      cursorEls.delete(id);
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.className = 'rsb-cursor';
      el.innerHTML = `
        <svg viewBox="0 0 12 19" width="12" height="19"><path d="M1 1v15l4-4 3 6 2-1-3-6h5z" fill="currentColor" stroke="#fff" stroke-width="1"/></svg>
        <span class="rsb-cursor-name"></span>`;
      layer.appendChild(el);
      cursorEls.set(id, el);
    }
    el.style.color = user.color;
    el.querySelector('.rsb-cursor-name')!.textContent = user.name;
    const r = desktop!.getBoundingClientRect();
    el.style.transform = `translate(${r.left + user.x * r.width}px, ${r.top + user.y * r.height}px)`;
  }

  function renderCursors(): void {
    cursorEls.forEach((_, id) => { if (!users.has(id)) renderCursor(id); });
    users.forEach((_, id) => renderCursor(id));
  }

  window.addEventListener('resize', renderCursors);

  // Our own cursor, as a fraction of the desktop so it lands in the same
  // place on other people's screens whatever their window size
  let pending: { x: number; y: number } | null | undefined;
  let lastSent = 0;
  let sendTimer = 0;

  function sendCursor(pos: { x: number; y: number } | null): void {
    if (!canPoint || !connected) return;
    pending = pos;
    const wait = CURSOR_INTERVAL_MS - (Date.now() - lastSent);
    if (wait <= 0) flushCursor();
    else if (!sendTimer) sendTimer = window.setTimeout(flushCursor, wait);
  }

  function flushCursor(): void {
    sendTimer = 0;
    if (pending === undefined) return;
    lastSent = Date.now();
    send({ t: 'cur', x: pending?.x ?? null, y: pending?.y ?? null });
    pending = undefined;
  }

  function pointerAt(clientX: number, clientY: number): void {
    const r = desktop!.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    const y = (clientY - r.top) / r.height;
    sendCursor(x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null);
  }

  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') pointerAt(e.clientX, e.clientY);
  });
  // Moves inside windows' iframes, translated to this page by the window manager
  document.addEventListener('rsb:pointer', (e) => {
    const p = (e as CustomEvent<{ x: number; y: number } | null>).detail;
    if (p) pointerAt(p.x, p.y);
    else sendCursor(null);
  });
  document.documentElement.addEventListener('mouseleave', () => sendCursor(null));

  // ── Taskbar tray ─────────────────────────────────────────────────────────

  const tray = document.getElementById('tray-presence') as HTMLButtonElement | null;
  const trayCount = document.getElementById('tray-presence-count');

  function renderTray(): void {
    if (!tray || !trayCount) return;
    tray.hidden = !connected;
    const online = users.size + 1;
    trayCount.textContent = String(online);
    tray.title = `${online} ${online === 1 ? 'person' : 'people'} on Real Serious Business right now`
      + (hits ? ` · ${hits.toLocaleString('en-US')} visits so far` : '');
  }

  tray?.addEventListener('click', () => {
    if (window.__rsbShell) window.__rsbShell.open('/chat');
    else location.href = '/chat';
  });

  // ── API for the Chat and Guestbook windows ───────────────────────────────

  const api: PresenceApi = {
    get connected() { return connected; },
    get me() { return me; },
    get others() { return [...users.values()]; },
    get hits() { return hits; },
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    setName(newName) {
      name = newName.trim().slice(0, 20) || name;
      try { localStorage.setItem(NAME_KEY, name); } catch {}
      lastAction = 'name';
      send({ t: 'name', name });
    },
    chat(text) {
      lastAction = 'chat';
      send({ t: 'chat', text });
    },
    requestChatHistory() { send({ t: 'chat-history' }); },
    requestGuestbook() { send({ t: 'gb' }); },
    sign(signName, text) {
      lastAction = 'sign';
      send({ t: 'sign', name: signName, text });
    },
  };
  window.__rsbPresence = api;
  window.dispatchEvent(new Event('rsb:presence-ready'));

  connect();
}

// Only the top-level desktop connects; windows' iframes use the parent's
if (!document.documentElement.classList.contains('rsb-embedded') && !window.__rsbPresence) {
  startPresence();
}
