// F.w 研究所：手机端回声 / 搭子快捷按钮修复
// 问题：手机压缩栏按钮只转点桌面按钮；搭子中心原 CSS 在手机端强制隐藏，所以看起来“点了没反应”。
(function(){
  if(window.__FW_MOBILE_SOCIAL_OPEN_FIX__) return;
  window.__FW_MOBILE_SOCIAL_OPEN_FIX__ = true;

  function $(s, root){ return (root || document).querySelector(s); }
  function $$(s, root){ return Array.from((root || document).querySelectorAll(s)); }

  function toast(msg){
    var t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwMobileSocialToast);
    window.__fwMobileSocialToast = setTimeout(function(){ t.classList.remove('show'); }, 2200);
  }

  function injectStyle(){
    if($('#fw-mobile-social-open-fix-style')) return;
    var style = document.createElement('style');
    style.id = 'fw-mobile-social-open-fix-style';
    style.textContent = `
      @media(max-width:760px){
        .fw-wx-modal.show,
        [data-fw-wx-buddy-modal].show{
          display:flex!important;
          position:fixed!important;
          inset:0!important;
          z-index:10180!important;
          align-items:center!important;
          justify-content:center!important;
          padding:12px!important;
          background:rgba(6,8,6,.74)!important;
          pointer-events:auto!important;
          backdrop-filter:blur(8px)!important;
          -webkit-backdrop-filter:blur(8px)!important;
        }

        .fw-wx-modal.show .fw-wx-panel,
        [data-fw-wx-buddy-modal].show [data-fw-wx-panel]{
          position:relative!important;
          left:auto!important;
          right:auto!important;
          top:auto!important;
          bottom:auto!important;
          width:100%!important;
          min-width:0!important;
          max-width:100%!important;
          height:86dvh!important;
          min-height:0!important;
          max-height:86dvh!important;
          resize:none!important;
          display:grid!important;
          grid-template-rows:auto minmax(0,1fr)!important;
          overflow:hidden!important;
          background:#fffdf7!important;
        }

        .fw-wx-modal.show .fw-wx-head{
          height:66px!important;
          padding:14px 16px!important;
          cursor:default!important;
        }
        .fw-wx-modal.show .fw-wx-title small{font-size:10px!important;margin-bottom:4px!important;}
        .fw-wx-modal.show .fw-wx-title h2{font-size:26px!important;}

        .fw-wx-modal.show .fw-wx-shell{
          min-height:0!important;
          display:grid!important;
          grid-template-columns:1fr!important;
          grid-template-rows:44% 56%!important;
          overflow:hidden!important;
        }
        .fw-wx-modal.show .fw-wx-left{
          min-height:0!important;
          border-right:0!important;
          border-bottom:1px solid rgba(28,28,24,.12)!important;
          display:grid!important;
          grid-template-rows:auto auto minmax(0,1fr)!important;
          overflow:hidden!important;
        }
        .fw-wx-modal.show .fw-wx-search{padding:10px!important;}
        .fw-wx-modal.show .fw-wx-search input{height:38px!important;font-size:13px!important;}
        .fw-wx-modal.show .fw-wx-search button{font-size:13px!important;}
        .fw-wx-modal.show .fw-wx-tabs{padding:8px 10px!important;gap:6px!important;}
        .fw-wx-modal.show .fw-wx-tab{height:32px!important;font-size:12px!important;}
        .fw-wx-modal.show .fw-wx-list{min-height:0!important;overflow:auto!important;padding:8px!important;}
        .fw-wx-modal.show .fw-wx-item{grid-template-columns:38px 1fr!important;padding:8px!important;gap:8px!important;}
        .fw-wx-modal.show .fw-wx-avatar{width:38px!important;height:38px!important;}
        .fw-wx-modal.show .fw-wx-name{font-size:13px!important;}
        .fw-wx-modal.show .fw-wx-sub{font-size:11px!important;}

        .fw-wx-modal.show .fw-wx-right{
          min-height:0!important;
          display:grid!important;
          grid-template-rows:54px minmax(0,1fr) auto!important;
          overflow:hidden!important;
        }
        .fw-wx-modal.show .fw-wx-chat-head{height:54px!important;padding:0 12px!important;}
        .fw-wx-modal.show .fw-wx-chat-head h3{font-size:17px!important;}
        .fw-wx-modal.show .fw-wx-chat-head span{font-size:10px!important;}
        .fw-wx-modal.show .fw-wx-messages{min-height:0!important;overflow:auto!important;padding:12px!important;}
        .fw-wx-modal.show .fw-wx-pm{max-width:86%!important;margin-bottom:12px!important;}
        .fw-wx-modal.show .fw-wx-pm-bubble{padding:10px 12px!important;font-size:13px!important;}
        .fw-wx-modal.show .fw-wx-compose{display:grid!important;grid-template-columns:auto auto 1fr auto!important;gap:8px!important;padding:10px!important;}
        .fw-wx-modal.show .fw-wx-compose input{height:42px!important;font-size:13px!important;}
        .fw-wx-modal.show .fw-wx-compose button{height:42px!important;min-width:60px!important;font-size:13px!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function openEcho(){
    if(typeof window.fwOpenStableEcho === 'function'){
      window.fwOpenStableEcho();
      return;
    }
    var original = $$('[data-fw-open-echo]').find(function(el){ return !el.closest('#fw-mobile-compact-strip'); });
    if(original){ original.click(); return; }
    toast('回声功能还没加载完成，请稍后再点。');
  }

  function openBuddy(){
    var original = $$('[data-fw-open-buddy]').find(function(el){ return !el.closest('#fw-mobile-compact-strip'); });
    if(original){ original.click(); return; }

    var tmp = document.createElement('button');
    tmp.type = 'button';
    tmp.setAttribute('data-fw-open-buddy', '1');
    tmp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;';
    document.body.appendChild(tmp);
    tmp.click();
    setTimeout(function(){ tmp.remove(); }, 120);
  }

  function bind(){
    window.addEventListener('click', function(e){
      var btn = e.target.closest && e.target.closest('[data-fw-mobile-open]');
      if(!btn) return;
      var kind = btn.dataset.fwMobileOpen || '';
      if(kind !== 'echo' && kind !== 'buddy') return;

      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();

      if(kind === 'echo') openEcho();
      else openBuddy();
    }, true);
  }

  function boot(){
    injectStyle();
    bind();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
