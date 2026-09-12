/* Fandez PWA — service worker (install + notificaciones del sistema). */
const SW_VERSION = 'fandez-sw-v38';

/** Ámbar + ventosa Fandez (v11). Query rompe caché Saturno/globo en Chrome/Android. */
const ICON_VER = '12';
const DEFAULT_ICON = `/icons/fandez-v11-notify.png?v=${ICON_VER}`;
const DEFAULT_BADGE = `/icons/fandez-v11-badge-96.png?v=${ICON_VER}`;

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

const APP_PATHS = ['/app', '/cliente', '/proveedor', '/tecnico', '/login', '/registro'];
const AUTH_NAV_PATHS = ['/logout', '/login', '/registro', '/recuperar'];

function isAppNavigation(pathname) {
  return APP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isAuthNavigation(pathname) {
  return AUTH_NAV_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

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

/** Navegación de la app: solo red, sin abortar (el abort de 5s provocaba “primer toque en blanco”). */
function networkOnlyNavigate(req) {
  return fetch(req, { cache: 'no-store' }).catch(async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const offline = await caches.match('/offline.html');
    if (offline) return offline;
    throw new Error('offline');
  });
}

function networkFirst(req, { timeoutMs = 12000 } = {}) {
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

  // Arranque / paneles / auth: red fresca sin timeout agresivo
  if (req.mode === 'navigate' || pathname === '/app') {
    if (isAuthNavigation(pathname) || isAppNavigation(pathname) || pathname === '/app') {
      event.respondWith(networkOnlyNavigate(req));
      return;
    }
    event.respondWith(networkFirst(req, { timeoutMs: 12000 }));
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
          // Preferir marca Fandez v11; icon-192 histórico a veces quedó como Saturno en CDN
          const fallback = await caches.match('/icons/fandez-v11-notify.png') || await caches.match('/icon-192.png');
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

function sameOriginIcon(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    if (raw.startsWith('/') && !raw.startsWith('//')) {
      const path = raw.split('?')[0];
      if (path.startsWith('/icons/fandez-v11') || path === '/icon-192.png') {
        return absUrl(`${path}?v=${ICON_VER}`);
      }
    }
    const u = new URL(raw, self.registration.scope);
    if (u.origin === self.location.origin) {
      const path = u.pathname;
      if (path.startsWith('/icons/fandez-v11') || path === '/icon-192.png') {
        return absUrl(`${path}?v=${ICON_VER}`);
      }
    }
  } catch (_) { /* ignore */ }
  return null;
}

async function showFandezNotification(data = {}) {
  const title = data.title || 'Fandez';
  const icon = sameOriginIcon(data.icon) || absUrl(DEFAULT_ICON);
  const badge = sameOriginIcon(data.badge) || absUrl(DEFAULT_BADGE);
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
        await client.focus();
        const path = url.pathname || '';
        const onApp = path.startsWith('/cliente')
          || path.startsWith('/proveedor')
          || path.startsWith('/tecnico')
          || path.startsWith('/app');
        if (!onApp && 'navigate' in client) {
          await client.navigate(target.startsWith('/app') ? target : '/app?source=pwa');
        }
        return;
      } catch (_) { /* ignore */ }
    }
    await clients.openWindow('/app?source=pwa');
  })());
});
