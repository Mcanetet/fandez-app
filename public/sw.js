/* Fundez PWA — service worker mínimo (requerido para “Instalar app” en Chrome/Android). */
const SW_VERSION = 'fundez-sw-v5';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SW_VERSION).then((cache) => cache.addAll(['/offline.html']).catch(() => {})));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SW_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    fetch(req).catch(async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const offline = await caches.match('/offline.html');
        if (offline) return offline;
      }
      throw new Error('offline');
    })
  );
});
