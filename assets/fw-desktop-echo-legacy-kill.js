// F.w 研究所：电脑端旧回声双浮窗清理开关
// 放在 app.js 前面执行，优先压掉旧的右侧回声小窗缓存。
(function(){
  if(window.__FW_DESKTOP_ECHO_LEGACY_KILL__) return;
  window.__FW_DESKTOP_ECHO_LEGACY_KILL__ = true;
  if(/\/app\//.test(window.location.pathname || '')) return;

  function removeLegacyEcho(){
    try{
      document.querySelectorAll('[data-fw-dual-echo-modal], .fw-dual-modal.echo').forEach(function(node){
        node.remove();
      });
    }catch(e){}
  }

  function hideLegacyEcho(){
    try{
      document.querySelectorAll('[data-fw-dual-echo-modal], .fw-dual-modal.echo').forEach(function(node){
        node.classList.remove('show');
        node.style.display = 'none';
        node.setAttribute('aria-hidden', 'true');
      });
    }catch(e){}
  }

  window.__FW_DISABLE_DUAL_ECHO__ = true;
  removeLegacyEcho();

  window.addEventListener('click', function(e){
    var echo = e.target && e.target.closest && e.target.closest('[data-fw-open-echo]');
    if(!echo) return;
    removeLegacyEcho();
    setTimeout(removeLegacyEcho, 0);
    setTimeout(removeLegacyEcho, 80);
    setTimeout(removeLegacyEcho, 260);
  }, true);

  var obs = new MutationObserver(function(){
    if(window.__FW_DISABLE_DUAL_ECHO__) hideLegacyEcho();
  });

  function start(){
    removeLegacyEcho();
    try{ obs.observe(document.documentElement, {childList:true, subtree:true}); }catch(e){}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
