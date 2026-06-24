/**
 * Minimal hash-based SPA router.
 *
 * Usage:
 *   const router = createRouter(containerEl, {
 *     '/home':    { mount(el, ctx), unmount() },
 *     '/log':     { mount(el, ctx), unmount() },
 *     '/program': { mount(el, ctx), unmount() },
 *     '/stats':   { mount(el, ctx), unmount() },
 *   }, ctx);
 */

export function createRouter(container, routes, ctx) {
  let currentPage = null;
  let currentRoute = null;

  function navigate() {
    const hash = location.hash.slice(1) || '/home';

    if (hash === currentRoute) return;

    // Unmount current page
    if (currentPage?.unmount) {
      currentPage.unmount();
    }
    container.innerHTML = '';

    // Mount new page with fade-in
    const page = routes[hash];
    if (page) {
      currentRoute = hash;
      currentPage = page;
      container.style.animation = 'none';
      void container.offsetHeight; // reflow
      container.style.animation = '';
      page.mount(container, ctx);
    } else {
      // Fallback to home
      location.hash = '#/home';
      return;
    }

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach((el) => {
      const href = el.getAttribute('href');
      el.classList.toggle('active', href === '#' + hash);
    });
  }

  window.addEventListener('hashchange', navigate);
  navigate();

  return { navigate };
}
