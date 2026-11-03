// Window manager. Runs in one of three modes:
//
// - Desktop (≥768px): the page is a multitasking desktop. The page's own
//   server-rendered window is adopted as-is; every other window opens in place
//   as an iframe of that page's real URL, so each app keeps its own scripts,
//   element ids and keyboard focus. The address bar and document title follow
//   the focused window.
// - Embedded: the page is loaded inside a desktop window's iframe. Only the
//   window content shows (see .rsb-embedded in window.css); links, clicks and
//   activity are handed up to the parent desktop.
// - Mobile (<768px): one full-screen window per page; Close navigates back.
//
// Window handling follows Windows 98: drag by the title bar (windows may hang
// off screen as long as the title bar stays reachable), resize from any edge
// or corner, double-click the title bar to maximize, caption "zoom" animations
// on minimize / maximize / restore, a system menu on the title bar icon and on
// right-click, and clicking the desktop deactivates every window.

export {};

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Sent by Window.astro from inside an iframe as soon as its window is parsed. */
interface FrameMeta {
  path: string;
  docTitle: string;
  key: string;
  title: string;
  icon?: string;
  width: number;
  height: number;
  resizable?: boolean;
}

interface ShellApi {
  open(href: string): void;
  closeFrame(frame: Element | null): void;
  resizeFrame(frame: Element | null, width: number, height: number): void;
  frameReady(frame: Element | null, meta: FrameMeta): void;
  frameFocus(frame: Element | null): void;
  activity(): void;
}

declare global {
  interface Window {
    __rsbShell?: ShellApi;
  }
}

interface ManagedWindow {
  el: HTMLElement;
  path: string;                     // pathname + search as served; compare with pathKey()
  key: string;                      // localStorage key suffix for position/size
  docTitle: string;
  frame: HTMLIFrameElement | null;  // null for the page's own server-rendered window
  btn: HTMLButtonElement | null;
  state: WindowState;
  minimized: boolean;
  ready: boolean;
  busy: boolean;                    // a caption animation is running
  pushHistory: boolean;             // add a history entry once the window appears
}

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const TASKBAR_HEIGHT = 40;
const BEZEL_SIDE   = 18;  // top / left / right bezel thickness (px)
const BEZEL_BOTTOM = 50;  // bottom bezel thickness (px)
const MIN_SIZE = 320;
const WINDOW_GAP = 6;     // min gap between window edge and screen boundary (px)
const GRAB_MARGIN = 60;   // title bar width that must stay on screen when dragging (px)
const CASCADE_STEP = 24;  // offset between successively opened windows (px)
const ZOOM_MS = 200;      // caption zoom animation length
const KEY_STEP = 8;       // px per arrow key in system-menu Move / Size
const STORAGE_PREFIX = 'w98:window:';
const DESKTOP_TITLE = 'Real Serious Business';
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const EDGE_CURSORS: Record<Edge, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
};

/** Returns the usable screen rectangle, accounting for the monitor bezel
 *  when the frame is active (viewport ≥ 1100px). */
function screenBounds() {
  const bezel = window.innerWidth >= 1100;
  const sl = bezel ? BEZEL_SIDE : 0;
  const st = bezel ? BEZEL_SIDE : 0;
  const bottomReserved = TASKBAR_HEIGHT + (bezel ? BEZEL_BOTTOM : 0);
  return {
    left:   sl,
    top:    st,
    right:  window.innerWidth  - sl,
    bottom: window.innerHeight - bottomReserved,
  };
}

function getStoredState(key: string): WindowState | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    // The Word 97 toolbar stores font prefs under the same key, so check
    // that geometry is actually there.
    const s = JSON.parse(raw);
    if ([s.x, s.y, s.width, s.height].every(v => typeof v === 'number')) {
      return { x: s.x, y: s.y, width: s.width, height: s.height };
    }
  } catch {}
  return null;
}

function saveState(key: string, state: WindowState): void {
  try {
    const prev = JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) ?? '{}');
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ ...prev, ...state }));
  } catch {}
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Win98 lets a window hang off the left, right and bottom of the screen;
 *  only enough of the title bar to grab it again has to stay visible. */
