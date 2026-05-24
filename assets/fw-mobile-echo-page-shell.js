// F.w lab: mobile echo tab page shell.
// Keeps echo.html as a first-level mobile tab without owning the shared tabbar.
(function(){
  if(window.__FW_MOBILE_ECHO_PAGE_SHELL__) return;
  window.__FW_MOBILE_ECHO_PAGE_SHELL__ = true;

  var retryDelays = [0, 220, 520, 1000, 1800, 3000, 4800];

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function isMobile(){
    return (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) || /Android|iPhone|iPad|iPod|Mobile|MicroMessenger|MQQBrowser|baiduboxapp|baidubrowser/i.test(navigator.userAgent || '');
  }

  function isEchoPage(){
    return (location.pathname.split('/').pop() || '').toLowerCase() === 'echo.html';
  }

  function injectStyle(){
    if(document.getElementById('fw-mobile-echo-page-shell-style')) return;

    var style = document.createElement('style');
    style.id = 'fw-mobile-echo-page-shell-style';
    style.textContent = [
      '@media(max-width:768px){',
      '  html.fw-echo-tab-page,html.fw-echo-tab-page body{background:#f3efe6!important;}',
      '  html.fw-echo-tab-page body{overflow:hidden!important;}',
      '  html.fw-echo-tab-page .page,html.fw-echo-tab-page .hero.bg-night{background:#f3efe6!important;}',
      '  html.fw-echo-tab-page .fw-mobile-social-placeholder{display:none!important;}',
      '  html.fw-echo-tab-page .fw-mobile-tab[data-fw-mobile-tab="echo"]{color:#fffdf7!important;background:rgba(217,121,121,.14)!important;}',
      '  html.fw-echo-tab-page .fw-mobile-tab[data-fw-mobile-tab="echo"] svg{color:var(--accent,#df7676)!important;}',

      '  html.fw-echo-tab-page .fw-stable-echo-modal{position:fixed!important;left:0!important;right:0!important;top:0!important;bottom:var(--fw-mobile-bottom-space)!important;z-index:930!important;background:#f3efe6!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;pointer-events:none!important;}',
      '  html.fw-echo-tab-page .fw-stable-echo-modal.show{display:block!important;pointer-events:auto!important;padding:0!important;}',
      '  html.fw-echo-tab-page .fw-stable-echo-panel{position:absolute!important;inset:0!important;right:auto!important;top:auto!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;min-height:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:#fffdf7!important;overflow:hidden!important;}',
      '  html.fw-echo-tab-page .fw-stable-echo-close,html.fw-echo-tab-page [data-fw-stable-echo-close],html.fw-echo-tab-page [data-fw-echo-close]{display:none!important;}',
      '  html.fw-echo-tab-page .fw-stable-echo-body{scrollbar-width:none!important;-ms-overflow-style:none!important;}',
      '  html.fw-echo-tab-page .fw-stable-echo-body::-webkit-scrollbar{width:0!important;height:0!important;display:none!important;}',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function activateEchoTab(){
    $$('[data-fw-mobile-tab]').forEach(function(tab){
      var active = tab.dataset.fwMobileTab === 'echo';
      tab.classList.toggle('is-active', active);
      if(active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
  }

  function openEcho(){
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
    if(btn){
      btn.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
      return true;
    }

    return false;
  }

  function ensureEchoOpen(){
    if(!isMobile() || !isEchoPage()) return;
    document.documentElement.classList.add('fw-echo-tab-page');
    if(document.body) document.body.classList.add('fw-echo-tab-page');
    injectStyle();
    activateEchoTab();

    if($('.fw-stable-echo-modal.show')) return;
    openEcho();
  }

  function boot(){
    if(!isEchoPage()) return;
    document.documentElement.classList.add('fw-echo-tab-page');
    if(document.body) document.body.classList.add('fw-echo-tab-page');
    injectStyle();
    activateEchoTab();

    retryDelays.forEach(function(ms){
      setTimeout(ensureEchoOpen, ms);
    });
  }

  window.addEventListener('pageshow', function(){ setTimeout(ensureEchoOpen, 80); });
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible') setTimeout(ensureEchoOpen, 80);
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
