/* Fandez PWA — service worker (install + notificaciones del sistema). */
const SW_VERSION = 'fandez-sw-v30';

/** Tile ámbar + isotipo oficial (2 semicírculos). Ruta nueva = rompe caché CDN/Chrome. */
const DEFAULT_ICON = '/icons/fandez-v9-notify.png';
const DEFAULT_BADGE = '/icons/fandez-v9-notify.png';

const PRECACHE = [
  '/offline.html',
  '/icons/fandez-v9-notify.png',
  '/icons/fandez-v9-192.png',
  '/icons/fandez-v9-96.png',
  '/favicon-32.png',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SW_VERSION).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
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
  let pathname = '';
  try { pathname = new URL(req.url).pathname; } catch (_) { return; }
  if (pathname.startsWith('/uploads/') || pathname.startsWith('/media/') || pathname.startsWith('/socket.io')) return;

  if (
    pathname.startsWith('/icons/fandez-v9')
    || pathname === '/favicon.ico'
    || pathname === '/favicon-32.png'
    || pathname === '/favicon.png'
    || pathname === '/apple-touch-icon.png'
    || pathname === '/icon-192.png'
  ) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SW_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req) || await caches.match(pathname);
          if (cached) return cached;
          throw new Error('icon-offline');
        })
    );
    return;
  }

  if (req.destination === 'image') return;
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

function absUrl(path) {
  try {
    return new URL(path, self.registration.scope).href;
  } catch (_) {
    return path;
  }
}

async function showFandezNotification(data = {}) {
  const title = data.title || 'Fandez';
  const icon = data.icon || absUrl(DEFAULT_ICON);
  const badge = data.badge || icon;
  const options = {
    body: data.body || '',
    icon,
    badge,
    image: data.image || undefined,
    tag: data.tag || 'fandez',
    renotify: data.renotify !== false,
    requireInteraction: !!data.requireInteraction,
    vibrate: data.vibrate || [90, 60, 90, 60, 140],
    data: {
      url: data.url || '/',
      tag: data.tag || 'fandez'
    },
    actions: data.actions || [
      { action: 'open', title: 'Abrir' }
    ]
  };
  return self.registration.showNotification(title, options);
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    try {
      data = { body: event.data ? event.data.text() : '' };
    } catch (__) {
      data = {};
    }
  }
  event.waitUntil(showFandezNotification(data));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      } catch (_) { /* ignore */ }
    }
    await clients.openWindow(target);
  })());
});
