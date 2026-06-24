/**
 * Simple toast notification.
 */

let toastEl = null;
let timeout = null;

function ensureElement() {
  if (toastEl) return;
  toastEl = document.createElement('div');
  toastEl.className = 'toast';
  document.body.appendChild(toastEl);
}

export function showToast(message, durationMs = 2000) {
  ensureElement();
  clearTimeout(timeout);

  toastEl.textContent = message;
  // Force reflow to restart animation
  toastEl.classList.remove('show');
  void toastEl.offsetHeight;
  toastEl.classList.add('show');

  timeout = setTimeout(() => {
    toastEl.classList.remove('show');
  }, durationMs);
}
