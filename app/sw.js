const CACHE_NAME = 'fw-mobile-app-echo-standalone-20260610-2';
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
  appPath('app.js'),
  appPath('nav.js'),
  appPath('feed.js'),
  appPath('publish.js'),
  appPath('buddy.js'),
  appPath('buddy-read-tweaks.js'),
  appPath('buddy-chat-read-fix.js'),
  appPath('buddy-badge-fix.js'),
  appPath('buddy-chat-tweaks.js'),
  appPath('buddy-chat-polish.js'),
  appPath('buddy-chat-bottom-fix.js'),
  appPath('buddy-chat-scroll-fix.js'),
  appPath('buddy-user-action-prehook.js'),
  appPath('buddy-contacts-actions.js'),
  appPath('buddy-chat-entry-fix.js'),
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
  appPath('mobile-core-fixes.js'),
  appPath('manifest.webmanifest')
];

function tweakTag(src){
  return '  <scr' + 'ipt src="' + src + '"></scr' + 'ipt>\n</body>';
}

function injectAppTweaks(html){
  let next = String(html || '');
  next = next.replace(/\s*<script src="\.\/buddy-open-fast\.js\?v=[^"']+"><\/script>/g, '');
  next = next.replace(/\.\/buddy\.js\?v=[^"']+/g, './buddy.js?v=mobile-buddy-core-20260609-3');
  next = next.replace(/\.\/buddy-read-tweaks\.js\?v=[^"']+/g, './buddy-read-tweaks.js?v=mobile-buddy-read-state-20260610-1');
  next = next.replace(/\.\/buddy-chat-read-fix\.js\?v=[^"']+/g, './buddy-chat-read-fix.js?v=mobile-buddy-chat-read-20260609-4');
  next = next.replace(/\.\/echo\.js\?v=[^"']+/g, './echo.js?v=mobile-echo-standalone-20260610-2');
  next = next.replace(/\.\/echo-enhance\.js\?v=[^"']+/g, './echo-enhance.js?v=mobile-echo-compat-20260610-1');
  next = next.replace(/\.\/mobile-core-fixes\.js\?v=[^"']+/g, './mobile-core-fixes.js?v=mobile-core-fixes-20260609-7');
  if(next.indexOf('report.js') < 0) next = next.replace('</body>', tweakTag('./report.js?v=mobile-report-20260609-1'));
  if(next.indexOf('mobile-core-fixes.js') < 0) next = next.replace('</body>', tweakTag('./mobile-core-fixes.js?v=mobile-core-fixes-20260609-7'));
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
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
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
  if(url.pathname === APP_BASE || url.pathname === appPath('index.html')){
    event.respondWith(
      fetch(request).then(async response => {
        if(!response || !response.ok) return response;
        const transformed = await transformIndexResponse(response);
        caches.open(CACHE_NAME).then(cache => cache.put(appPath('index.html'), transformed.clone()));
        return transformed;
      }).catch(async () => {
        const cached = await caches.match(appPath('index.html'));
        return cached ? transformIndexResponse(cached) : caches.match(appPath('index.html'));
      })
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
    }).catch(() => caches.match(request).then(cached => cached || caches.match(appPath('index.html'))))
  );
});
