// Offline support for the web version: serve from the cache straight away, and refresh the cache in the
// background so the next launch picks up any update.
const CACHE = 'grainfall-ff07cb2b31';
self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version never gets filled with old copies
  const files = ['./', 'index.html', 'wood.js', 'levels.js', 'music.js', 'game.js',
    'fonts/LilitaOne.woff2', 'fonts/Nunito.woff2', 'manifest.webmanifest', 'icon-180.png'];
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(files.map(f => new Request(f, { cache: 'reload' })))));
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
    const fresh = fetch(e.request.url, { cache: 'no-cache' }).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; });
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    return fresh;
  }));
});
