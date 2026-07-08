// F.w 研究所：电脑端轻量样式修正
// 只处理电脑端回声通知布局和搭子选中态；不再长期监听 DOM，不影响 /app/ 手机端。
(function(){
  if(window.__FW_DESKTOP_ECHO_LIGHT_FIX__) return;
  window.__FW_DESKTOP_ECHO_LIGHT_FIX__ = true;
  if(/\/app\//.test(window.location.pathname || '')) return;

  function injectDesktopFixStyle(){
    if(document.getElementById('fw-desktop-echo-layout-fix')) return;

    var style = document.createElement('style');
    style.id = 'fw-desktop-echo-layout-fix';
    style.textContent = `
      @media (min-width:761px){
        .fw-stable-echo-panel{width:min(520px, calc(100vw - 56px))!important;overflow:hidden!important;}
        .fw-stable-echo-head{padding:20px 24px 18px!important;align-items:flex-start!important;}
        .fw-stable-echo-head h2{font-size:30px!important;letter-spacing:-.035em!important;white-space:nowrap!important;}
        .fw-stable-echo-body{display:grid!important;align-content:start!important;gap:12px!important;overflow-y:auto!important;overflow-x:hidden!important;padding:18px!important;}
        .fw-stable-echo-item{display:grid!important;grid-template-columns:42px minmax(0, 1fr) auto!important;gap:12px!important;align-items:center!important;width:100%!important;min-height:84px!important;padding:13px 14px!important;box-sizing:border-box!important;overflow:visible!important;}
        .fw-stable-echo-avatar{width:38px!important;height:38px!important;min-width:38px!important;flex:0 0 38px!important;overflow:hidden!important;align-self:center!important;}
        .fw-stable-echo-avatar img{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important;}
        .fw-stable-echo-main{display:block!important;min-width:0!important;max-width:100%!important;overflow:hidden!important;line-height:1.35!important;}
        .fw-stable-echo-main b{display:block!important;max-width:100%!important;font-size:14px!important;line-height:1.35!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word!important;}
        .fw-stable-echo-main span{display:block!important;max-width:100%!important;margin-top:4px!important;font-size:12px!important;line-height:1.45!important;color:#6f6a5f!important;overflow-wrap:anywhere!important;word-break:break-word!important;white-space:normal!important;}
        .fw-stable-echo-main time{display:block!important;margin-top:4px!important;font-size:11px!important;line-height:1.3!important;}
        .fw-stable-echo-actions{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:8px!important;min-width:max-content!important;}
        .fw-stable-echo-actions button{min-height:32px!important;height:auto!important;padding:0 12px!important;white-space:nowrap!important;line-height:30px!important;}
        .fw-stable-echo-toolbar{width:100%!important;box-sizing:border-box!important;overflow:hidden!important;padding:12px 14px!important;min-height:64px!important;}
        .fw-wx-item:hover:not(.unread){background:#fffdf7!important;border-color:rgba(28,28,24,.14)!important;}
        .fw-wx-item.active:not(.unread){background:#fffdf7!important;border-color:rgba(28,28,24,.24)!important;box-shadow:inset 4px 0 0 #1b1b18, 0 8px 20px rgba(0,0,0,.045)!important;}
        .fw-wx-item.unread{background:#fffdf7!important;border-color:rgba(217,121,121,.55)!important;}
        .fw-wx-item.unread.active{border-color:rgba(217,121,121,.55)!important;box-shadow:inset 4px 0 0 #df7676, 0 8px 20px rgba(0,0,0,.045)!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function removeOldDualEchoOnce(){
    try{
      document.querySelectorAll('[data-fw-dual-echo-modal], .fw-dual-modal.echo').forEach(function(node){ node.remove(); });
    }catch(e){}
  }

  function boot(){
    injectDesktopFixStyle();
    removeOldDualEchoOnce();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