function clampX(x: number, width: number): number {
  const b = screenBounds();
  return clamp(x, b.left - width + GRAB_MARGIN, b.right - GRAB_MARGIN);
}

function clampY(y: number): number {
  const b = screenBounds();
  return clamp(y, b.top, b.bottom - 20);
}

/** Default geometry: centered on screen, shifted down-right by `offset`. */
function centered(width: number, height: number, offset = 0): WindowState {
  const b = screenBounds();
  const screenW = b.right  - b.left;
  const screenH = b.bottom - b.top;
  const w = Math.min(width,  screenW - WINDOW_GAP);
  const h = Math.min(height, screenH - WINDOW_GAP);
  return {
    x: b.left + Math.max(0, Math.round((screenW - w) / 2)) + offset,
    y: b.top  + Math.max(0, Math.round((screenH - h) / 2)) + offset,
    width: w,
    height: h,
  };
}

function applyState(el: HTMLElement, state: WindowState): void {
  const b = screenBounds();
  const width  = clamp(state.width,  MIN_SIZE, b.right  - b.left - WINDOW_GAP);
  const height = clamp(state.height, MIN_SIZE, b.bottom - b.top  - WINDOW_GAP);
  el.style.left   = clampX(state.x, width) + 'px';
  el.style.top    = clampY(state.y) + 'px';
  el.style.width  = width  + 'px';
  el.style.height = height + 'px';
}

function fitMaximized(el: HTMLElement): void {
  const b = screenBounds();
  el.style.left   = b.left + 'px';
  el.style.top    = b.top  + 'px';
  el.style.width  = (b.right  - b.left) + 'px';
  el.style.height = (b.bottom - b.top)  + 'px';
}

function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/** Identity of a page, ignoring the trailing slash (production redirects
 *  /post/x to /post/x/, so both forms show up). */
function pathKey(path: string): string {
  const q = path.indexOf('?');
  return q === -1 ? normalizePath(path) : normalizePath(path.slice(0, q)) + path.slice(q);
}

/** Pages that open as desktop windows. The desktop itself, Shut Down, the CMS
 *  and plain files (rss.xml, danger.exe, images) load as normal pages. */
function isWindowable(pathname: string): boolean {
  return pathname !== '/'
    && !/^\/(shutdown|admin)(\/|$)/.test(pathname)
    && !/\.[a-z0-9]+$/i.test(pathname);
}

/** The URL of a plain left-click on a link, or null when the click should be
 *  left alone (modifier keys, explicit targets, in-page anchors, non-http). */
function clickedLink(e: MouseEvent): URL | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || a.hasAttribute('download')) return null;
  if (a.target && a.target !== '_self') return null;
  if (a.getAttribute('href')!.startsWith('#')) return null;
  const url = new URL(a.href);
  if (!/^https?:$/.test(url.protocol)) return null;
  if (url.origin === location.origin && url.hash && url.pathname === location.pathname) return null;
  return url;
}

/** Follows the pointer until release. Iframes would swallow pointer events
 *  while the pointer is over them, so they're made click-through meanwhile;
 *  `cursor` holds a resize cursor everywhere for the duration. */
