// Display Properties settings: wallpaper and screen saver. Kept in
// localStorage per visitor; changes reach every open desktop through the
// `storage` event. No side effects, so any page or window can import it.

export interface Wallpaper {
  id: string;
  name: string;
  src: string | null;
}

/** Wallpapers in public/wallpapers/, made for this site. */
export const WALLPAPERS: Wallpaper[] = [
  { id: 'none',    name: '(None)',         src: null },
  { id: 'clouds',  name: 'Clouds at Dusk', src: '/wallpapers/clouds.webp' },
  { id: 'ribbons', name: 'Teal Ribbons',   src: '/wallpapers/ribbons.webp' },
  { id: 'lake',    name: 'Pixel Lake',     src: '/wallpapers/lake.webp' },
  { id: 'space',   name: 'Deep Space',     src: '/wallpapers/space.webp' },
  { id: 'circuit', name: 'Circuit Board',  src: '/wallpapers/circuit.webp' },
];

export type WallpaperMode = 'center' | 'tile' | 'stretch';

export interface WallpaperSetting {
  id: string;
  mode: WallpaperMode;
}

export interface ScreensaverSetting {
  enabled: boolean;
  minutes: number;
}

// The desktop's inline script in DesktopLayout.astro reads WALLPAPER_KEY
// before first paint, so the stored value also carries `src`.
export const WALLPAPER_KEY = 'rsb:wallpaper';
export const SCREENSAVER_KEY = 'rsb:screensaver';

const MODES: WallpaperMode[] = ['center', 'tile', 'stretch'];

function readJson(key: string): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}') ?? {}; } catch { return {}; }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    // `storage` only fires in other documents; tell this one too
    window.dispatchEvent(new StorageEvent('storage', { key }));
  } catch {}
}

export function readWallpaper(): WallpaperSetting {
  const s = readJson(WALLPAPER_KEY);
  const id = WALLPAPERS.some(w => w.id === s.id) ? String(s.id) : 'none';
  const mode = MODES.includes(s.mode as WallpaperMode) ? s.mode as WallpaperMode : 'stretch';
  return { id, mode };
}

export function saveWallpaper(setting: WallpaperSetting): void {
  const src = WALLPAPERS.find(w => w.id === setting.id)?.src ?? null;
  writeJson(WALLPAPER_KEY, { ...setting, src });
}

/** Paint a wallpaper onto the desktop (or a preview screen). */
export function applyWallpaper(el: HTMLElement, setting: WallpaperSetting): void {
  const src = WALLPAPERS.find(w => w.id === setting.id)?.src;
  el.style.backgroundImage = src ? `url("${src}")` : '';
  if (src) el.dataset.wallpaper = setting.mode;
  else delete el.dataset.wallpaper;
}

export function readScreensaver(): ScreensaverSetting {
  const s = readJson(SCREENSAVER_KEY);
  const minutes = Number(s.minutes);
  return {
    enabled: s.enabled !== false,
    minutes: Number.isFinite(minutes) && minutes >= 1 && minutes <= 60 ? Math.round(minutes) : 2,
  };
}

export function saveScreensaver(setting: ScreensaverSetting): void {
  writeJson(SCREENSAVER_KEY, setting);
}
