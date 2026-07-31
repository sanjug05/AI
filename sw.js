/* AIS KnowledgeOS — service worker
   Strategy: network-first for the app shell (HTML/manifest) so a new deploy is
   picked up automatically on the next load when online — no manual "update"
   step needed for ordinary content changes. Cache is purely an offline
   fallback, not the primary source of truth. Static icons use cache-first
   since they almost never change. Cross-origin requests (CDN libraries, etc.)
   are left untouched — this worker only ever handles same-origin GETs.
   Bump CACHE_VERSION below if you ever want to force every client to purge
   its offline cache (e.g. after removing/renaming a cached asset). */
const CACHE_VERSION = 'ais-kos-v1';
const APP_SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_VERSION).then(c => c.addAll(APP_SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return; // don't touch CDN/cross-origin

  const isNavigation = req.mode === 'navigate' || req.destination === 'document' || req.url.endsWith('.json');

  if (isNavigation) {
    // Network-first: always prefer the live deploy; fall back to cache offline.
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
    );
  } else {
    // Cache-first for static assets (icons etc.), refreshing in the background.
    e.respondWith(
      caches.match(req).then(cached => {
        const fresh = fetch(req).then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
  }
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
