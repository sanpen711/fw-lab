const CACHE_NAME = 'fw-mobile-app-pwa-stable-20260629-swipe-direct-1';
const APP_BASE = new URL('./', self.location.href).pathname;
const SITE_BASE = APP_BASE.replace(/app\/?$/, '');
const appPath = path => APP_BASE + path;
const assetPath = path => SITE_BASE + 'assets/' + path;

const APP_SHELL = [
  appPath('install.html'),
  appPath('index.html'),
  appPath('app.css'),
  appPath('rooms.css'),
  appPath('bird.css'),
  assetPath('supabase-config.js'),
  assetPath('supabase-db.js'),
  appPath('app.js'),
  appPath('nav.js'),
  appPath('feed.js'),
  appPath('feed-detail-return.js'),
  appPath('publish.js'),
  appPath('buddy.js'),
  appPath('buddy-read-tweaks.js'),
  appPath('buddy-chat-read-fix.js'),
  appPath('buddy-chat-tweaks.js'),
  appPath('buddy-chat-polish.js'),
  appPath('buddy-chat-bottom-fix.js'),
  appPath('buddy-chat-scroll-fix.js'),
  appPath('buddy-contacts-actions.js'),
  appPath('buddy-chat-entry-fix.js'),
  appPath('mobile-buddy-chat-swipe.js'),
  assetPath('fw-emoji-panel.js'),
  assetPath('icons/apple-touch-icon.png'),
  assetPath('icons/icon-192.png'),
  assetPath('icons/icon-512.png'),
  assetPath('icons/icon-maskable-512.png'),
  assetPath('icons/fw-lab-icon.svg'),
  appPath('echo.js'),
  appPath('echo-enhance.js'),
  appPath('profile.js'),
  appPath('profile-login-ui.js'),
  appPath('profile-email-guard.js'),
  appPath('rooms.js'),
  appPath('bird.js'),
  appPath('bird-tweaks.js'),
  appPath('archive.js'),
  appPath('modules-init.js'),
  appPath('admin.js'),
  appPath('report.js'),
  appPath('comment-reply-fix.js'),
  appPath('mobile-core-fixes.js'),
  appPath('mobile-priority-fixes.js'),
  appPath('mobile-swipe-back.js'),
  appPath('mobile-transitions.js'),
  appPath('mobile-media-cache.js'),
  appPath('mobile-feed-cache.js'),
  appPath('mobile-image-preview.js'),
  appPath('mobile-module-cache.js'),
  appPath('mobile-global-fixes.js'),
  appPath('mobile-cache-settings.js'),
  appPath('manifest.webmanifest')
];

function isNavigationRequest(request){
  if(request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.indexOf('text/html') >= 0;
}

function cacheAppShell(cache){
  return Promise.all(APP_SHELL.map(url => {
    return cache.add(url).catch(error => {
      console.warn('[FW mobile app] shell cache skipped', url, error);
    });
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cacheAppShell).then(() => self.skipWaiting()));
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
  if(!url.pathname.startsWith(APP_BASE) && !url.pathname.startsWith(SITE_BASE + 'assets/')) return;
  if(url.pathname === APP_BASE || url.pathname === appPath('index.html') || isNavigationRequest(request)){
    event.respondWith(
      fetch(request).then(response => {
        if(response && response.ok){
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(appPath('index.html'), copy));
        }
        return response;
      }).catch(() => caches.match(appPath('index.html')))
    );
    return;
  }
  event.respondWith(
    fetch(request).then(response => {
      if(response && response.ok){
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request))
  );
});