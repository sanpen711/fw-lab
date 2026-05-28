const CACHE_NAME = 'fw-mobile-app-buddy-contact-actions-1';
const APP_SHELL = [
  '/app/install.html',
  '/app/index.html',
  '/app/app.css',
  '/app/rooms.css',
  '/app/bird.css',
  '/app/app.js',
  '/app/nav.js',
  '/app/feed.js',
  '/app/publish.js',
  '/app/buddy.js',
  '/app/buddy-read-tweaks.js',
  '/app/buddy-chat-tweaks.js',
  '/app/buddy-chat-polish.js',
  '/app/buddy-chat-bottom-fix.js',
  '/app/buddy-chat-scroll-fix.js',
  '/app/buddy-contacts-actions.js',
  '/assets/fw-emoji-panel.js',
  '/app/echo.js',
  '/app/profile.js',
  '/app/rooms.js',
  '/app/bird.js',
  '/app/bird-tweaks.js',
  '/app/modules-init.js',
  '/app/manifest.webmanifest'
];

function injectAppTweaks(html){
  let next = String(html || '');
  if(next.indexOf('/assets/fw-emoji-panel.js') < 0){
    next = next.replace('</body>', '  <script src="/assets/fw-emoji-panel.js?v=mobile-buddy-chat-20260528-1"></script>\n</body>');
  }
  if(next.indexOf('/app/bird-tweaks.js') < 0){
    next = next.replace('</body>', '  <script src="/app/bird-tweaks.js?v=mobile-bird-toggle-20260528-1"></script>\n</body>');
  }
  if(next.indexOf('/app/buddy-read-tweaks.js') < 0){
    next = next.replace('</body>', '  <script src="/app/buddy-read-tweaks.js?v=mobile-buddy-read-20260528-1"></script>\n</body>');
  }
  if(next.indexOf('/app/buddy-chat-tweaks.js') < 0){
    next = next.replace('</body>', '  <script src="/app/buddy-chat-tweaks.js?v=mobile-buddy-chat-20260528-1"></script>\n</body>');
  }
  if(next.indexOf('/app/buddy-chat-polish.js') < 0){
    next = next.replace('</body>', '  <script src="/app/buddy-chat-polish.js?v=mobile-buddy-chat-polish-20260528-1"></script>\n</body>');
  }
  if(next.indexOf('/app/buddy-chat-bottom-fix.js') < 0){
    next = next.replace('</body>', '  <script src="/app/buddy-chat-bottom-fix.js?v=mobile-buddy-chat-bottom-20260528-1"></script>\n</body>');
  }
  if(next.indexOf('/app/buddy-chat-scroll-fix.js') < 0){
    next = next.replace('</body>', '  <script src="/app/buddy-chat-scroll-fix.js?v=mobile-buddy-chat-scroll-20260528-1"></script>\n</body>');
  }
  if(next.indexOf('/app/buddy-contacts-actions.js') < 0){
    next = next.replace('</body>', '  <script src="/app/buddy-contacts-actions.js?v=mobile-buddy-contact-actions-20260528-1"></script>\n</body>');
  }
  return next;
}

function htmlResponse(html, response){
  const headers = new Headers(response && response.headers || {});
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(injectAppTweaks(html), {
    status: response && response.status || 200,
    statusText: response && response.statusText || 'OK',
    headers
  });
}

async function transformIndexResponse(response){
  const html = await response.clone().text();
  return htmlResponse(html, response);
}

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
  if(!url.pathname.startsWith('/app/') && !url.pathname.startsWith('/assets/')) return;

  if(url.pathname === '/app/' || url.pathname === '/app/index.html'){
    event.respondWith(
      fetch(request).then(async response => {
        if(!response || !response.ok) return response;
        const transformed = await transformIndexResponse(response);
        caches.open(CACHE_NAME).then(cache => cache.put('/app/index.html', transformed.clone()));
        return transformed;
      }).catch(async () => {
        const cached = await caches.match('/app/index.html');
        return cached ? transformIndexResponse(cached) : caches.match('/app/index.html');
      })
    );
    return;
  }

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
