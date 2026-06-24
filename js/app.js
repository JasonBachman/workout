import { openDB } from './db.js';
import { seedAll } from './data/seed.js';
import { createRouter } from './ui/router.js';
import { homePage } from './ui/home.js';
import { logPage } from './ui/log.js';
import { programPage } from './ui/program.js';
import { statsPage } from './ui/stats.js';
import { morePage } from './ui/more.js';

async function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (err) {
      console.error('SW registration failed:', err);
    }
  }

  // Open database and seed on first launch
  const db = await openDB();
  await seedAll(db);

  // Expose for debugging
  window.__db = db;

  // Mount router
  const appEl = document.getElementById('app');
  const ctx = { db };

  createRouter(appEl, {
    '/home': homePage,
    '/log': logPage,
    '/program': programPage,
    '/stats': statsPage,
    '/more': morePage,
  }, ctx);
}

init();
