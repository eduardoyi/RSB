// Minesweeper, classic Windows rules: the first click is never a mine, right
// click cycles flag / ? mark, both buttons (or the middle button) on a number
// "chords" its neighbours, the timer starts at 1 on the first click, and the
// best time per level is kept with a name. On touch screens, long-press flags
// and tapping a number chords.
//
// All graphics are CSS (see the Minesweeper section of src/styles/games.css)
// plus the inline 7-segment counters below.
(function () {
  var LEVELS = {
    beginner:     { cols: 9,  rows: 9,  mines: 10, label: 'Beginner' },
    intermediate: { cols: 16, rows: 16, mines: 40, label: 'Intermediate' },
    expert:       { cols: 30, rows: 16, mines: 99, label: 'Expert' },
  };
  var STORAGE_KEY = 'rsb:minesweeper';
  var LONG_PRESS_MS = 450;
  var NOT_SET = { time: 999, name: 'Anonymous' };

  var root = document.getElementById('ms');
  var boardEl = document.getElementById('ms-board');
  var faceEl = document.getElementById('ms-face');
  var minesEl = document.getElementById('ms-mines');
  var timeEl = document.getElementById('ms-time');
  var dialogEl = document.getElementById('ms-dialog');
  if (!root || !boardEl) return;

  // ── Settings (level, ? marks, best times) ────────────────────────────────

  var settings = { level: 'beginner', marks: true, name: '', best: {} };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch (e) {}
  if (!LEVELS[settings.level]) settings.level = 'beginner';

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  function best(level) {
    return settings.best[level] || NOT_SET;
  }

  // ── Game state ───────────────────────────────────────────────────────────

  var cols, rows, mineCount;
  var cells = [];        // { mine, n, open, mark: 0 none | 1 flag | 2 ?, exploded, wrong }
  var cellEls = [];
  var started, over, won, flags, opened, time, timer;

  function newGame() {
    var level = LEVELS[settings.level];
    cols = level.cols;
    rows = level.rows;
    mineCount = level.mines;
    cells = [];
    for (var i = 0; i < cols * rows; i++) {
      cells.push({ mine: false, n: 0, open: false, mark: 0, exploded: false, wrong: false });
    }
    started = over = won = false;
    flags = opened = time = 0;
    clearInterval(timer);
    buildBoard();
    setFace('smile');
    render();
    fitWindow();
  }

  function buildBoard() {
    boardEl.style.gridTemplateColumns = 'repeat(' + cols + ', var(--ms-cell))';
    boardEl.replaceChildren();
    cellEls = cells.map(function (_, i) {
      var el = document.createElement('div');
      el.className = 'ms-cell';
      el.dataset.i = i;
      boardEl.appendChild(el);
      return el;
    });
  }

  function neighbours(i) {
    var x = i % cols, y = Math.floor(i / cols), out = [];
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var nx = x + dx, ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.push(ny * cols + nx);
      }
    }
    return out;
  }

  /** Mines are laid on the first click, never under it. */
  function layMines(safe) {
    var placed = 0;
    while (placed < mineCount) {
      var i = Math.floor(Math.random() * cells.length);
      if (i === safe || cells[i].mine) continue;
      cells[i].mine = true;
      placed++;
    }
    cells.forEach(function (c, i) {
      c.n = neighbours(i).filter(function (j) { return cells[j].mine; }).length;
    });
  }

  function startClock() {
    started = true;
    time = 1;
    timer = setInterval(function () {
      if (time < 999) time++;
      renderCounters();
    }, 1000);
  }

  function reveal(i) {
    var c = cells[i];
    if (over || c.open || c.mark === 1) return;
    if (!started) {
      layMines(i);
      startClock();
    }
    if (c.mine) {
      c.exploded = true;
      lose();
      return;
    }
    // Flood-fill open the empty area
    var stack = [i];
    while (stack.length) {
      var j = stack.pop(), cell = cells[j];
      if (cell.open || cell.mark === 1) continue;
      cell.open = true;
      cell.mark = 0;
      opened++;
      if (cell.n === 0) stack.push.apply(stack, neighbours(j));
    }
    if (opened === cells.length - mineCount) win();
  }

  /** Open every unflagged neighbour of a number whose flags are all placed. */
  function chord(i) {
    var c = cells[i];
    if (over || !c.open || c.n === 0) return;
    var around = neighbours(i);
    var flagged = around.filter(function (j) { return cells[j].mark === 1; }).length;
    if (flagged !== c.n) return;
    around.forEach(reveal);
  }

  function cycleMark(i) {
    var c = cells[i];
    if (over || c.open) return;
    if (c.mark === 0) { c.mark = 1; flags++; }
    else if (c.mark === 1) { c.mark = settings.marks ? 2 : 0; flags--; }
    else c.mark = 0;
  }

  function lose() {
    over = true;
    clearInterval(timer);
    cells.forEach(function (c) {
      if (c.mine && c.mark !== 1) c.open = true;
      if (!c.mine && c.mark === 1) c.wrong = true;
    });
    setFace('dead');
  }

  function win() {
    over = won = true;
    clearInterval(timer);
    cells.forEach(function (c) {
      if (c.mine) c.mark = 1;
    });
    flags = mineCount;
    setFace('win');
    if (time < best(settings.level).time) {
      // Let the board finish drawing before asking
      setTimeout(askName, 50);
    }
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  function render() {
    cells.forEach(function (c, i) {
      var cls = 'ms-cell';
      var text = '';
      if (c.open) {
        cls += ' open';
        if (c.mine) cls += c.exploded ? ' mine exploded' : ' mine';
        else if (c.n) { cls += ' n' + c.n; text = c.n; }
      } else if (c.wrong) {
        cls += ' open mine wrong';
      } else if (c.mark === 1) {
        cls += ' flag';
      } else if (c.mark === 2) {
        cls += ' mark';
        text = '?';
      }
      var el = cellEls[i];
      if (el.className !== cls) el.className = cls;
      if (el.textContent !== String(text)) el.textContent = text;
    });
    renderCounters();
  }

  function renderCounters() {
    minesEl.innerHTML = led(mineCount - flags);
    timeEl.innerHTML = led(time);
  }

  // Seven-segment digits: which of segments a–g light up
  var SEGMENTS = {
    '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
    '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g',
  };
  var SEGMENT_SHAPES = {
    a: '2,1 11,1 9,3 4,3',
    b: '12,2 12,11 11,11.5 10,10.5 10,4',
    c: '12,12 12,21 10,19 10,13.5 11,12.5',
    d: '4,20 9,20 11,22 2,22',
    e: '1,12 2,12.5 3,13.5 3,19 1,21',
    f: '1,2 3,4 3,10.5 2,11.5 1,11',
    g: '3,11 4,10.5 9,10.5 10,11 10,12 9,12.5 4,12.5 3,12',
  };

  function digit(ch) {
    var lit = SEGMENTS[ch] || '';
    var shapes = Object.keys(SEGMENT_SHAPES).map(function (s) {
      return '<polygon points="' + SEGMENT_SHAPES[s] + '" fill="' + (lit.indexOf(s) >= 0 ? '#ff0000' : '#5a0000') + '"/>';
    }).join('');
    return '<svg viewBox="0 0 13 23" width="13" height="23" aria-hidden="true">' + shapes + '</svg>';
  }

  function led(value) {
    var v = Math.max(-99, Math.min(999, value));
    var s = v < 0 ? '-' + String(-v).padStart(2, '0') : String(v).padStart(3, '0');
    return s.split('').map(digit).join('');
  }

  function setFace(face) {
    faceEl.dataset.face = face;
  }

  // ── Window size ──────────────────────────────────────────────────────────

  /** Size the window to the board, like the real game does on a level change. */
  function fitWindow() {
    var width = root.offsetWidth, height = root.offsetHeight;
    if (document.documentElement.classList.contains('rsb-embedded')) {
      parent.__rsbShell.fitContent(frameElement, width, height);
    } else if (window.__rsbShell) {
      window.__rsbShell.fitContent(root.closest('.w98-window'), width, height);
    }
  }

  // ── Mouse and touch on the board ─────────────────────────────────────────

  var press = null;   // { mode: 'left' | 'chord' | 'touch' | 'done', cell, x, y }
  var longPress = 0;

  function cellAt(x, y) {
    var el = document.elementFromPoint(x, y);
    var cellEl = el && el.closest && el.closest('.ms-cell');
    return cellEl && boardEl.contains(cellEl) ? Number(cellEl.dataset.i) : -1;
  }

  /** Sunken look on the cell (or 3×3 block when chording) under the pointer. */
  function showPressed() {
    cellEls.forEach(function (el) { el.classList.remove('pressed'); });
    if (!press || press.cell < 0 || press.mode === 'done' || over) return;
    var targets = press.mode === 'chord' ? [press.cell].concat(neighbours(press.cell)) : [press.cell];
    targets.forEach(function (j) {
      var c = cells[j];
      if (!c.open && c.mark !== 1) cellEls[j].classList.add('pressed');
    });
  }

  function endPress() {
    clearTimeout(longPress);
    press = null;
    showPressed();
    if (!over) setFace('smile');
  }

  function act(fn, i) {
    if (i < 0) return;
    fn(i);
    render();
  }

  boardEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  boardEl.addEventListener('pointerdown', function (e) {
    if (over) return;
    var i = cellAt(e.clientX, e.clientY);
    if (e.pointerType !== 'mouse') {
      press = { mode: 'touch', cell: i, x: e.clientX, y: e.clientY };
      longPress = setTimeout(function () {
        if (!press || press.mode !== 'touch') return;
        press.mode = 'done';
        act(cycleMark, press.cell);
        if (navigator.vibrate) navigator.vibrate(15);
        showPressed();
      }, LONG_PRESS_MS);
    } else if (e.button === 1 || e.buttons === 3) {
      press = { mode: 'chord', cell: i };
    } else if (e.button === 0) {
      press = { mode: 'left', cell: i };
    } else if (e.button === 2) {
      act(cycleMark, i);
      return;
    }
    if (e.button === 1) e.preventDefault();  // no autoscroll
    setFace('oh');
    showPressed();
  });

  document.addEventListener('pointermove', function (e) {
    if (!press) return;
    if (press.mode === 'touch') {
      // Moving the finger means scrolling the board, not pressing a cell
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) endPress();
      return;
    }
    // A second button pressed or released while one is held (pointer events
    // report these as moves): both down starts a chord; releasing one does it
    if (press.mode === 'left' && e.buttons === 3) press.mode = 'chord';
    else if (press.mode === 'chord' && e.buttons !== 3 && e.buttons !== 4) {
      act(chord, press.cell);
      press.mode = 'done';
    }
    press.cell = cellAt(e.clientX, e.clientY);
    showPressed();
  });

  document.addEventListener('pointerup', function (e) {
    if (!press) return;
    var i = press.mode === 'touch' ? press.cell : cellAt(e.clientX, e.clientY);
    if (press.mode === 'left') act(reveal, i);
    else if (press.mode === 'chord') act(chord, i);
    else if (press.mode === 'touch' && i >= 0) act(cells[i].open ? chord : reveal, i);
    endPress();
  });

  document.addEventListener('pointercancel', function () {
    if (press) endPress();
  });

  // ── Face, keyboard, menus ────────────────────────────────────────────────

  faceEl.addEventListener('click', newGame);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'F2') { e.preventDefault(); newGame(); }
    if (e.key === 'Escape') { closeMenus(); closeDialog(); }
  });

  var menuButtons = root.querySelectorAll('.win-menubar-btn[data-menu]');

  function closeMenus() {
    root.querySelectorAll('.win-dropdown.open').forEach(function (m) { m.classList.remove('open'); });
    menuButtons.forEach(function (b) { b.classList.remove('open'); });
  }

  function openMenu(btn) {
    closeMenus();
    var menu = document.getElementById(btn.dataset.menu);
    var r = btn.getBoundingClientRect();
    menu.style.left = r.left + 'px';
    menu.style.top = r.bottom + 'px';
    menu.classList.add('open');
    btn.classList.add('open');
    syncChecks();
  }

  menuButtons.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (btn.classList.contains('open')) closeMenus();
      else openMenu(btn);
    });
    // Sliding along the menu bar with a menu open switches menus
    btn.addEventListener('pointerenter', function () {
      if (root.querySelector('.win-dropdown.open') && !btn.classList.contains('open')) openMenu(btn);
    });
  });

  document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest('.win-dropdown, .win-menubar-btn')) closeMenus();
  });

  function syncChecks() {
    root.querySelectorAll('[data-level]').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.level === settings.level));
    });
    root.querySelector('[data-action="marks"]').setAttribute('aria-checked', String(settings.marks));
  }

  root.querySelectorAll('.win-dropdown button').forEach(function (b) {
    b.addEventListener('click', function () {
      closeMenus();
      if (b.dataset.level) {
        settings.level = b.dataset.level;
        saveSettings();
        newGame();
        return;
      }
      switch (b.dataset.action) {
        case 'new':   newGame(); break;
        case 'marks':
          settings.marks = !settings.marks;
          saveSettings();
          if (!settings.marks) {
            cells.forEach(function (c) { if (c.mark === 2) c.mark = 0; });
            render();
          }
          break;
        case 'best':  showBestTimes(); break;
        case 'help':  showHelp(); break;
        case 'exit':
          // The window's own Close button: closes the desktop window, or goes
          // back on phones
          var close = root.closest('.w98-window').querySelector('.title-bar [aria-label="Close"]');
          if (close) close.click();
          break;
      }
    });
  });

  // ── Dialogs ──────────────────────────────────────────────────────────────

  function closeDialog() {
    dialogEl.hidden = true;
    dialogEl.replaceChildren();
  }

  /** A small Win98 dialog over the board. `body` is HTML; buttons are
   *  [label, onClick] pairs, the first one being the default. */
  function dialog(title, body, buttons) {
    dialogEl.innerHTML =
      '<div class="ms-dialog-box" role="dialog" aria-label="' + title + '">' +
        '<div class="ms-dialog-title">' + title + '</div>' +
        '<div class="ms-dialog-body">' + body + '</div>' +
        '<div class="ms-dialog-buttons"></div>' +
      '</div>';
    var row = dialogEl.querySelector('.ms-dialog-buttons');
    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b[0];
      btn.addEventListener('click', b[1]);
      row.appendChild(btn);
    });
    dialogEl.hidden = false;
    var input = dialogEl.querySelector('input');
    (input || row.firstChild).focus();
    if (input) {
      input.select();
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') row.firstChild.click();
      });
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function askName() {
    var level = settings.level;
    dialog('Congratulations',
      '<p>You have the fastest time for ' + level + ' level. Please type your name:</p>' +
      '<input type="text" maxlength="32" value="' + escapeHtml(settings.name || 'Anonymous') + '">',
      [['OK', function () {
        var name = dialogEl.querySelector('input').value.trim() || 'Anonymous';
        settings.name = name;
        settings.best[level] = { time: time, name: name };
        saveSettings();
        showBestTimes();
      }]]);
  }

  function showBestTimes() {
    var rowsHtml = Object.keys(LEVELS).map(function (level) {
      var b = best(level);
      return '<tr><td>' + LEVELS[level].label + ':</td><td>' + b.time + ' seconds</td><td>' + escapeHtml(b.name) + '</td></tr>';
    }).join('');
    dialog('Fastest Mine Sweepers', '<table class="ms-best">' + rowsHtml + '</table>', [
      ['OK', closeDialog],
      ['Reset Scores', function () {
        settings.best = {};
        saveSettings();
        showBestTimes();
      }],
    ]);
  }

  function showHelp() {
    var touch = matchMedia('(pointer: coarse)').matches;
    dialog('How to Play',
      '<p>Clear every square that isn\'t a mine. A number tells you how many of the 8 squares around it hide mines.</p>' +
      (touch
        ? '<p><b>Tap</b> to uncover. <b>Hold</b> to flag. <b>Tap a number</b> whose mines are all flagged to clear around it.</p>'
        : '<p><b>Click</b> to uncover. <b>Right-click</b> to flag. Click a number with <b>both buttons</b> (or the middle one) to clear around it once its mines are flagged.</p>') +
      '<p>Your first click is always safe. F2 or the face starts a new game.</p>',
      [['OK', closeDialog]]);
  }

  // Wait for the window manager (a module script) before sizing the window
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', newGame);
  } else {
    newGame();
  }
})();
