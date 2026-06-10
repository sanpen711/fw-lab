// F.w 研究所：手机端回声兼容入口
// 回声主逻辑已收回 app/echo.js；这里不再覆盖 FWAppEcho，也不再管理搭子通知/红点。
(function(){
  if(window.__FW_MOBILE_ECHO_ENHANCE__) return;
  window.__FW_MOBILE_ECHO_ENHANCE__ = true;

  function refreshBadges(){
    if(window.FWAppEcho && typeof window.FWAppEcho.refreshBadges === 'function'){
      return window.FWAppEcho.refreshBadges();
    }
  }

  window.FWAppEchoEnhance = {
    load:function(force){
      if(window.FWAppEcho && typeof window.FWAppEcho.load === 'function') return window.FWAppEcho.load(!!force);
    },
    refreshBadges:refreshBadges,
    install:function(){ refreshBadges(); }
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshBadges);
  else refreshBadges();
})();