function track(onMove: (e: PointerEvent) => void, onDone: () => void, cursor?: string): void {
  const root = document.documentElement;
  root.classList.add('rsb-dragging');
  if (cursor) root.style.setProperty('--rsb-drag-cursor', cursor);
  function onUp() {
    root.classList.remove('rsb-dragging');
    root.style.removeProperty('--rsb-drag-cursor');
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    onDone();
  }
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

/** New geometry after dragging `edge` by (dx, dy) from `start`. */
function resized(start: WindowState, edge: string, dx: number, dy: number): WindowState {
  const b = screenBounds();
  let { x, y, width, height } = start;
  if (edge.includes('e')) width = clamp(start.width + dx, MIN_SIZE, b.right - start.x);
  if (edge.includes('s')) height = clamp(start.height + dy, MIN_SIZE, b.bottom - start.y);
  if (edge.includes('w')) {
    width = clamp(start.width - dx, MIN_SIZE, start.x + start.width - b.left);
    x = start.x + start.width - width;
  }
  if (edge.includes('n')) {
    height = clamp(start.height - dy, MIN_SIZE, start.y + start.height - b.top);
    y = start.y + start.height - height;
  }
  return { x, y, width, height };
}

function place(el: HTMLElement, s: WindowState): void {
  el.style.left   = s.x + 'px';
  el.style.top    = s.y + 'px';
  el.style.width  = s.width + 'px';
  el.style.height = s.height + 'px';
}

function currentGeometry(el: HTMLElement): WindowState {
  return { x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
}

function isResizable(el: HTMLElement): boolean {
  return !!el.querySelector('.resize-handle');
}

/** Turn off resizing: no grip, no edges, Maximize greyed out (like Minesweeper). */
function makeFixedSize(el: HTMLElement): void {
  el.querySelectorAll('.resize-handle, .resize-edge').forEach(n => n.remove());
  el.querySelector<HTMLButtonElement>('[aria-label="Maximize"]')?.setAttribute('disabled', '');
}

function setupDragResize(el: HTMLElement, state: WindowState, save: () => void, activate: () => void): void {
  el.querySelector<HTMLElement>('.title-bar')?.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || el.classList.contains('maximized')) return;
    // Title bar buttons and the icon (system menu) aren't drag handles
    if ((e.target as HTMLElement).closest('.title-bar-controls, .title-bar-text img')) return;
    e.preventDefault();
    activate();
    const offX = e.clientX - el.offsetLeft;
    const offY = e.clientY - el.offsetTop;
    track((e) => {
      el.style.left = clampX(e.clientX - offX, el.offsetWidth) + 'px';
      el.style.top  = clampY(e.clientY - offY) + 'px';
    }, () => {
      state.x = el.offsetLeft;
      state.y = el.offsetTop;
      save();
    });
  });

  // Every edge and corner resizes; the grip in the corner is the se corner
  if (isResizable(el)) {
    const frame = el.querySelector('.window') ?? el;
    EDGES.forEach(edge => {
      const handle = document.createElement('div');
      handle.className = 'resize-edge';
      handle.dataset.edge = edge;
      handle.setAttribute('aria-hidden', 'true');
      frame.appendChild(handle);
    });
    el.querySelector<HTMLElement>('.resize-handle')!.dataset.edge = 'se';
  }

  el.addEventListener('pointerdown', (e) => {
    const handle = (e.target as HTMLElement).closest<HTMLElement>('.resize-edge, .resize-handle');
    if (!handle || e.button !== 0 || el.classList.contains('maximized')) return;
    e.preventDefault();
    e.stopPropagation();
    activate();
    const edge = handle.dataset.edge!;
    const start = currentGeometry(el);
    const startX = e.clientX;
    const startY = e.clientY;
    track((e) => {
      place(el, resized(start, edge, e.clientX - startX, e.clientY - startY));
    }, () => {
      Object.assign(state, currentGeometry(el));
      save();
    }, EDGE_CURSORS[edge as Edge]);
  }, true);

  el.addEventListener('pointerdown', activate);
}

function titleOf(el: HTMLElement): { title: string; icon?: string } {
  const titleEl = el.querySelector<HTMLElement>('.title-bar-text');
  return {
    title: (titleEl?.textContent ?? '').trim(),
    icon: titleEl?.querySelector('img')?.getAttribute('src') ?? undefined,
  };
}

function makeTaskbarButton(title: string, icon?: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'taskbar-window-btn';
  btn.appendChild(document.createElement('img'));
  btn.appendChild(document.createElement('span'));
  setButtonTitle(btn, title, icon);
  return btn;
}

