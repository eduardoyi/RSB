// Win98-style 3D Maze screensaver.
// Activates after 2 min idle on desktop (≥768px). Any input dismisses it.

(function () {
  if (window.innerWidth < 768) return;

  const IDLE_MS  = 120_000;
  const MW = 21, MH = 21;          // maze dimensions (must be odd)
  const MOVE_SPD = 0.04;
  const TURN_SPD = 0.05;
  const PROBE    = 0.45;
  const FOG      = 9;

  // ── Maze generation (recursive backtracker) ───────────────────────────────
  function makeMaze(): number[][] {
    const m = Array.from({ length: MH }, () => Array(MW).fill(1));
    function dig(x: number, y: number) {
      const dirs = [[0,-2],[2,0],[0,2],[-2,0]].sort(() => Math.random() - 0.5);
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx > 0 && nx < MW-1 && ny > 0 && ny < MH-1 && m[ny][nx] === 1) {
          m[y + dy/2][x + dx/2] = 0;
          m[ny][nx] = 0;
          dig(nx, ny);
        }
      }
    }
    m[1][1] = 0;
    dig(1, 1);
    return m;
  }

  // ── Player + navigation ───────────────────────────────────────────────────
  let maze: number[][];
  let px = 1.5, py = 1.5, angle = 0;
  let turning = false, turnDir = 1;

  function open(x: number, y: number, a: number, d = PROBE): boolean {
    const nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d;
    return maze[Math.floor(ny)]?.[Math.floor(nx)] === 0;
  }

  function navigate() {
    if (!turning) {
      if (open(px, py, angle)) {
        px += Math.cos(angle) * MOVE_SPD;
        py += Math.sin(angle) * MOVE_SPD;
        // Right-hand rule: opportunistically take open right turns
        if (open(px, py, angle + Math.PI / 2) && Math.random() < 0.012) {
          turning = true; turnDir = 1;
        }
      } else {
        turning = true;
        if      (open(px, py, angle - Math.PI / 2, PROBE * 1.5)) turnDir = -1;
        else if (open(px, py, angle + Math.PI / 2, PROBE * 1.5)) turnDir =  1;
        else                                                       turnDir =  1; // U-turn
      }
    } else {
      angle += turnDir * TURN_SPD;
      if (open(px, py, angle)) turning = false;
    }
  }

  // ── Raycaster ─────────────────────────────────────────────────────────────
  function draw(ctx: CanvasRenderingContext2D) {
    const W = ctx.canvas.width, H = ctx.canvas.height;

    // Ceiling + floor
    ctx.fillStyle = '#0d0d0d';  ctx.fillRect(0, 0, W, H / 2);
    ctx.fillStyle = '#1a1206';  ctx.fillRect(0, H / 2, W, H / 2);

    // Camera plane perpendicular to view direction
    const cpx = -Math.sin(angle) * 0.66;
    const cpy =  Math.cos(angle) * 0.66;

    for (let col = 0; col < W; col++) {
      const cam = 2 * col / W - 1;
      const rdx = Math.cos(angle) + cpx * cam;
      const rdy = Math.sin(angle) + cpy * cam;

      // DDA setup
      let mx = Math.floor(px), my = Math.floor(py);
      const ddx = Math.abs(1 / (rdx || 1e-10));
      const ddy = Math.abs(1 / (rdy || 1e-10));
      const sx = rdx < 0 ? -1 : 1, sy = rdy < 0 ? -1 : 1;
      let sdx = rdx < 0 ? (px - mx) * ddx : (mx + 1 - px) * ddx;
      let sdy = rdy < 0 ? (py - my) * ddy : (my + 1 - py) * ddy;
      let side = 0;

      for (let i = 0; i < 48; i++) {
        if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; }
        else           { sdy += ddy; my += sy; side = 1; }
        if (maze[my]?.[mx] === 1) break;
      }

      const dist = Math.max(0.1, side === 0 ? sdx - ddx : sdy - ddy);
      const h    = Math.min(H * 3, Math.floor(H / dist));
      const y0   = Math.floor((H - h) / 2);

      // E/W walls: golden tan; N/S walls: darker brown. Both fade with fog.
      const fog   = Math.max(0, 1 - dist / FOG);
      const [r,g,b] = side === 0 ? [204, 172, 92] : [152, 120, 56];
      ctx.fillStyle = `rgb(${Math.floor(r*fog)},${Math.floor(g*fog)},${Math.floor(b*fog)})`;
      ctx.fillRect(col, y0, 1, h);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  let canvas: HTMLCanvasElement | null = null;
  let raf = 0;

  function show() {
    if (canvas) return;
    maze = makeMaze();
    px = 1.5; py = 1.5; angle = 0; turning = false;

    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99999;display:block;cursor:none;';
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d')!;
    (function loop() { navigate(); draw(ctx); raf = requestAnimationFrame(loop); })();
  }

  function hide() {
    if (!canvas) return;
    cancelAnimationFrame(raf);
    canvas.remove();
    canvas = null;
  }

  // ── Idle detection ────────────────────────────────────────────────────────
  let timer = 0;
  function bump() {
    clearTimeout(timer);
    hide();
    timer = window.setTimeout(show, IDLE_MS);
  }

  ['mousemove','mousedown','keydown','touchstart','wheel'].forEach(e =>
    document.addEventListener(e, bump, { passive: true })
  );
  bump();
})();
