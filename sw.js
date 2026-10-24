// Service worker — Vibras Noticias · Vibras Positivas HM
const VERSION = 'vn-v1-2026-10-24';
const BASE = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Fotos de los medios, YouTube y búsqueda en vivo van directo a la red
  if (url.origin !== location.origin) return;

  // Red primero: la página y noticias.json siempre salen frescos; sin internet, la última copia
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copia = res.clone();
          const clave = url.pathname.endsWith('.json') ? url.origin + url.pathname : req;
          caches.open(VERSION).then(c => c.put(clave, copia));
        }
        return res;
      })
      .catch(() => caches.match(url.pathname.endsWith('.json') ? url.origin + url.pathname : req)
        .then(r => r || caches.match('index.html')))
  );
});
