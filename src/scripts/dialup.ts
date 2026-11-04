// "Connecting…" dial-up dialog shown before an outside link opens in a new
// tab, once per visit: after the first connection you stay "online" and
// later links open straight away, as they did once the modem had connected.
//
// window.open must happen during the click (or within the few seconds of
// "user activation" browsers allow after it), so the dialog is short. If the
// browser still blocks the tab, the dialog ends with a button to open it.

const ONLINE_KEY = 'rsb:online';
const STEPS: [number, string][] = [
  [0,    'Dialing 555-0198...'],
  [650,  'Verifying user name and password...'],
  [1250, 'Logging on to network...'],
  [1750, 'Connected at 56,000 bps.'],
];
const OPEN_AT_MS = 2100;

let active: { cancel: () => void } | null = null;

function isOnline(): boolean {
  try { return sessionStorage.getItem(ONLINE_KEY) === '1'; } catch { return false; }
}

function goOnline(): void {
  try { sessionStorage.setItem(ONLINE_KEY, '1'); } catch {}
}

/** Open in a new tab; false if the browser blocked it. */
function openTab(href: string): boolean {
  const tab = window.open(href, '_blank');
  if (!tab) return false;
  tab.opener = null;
  return true;
}

/** A short, quiet modem: dial tone, touch-tone digits, then a handshake warble. */
function playModem(): void {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  let ctx: AudioContext;
  try { ctx = new Ctx(); } catch { return; }
  const out = ctx.createGain();
  out.gain.value = 0.05;
  out.connect(ctx.destination);
  const tone = (freq: number, start: number, dur: number) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    osc.connect(out);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + dur);
  };
  // Dial tone (350 + 440 Hz)
  tone(350, 0, 0.35);
  tone(440, 0, 0.35);
  // Touch-tone digits 5 5 5 0 1 9 8: each is a low and a high frequency
  const DTMF: Record<string, [number, number]> = {
    '0': [941, 1336], '1': [697, 1209], '5': [770, 1336], '8': [852, 1336], '9': [852, 1477],
  };
  '5550198'.split('').forEach((d, i) => {
    const [lo, hi] = DTMF[d];
    tone(lo, 0.45 + i * 0.1, 0.07);
    tone(hi, 0.45 + i * 0.1, 0.07);
  });
  // Handshake: answer tone, then a quick two-tone warble
  tone(2100, 1.25, 0.25);
  for (let i = 0; i < 6; i++) tone(i % 2 ? 1200 : 2400, 1.55 + i * 0.05, 0.05);
  setTimeout(() => ctx.close(), 2500);
}

function showDialog(href: string): void {
  active?.cancel();
  const host = new URL(href).hostname.replace(/^www\./, '');

  const dialog = document.createElement('div');
  dialog.className = 'dialup';
  dialog.innerHTML = `
    <div class="window dialup-window" role="dialog" aria-modal="true" aria-labelledby="dialup-title">
      <div class="title-bar">
        <div class="title-bar-text" id="dialup-title">Connecting to Real Serious Online</div>
      </div>
      <div class="window-body dialup-body">
        <img class="dialup-icon" src="/icons/win98/conn_dialup.ico" alt="" width="32" height="32" />
        <div class="dialup-text">
          <p>Opening <b></b></p>
          <p class="dialup-status" aria-live="polite"></p>
        </div>
        <div class="dialup-actions">
          <button type="button" class="dialup-cancel">Cancel</button>
        </div>
      </div>
    </div>`;
  dialog.querySelector('b')!.textContent = host;
  const status = dialog.querySelector<HTMLElement>('.dialup-status')!;
  const actions = dialog.querySelector<HTMLElement>('.dialup-actions')!;
  document.body.appendChild(dialog);

  const timers: number[] = [];
  function close(): void {
    timers.forEach(clearTimeout);
    dialog.remove();
    document.removeEventListener('keydown', onKey, true);
    if (active === handle) active = null;
  }
  const handle = { cancel: close };
  active = handle;

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  }
  document.addEventListener('keydown', onKey, true);
  dialog.querySelector('.dialup-cancel')!.addEventListener('click', close);
  dialog.querySelector<HTMLButtonElement>('.dialup-cancel')!.focus();

  STEPS.forEach(([at, text]) => timers.push(window.setTimeout(() => { status.textContent = text; }, at)));
  timers.push(window.setTimeout(() => {
    goOnline();
    if (openTab(href)) {
      close();
      return;
    }
    // Pop-up blocked: let a fresh click open it
    status.textContent = 'Connected. Your browser needs one more click.';
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.textContent = `Open ${host}`;
    openBtn.addEventListener('click', () => {
      openTab(href);
      close();
    });
    actions.prepend(openBtn);
    openBtn.focus();
  }, OPEN_AT_MS));
}

/** Open an outside link the Win98 way. Call it from a click handler. */
export function openExternal(href: string): void {
  if (isOnline()) {
    openTab(href);
    return;
  }
  playModem();
  showDialog(href);
}
