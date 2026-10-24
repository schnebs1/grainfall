// Offline support for the web version: serve from the cache straight away, and refresh the cache in the
// background so the next launch picks up any update.
const CACHE = 'grainfall-9001bb3';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'index.html', 'wood.js', 'levels.js', 'music.js', 'game.js',
    'fonts/LilitaOne.woff2', 'fonts/Nunito.woff2', 'manifest.webmanifest', 'icon-180.png'])));
  self.skipWaiting();
});
// drop the previous version's cache once this one takes over
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  .then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; });
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    return fresh;
  }));
});
