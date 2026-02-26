const clockEl = document.getElementById('taskbar-clock');

function updateClock() {
  if (clockEl) {
    clockEl.textContent = new Date().toLocaleTimeString();
  }
}

updateClock();
setInterval(updateClock, 1000);
