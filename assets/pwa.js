// F.w 研究所：PWA 注册 + 下载客户端入口加载
(function(){
  if(window.__FW_PWA_DOWNLOAD_BOOT__) return;
  window.__FW_PWA_DOWNLOAD_BOOT__ = true;

  function loadDownloadClient(){
    if(window.__FW_DOWNLOAD_CLIENT_MODAL__) return;
    if(document.querySelector('script[data-fw-download-client-script]')) return;
    var script = document.createElement('script');
    script.src = 'assets/fw-download-client.js?v=download-client-20260702-1';
    script.async = false;
    script.setAttribute('data-fw-download-client-script', '1');
    document.body.appendChild(script);
  }

  function registerServiceWorker(){
    if(!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('service-worker.js').catch(function(err){
      console.warn('[FW PWA] service worker registration failed', err);
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadDownloadClient);
  else loadDownloadClient();

  window.addEventListener('load', registerServiceWorker);
})();
