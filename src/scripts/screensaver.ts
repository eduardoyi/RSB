// Screensaver: fullscreen YouTube embed after 2 min idle (desktop ≥768px).
// Any input dismisses it.

(function () {
  if (window.innerWidth < 768) return;

  const IDLE_MS = 120_000;
  const EMBED   = 'https://www.youtube.com/embed/I0hypYunmwI?autoplay=1&mute=1&loop=1&list=PLfIhUmTWHNva3Tt_L80lErZfEWMROTX5y&index=0';

  let overlay: HTMLDivElement | null = null;

  function show() {
    if (overlay) return;
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

  function bump() {
    clearTimeout(idleTimer);
    // Delay hiding so the screensaver is briefly visible before dismissing
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hide, 1000);
    idleTimer = window.setTimeout(show, IDLE_MS);
  }

  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'].forEach(e =>
    document.addEventListener(e, bump, { passive: true })
  );

  // Start the idle timer on load (no hide delay needed on first run)
  idleTimer = window.setTimeout(show, IDLE_MS);
})();
