// Bump CACHE on every release so clients pick up new assets.
const CACHE = 'measureledger-v0.1.0';
const ASSETS = ['./', './index.html', './css/app.css', './manifest.webmanifest', './icons/icon.svg',
  './js/app.js', './js/units.js', './js/calc.js', './js/csv.js', './js/model.js', './js/store.js', './js/templates.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('measureledger-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // cache-first, fall back to network, then to the app shell for navigations
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