function setButtonTitle(btn: HTMLButtonElement, title: string, icon?: string): void {
  btn.title = title;
  btn.querySelector('span')!.textContent = title;
  const img = btn.querySelector('img')!;
  img.alt = '';
  img.width = 16;
  img.height = 16;
  img.hidden = !icon;
  if (icon) img.src = icon;
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Win98's caption zoom: a copy of the title bar flies between two rects. */
function zoomCaption(el: HTMLElement, from: DOMRect, to: DOMRect): Promise<void> {
  if (reducedMotion.matches || !from.width || !to.width) return Promise.resolve();
  const bar = el.querySelector('.title-bar')!.cloneNode(true) as HTMLElement;
  bar.querySelector('.title-bar-controls')?.remove();
  bar.classList.remove('inactive');
  bar.classList.add('caption-zoom');
  document.body.appendChild(bar);
  const rect = (r: DOMRect) => ({
    left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px',
  });
  const anim = bar.animate([rect(from), rect(to)], { duration: ZOOM_MS, easing: 'linear' });
  // Animations stall in hidden or throttled tabs; never leave a window hidden
  const timeout = new Promise<void>(resolve => setTimeout(resolve, ZOOM_MS + 150));
  const done = () => { anim.cancel(); bar.remove(); };
  return Promise.race([anim.finished.then(() => {}), timeout]).then(done, done);
}

// ── Desktop ────────────────────────────────────────────────────────────────

function runDesktop(): void {
  const desktop = document.getElementById('desktop');
  const taskbar = document.getElementById('taskbar-windows');
  if (!desktop) return;

  const windows: ManagedWindow[] = [];  // back to front
  let desktopFocused = false;           // the desktop itself was clicked: no active window
  let sysMenu: HTMLElement | null = null;

  const topWindow = () => {
    for (let i = windows.length - 1; i >= 0; i--) {
      if (windows[i].ready && !windows[i].minimized) return windows[i];
    }
    return null;
  };
  const activeWindow = () => desktopFocused ? null : topWindow();

  function restack(): void {
    const active = activeWindow();
    windows.forEach((w, i) => {
      w.el.style.zIndex = String(100 + i);
      w.el.querySelector('.title-bar')?.classList.toggle('inactive', w !== active);
      w.btn?.classList.toggle('active', w === active);
    });
  }

  /** Point the address bar and tab title at the focused window. */
  function syncAddress(push = false): void {
    const w = topWindow();
    const path = w ? w.path : '/';
    document.title = w ? w.docTitle : DESKTOP_TITLE;
    if (pathKey(location.pathname + location.search) === pathKey(path)) return;
    if (push) history.pushState(null, '', path);
    else history.replaceState(null, '', path);
  }

  function barRect(w: ManagedWindow): DOMRect {
    return w.el.querySelector('.title-bar')!.getBoundingClientRect();
  }

  /** Bring to front and activate; a minimized window zooms up from its button. */
  function focus(w: ManagedWindow, push = false): void {
    desktopFocused = false;
    windows.splice(windows.indexOf(w), 1);
    windows.push(w);
    if (w.minimized) {
      w.minimized = false;
      w.el.classList.remove('minimized');
      if (w.btn && !w.busy) {
        w.busy = true;
        w.el.style.visibility = 'hidden';
        zoomCaption(w.el, w.btn.getBoundingClientRect(), barRect(w)).then(() => {
          w.el.style.visibility = '';
          w.busy = false;
        });
      }
    }
    restack();
    if (w.frame) {
      w.frame.contentWindow?.focus();
    } else if (document.activeElement instanceof HTMLIFrameElement) {
      document.activeElement.blur();
    }
    syncAddress(push);
  }

  function activateNext(): void {
    const next = topWindow();
    if (next) focus(next);
    else { restack(); syncAddress(); }
  }

  function minimize(w: ManagedWindow): void {
    if (w.minimized || w.busy) return;
    const from = barRect(w);
    w.minimized = true;
    w.el.classList.add('minimized');
    if (w.frame && document.activeElement === w.frame) w.frame.blur();
    if (w.btn) zoomCaption(w.el, from, w.btn.getBoundingClientRect());
    activateNext();
  }

  function close(w: ManagedWindow): void {
    w.el.remove();
    w.btn?.remove();
    windows.splice(windows.indexOf(w), 1);
    activateNext();
  }

  function toggleMaximize(w: ManagedWindow): void {
    if (w.busy) return;
    const maximizing = !w.el.classList.contains('maximized');
    if (maximizing && !isResizable(w.el)) return;
    const from = barRect(w);
    const btn = w.el.querySelector('[aria-label="Maximize"], [aria-label="Restore"]');
    w.el.classList.toggle('maximized', maximizing);
    if (maximizing) fitMaximized(w.el);
    else applyState(w.el, w.state);
    btn?.setAttribute('aria-label', maximizing ? 'Restore' : 'Maximize');
    // Hide the window while its caption zooms to the new size, then show it
    w.busy = true;
    w.el.style.visibility = 'hidden';
    zoomCaption(w.el, from, barRect(w)).then(() => {
      w.el.style.visibility = '';
      w.busy = false;
    });
  }

  function setTitle(w: ManagedWindow, title: string, icon?: string): void {
    const titleEl = w.el.querySelector<HTMLElement>('.title-bar-text');
    if (titleEl) {
      titleEl.replaceChildren();
      if (icon) {
        const img = document.createElement('img');
        img.src = icon;
        img.alt = '';
        img.width = 16;
        img.height = 16;
        img.style.cssText = 'image-rendering:pixelated;margin-right:4px;vertical-align:middle;';
        titleEl.appendChild(img);
      }
      titleEl.append(title);
    }
    if (w.btn) setButtonTitle(w.btn, title, icon);
  }

  // ── System menu (title bar icon, right-click on title bar or taskbar) ──

  function closeSysMenu(): void {
    sysMenu?.remove();
    sysMenu = null;
  }

  function openSysMenu(w: ManagedWindow, x: number, y: number, above = false): void {
    closeSysMenu();
    const maxed = w.el.classList.contains('maximized');
    const sizable = isResizable(w.el);
    const normal = !maxed && !w.minimized;
    const items: ([string, string, boolean, () => void, string?] | null)[] = [
      ['<u>R</u>estore',  'r', maxed || w.minimized, () => w.minimized ? focus(w) : toggleMaximize(w)],
      ['<u>M</u>ove',     'm', normal,               () => keyboardMove(w, 'move')],
      ['<u>S</u>ize',     's', normal && sizable,    () => keyboardMove(w, 'size')],
      ['Mi<u>n</u>imize', 'n', !w.minimized,         () => minimize(w)],
      ['Ma<u>x</u>imize', 'x', !maxed && sizable,    () => { if (w.minimized) focus(w); toggleMaximize(w); }],
      null,
      ['<b><u>C</u>lose</b>', 'c', true, () => close(w), 'Alt+F4'],
    ];

    const menu = document.createElement('div');
    menu.className = 'sys-menu';
    menu.setAttribute('role', 'menu');
    const actions = new Map<string, () => void>();
    items.forEach(item => {
      if (!item) {
        menu.appendChild(Object.assign(document.createElement('div'), { className: 'sys-menu-sep' }));
        return;
      }
      const [label, key, enabled, run, shortcut] = item;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'menuitem');
      btn.innerHTML = `<span>${label}</span>` + (shortcut ? `<span class="sys-menu-key">${shortcut}</span>` : '');
      btn.disabled = !enabled;
      if (enabled) actions.set(key, run);
      btn.addEventListener('click', () => { closeSysMenu(); run(); });
      menu.appendChild(btn);
    });
    // Accelerator keys, like the underlined letters promise
    menu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSysMenu();
      const run = actions.get(e.key.toLowerCase());
      if (run) { e.preventDefault(); closeSysMenu(); run(); }
    });

    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = clamp(x, 0, innerWidth - r.width) + 'px';
    menu.style.top  = clamp(above ? y - r.height : y, 0, innerHeight - r.height) + 'px';
    sysMenu = menu;
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }

  document.addEventListener('pointerdown', (e) => {
    if (sysMenu && !sysMenu.contains(e.target as Node)) closeSysMenu();
  }, true);
  document.addEventListener('rsb:frame-pointerdown', closeSysMenu);
  window.addEventListener('blur', () => { if (!sysMenu?.contains(document.activeElement)) closeSysMenu(); });

  /** System menu Move / Size: the window follows the mouse or arrow keys
   *  until a click, Enter or Escape (which puts it back). */
  function keyboardMove(w: ManagedWindow, mode: 'move' | 'size'): void {
    const root = document.documentElement;
    const start = currentGeometry(w.el);
    let geo = { ...start };
    let last: { x: number; y: number } | null = null;
    const apply = (dx: number, dy: number) => {
      if (mode === 'move') {
        geo = { ...geo, x: clampX(geo.x + dx, geo.width), y: clampY(geo.y + dy) };
      } else {
        geo = resized(geo, 'se', dx, dy);
      }
      place(w.el, geo);
    };
    const onMove = (e: PointerEvent) => {
      if (last) apply(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
    };
    const onKey = (e: KeyboardEvent) => {
      const step: Record<string, [number, number]> = {
        ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP],
      };
      if (step[e.key]) { e.preventDefault(); apply(...step[e.key]); }
      else if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    };
    const onClick = (e: PointerEvent) => { e.preventDefault(); e.stopPropagation(); finish(true); };
    function finish(keep: boolean) {
      root.classList.remove('rsb-dragging');
      root.style.removeProperty('--rsb-drag-cursor');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onClick, true);
      if (!keep) geo = start;
      place(w.el, geo);
      Object.assign(w.state, geo);
      saveState(w.key, w.state);
    }
    // Start listening after the click that chose the menu item
    setTimeout(() => {
      root.classList.add('rsb-dragging');
      root.style.setProperty('--rsb-drag-cursor', mode === 'move' ? 'move' : 'nwse-resize');
      document.addEventListener('pointermove', onMove);
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('pointerdown', onClick, true);
      (document.activeElement as HTMLElement | null)?.blur();
    });
  }

  function addToTaskbar(w: ManagedWindow): void {
    const { title, icon } = titleOf(w.el);
    w.btn = makeTaskbarButton(title, icon);
    // Win98: clicking the active window's button minimizes it
    w.btn.addEventListener('click', () => {
      if (w === activeWindow()) minimize(w);
      else focus(w);
    });
    w.btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openSysMenu(w, e.clientX, e.clientY, true);
    });
    taskbar?.appendChild(w.btn);
  }

  function wire(w: ManagedWindow): void {
    w.el.querySelector('.title-bar-controls')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      switch (btn.getAttribute('aria-label')) {
        case 'Minimize': minimize(w); break;
        case 'Maximize':
        case 'Restore':  toggleMaximize(w); focus(w); break;
        case 'Close':    close(w); break;
      }
    });

    const titleBar = w.el.querySelector<HTMLElement>('.title-bar')!;
    titleBar.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.title-bar-controls')) return;
      // Double-clicking the icon closes the window
      if (target.closest('.title-bar-text img')) close(w);
      else toggleMaximize(w);
    });
    titleBar.addEventListener('pointerdown', (e) => {
      const icon = (e.target as HTMLElement).closest('.title-bar-text img');
      if (!icon || e.button !== 0) return;
      e.stopPropagation();
      if (w !== activeWindow()) focus(w);
      if (sysMenu) { closeSysMenu(); return; }
      const r = titleBar.getBoundingClientRect();
      // Wait for the click to finish so it doesn't immediately dismiss the menu
      setTimeout(() => openSysMenu(w, r.left, r.bottom));
    });
    titleBar.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement).closest('.title-bar-controls')) return;
      e.preventDefault();
      if (w !== activeWindow()) focus(w);
      openSysMenu(w, e.clientX, e.clientY);
    });

    setupDragResize(w.el, w.state, () => saveState(w.key, w.state), () => {
      if (w !== activeWindow()) focus(w);
    });
  }

  function reveal(w: ManagedWindow, meta: Pick<FrameMeta, 'width' | 'height'>): void {
    const offset = ((windows.length - 1) % 6) * CASCADE_STEP;
    Object.assign(w.state, getStoredState(w.key) ?? centered(meta.width, meta.height, offset));
    applyState(w.el, w.state);
    w.el.classList.add('js-ready');
    w.ready = true;
    addToTaskbar(w);
    if (!windows.some(o => !o.ready)) desktop!.removeAttribute('aria-busy');
    focus(w, w.pushHistory);
  }

  function open(href: string, pushHistory = true): void {
    const url = new URL(href, location.href);
    const path = url.pathname + url.search;
    const existing = windows.find(w => pathKey(w.path) === pathKey(path));
    if (existing) {
      if (existing.ready) focus(existing);
      return;
    }

    const el = document.createElement('div');
    el.className = 'w98-window no-body-scroll';
    el.innerHTML = `
      <div class="window">
        <div class="title-bar">
          <div class="title-bar-text"></div>
          <div class="title-bar-controls">
            <button aria-label="Minimize"></button>
            <button aria-label="Maximize"></button>
            <button aria-label="Close"></button>
          </div>
        </div>
        <div class="window-body"><iframe class="window-frame"></iframe></div>
        <div class="resize-handle" aria-hidden="true"></div>
      </div>`;
    const frame = el.querySelector('iframe')!;

    const w: ManagedWindow = {
      el, path, key: normalizePath(url.pathname), docTitle: DESKTOP_TITLE, frame, btn: null,
      // Provisional size so the page lays out sensibly until it reports its own
      state: centered(640, 480),
      minimized: false, ready: false, busy: false, pushHistory,
    };
    applyState(el, w.state);
    windows.push(w);
    wire(w);
    desktop!.setAttribute('aria-busy', 'true');
    desktop!.appendChild(el);

    // Pages without a Window component never call frameReady. Full-page
    // layouts (standalone explainers) take over the tab; anything else, like a
    // 404, still shows in a window.
    frame.addEventListener('load', () => {
      if (w.ready) return;
      let title = path;
      try {
        const doc = frame.contentDocument;
        if (doc?.querySelector('[data-standalone]')) {
          location.href = frame.contentWindow!.location.href;
          return;
        }
        title = doc?.title || path;
      } catch {}
      w.docTitle = title;
      setTitle(w, title);
      reveal(w, { width: 640, height: 480 });
    });
    frame.src = url.pathname + url.search + url.hash;
  }

  const shell: ShellApi = {
    open,

    closeFrame(frameEl) {
      const w = windows.find(o => o.frame === frameEl);
      if (w) close(w);
    },

    // A page asking for a new window size (Minesweeper fitting its board)
    resizeFrame(frameEl, width, height) {
      const w = windows.find(o => o.frame === frameEl);
      if (!w || w.el.classList.contains('maximized')) return;
      const b = screenBounds();
      // Pull it back on screen if it grows past the right / bottom edge
      w.state.width = width;
      w.state.height = height;
      w.state.x = Math.max(b.left, Math.min(w.el.offsetLeft, b.right - width));
      w.state.y = Math.max(b.top, Math.min(w.el.offsetTop, b.bottom - height));
      applyState(w.el, w.state);
    },

    frameReady(frameEl, meta) {
      const w = windows.find(o => o.frame === frameEl);
      if (!w) return;
      const reloaded = w.ready && pathKey(w.path) === pathKey(meta.path);
      w.path = meta.path;
      w.key = meta.key;
      w.docTitle = meta.docTitle;
      if (w.frame) w.frame.title = meta.title;
      setTitle(w, meta.title, meta.icon);
      if (meta.resizable === false) makeFixedSize(w.el);
      if (!w.ready) {
        reveal(w, meta);
      } else {
        // The page reloaded itself after clearing its saved geometry
        // ("Reset window" in the Word 97 toolbar): snap back to defaults.
        if (reloaded && !getStoredState(w.key) && !w.el.classList.contains('maximized')) {
          Object.assign(w.state, centered(meta.width, meta.height));
          applyState(w.el, w.state);
        }
        if (w === topWindow()) syncAddress();
      }
    },

    frameFocus(frameEl) {
      document.dispatchEvent(new Event('rsb:frame-pointerdown'));
      const w = windows.find(o => o.frame === frameEl);
      if (w && w !== activeWindow()) focus(w);
    },

    activity() {
      document.dispatchEvent(new Event('rsb:activity'));
    },
  };
  window.__rsbShell = shell;

  // Adopt the page's own window(s)
  desktop.querySelectorAll<HTMLElement>('.w98-window[data-window-path]').forEach(el => {
    const key = el.dataset.windowPath!;
    const state = getStoredState(key) ?? centered(
      parseInt(el.dataset.defaultWidth ?? '640', 10),
      parseInt(el.dataset.defaultHeight ?? '480', 10),
    );
    applyState(el, state);
    el.classList.add('js-ready');

    // Floating dialogs like the newsletter popup stay out of the taskbar
    if (el.dataset.noTaskbar) {
      el.style.zIndex = '9000';
      setupDragResize(el, state, () => saveState(key, state), () => {});
      return;
    }

    if (!isResizable(el)) makeFixedSize(el);
    const w: ManagedWindow = {
      el, key, state,
      path: location.pathname + location.search,
      docTitle: document.title,
      frame: null, btn: null,
      minimized: false, ready: true, busy: false, pushHistory: false,
    };
    windows.push(w);
    wire(w);
    addToTaskbar(w);
  });
  restack();

  // Clicking the desktop itself (not a window, taskbar or menu) deactivates
  // every window, as in Win98
  desktop.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('.w98-window, .taskbar, .start-menu')) return;
    if (desktopFocused) return;
    desktopFocused = true;
    restack();
  });

  // Links anywhere on the desktop (icons, Start menu, the adopted window)
  // open windows instead of navigating away
  document.addEventListener('click', (e) => {
    const url = clickedLink(e);
    if (!url) return;
    if (url.origin !== location.origin) {
      // Same as links inside iframe windows: don't tear down the desktop
      if (!(e.target as Element).closest('.w98-window')) return;
      e.preventDefault();
      window.open(url.href, '_blank', 'noopener');
    } else if (isWindowable(url.pathname)) {
      e.preventDefault();
      open(url.href);
    }
  });

  window.addEventListener('popstate', () => {
    const path = location.pathname + location.search;
    const w = windows.find(o => pathKey(o.path) === pathKey(path));
    if (w) {
      focus(w);
    } else if (isWindowable(location.pathname)) {
      open(location.href, false);
    } else if (location.pathname === '/') {
      // Back to the bare desktop: get everything out of the way
      windows.forEach(o => { o.minimized = true; o.el.classList.add('minimized'); });
      restack();
      document.title = DESKTOP_TITLE;
    }
  });

  window.addEventListener('resize', () => {
    windows.forEach(w => { if (w.el.classList.contains('maximized')) fitMaximized(w.el); });
  });
}

