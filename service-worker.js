// F.w 研究所：PWA 基础版 Service Worker
// 只负责安装/激活生命周期，不缓存 HTML，也不拦截业务请求。
self.addEventListener('install', function(){
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(self.clients.claim());
});
