// Boot animation — plays once on first desktop visit (≥1100px).
// Sequence: black → Dell logo → BIOS top+bottom text → BIOS middle text
//           → Windows 98 splash → fade out to desktop.

const BOOT_KEY = 'rsb:boot-played';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runBoot(): Promise<void> {
  const overlay    = document.getElementById('boot-overlay')!;
  const dell       = overlay.querySelector('.boot-dell')       as HTMLElement;
  const textTop    = overlay.querySelector('.boot-text-top')   as HTMLElement;
  const textMiddle = overlay.querySelector('.boot-text-middle') as HTMLElement;
  const textBottom = overlay.querySelector('.boot-text-bottom') as HTMLElement;
  const win98      = document.getElementById('boot-win98')!    as HTMLElement;

  // Reveal overlay (black screen) — set directly so inline style is overridden
  overlay.style.display = 'block';

  await delay(100);

  // Phase 1 — Dell logo + URL
  dell.classList.add('visible');
  await delay(550);

  // Phase 2 — BIOS copyright block + "Press <Del>" at bottom
  textTop.classList.add('visible');
  textBottom.classList.add('visible');
  await delay(500);

  // Phase 3 — device/disk info
  textMiddle.classList.add('visible');
  await delay(650);

  // Phase 4 — Windows 98 splash: abrupt cut
  win98.classList.add('visible');
  await delay(1200);

  // Phase 5 — abrupt cut to desktop
  overlay.style.display = 'none';

  overlay.remove();

  // Mark as played so it never shows again
  localStorage.setItem(BOOT_KEY, '1');
}

// Guard: desktop width only, first visit only
if (window.innerWidth >= 1100 && !localStorage.getItem(BOOT_KEY)) {
  runBoot();
}