// ── Embedded (inside a desktop window's iframe) ────────────────────────────

function runEmbedded(shell: ShellApi): void {
  const frame = window.frameElement;

  document.addEventListener('pointerdown', () => shell.frameFocus(frame), true);

  // The page's own (hidden) Close button, e.g. clicked by an About box's OK
  document.querySelectorAll('.w98-window:not([data-no-taskbar]) [aria-label="Close"]').forEach(btn =>
    btn.addEventListener('click', () => shell.closeFrame(frame))
  );

  // Keep the desktop's screensaver from kicking in while someone uses this window
  let lastPoke = 0;
  const poke = () => {
    const now = Date.now();
    if (now - lastPoke < 1000) return;
    lastPoke = now;
    shell.activity();
  };
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'].forEach(type =>
    document.addEventListener(type, poke, { capture: true, passive: true })
  );

  document.addEventListener('click', (e) => {
    const url = clickedLink(e);
    if (!url) return;
    e.preventDefault();
    if (url.origin !== location.origin) {
      // Most sites refuse to load in a frame; open them in a browser tab
      window.open(url.href, '_blank', 'noopener');
    } else if (isWindowable(url.pathname)) {
      shell.open(url.href);
    } else {
      window.top!.location.href = url.href;
    }
  });
}

// ── Mobile ─────────────────────────────────────────────────────────────────

function runMobile(): void {
  document.querySelectorAll<HTMLButtonElement>('[aria-label="Close"][data-back-href]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.href = btn.dataset.backHref ?? '/';
    });
  });

  const container = document.getElementById('taskbar-windows');
  let first = true;
  document.querySelectorAll<HTMLElement>('.w98-window').forEach(win => {
    if (win.dataset.noTaskbar) return;
    const { title, icon } = titleOf(win);
    const btn = makeTaskbarButton(title, icon);
    if (first) { btn.classList.add('active'); first = false; }
    container?.appendChild(btn);
  });
}

if (document.documentElement.classList.contains('rsb-embedded') && window.parent.__rsbShell) {
  runEmbedded(window.parent.__rsbShell);
} else if (window.innerWidth >= 768) {
  runDesktop();
} else {
  runMobile();
}
