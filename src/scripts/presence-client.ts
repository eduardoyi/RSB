// Types and lookup for the desktop's live connection (see presence.ts).
// No side effects, so windows such as Chat and Guestbook can import it even
// when they run inside a desktop window's iframe.

export interface PresenceUser {
  id: string;
  name: string;
  color: string;
  x: number | null;
  y: number | null;
}

export interface ChatMessage {
  id: number;
  name: string;
  color: string;
  text: string;
  ts: number;
}

export interface GuestbookEntry {
  id: number;
  name: string;
  text: string;
  ts: number;
}

/** What a request was for, so an error reaches the window that caused it. */
export type PresenceAction = 'chat' | 'sign' | 'name';

export type PresenceEvent =
  | { t: 'status'; connected: boolean }
  | { t: 'join'; user: PresenceUser }
  | { t: 'leave'; user: PresenceUser }
  | { t: 'rename'; user: PresenceUser; old: string }
  | { t: 'hits'; hits: number }
  | { t: 'chat'; msg: ChatMessage }
  | { t: 'chat-history'; msgs: ChatMessage[] }
  | { t: 'chat-del'; id: number }
  | { t: 'gb'; entries: GuestbookEntry[] }
  | { t: 'gb-new'; entry: GuestbookEntry }
  | { t: 'gb-del'; id: number }
  | { t: 'err'; text: string; for: PresenceAction | null };

export interface PresenceApi {
  readonly connected: boolean;
  readonly me: PresenceUser | null;
  /** Everyone else online right now. */
  readonly others: PresenceUser[];
  readonly hits: number;
  subscribe(listener: (e: PresenceEvent) => void): () => void;
  setName(name: string): void;
  chat(text: string): void;
  requestChatHistory(): void;
  requestGuestbook(): void;
  sign(name: string, text: string): void;
}

declare global {
  interface Window {
    __rsbPresence?: PresenceApi;
  }
}

/** The desktop's presence connection: from the parent page when running in a
 *  window's iframe, else from this page. Null if it never shows up (phones
 *  still get it; a page outside the desktop does not). */
export function getPresence(): Promise<PresenceApi | null> {
  const host = document.documentElement.classList.contains('rsb-embedded') ? window.parent : window;
  if (host.__rsbPresence) return Promise.resolve(host.__rsbPresence);
  return new Promise(resolve => {
    const done = () => resolve(host.__rsbPresence ?? null);
    host.addEventListener('rsb:presence-ready', done, { once: true });
    setTimeout(done, 3000);
  });
}

/** Subscribe for as long as this page is open. Listeners from a closed
 *  window's iframe must not linger in the parent page. */
export function subscribeWhileOpen(presence: PresenceApi, listener: (e: PresenceEvent) => void): void {
  const unsubscribe = presence.subscribe(listener);
  window.addEventListener('pagehide', unsubscribe, { once: true });
}
