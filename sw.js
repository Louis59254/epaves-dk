// Cache uniquement les tuiles carte — jamais les fichiers app
const CACHE = 'maz-tiles-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Cacher tuiles OSM et Leaflet — les autres fichiers vont toujours au réseau
  const isTile = url.includes('tile.openstreetmap') ||
                 url.includes('openseamap') ||
                 url.includes('unpkg.com/leaflet');
  if (isTile) {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(res => {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
      )
    );
  }
  // Fichiers app (index.html, app.js…) : réseau direct, toujours à jour
});
