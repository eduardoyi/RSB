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
