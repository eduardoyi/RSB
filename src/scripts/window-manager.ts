interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TASKBAR_HEIGHT = 40;
const BEZEL_SIDE   = 18;  // top / left / right bezel thickness (px)
const BEZEL_BOTTOM = 50;  // bottom bezel thickness (px)
const MIN_SIZE = 320;
const STORAGE_PREFIX = 'w98:window:';

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

function getStoredState(path: string): WindowState | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + path);
    if (raw) return JSON.parse(raw) as WindowState;
  } catch {}
  return null;
}

function saveState(path: string, state: WindowState): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + path, JSON.stringify(state));
  } catch {}
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function initWindow(el: HTMLElement): void {
  const path = el.dataset.windowPath!;
  const defaultWidth = parseInt(el.dataset.defaultWidth ?? '640', 10);
  const defaultHeight = parseInt(el.dataset.defaultHeight ?? '480', 10);
  const defaultX = parseInt(el.dataset.defaultX ?? '60', 10);
  const defaultY = parseInt(el.dataset.defaultY ?? '40', 10);

  const stored = getStoredState(path);
  const bounds = screenBounds();
  const screenW = bounds.right  - bounds.left;
  const screenH = bounds.bottom - bounds.top;
  const state: WindowState = stored ?? {
    x: bounds.left + Math.max(0, Math.round((screenW - defaultWidth)  / 2)),
    y: bounds.top  + Math.max(0, Math.round((screenH - defaultHeight) / 2)),
    width: defaultWidth,
    height: defaultHeight,
  };

  applyState(el, state);
  el.classList.add('js-ready');

  const titleBar = el.querySelector<HTMLElement>('.title-bar');
  const resizeHandle = el.querySelector<HTMLElement>('.resize-handle');

  if (titleBar) {
    setupDrag(el, titleBar, path, state);
  }

  if (resizeHandle) {
    setupResize(el, resizeHandle, path, state);
  }

  setupMaximize(el, state);
}

function setupMaximize(el: HTMLElement, state: WindowState): void {
  el.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[aria-label="Maximize"]')) {
      const b = screenBounds();
      el.classList.add('maximized');
      el.style.left   = b.left + 'px';
      el.style.top    = b.top  + 'px';
      el.style.width  = (b.right  - b.left) + 'px';
      el.style.height = (b.bottom - b.top)  + 'px';
      target.closest('button')!.setAttribute('aria-label', 'Restore');
      bringToFront(el);
    } else if (target.closest('[aria-label="Restore"]')) {
      el.classList.remove('maximized');
      applyState(el, state);
      target.closest('button')!.setAttribute('aria-label', 'Maximize');
    }
  });
}

function applyState(el: HTMLElement, state: WindowState): void {
  const b = screenBounds();
  el.style.left   = clamp(state.x, b.left, b.right  - 40) + 'px';
  el.style.top    = clamp(state.y, b.top,  b.bottom - 40) + 'px';
  el.style.width  = Math.max(state.width,  MIN_SIZE) + 'px';
  el.style.height = Math.max(state.height, MIN_SIZE) + 'px';
}

// Map from window element → taskbar button (populated by createTaskbarButtons)
const windowBtnMap = new WeakMap<HTMLElement, HTMLButtonElement>();

function bringToFront(el: HTMLElement): void {
  const all = document.querySelectorAll<HTMLElement>('.w98-window');
  let max = 100;
  all.forEach(w => {
    const z = parseInt(w.style.zIndex || '100', 10);
    if (z > max) max = z;
  });
  el.style.zIndex = String(Math.min(max + 1, 9000));

  // Update active state on taskbar buttons
  document.querySelectorAll<HTMLButtonElement>('.taskbar-window-btn').forEach(b => b.classList.remove('active'));
  windowBtnMap.get(el)?.classList.add('active');
}

function setupDrag(el: HTMLElement, handle: HTMLElement, path: string, state: WindowState): void {
  handle.addEventListener('mousedown', (e: MouseEvent) => {
    if (el.classList.contains('maximized')) return;
    // Don't drag when clicking title bar buttons
    if ((e.target as HTMLElement).closest('.title-bar-controls')) return;

    bringToFront(el);
    const startX = e.clientX - el.offsetLeft;
    const startY = e.clientY - el.offsetTop;

    function onMouseMove(e: MouseEvent) {
      const b = screenBounds();
      const newX = clamp(e.clientX - startX, b.left, b.right  - el.offsetWidth);
      const newY = clamp(e.clientY - startY, b.top,  b.bottom - 20);
      el.style.left = newX + 'px';
      el.style.top = newY + 'px';
    }

    function onMouseUp() {
      state.x = el.offsetLeft;
      state.y = el.offsetTop;
      saveState(path, state);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  el.addEventListener('mousedown', () => bringToFront(el));
}

function setupResize(el: HTMLElement, handle: HTMLElement, path: string, state: WindowState): void {
  handle.addEventListener('mousedown', (e: MouseEvent) => {
    if (el.classList.contains('maximized')) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = el.offsetWidth;
    const startH = el.offsetHeight;

    function onMouseMove(e: MouseEvent) {
      const b = screenBounds();
      const maxW = b.right  - el.offsetLeft;
      const maxH = b.bottom - el.offsetTop;
      const newW = clamp(startW + e.clientX - startX, MIN_SIZE, maxW);
      const newH = clamp(startH + e.clientY - startY, MIN_SIZE, maxH);
      el.style.width = newW + 'px';
      el.style.height = newH + 'px';
    }

    function onMouseUp() {
      state.width = el.offsetWidth;
      state.height = el.offsetHeight;
      saveState(path, state);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function createTaskbarButtons(): void {
  const container = document.getElementById('taskbar-windows');
  if (!container) return;

  let first = true;
  document.querySelectorAll<HTMLElement>('.w98-window').forEach(win => {
    const titleEl = win.querySelector<HTMLElement>('.title-bar-text');
    if (!titleEl) return;

    const iconImg = titleEl.querySelector<HTMLImageElement>('img');
    const title = (titleEl.textContent ?? '').trim();

    const btn = document.createElement('button');
    btn.className = 'taskbar-window-btn';
    btn.title = title;
    if (first) { btn.classList.add('active'); first = false; }

    if (iconImg) {
      const img = document.createElement('img');
      img.src = iconImg.src;
      img.alt = '';
      img.width = 16;
      img.height = 16;
      btn.appendChild(img);
    }

    const span = document.createElement('span');
    span.textContent = title;
    btn.appendChild(span);

    windowBtnMap.set(win, btn);
    btn.addEventListener('click', () => bringToFront(win));
    container.appendChild(btn);
  });
}

// Only enable on desktop
if (window.innerWidth >= 768) {
  document.querySelectorAll<HTMLElement>('.w98-window').forEach(initWindow);
}

// Taskbar window buttons run on all screen sizes
createTaskbarButtons();
