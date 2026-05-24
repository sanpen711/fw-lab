// F.w 研究所：手机端搭子 / 回声页面化入口
// 目的：让 PWA 底部“搭子 / 回声”像普通导航一样先跳页面，避免首页硬开弹窗失效。
(function(){
  if(window.__FW_MOBILE_SOCIAL_PAGE_ROUTES__) return;
  window.__FW_MOBILE_SOCIAL_PAGE_ROUTES__ = true;

  var routeMap = {buddy:'buddy.html', echo:'echo.html'};
  var autoOpenDelays = [300, 800, 1600, 3200, 5200];

  function $(selector, root){ return (root || document).querySelector(selector); }

  function isMobile(){
    return (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) || /Android|iPhone|iPad|iPod|Mobile|MicroMessenger|MQQBrowser|baiduboxapp|baidubrowser/i.test(navigator.userAgent || '');
  }

  function pageName(){
    return (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  }

  function currentKind(){
    var page = pageName();
    if(page === 'buddy.html') return 'buddy';
    if(page === 'echo.html') return 'echo';
    return '';
  }

  function toast(message){
    var t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(window.__fwMobileSocialPageRouteToast);
    window.__fwMobileSocialPageRouteToast = setTimeout(function(){ t.classList.remove('show'); }, 1800);
  }

  function setActive(kind){
    Array.prototype.slice.call(document.querySelectorAll('[data-fw-mobile-tab]')).forEach(function(btn){
      var active = btn.dataset.fwMobileTab === kind;
      btn.classList.toggle('is-active', active);
      if(active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
  }

  function injectPageStyle(){
    if(document.getElementById('fw-mobile-social-route-style')) return;
    var style = document.createElement('style');
    style.id = 'fw-mobile-social-route-style';
    style.textContent = [
      '@media(max-width:768px){',
      '  body.fw-wx-modal-open{overflow:hidden!important;}',
      '  .fw-mobile-social-placeholder{min-height:calc(100dvh - var(--fw-mobile-bottom-space,92px));display:grid;align-content:center;gap:12px;padding:calc(env(safe-area-inset-top,0px) + 76px) 22px 120px;color:#fffdf7;background:#080c08;}',
      '  .fw-mobile-social-placeholder small{color:#df7676;font-weight:1000;letter-spacing:.18em;}',
      '  .fw-mobile-social-placeholder h1{margin:0;font-size:46px;line-height:1;letter-spacing:-.08em;font-weight:1000;}',
      '  .fw-mobile-social-placeholder p{margin:0;color:rgba(255,253,247,.72);font-size:15px;line-height:1.7;font-weight:850;}',
      '  .fw-mobile-social-placeholder button,.fw-mobile-social-placeholder a{width:max-content;max-width:100%;min-height:44px;border-radius:999px;border:1px solid rgba(255,253,247,.28);background:rgba(255,253,247,.06);color:#fffdf7;padding:0 18px;font-size:14px;font-weight:1000;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;}',
      '  .fw-mobile-social-placeholder button.primary{border:0;background:#df7676;color:#fff;}',
      '  .fw-wx-modal{position:fixed!important;inset:0!important;z-index:10220!important;background:#f3efe6!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;pointer-events:none!important;}',
      '  .fw-wx-modal.show{display:block!important;pointer-events:auto!important;}',
      '  .fw-wx-panel{position:absolute!important;inset:0!important;left:0!important;right:0!important;top:0!important;bottom:0!important;width:100%!important;height:100dvh!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;resize:none!important;border:0!important;box-shadow:none!important;display:grid!important;grid-template-rows:auto minmax(0,1fr)!important;background:#fffdf7!important;overflow:hidden!important;}',
      '  .fw-wx-head{height:auto!important;min-height:78px!important;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px 12px!important;border-bottom:1px solid rgba(28,28,24,.12)!important;display:flex!important;align-items:flex-end!important;justify-content:space-between!important;background:#fffdf7!important;cursor:default!important;}',
      '  .fw-wx-title small{display:block!important;color:#d97979!important;font-size:12px!important;font-weight:1000!important;letter-spacing:.14em!important;margin-bottom:5px!important;}',
      '  .fw-wx-title h2{margin:0!important;font-size:26px!important;line-height:1!important;color:#1d1d1a!important;font-weight:1000!important;}',
      '  .fw-wx-tool{display:none!important;}',
      '  .fw-wx-close{display:grid!important;place-items:center!important;width:40px!important;height:40px!important;border:0!important;background:transparent!important;font-size:30px!important;line-height:1!important;color:#1d1d1a!important;}',
      '  .fw-wx-shell{min-height:0!important;height:100%!important;display:block!important;background:#f3efe6!important;overflow:hidden!important;}',
      '  .fw-wx-left{height:100%!important;min-height:0!important;border:0!important;background:#f3efe6!important;display:grid!important;grid-template-rows:auto auto minmax(0,1fr)!important;}',
      '  .fw-wx-search{padding:12px 14px!important;border-bottom:1px solid rgba(28,28,24,.08)!important;}',
      '  .fw-wx-search form{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;}',
      '  .fw-wx-search input{min-width:0!important;height:42px!important;border:1px solid rgba(28,28,24,.18)!important;background:#fffdf7!important;border-radius:12px!important;padding:0 12px!important;font-size:14px!important;font-weight:800!important;outline:none!important;}',
      '  .fw-wx-search button{height:42px!important;border:0!important;border-radius:999px!important;background:#1b1b18!important;color:#fff!important;padding:0 13px!important;font-size:13px!important;font-weight:1000!important;}',
      '  .fw-wx-tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important;padding:12px 14px!important;border-bottom:1px solid rgba(28,28,24,.08)!important;}',
      '  .fw-wx-tab{height:36px!important;border:1px solid rgba(28,28,24,.14)!important;background:#fffdf7!important;border-radius:999px!important;font-size:12px!important;font-weight:1000!important;}',
      '  .fw-wx-tab.active{background:#1b1b18!important;color:#fff!important;border-color:#1b1b18!important;}',
      '  .fw-wx-list{min-height:0!important;overflow:auto!important;padding:10px 10px calc(92px + env(safe-area-inset-bottom,0px))!important;}',
      '  .fw-wx-item{display:grid!important;grid-template-columns:44px minmax(0,1fr)!important;gap:10px!important;align-items:center!important;padding:12px!important;border-radius:14px!important;border:1px solid transparent!important;background:transparent!important;}',
      '  .fw-wx-item.active,.fw-wx-item:active{background:#fffdf7!important;border-color:rgba(217,121,121,.42)!important;}',
      '  .fw-wx-avatar{width:44px!important;height:44px!important;border-radius:999px!important;display:grid!important;place-items:center!important;overflow:hidden!important;background:#1b1b18!important;color:#fff!important;font-weight:1000!important;font-size:12px!important;}',
      '  .fw-wx-avatar img{width:100%!important;height:100%!important;object-fit:cover!important;}',
      '  .fw-wx-name{font-size:15px!important;font-weight:1000!important;color:#1d1d1a!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}',
      '  .fw-wx-sub{margin-top:4px!important;font-size:12px!important;color:#77736b!important;font-weight:800!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}',
      '  .fw-wx-empty{margin:8px!important;border:1px dashed rgba(28,28,24,.2)!important;background:rgba(255,253,247,.72)!important;border-radius:14px!important;padding:16px!important;color:#77736b!important;font-weight:900!important;}',
      '  .fw-wx-right{position:absolute!important;inset:0!important;z-index:2!important;display:none!important;grid-template-rows:auto minmax(0,1fr) auto!important;background:#fffaf1!important;}',
      '  .fw-wx-modal.fw-wx-mobile-chatting .fw-wx-left{display:none!important;}',
      '  .fw-wx-modal.fw-wx-mobile-chatting .fw-wx-right{display:grid!important;height:100dvh!important;}',
      '  .fw-wx-back-list{display:inline-flex!important;align-items:center!important;justify-content:center!important;margin:0 0 9px!important;min-height:32px!important;border:1px solid rgba(28,28,24,.14)!important;border-radius:999px!important;background:#fffdf7!important;padding:0 12px!important;font-size:12px!important;font-weight:1000!important;color:#1d1d1a!important;}',
      '  .fw-wx-chat-head{height:auto!important;min-height:78px!important;padding:calc(env(safe-area-inset-top,0px) + 10px) 14px 10px!important;display:flex!important;align-items:flex-end!important;border-bottom:1px solid rgba(28,28,24,.1)!important;background:#fffdf7!important;}',
      '  .fw-wx-chat-head h3{margin:0!important;font-size:20px!important;line-height:1.12!important;color:#1d1d1a!important;font-weight:1000!important;}',
      '  .fw-wx-chat-head span{display:block!important;margin-top:5px!important;font-size:12px!important;color:#9d4a4a!important;font-weight:900!important;}',
      '  .fw-wx-messages{min-height:0!important;overflow:auto!important;padding:16px 14px 18px!important;background-image:linear-gradient(rgba(42,42,35,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(42,42,35,.045) 1px,transparent 1px)!important;background-size:28px 28px!important;}',
      '  .fw-wx-compose{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;padding:10px 12px calc(env(safe-area-inset-bottom,0px) + 10px)!important;border-top:1px solid rgba(28,28,24,.1)!important;background:#fffdf7!important;}',
      '  .fw-wx-compose input{min-width:0!important;height:44px!important;border:1px solid rgba(28,28,24,.18)!important;border-radius:12px!important;background:#fffdf7!important;padding:0 12px!important;font-size:14px!important;font-weight:900!important;outline:none!important;}',
      '  .fw-wx-compose button{height:44px!important;min-width:64px!important;border:0!important;border-radius:999px!important;background:#1b1b18!important;color:#fff!important;font-size:13px!important;font-weight:1000!important;}',
      '  .fw-stable-echo-modal.show{z-index:10220!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px calc(env(safe-area-inset-bottom,0px) + 10px)!important;background:rgba(6,8,6,.72)!important;pointer-events:auto!important;}',
      '  .fw-stable-echo-panel{width:100%!important;height:86dvh!important;max-height:none!important;right:auto!important;top:auto!important;}',
      '}',
      '@supports not (height:100dvh){@media(max-width:760px){.fw-wx-panel,.fw-wx-modal.fw-wx-mobile-chatting .fw-wx-right{height:100vh!important;}}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function navigate(kind){
    var target = routeMap[kind];
    if(!target) return false;
    if(pageName() === target){
      if(kind === 'buddy' && window.FWMobileBuddyPageShell && typeof window.FWMobileBuddyPageShell.ensureOpen === 'function'){
        window.FWMobileBuddyPageShell.ensureOpen();
        return true;
      }
      openWithRetry(kind);
      return true;
    }
    location.href = target;
    return true;
  }

  function openEcho(){
    injectPageStyle();
    if(typeof window.fwOpenStableEcho === 'function'){
      window.fwOpenStableEcho();
      return true;
    }
    var api = window.FWMobileActions || {};
    if(typeof api.openEcho === 'function' && !api.openEcho.__fwMobileNavFallback){
      api.openEcho();
      return true;
    }
    var btn = $('[data-fw-open-echo]');
    if(btn){ btn.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window})); return true; }
    return false;
  }

  function openBuddy(){
    injectPageStyle();
    var api = window.FWMobileActions || {};
    if(typeof api.openBuddy === 'function' && !api.openBuddy.__fwMobileNavFallback){
      api.openBuddy();
      return true;
    }
    var btn = $('[data-fw-open-buddy]');
    if(btn){ btn.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window})); return true; }
    return false;
  }

  function openWithRetry(kind){
    var i = 0;
    injectPageStyle();
    setActive(kind);
    toast(kind === 'buddy' ? '正在打开搭子...' : '正在打开回声...');

    function run(){
      var ok = kind === 'buddy' ? openBuddy() : openEcho();
      if(ok) return;
      if(i >= autoOpenDelays.length){
        toast(kind === 'buddy' ? '搭子功能还没加载完成，请刷新后再试。' : '回声功能还没加载完成，请刷新后再试。');
        return;
      }
      setTimeout(run, autoOpenDelays[i]);
      i += 1;
    }
    run();
  }

  function handleRouteEvent(e){
    if(!isMobile()) return;
    var tab = e.target.closest && e.target.closest('[data-fw-mobile-tab="buddy"], [data-fw-mobile-tab="echo"]');
    if(!tab) return;
    var kind = tab.dataset.fwMobileTab;
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    navigate(kind);
  }

  window.addEventListener('touchstart', handleRouteEvent, true);
  window.addEventListener('pointerdown', handleRouteEvent, true);
  window.addEventListener('click', handleRouteEvent, true);

  function boot(){
    injectPageStyle();
    var kind = currentKind();
    if(kind){
      setActive(kind);
      setTimeout(function(){ openWithRetry(kind); }, 500);
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
