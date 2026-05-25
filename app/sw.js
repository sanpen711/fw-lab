const CACHE_NAME = 'fw-mobile-app-debug-3';
const APP_SHELL = [
  '/app/install.html',
  '/app/index.html',
  '/app/app.css',
  '/app/app.js',
  '/app/nav.js',
  '/app/feed.js',
  '/app/publish.js',
  '/app/buddy.js',
  '/app/echo.js',
  '/app/profile.js',
  '/app/manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME && key.indexOf('fw-mobile-app-') === 0).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if(request.method !== 'GET') return;

  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return;
  if(!url.pathname.startsWith('/app/')) return;

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if(response && response.ok){
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached || caches.match('/app/index.html'));

      return cached || network;
    })
  );
});
