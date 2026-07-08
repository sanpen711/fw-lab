// F.w 研究所：电脑端旧回声双浮窗清理开关 + 回声通知布局修正 + 搭子选中态修正
// 放在 app.js 前面执行，优先压掉旧的右侧回声小窗缓存，并修正新版回声面板横向溢出。
(function(){
  if(window.__FW_DESKTOP_ECHO_LEGACY_KILL__) return;
  window.__FW_DESKTOP_ECHO_LEGACY_KILL__ = true;
  if(/\/app\//.test(window.location.pathname || '')) return;

  function injectEchoLayoutFix(){
    if(document.getElementById('fw-desktop-echo-layout-fix')) return;

    var style = document.createElement('style');
    style.id = 'fw-desktop-echo-layout-fix';
    style.textContent = `
      @media (min-width:761px){
        .fw-stable-echo-panel{
          width:min(520px, calc(100vw - 56px))!important;
          overflow:hidden!important;
        }
        .fw-stable-echo-head{
          padding:20px 24px 18px!important;
          align-items:flex-start!important;
        }
        .fw-stable-echo-head h2{
          font-size:30px!important;
          letter-spacing:-.035em!important;
          white-space:nowrap!important;
        }
        .fw-stable-echo-body{
          overflow-y:auto!important;
          overflow-x:hidden!important;
          padding:18px!important;
        }
        .fw-stable-echo-item{
          grid-template-columns:38px minmax(0, 1fr) auto!important;
          align-items:center!important;
          width:100%!important;
          box-sizing:border-box!important;
          overflow:hidden!important;
        }
        .fw-stable-echo-main{
          min-width:0!important;
          max-width:100%!important;
          overflow:hidden!important;
        }
        .fw-stable-echo-main b{
          max-width:100%!important;
          white-space:normal!important;
          overflow-wrap:anywhere!important;
          word-break:break-word!important;
        }
        .fw-stable-echo-main span{
          max-width:100%!important;
          overflow-wrap:anywhere!important;
          word-break:break-word!important;
          white-space:normal!important;
        }
        .fw-stable-echo-actions{
          min-width:max-content!important;
        }
        .fw-stable-echo-actions button{
          white-space:nowrap!important;
        }
        .fw-stable-echo-toolbar{
          width:100%!important;
          box-sizing:border-box!important;
          overflow:hidden!important;
        }

        /* 搭子中心：红色只表示未读，当前选中不再用红框，避免误判为未读 */
        .fw-wx-item:hover:not(.unread){
          background:#fffdf7!important;
          border-color:rgba(28,28,24,.14)!important;
        }
        .fw-wx-item.active:not(.unread){
          background:#fffdf7!important;
          border-color:rgba(28,28,24,.24)!important;
          box-shadow:inset 4px 0 0 #1b1b18, 0 8px 20px rgba(0,0,0,.045)!important;
        }
        .fw-wx-item.unread{
          background:#fffdf7!important;
          border-color:rgba(217,121,121,.55)!important;
        }
        .fw-wx-item.unread.active{
          border-color:rgba(217,121,121,.55)!important;
          box-shadow:inset 4px 0 0 #df7676, 0 8px 20px rgba(0,0,0,.045)!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

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
  injectEchoLayoutFix();
  removeLegacyEcho();

  window.addEventListener('click', function(e){
    var echo = e.target && e.target.closest && e.target.closest('[data-fw-open-echo]');
    if(!echo) return;
    injectEchoLayoutFix();
    removeLegacyEcho();
    setTimeout(removeLegacyEcho, 0);
    setTimeout(removeLegacyEcho, 80);
    setTimeout(removeLegacyEcho, 260);
  }, true);

  var obs = new MutationObserver(function(){
    injectEchoLayoutFix();
    if(window.__FW_DISABLE_DUAL_ECHO__) hideLegacyEcho();
  });

  function start(){
    injectEchoLayoutFix();
    removeLegacyEcho();
    try{ obs.observe(document.documentElement, {childList:true, subtree:true}); }catch(e){}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
