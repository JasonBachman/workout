const CACHE_NAME = 'strength-v15';

// Relative paths — resolved against SW scope at install time
const PRECACHE_URLS = [
  './',
  'index.html',
  'css/design-system.css',
  'js/db.js',
  'js/app.js',
  'js/data/seed.js',
  'js/data/muscles.js',
  'js/data/landmarks.js',
  'js/data/exercises.js',
  'js/data/sets.js',
  'js/data/programs.js',
  'js/data/metrics.js',
  'js/engine/volume.js',
  'js/engine/readiness.js',
  'js/engine/recommend.js',
  'js/engine/progression.js',
  'js/engine/priority.js',
  'js/data/goals.js',
  'js/ui/router.js',
  'js/ui/home.js',
  'js/ui/log.js',
  'js/ui/program.js',
  'js/ui/stats.js',
  'js/ui/more.js',
  'js/ui/bodymap.js',
  'js/ui/charts.js',
  'js/ui/toast.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) return response;

        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });

        return response;
      });
    })
  );
});
