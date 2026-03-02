const toolbar = document.querySelector<HTMLElement>('.word97-toolbar');
if (toolbar) {
  const windowPath = toolbar.dataset.windowPath!;
  const storageKey = `w98:window:${windowPath}`;
  const documentBody = document.querySelector<HTMLElement>('.document-body');

  function loadFontPrefs() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (data.fontFamily && documentBody) {
        documentBody.style.fontFamily = String(data.fontFamily);
        const sel = document.getElementById('font-family-select') as HTMLSelectElement | null;
        if (sel) sel.value = String(data.fontFamily);
      }
      if (data.fontSize && documentBody) {
        applyFontSize(String(data.fontSize));
        const sel = document.getElementById('font-size-select') as HTMLSelectElement | null;
        if (sel) sel.value = String(data.fontSize);
      }
    } catch {}
  }

  function savePref(key: string, value: string) {
    try {
      const raw = localStorage.getItem(storageKey);
      const data = raw ? JSON.parse(raw) : {};
      data[key] = value;
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {}
  }

  function applyFontSize(size: string) {
    if (!documentBody) return;
    documentBody.classList.remove('font-small', 'font-normal', 'font-large');
    documentBody.classList.add(`font-${size}`);
  }

  const fontFamilySelect = document.getElementById('font-family-select') as HTMLSelectElement | null;
  fontFamilySelect?.addEventListener('change', () => {
    if (!documentBody) return;
    documentBody.style.fontFamily = fontFamilySelect.value;
    savePref('fontFamily', fontFamilySelect.value);
  });

  const fontSizeSelect = document.getElementById('font-size-select') as HTMLSelectElement | null;
  fontSizeSelect?.addEventListener('change', () => {
    applyFontSize(fontSizeSelect.value);
    savePref('fontSize', fontSizeSelect.value);
  });

  document.getElementById('btn-reset-window')?.addEventListener('click', () => {
    localStorage.removeItem(storageKey);
    window.location.reload();
  });

  // Table of Contents submenu
  const tocBtn = document.getElementById('btn-toc');
  const tocMenu = document.getElementById('menu-toc') as HTMLUListElement | null;
  const viewMenu = document.getElementById('menu-view');

  function populateTOC() {
    if (!tocMenu) return;
    tocMenu.innerHTML = '';
    const headings = Array.from(document.querySelectorAll<HTMLElement>('.document-body h2'));
    if (headings.length === 0) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = '(No headings)';
      btn.disabled = true;
      btn.style.color = '#808080';
      li.appendChild(btn);
      tocMenu.appendChild(li);
      return;
    }
    headings.forEach(h => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = h.textContent ?? '';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toolbar.querySelectorAll<HTMLElement>('.win-dropdown').forEach(m => m.classList.remove('open'));
        toolbar.querySelectorAll<HTMLButtonElement>('.win-menubar-btn').forEach(b => b.classList.remove('open'));
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      li.appendChild(btn);
      tocMenu.appendChild(li);
    });
  }

  let tocHideTimer: ReturnType<typeof setTimeout> | null = null;

  function showTOC() {
    if (!tocMenu || !viewMenu || !tocBtn) return;
    if (tocHideTimer) { clearTimeout(tocHideTimer); tocHideTimer = null; }
    populateTOC();
    const viewRect = viewMenu.getBoundingClientRect();
    const btnRect = tocBtn.getBoundingClientRect();
    const wrapper = document.querySelector<HTMLElement>('.document-wrapper');
    if (wrapper) {
      const wrapperRect = wrapper.getBoundingClientRect();
      tocMenu.style.maxHeight = Math.max(80, wrapperRect.height - 20) + 'px';
    }
    // Fly out right if there's room; otherwise drop below the button.
    // Use the CSS max-width (260) as a known upper bound since offsetWidth is
    // 0 while the menu is display:none.
    const SUBMENU_W = 260;
    let left: number;
    let top: number;
    if (viewRect.right + SUBMENU_W <= window.innerWidth) {
      left = viewRect.right - 2;
      top = btnRect.top;
    } else {
      left = viewRect.left;
      top = btnRect.bottom;
    }
    // Final clamp: never let the right edge bleed off screen
    left = Math.min(left, window.innerWidth - SUBMENU_W - 4);
    left = Math.max(0, left);
    tocMenu.style.left = left + 'px';
    tocMenu.style.top = top + 'px';
    tocMenu.classList.add('open');
  }

  function hideTOC(delay = 120) {
    tocHideTimer = setTimeout(() => {
      tocMenu?.classList.remove('open');
    }, delay);
  }

  tocBtn?.addEventListener('mouseenter', showTOC);
  tocBtn?.addEventListener('mouseleave', () => hideTOC());

  function toggleTOC(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    if (tocMenu?.classList.contains('open')) {
      tocMenu.classList.remove('open');
    } else {
      showTOC();
    }
  }

  tocBtn?.addEventListener('touchend', toggleTOC);
  tocBtn?.addEventListener('click', toggleTOC);
  tocMenu?.addEventListener('mouseenter', () => {
    if (tocHideTimer) { clearTimeout(tocHideTimer); tocHideTimer = null; }
  });
  tocMenu?.addEventListener('mouseleave', () => hideTOC());
  tocMenu?.addEventListener('click', (e) => e.stopPropagation());

  // "Read with AI" tools
  const postUrl = toolbar.dataset.postUrl;
  if (postUrl) {
    const aiPrompt = (url: string) =>
      `Hey! Got something cool for you—curious what you make of this: ${url}\nIt's a blog post and I want to understand it better.\nStart with a tight summary: one paragraph, bulleted. Then offer to go deeper on what's most interesting.`;

    document.getElementById('btn-read-chatgpt')?.addEventListener('click', () => {
      window.open(`https://chatgpt.com/?q=${encodeURIComponent(aiPrompt(postUrl))}`, '_blank');
    });
    document.getElementById('btn-read-claude')?.addEventListener('click', () => {
      window.open(`https://claude.ai/new?q=${encodeURIComponent(aiPrompt(postUrl))}`, '_blank');
    });
  }

  // Menu bar dropdowns
  toolbar.querySelectorAll<HTMLButtonElement>('.win-menubar-btn[data-menu]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menuId = `menu-${btn.dataset.menu}`;
      const menu = document.getElementById(menuId);
      if (!menu) return;

      const isOpen = menu.classList.contains('open');

      // Close all
      toolbar.querySelectorAll<HTMLElement>('.win-dropdown').forEach(m => {
        m.classList.remove('open');
      });
      toolbar.querySelectorAll<HTMLButtonElement>('.win-menubar-btn').forEach(b => {
        b.classList.remove('open');
      });

      if (!isOpen) {
        menu.classList.add('open');
        btn.classList.add('open');
        // Position using viewport coordinates (dropdown is position:fixed)
        const rect = btn.getBoundingClientRect();
        menu.style.left = rect.left + 'px';
        menu.style.top = rect.bottom + 'px';
      }
    });
  });

  document.addEventListener('click', () => {
    toolbar.querySelectorAll<HTMLElement>('.win-dropdown').forEach(m => m.classList.remove('open'));
    toolbar.querySelectorAll<HTMLButtonElement>('.win-menubar-btn').forEach(b => b.classList.remove('open'));
  });

  loadFontPrefs();
}
