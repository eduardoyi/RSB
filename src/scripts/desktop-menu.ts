// The desktop's right-click menu (Arrange Icons, Refresh, Properties…) and
// live wallpaper changes from Display Properties.

import { WALLPAPER_KEY, applyWallpaper, readWallpaper } from './display-settings';

interface MenuItem {
  label: string;        // may contain <u>/<b> markup
  run?: () => void;     // missing: greyed out
  submenu?: MenuItem[];
}

type MenuEntry = MenuItem | null;  // null: separator

function startDesktopMenu(): void {
  const desktop = document.getElementById('desktop');
  const iconsBox = desktop?.querySelector<HTMLElement>('.desktop-icons');
  if (!desktop || !iconsBox) return;

  // Wallpaper picked in Display Properties (in a window's iframe, or another tab)
  window.addEventListener('storage', (e) => {
    if (e.key === WALLPAPER_KEY) applyWallpaper(desktop, readWallpaper());
  });

  // Right-click menus need a mouse and room: desktop layout only
  if (window.innerWidth < 768) return;

  let menu: HTMLElement | null = null;

  function close(): void {
    menu?.remove();
    menu = null;
  }

  function build(entries: MenuEntry[]): HTMLElement {
    const el = document.createElement('div');
    el.className = 'sys-menu';
    el.setAttribute('role', 'menu');
    entries.forEach(entry => {
      if (!entry) {
        el.appendChild(Object.assign(document.createElement('div'), { className: 'sys-menu-sep' }));
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'menuitem');
      btn.innerHTML = `<span>${entry.label}</span>`;
      if (entry.submenu) {
        const wrap = document.createElement('div');
        wrap.className = 'sys-menu-sub';
        btn.insertAdjacentHTML('beforeend', '<span class="sys-menu-arrow">▶</span>');
        btn.setAttribute('aria-haspopup', 'true');
        wrap.append(btn, build(entry.submenu));
        el.appendChild(wrap);
        return;
      }
      btn.disabled = !entry.run;
      btn.addEventListener('click', () => {
        close();
        entry.run?.();
      });
      el.appendChild(btn);
    });
    return el;
  }

  function open(entries: MenuEntry[], x: number, y: number): void {
    close();
    menu = build(entries);
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, innerWidth - r.width - 2) + 'px';
    menu.style.top = Math.min(y, innerHeight - r.height - 2) + 'px';
    // Flip submenus to the left near the right edge of the screen
    menu.classList.toggle('sys-menu-flip', x + r.width * 2 > innerWidth);
  }

  // Icons sorted for this visit only, like Win98's Arrange Icons
  const ICON_TYPES: Record<string, number> = { folder: 0, app: 1, link: 2, document: 3 };
  function arrange(by: 'name' | 'type'): void {
    const icons = [...iconsBox!.querySelectorAll<HTMLElement>('.desktop-icon')];
    const name = (el: HTMLElement) => (el.textContent ?? '').trim().toLowerCase();
    icons.sort((a, b) => {
      if (by === 'type') {
        const t = (ICON_TYPES[a.dataset.type ?? ''] ?? 9) - (ICON_TYPES[b.dataset.type ?? ''] ?? 9);
        if (t) return t;
      }
      return name(a).localeCompare(name(b));
    });
    iconsBox!.append(...icons);
  }

  function refresh(): void {
    iconsBox!.style.visibility = 'hidden';
    setTimeout(() => { iconsBox!.style.visibility = ''; }, 120);
  }

  function openWindow(path: string): void {
    if (window.__rsbShell) window.__rsbShell.open(path);
    else location.href = path;
  }

  desktop.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement;
    // Windows, the taskbar and menus keep their own (or the browser's) menu
    if (target.closest('.w98-window, .taskbar, .start-menu, .sys-menu')) return;
    e.preventDefault();
    const icon = target.closest<HTMLAnchorElement>('.desktop-icon');
    if (icon) {
      open([
        { label: '<b><u>O</u>pen</b>', run: () => icon.click() },
        null,
        { label: 'Cu<u>t</u>' },
        { label: '<u>C</u>opy' },
        null,
        { label: 'Create <u>S</u>hortcut' },
        { label: '<u>D</u>elete' },
        { label: 'Rena<u>m</u>e' },
        null,
        { label: 'P<u>r</u>operties' },
      ], e.clientX, e.clientY);
      return;
    }
    open([
      { label: 'Arrange <u>I</u>cons', submenu: [
        { label: 'by <u>N</u>ame', run: () => arrange('name') },
        { label: 'by <u>T</u>ype', run: () => arrange('type') },
      ] },
      { label: 'Line <u>U</u>p Icons' },
      null,
      { label: 'R<u>e</u>fresh', run: refresh },
      null,
      { label: '<u>P</u>aste' },
      { label: 'Paste <u>S</u>hortcut' },
      null,
      { label: 'Ne<u>w</u>', submenu: [{ label: '<u>F</u>older' }, { label: '<u>S</u>hortcut' }] },
      null,
      { label: 'P<u>r</u>operties', run: () => openWindow('/display-properties') },
    ], e.clientX, e.clientY);
  });

  document.addEventListener('pointerdown', (e) => {
    if (menu && !menu.contains(e.target as Node)) close();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('rsb:frame-pointerdown', close);
  window.addEventListener('blur', close);
}

if (!document.documentElement.classList.contains('rsb-embedded')) {
  startDesktopMenu();
}
