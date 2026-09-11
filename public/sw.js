/* Fandez PWA — service worker (install + notificaciones del sistema). */
const SW_VERSION = 'fandez-sw-v34';

/** Ámbar + 2 semicírculos (v11). Path nuevo = rompe caché Saturno Chrome. */
const DEFAULT_ICON = '/icons/fandez-v11-notify.png';
const DEFAULT_BADGE = '/icons/fandez-v11-badge-96.png';

const PRECACHE = [
  '/offline.html',
  '/icons/fandez-v11-notify.png',
  '/icons/fandez-v11-badge-96.png',
  '/icons/fandez-v11-192.png',
  '/icons/fandez-v11-96.png',
  '/icon-192.png',
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

function networkFirst(req, { timeoutMs = 8000 } = {}) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => {
    try { ctrl.abort(); } catch (_) { /* ignore */ }
  }, timeoutMs) : null;
  return fetch(req, ctrl ? { signal: ctrl.signal } : undefined)
    .finally(() => { if (timer) clearTimeout(timer); })
    .catch(async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const offline = await caches.match('/offline.html');
        if (offline) return offline;
      }
      throw new Error('offline');
    });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let pathname = '';
  try { pathname = new URL(req.url).pathname; } catch (_) { return; }
  if (pathname.startsWith('/uploads/') || pathname.startsWith('/media/') || pathname.startsWith('/socket.io')) return;

  // Arranque PWA: siempre red fresca (sesión / rol), sin quedarse colgado.
  if (pathname === '/app' || req.mode === 'navigate') {
    event.respondWith(networkFirst(req, { timeoutMs: pathname === '/app' ? 5000 : 9000 }));
    return;
  }

  if (
    pathname.startsWith('/icons/fandez-v11')
    || pathname === '/favicon.ico'
    || pathname === '/favicon-32.png'
    || pathname === '/favicon.png'
    || pathname === '/apple-touch-icon.png'
    || pathname === '/icon-192.png'
  ) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
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
          const fallback = await caches.match('/icon-192.png') || await caches.match('/icons/fandez-v11-notify.png');
          if (fallback) return fallback;
          throw new Error('icon-offline');
        })
    );
    return;
  }

  if (req.destination === 'image') return;
  event.respondWith(networkFirst(req));
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
  const icon = absUrl(DEFAULT_ICON);
  const badge = absUrl(DEFAULT_BADGE);
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
      url: data.url || '/app?source=pwa',
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
  const rawTarget = (event.notification.data && event.notification.data.url) || '/app?source=pwa';
  let target = '/app?source=pwa';
  try {
    // Solo rutas same-origin relativas (evita abrir otro host sin cookie de sesión)
    if (typeof rawTarget === 'string' && rawTarget.startsWith('/') && !rawTarget.startsWith('//')) {
      target = rawTarget;
    }
  } catch (_) { /* ignore */ }

  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      try {
        const url = new URL(client.url);
        if (url.origin !== self.location.origin) continue;
        // Si la app ya está abierta, solo enfocarla (no forzar navegación → no pierdes el pedido).
        await client.focus();
        const path = url.pathname || '';
        const onApp = path.startsWith('/cliente')
          || path.startsWith('/proveedor')
          || path.startsWith('/tecnico')
          || path.startsWith('/app');
        if (!onApp && 'navigate' in client) {
          await client.navigate(target);
        }
        return;
      } catch (_) { /* ignore */ }
    }
    // Frío: abrir /app para restaurar sesión → panel del rol
    await clients.openWindow(target.startsWith('/app') ? target : '/app?source=pwa');
  })());
});
