// F.w 研究所：PWA 基础注册脚本
(function(){
  if(!('serviceWorker' in navigator)) return;

  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/service-worker.js').catch(function(err){
      console.warn('[FW PWA] service worker registration failed', err);
    });
  });
})();
