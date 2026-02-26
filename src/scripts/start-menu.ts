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
}

// Programs submenu: show on hover (CSS handles desktop), toggle on click for mobile
if (programsItem && programsSubmenu) {
  programsItem.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShown = programsSubmenu.style.display === 'flex';
    programsSubmenu.style.display = isShown ? 'none' : 'flex';
  });
}
