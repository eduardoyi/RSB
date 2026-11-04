// Screensaver: fullscreen YouTube embed after a few idle minutes (desktop
// ≥768px). On/off and the wait come from Display Properties > Screen Saver.
// Any input dismisses it.

import { SCREENSAVER_KEY, readScreensaver } from './display-settings';

(function () {
  if (window.innerWidth < 768) return;
  // Inside a desktop window: the parent desktop runs the screensaver
  if (document.documentElement.classList.contains('rsb-embedded')) return;

  const EMBED   = 'https://www.youtube.com/embed/I0hypYunmwI?autoplay=1&mute=1&loop=1&list=PLfIhUmTWHNva3Tt_L80lErZfEWMROTX5y&index=0';

  let settings = readScreensaver();
  let overlay: HTMLDivElement | null = null;

  function show() {
    if (overlay || !settings.enabled) return;
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;cursor:none;';

    const iframe = document.createElement('iframe');
    iframe.src = EMBED;
    iframe.allow = 'autoplay; fullscreen';
    // Oversized by 10% on each side to push the YouTube title bar off-screen
    iframe.style.cssText = 'position:absolute;top:-10%;left:-10%;width:120%;height:120%;border:none;';

    overlay.appendChild(iframe);
    document.body.appendChild(overlay);
  }

  function hide() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
  }

  let idleTimer = 0;
  let hideTimer = 0;

  function startIdleTimer() {
    clearTimeout(idleTimer);
    if (settings.enabled) idleTimer = window.setTimeout(show, settings.minutes * 60_000);
  }

  function bump() {
    // Delay hiding so the screensaver is briefly visible before dismissing
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hide, 1000);
    startIdleTimer();
  }

  // rsb:activity is forwarded from windows' iframes by the window manager
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'rsb:activity'].forEach(e =>
    document.addEventListener(e, bump, { passive: true })
  );

  // Settings changed in Display Properties
  window.addEventListener('storage', (e) => {
    if (e.key !== SCREENSAVER_KEY) return;
    settings = readScreensaver();
    startIdleTimer();
  });

  // Start the idle timer on load (no hide delay needed on first run)
  startIdleTimer();
})();
