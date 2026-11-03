const startBtn = document.getElementById('start-btn');
const startMenu = document.getElementById('start-menu');
const programsItem = document.getElementById('programs-item');
const programsSubmenu = document.getElementById('programs-submenu');

if (startBtn && startMenu) {
  startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = startMenu.classList.contains('open');
    startMenu.classList.toggle('open', !isOpen);
    startBtn.setAttribute('aria-expanded', String(!isOpen));
  });

  document.addEventListener('click', (e) => {
    if (!startMenu.contains(e.target as Node) && e.target !== startBtn) {
      startMenu.classList.remove('open');
      startBtn.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      startMenu.classList.remove('open');
      startBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Links now open windows in place instead of loading a new page, and clicks
  // inside a window's iframe never reach this document — close on both
  const close = () => {
    startMenu.classList.remove('open');
    startBtn.setAttribute('aria-expanded', 'false');
  };
  startMenu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a[href]')) close();
  });
  document.addEventListener('rsb:frame-pointerdown', close);
}

// Programs submenu: show on hover (CSS handles desktop), toggle on click for mobile
if (programsItem && programsSubmenu) {
  programsItem.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShown = programsSubmenu.style.display === 'flex';
    programsSubmenu.style.display = isShown ? 'none' : 'flex';
  });
}

// Accessories sub-submenu: same pattern
const accessoriesItem = document.querySelector<HTMLElement>('.sub-item');
const accessoriesSubmenu = accessoriesItem?.querySelector<HTMLElement>('.sub-submenu');
if (accessoriesItem && accessoriesSubmenu) {
  accessoriesItem.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShown = accessoriesSubmenu.style.display === 'flex';
    accessoriesSubmenu.style.display = isShown ? 'none' : 'flex';
  });
}
