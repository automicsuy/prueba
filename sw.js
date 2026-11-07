// Service worker: app shell offline + última respuesta de la API como respaldo.
const VERSION = 'agenda-v3';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'leagues.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // API: red primero, caché si no hay conexión
  if (url.hostname === 'site.api.espn.com' || url.pathname.includes('/api/')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION + '-api').then(c => c.put(e.request, copy)); }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Shell propio: stale-while-revalidate
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const net = fetch(e.request).then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    );
  }
});
