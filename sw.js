// Cache uniquement les tuiles carte — jamais les fichiers app
// Cache d'abord (carte consultable hors réseau en mer), réseau sinon ; taille plafonnée
const CACHE = 'maz-tiles-v3';
const MAX_ENTRIES = 5000;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

const TILE_HOSTS = [
  'tile.openstreetmap.org',
  'openseamap.org',
  'unpkg.com/leaflet',
  'basemaps.cartocdn.com',
  'arcgisonline.com',
];

function isTile(url) {
  if (TILE_HOSTS.some(h => url.includes(h))) return true;
  // WMS bathymétrie (EMODnet, SHOM) : GetMap uniquement
  return (url.includes('emodnet-bathymetry.eu') || url.includes('services.data.shom.fr'))
    && /REQUEST=GetMap/i.test(url);
}

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_ENTRIES) {
    await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map(k => cache.delete(k)));
  }
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !isTile(e.request.url)) return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);
      if (cached) return cached;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') {
        cache.put(e.request, res.clone()).then(() => trim(cache));
      }
      return res;
    })
  );
});
