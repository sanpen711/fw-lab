// F.w 研究所：手机搭子页常驻 Tab 布局
// 目标：buddy.html 像微信通讯录页一样作为底部 Tab 页面存在，不再显示关闭按钮。
(function(){
  if(window.__FW_MOBILE_BUDDY_PAGE_SHELL__) return;
  window.__FW_MOBILE_BUDDY_PAGE_SHELL__ = true;

  var retryDelays = [0, 220, 520, 1000, 1800, 3000, 4800];

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function isMobile(){
    return (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) || /Android|iPhone|iPad|iPod|Mobile|MicroMessenger|MQQBrowser|baiduboxapp|baidubrowser/i.test(navigator.userAgent || '');
  }

  function isBuddyPage(){
    return (location.pathname.split('/').pop() || '').toLowerCase() === 'buddy.html';
  }

  function injectStyle(){
    if(document.getElementById('fw-mobile-buddy-page-shell-style')) return;

    var style = document.createElement('style');
    style.id = 'fw-mobile-buddy-page-shell-style';
    style.textContent = [
      '@media(max-width:768px){',
      '  html.fw-buddy-tab-page,html.fw-buddy-tab-page body{background:#f3efe6!important;}',
      '  html.fw-buddy-tab-page body{overflow:hidden!important;}',
      '  html.fw-buddy-tab-page .page,html.fw-buddy-tab-page .hero.bg-night{background:#f3efe6!important;min-height:100dvh!important;height:100dvh!important;overflow:hidden!important;}',
      '  html.fw-buddy-tab-page .fw-mobile-social-placeholder{display:none!important;}',
      '  html.fw-buddy-tab-page .fw-mobile-tab[data-fw-mobile-tab="buddy"]{color:#fffdf7!important;background:rgba(217,121,121,.14)!important;}',
      '  html.fw-buddy-tab-page .fw-mobile-tab[data-fw-mobile-tab="buddy"] svg{color:var(--accent,#df7676)!important;}',

      '  html.fw-buddy-tab-page .fw-wx-modal{position:fixed!important;left:0!important;right:0!important;top:0!important;bottom:var(--fw-mobile-bottom-space)!important;z-index:930!important;background:#f3efe6!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;pointer-events:none!important;}',
      '  html.fw-buddy-tab-page .fw-wx-modal.show{display:block!important;pointer-events:auto!important;}',
      '  html.fw-buddy-tab-page .fw-wx-panel{position:absolute!important;inset:0!important;left:0!important;right:0!important;top:0!important;bottom:0!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;resize:none!important;border:0!important;box-shadow:none!important;display:grid!important;grid-template-rows:auto minmax(0,1fr)!important;background:#fffdf7!important;overflow:hidden!important;}',

      '  html.fw-buddy-tab-page .fw-wx-head{height:auto!important;min-height:78px!important;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px 12px!important;border-bottom:1px solid rgba(28,28,24,.12)!important;display:flex!important;align-items:flex-end!important;justify-content:space-between!important;background:#fffdf7!important;cursor:default!important;}',
      '  html.fw-buddy-tab-page .fw-wx-title small{display:block!important;color:#d97979!important;font-size:12px!important;font-weight:1000!important;letter-spacing:.14em!important;margin-bottom:5px!important;}',
      '  html.fw-buddy-tab-page .fw-wx-title h2{margin:0!important;font-size:26px!important;line-height:1!important;color:#1d1d1a!important;font-weight:1000!important;}',
      '  html.fw-buddy-tab-page .fw-wx-tools,html.fw-buddy-tab-page .fw-wx-tool,html.fw-buddy-tab-page .fw-wx-close{display:none!important;}',

      '  html.fw-buddy-tab-page .fw-wx-shell{min-height:0!important;height:100%!important;display:block!important;background:#f3efe6!important;overflow:hidden!important;}',
      '  html.fw-buddy-tab-page .fw-wx-left{height:100%!important;min-height:0!important;border:0!important;background:#f3efe6!important;display:grid!important;grid-template-rows:auto auto minmax(0,1fr)!important;}',
      '  html.fw-buddy-tab-page .fw-wx-search{padding:12px 14px!important;border-bottom:1px solid rgba(28,28,24,.08)!important;}',
      '  html.fw-buddy-tab-page .fw-wx-search form{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;}',
      '  html.fw-buddy-tab-page .fw-wx-search input{min-width:0!important;height:42px!important;border:1px solid rgba(28,28,24,.18)!important;background:#fffdf7!important;border-radius:12px!important;padding:0 12px!important;font-size:14px!important;font-weight:800!important;outline:none!important;}',
      '  html.fw-buddy-tab-page .fw-wx-search button{height:42px!important;border:0!important;border-radius:999px!important;background:#1b1b18!important;color:#fff!important;padding:0 13px!important;font-size:13px!important;font-weight:1000!important;}',

      '  html.fw-buddy-tab-page .fw-wx-tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important;padding:12px 14px!important;border-bottom:1px solid rgba(28,28,24,.08)!important;}',
      '  html.fw-buddy-tab-page .fw-wx-tab{height:36px!important;border:1px solid rgba(28,28,24,.14)!important;background:#fffdf7!important;border-radius:999px!important;font-size:12px!important;font-weight:1000!important;}',
      '  html.fw-buddy-tab-page .fw-wx-tab.active{background:#1b1b18!important;color:#fff!important;border-color:#1b1b18!important;}',

      '  html.fw-buddy-tab-page .fw-wx-list{min-height:0!important;overflow:auto!important;padding:10px 10px 18px!important;background:#f3efe6!important;}',
      '  html.fw-buddy-tab-page .fw-wx-list,html.fw-buddy-tab-page .fw-wx-messages{scrollbar-width:none!important;-ms-overflow-style:none!important;}',
      '  html.fw-buddy-tab-page .fw-wx-list::-webkit-scrollbar,html.fw-buddy-tab-page .fw-wx-messages::-webkit-scrollbar{width:0!important;height:0!important;display:none!important;}',
      '  html.fw-buddy-tab-page .fw-wx-item{display:grid!important;grid-template-columns:44px minmax(0,1fr)!important;gap:10px!important;align-items:center!important;padding:12px!important;border-radius:14px!important;border:1px solid transparent!important;background:transparent!important;}',
      '  html.fw-buddy-tab-page .fw-wx-item.active,html.fw-buddy-tab-page .fw-wx-item:active{background:#fffdf7!important;border-color:rgba(217,121,121,.42)!important;}',
      '  html.fw-buddy-tab-page .fw-wx-avatar{width:44px!important;height:44px!important;border-radius:999px!important;display:grid!important;place-items:center!important;overflow:hidden!important;background:#1b1b18!important;color:#fff!important;font-weight:1000!important;font-size:12px!important;}',
      '  html.fw-buddy-tab-page .fw-wx-avatar img{width:100%!important;height:100%!important;object-fit:cover!important;}',
      '  html.fw-buddy-tab-page .fw-wx-name{font-size:15px!important;font-weight:1000!important;color:#1d1d1a!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}',
      '  html.fw-buddy-tab-page .fw-wx-sub{margin-top:4px!important;font-size:12px!important;color:#77736b!important;font-weight:800!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}',
      '  html.fw-buddy-tab-page .fw-wx-empty{margin:8px!important;border:1px dashed rgba(28,28,24,.2)!important;background:rgba(255,253,247,.72)!important;border-radius:14px!important;padding:16px!important;color:#77736b!important;font-weight:900!important;}',

      '  html.fw-buddy-tab-page .fw-wx-right{position:absolute!important;inset:0!important;z-index:2!important;display:none!important;grid-template-rows:auto minmax(0,1fr) auto!important;background:#fffaf1!important;}',
      '  html.fw-buddy-tab-page .fw-wx-modal.fw-wx-mobile-chatting{bottom:0!important;z-index:10220!important;}',
      '  html.fw-buddy-tab-page .fw-wx-modal.fw-wx-mobile-chatting .fw-wx-panel{height:100dvh!important;}',
      '  html.fw-buddy-tab-page .fw-wx-modal.fw-wx-mobile-chatting .fw-wx-left{display:none!important;}',
      '  html.fw-buddy-tab-page .fw-wx-modal.fw-wx-mobile-chatting .fw-wx-right{display:grid!important;height:100dvh!important;}',
      '  html.fw-buddy-tab-page .fw-wx-back-list{display:inline-flex!important;align-items:center!important;justify-content:center!important;margin:0 0 9px!important;min-height:32px!important;border:1px solid rgba(28,28,24,.14)!important;border-radius:999px!important;background:#fffdf7!important;padding:0 12px!important;font-size:12px!important;font-weight:1000!important;color:#1d1d1a!important;}',
      '  html.fw-buddy-tab-page .fw-wx-chat-head{height:auto!important;min-height:78px!important;padding:calc(env(safe-area-inset-top,0px) + 10px) 14px 10px!important;display:flex!important;align-items:flex-end!important;border-bottom:1px solid rgba(28,28,24,.1)!important;background:#fffdf7!important;}',
      '  html.fw-buddy-tab-page .fw-wx-chat-head h3{margin:0!important;font-size:20px!important;line-height:1.12!important;color:#1d1d1a!important;font-weight:1000!important;}',
      '  html.fw-buddy-tab-page .fw-wx-chat-head span{display:block!important;margin-top:5px!important;font-size:12px!important;color:#9d4a4a!important;font-weight:900!important;}',
      '  html.fw-buddy-tab-page .fw-wx-messages{min-height:0!important;overflow:auto!important;padding:16px 14px 18px!important;background-image:linear-gradient(rgba(42,42,35,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(42,42,35,.045) 1px,transparent 1px)!important;background-size:28px 28px!important;}',
      '  html.fw-buddy-tab-page .fw-wx-compose{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;padding:10px 12px calc(env(safe-area-inset-bottom,0px) + 10px)!important;border-top:1px solid rgba(28,28,24,.1)!important;background:#fffdf7!important;}',
      '  html.fw-buddy-tab-page .fw-wx-compose input{min-width:0!important;height:44px!important;border:1px solid rgba(28,28,24,.18)!important;border-radius:12px!important;background:#fffdf7!important;padding:0 12px!important;font-size:14px!important;font-weight:900!important;outline:none!important;}',
      '  html.fw-buddy-tab-page .fw-wx-compose button{height:44px!important;min-width:64px!important;border:0!important;border-radius:999px!important;background:#1b1b18!important;color:#fff!important;font-size:13px!important;font-weight:1000!important;}',
      '}',
      '@supports not (height:100dvh){@media(max-width:768px){html.fw-buddy-tab-page .fw-wx-modal.fw-wx-mobile-chatting .fw-wx-panel,html.fw-buddy-tab-page .fw-wx-modal.fw-wx-mobile-chatting .fw-wx-right{height:100vh!important;}}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function activateBuddyTab(){
    $$('[data-fw-mobile-tab]').forEach(function(tab){
      var active = tab.dataset.fwMobileTab === 'buddy';
      tab.classList.toggle('is-active', active);
      if(active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
  }

  function openBuddy(){
    var api = window.FWMobileActions || {};
    if(typeof api.openBuddy === 'function' && !api.openBuddy.__fwMobileNavFallback){
      api.openBuddy();
      return true;
    }

    var btn = $('[data-fw-open-buddy]');
    if(btn){
      btn.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
      return true;
    }

    return false;
  }

  function ensureBuddyOpen(){
    if(!isMobile() || !isBuddyPage()) return;
    injectStyle();
    activateBuddyTab();
    document.documentElement.classList.add('fw-buddy-tab-page');
    document.body && document.body.classList.add('fw-buddy-tab-page');

    if($('.fw-wx-modal.show')) return;
    openBuddy();
  }

  function interceptClose(e){
    if(!isMobile() || !isBuddyPage()) return;
    var close = e.target.closest && e.target.closest('[data-fw-wx-close], .fw-wx-close');
    if(!close) return;
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    ensureBuddyOpen();
  }

  function boot(){
    if(!isBuddyPage()) return;
    document.documentElement.classList.add('fw-buddy-tab-page');
    if(document.body) document.body.classList.add('fw-buddy-tab-page');
    injectStyle();
    activateBuddyTab();

    retryDelays.forEach(function(ms){
      setTimeout(ensureBuddyOpen, ms);
    });
  }

  window.addEventListener('click', interceptClose, true);
  window.addEventListener('pageshow', function(){ setTimeout(ensureBuddyOpen, 80); });
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible') setTimeout(ensureBuddyOpen, 80);
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
