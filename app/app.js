(function(){
  if(window.FWApp) return;

  var state = {
    view:'nav',
    user:null,
    posts:[],
    postsLoaded:false,
    filterStatus:'全部'
  };
  var viewportSyncBound = false;
  var viewportTimers = [];
  var debugPanel = null;
  var debugSafeProbe = null;
  var debugTimers = [];

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.from((root || document).querySelectorAll(selector)); }
  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function initials(name){ return String(name || 'FW').trim().slice(0, 2).toUpperCase() || 'FW'; }

  function syncAppViewport(){
    var root = document.documentElement;
    var height = Math.round(
      (window.visualViewport && window.visualViewport.height) ||
      window.innerHeight ||
      root.clientHeight ||
      0
    );
    if(height > 0){
      root.style.setProperty('--app-viewport-height', height + 'px');
    }
    root.classList.add('app-viewport-ready');
  }

  function clearViewportTimers(){
    viewportTimers.forEach(function(timer){ clearTimeout(timer); });
    viewportTimers = [];
  }

  function scheduleViewportSync(){
    clearViewportTimers();
    syncAppViewport();
    requestAnimationFrame(function(){
      syncAppViewport();
      requestAnimationFrame(syncAppViewport);
    });
    [50, 150, 350, 700].forEach(function(delay){
      viewportTimers.push(setTimeout(syncAppViewport, delay));
    });
  }

  function bindViewportSync(){
    if(viewportSyncBound) return;
    viewportSyncBound = true;
    scheduleViewportSync();
    window.addEventListener('load', scheduleViewportSync, {passive:true});
    window.addEventListener('pageshow', scheduleViewportSync, {passive:true});
    window.addEventListener('resize', scheduleViewportSync, {passive:true});
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible') scheduleViewportSync();
    }, {passive:true});
    window.addEventListener('orientationchange', function(){
      setTimeout(scheduleViewportSync, 80);
      setTimeout(scheduleViewportSync, 240);
      setTimeout(scheduleViewportSync, 600);
    }, {passive:true});
    if(window.visualViewport){
      window.visualViewport.addEventListener('resize', scheduleViewportSync, {passive:true});
    }
  }

  function isDebugEnabled(){
    var enabled = false;
    try{
      enabled = new URLSearchParams(window.location.search).get('debug') === '1';
    }catch(e){}
    if(window.location.hash && window.location.hash.indexOf('debug') >= 0) enabled = true;
    try{
      if(window.localStorage && window.localStorage.getItem('fwAppDebug') === '1') enabled = true;
    }catch(e){}
    return enabled;
  }

  function round(value){
    if(value == null || value === '') return value;
    if(typeof value === 'number') return Math.round(value * 10) / 10;
    return value;
  }

  function rectInfo(selectorOrNode){
    var node = typeof selectorOrNode === 'string' ? $(selectorOrNode) : selectorOrNode;
    if(!node) return null;
    var rect = node.getBoundingClientRect();
    return {
      top:round(rect.top),
      bottom:round(rect.bottom),
      height:round(rect.height)
    };
  }

  function formatRect(label, rect){
    if(!rect) return label + ': not found';
    return label + '.top: ' + rect.top + '\n' +
      label + '.bottom: ' + rect.bottom + '\n' +
      label + '.height: ' + rect.height;
  }

  function getLastContentNode(){
    var active = $('[data-app-view].is-active') || document;
    var selectors = [
      '.app-home',
      '.nav-home',
      '.module-card:last-of-type',
      '.nav-grid button:last-child',
      '.post-card:last-of-type',
      '.list-item:last-of-type',
      '.notice-item:last-of-type',
      '.nav-secondary'
    ];
    for(var i = 0; i < selectors.length; i++){
      var node = $(selectors[i], active);
      if(node) return node;
    }
    return active.lastElementChild || active;
  }

  function readCssVar(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '(empty)';
  }

  function refreshDebugPanel(){
    if(!debugPanel) return;
    var root = document.documentElement;
    var body = document.body;
    var visual = window.visualViewport;
    var shellRect = rectInfo('.app-shell');
    var mainRect = rectInfo('.app-main');
    var tabbarRect = rectInfo('.app-tabbar');
    var firstButtonRect = rectInfo($('.app-tabbar button'));
    var lastContentRect = rectInfo(getLastContentNode());
    var standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    var safeProbe = debugSafeProbe ? debugSafeProbe.offsetHeight : '(missing)';
    var lines = [
      'FW APP DEBUG (tap to refresh)',
      'time: ' + new Date().toLocaleTimeString(),
      '',
      'displayMode: ' + (standalone ? 'standalone' : 'browser'),
      'navigator.standalone: ' + (typeof navigator.standalone === 'undefined' ? 'undefined' : navigator.standalone),
      'window.innerWidth: ' + window.innerWidth,
      'window.innerHeight: ' + window.innerHeight,
      'window.outerHeight: ' + window.outerHeight,
      'visualViewport.width: ' + (visual ? round(visual.width) : 'n/a'),
      'visualViewport.height: ' + (visual ? round(visual.height) : 'n/a'),
      'visualViewport.offsetTop: ' + (visual ? round(visual.offsetTop) : 'n/a'),
      'visualViewport.offsetLeft: ' + (visual ? round(visual.offsetLeft) : 'n/a'),
      'docEl.clientWidth: ' + root.clientWidth,
      'docEl.clientHeight: ' + root.clientHeight,
      'body.clientHeight: ' + (body ? body.clientHeight : 'n/a'),
      '',
      '--tab-h: ' + readCssVar('--tab-h'),
      '--tabbar-total-h: ' + readCssVar('--tabbar-total-h'),
      '--app-viewport-height: ' + readCssVar('--app-viewport-height'),
      '--app-header-h: ' + readCssVar('--app-header-h'),
      'safeAreaBottomProbe: ' + safeProbe,
      '',
      formatRect('appShell', shellRect),
      '',
      formatRect('appMain', mainRect),
      '',
      formatRect('appTabbar', tabbarRect),
      '',
      formatRect('firstTabButton', firstButtonRect),
      '',
      formatRect('lastContent', lastContentRect),
      '',
      'innerHeight - tabbar.top: ' + (tabbarRect ? round(window.innerHeight - tabbarRect.top) : 'n/a'),
      'tabbar.height: ' + (tabbarRect ? tabbarRect.height : 'n/a'),
      'tabbar.bottom - innerHeight: ' + (tabbarRect ? round(tabbarRect.bottom - window.innerHeight) : 'n/a'),
      'main.bottom - tabbar.top: ' + (mainRect && tabbarRect ? round(mainRect.bottom - tabbarRect.top) : 'n/a'),
      'shell.bottom - innerHeight: ' + (shellRect ? round(shellRect.bottom - window.innerHeight) : 'n/a')
    ];
    debugPanel.textContent = lines.join('\n');
  }

  function scheduleDebugRefresh(){
    if(!debugPanel) return;
    refreshDebugPanel();
    debugTimers.forEach(function(timer){ clearTimeout(timer); });
    debugTimers = [500, 1500].map(function(delay){
      return setTimeout(refreshDebugPanel, delay);
    });
  }

  function initDebugPanel(){
    if(!isDebugEnabled() || debugPanel) return;
    var style = document.createElement('style');
    style.textContent = '.fw-app-debug-panel{position:fixed;right:8px;top:calc(env(safe-area-inset-top,0px) + 8px);z-index:99999;max-width:min(360px,calc(100vw - 16px));max-height:72vh;overflow:auto;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.78);color:#fff;font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;box-shadow:0 12px 32px rgba(0,0,0,.3);touch-action:manipulation}.fw-app-debug-safe-probe{position:fixed;left:0;bottom:0;width:1px;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;z-index:-1}';
    document.head.appendChild(style);

    debugSafeProbe = document.createElement('div');
    debugSafeProbe.className = 'fw-app-debug-safe-probe';
    document.body.appendChild(debugSafeProbe);

    debugPanel = document.createElement('pre');
    debugPanel.className = 'fw-app-debug-panel';
    debugPanel.setAttribute('aria-label', 'FW App debug panel');
    debugPanel.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      scheduleDebugRefresh();
    });
    document.body.appendChild(debugPanel);

    scheduleDebugRefresh();
    window.addEventListener('resize', scheduleDebugRefresh, {passive:true});
    window.addEventListener('orientationchange', function(){
      setTimeout(scheduleDebugRefresh, 120);
      setTimeout(scheduleDebugRefresh, 500);
    }, {passive:true});
    window.addEventListener('pageshow', scheduleDebugRefresh, {passive:true});
    if(window.visualViewport){
      window.visualViewport.addEventListener('resize', scheduleDebugRefresh, {passive:true});
    }
  }

  scheduleViewportSync();

  function avatarHtml(user){
    var name = user && (user.nickname || user.email) || 'F.w';
    var url = user && user.avatar_url || '';
    if(url) return '<img src="' + esc(url) + '" alt="' + esc(name) + '">';
    return esc(initials(name));
  }

  function db(){ return window.fwDb && window.fwDb.enabled ? window.fwDb : null; }

  function waitForDb(timeout){
    timeout = timeout || 8000;
    return new Promise(function(resolve){
      if(db()) { resolve(true); return; }
      var start = Date.now();
      var timer = setInterval(function(){
        if(db()){
          clearInterval(timer);
          resolve(true);
          return;
        }
        if(Date.now() - start > timeout){
          clearInterval(timer);
          resolve(false);
        }
      }, 80);
    });
  }

  function toast(message){
    var node = $('[data-app-toast]');
    if(!node) return;
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(window.__fwAppToastTimer);
    window.__fwAppToastTimer = setTimeout(function(){ node.classList.remove('show'); }, 2200);
  }

  function setStatus(text){
    var node = $('[data-app-status]');
    if(node) node.textContent = text;
  }

  function renderUser(){
    var label = $('[data-app-user-label]');
    var avatar = $('[data-app-avatar]');
    if(!label || !avatar) return;

    if(state.user){
      label.textContent = state.user.nickname || '研究员';
      avatar.innerHTML = avatarHtml(state.user);
      setStatus('已登录');
      return;
    }

    label.textContent = '未登录';
    avatar.textContent = 'F';
    setStatus(db() ? '可浏览，登录后互动' : '正在连接');
  }

  async function refreshUser(){
    if(!(await waitForDb())){
      state.user = null;
      renderUser();
      return null;
    }

    try{
      state.user = await window.fwDb.getCurrentUser();
    }catch(e){
      state.user = null;
    }

    renderUser();
    if(window.FWAppProfile) window.FWAppProfile.render();
    return state.user;
  }

  function tabForView(name){
    if(name === 'buddy' || name === 'echo' || name === 'profile') return name;
    return 'nav';
  }

  function setView(name){
    state.view = name || 'nav';
    $$('[data-app-view]').forEach(function(view){
      view.classList.toggle('is-active', view.dataset.appView === state.view);
    });
    $$('[data-app-nav]').forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.appNav === tabForView(state.view));
    });
    var main = $('#appMain');
    if(main) main.scrollTop = 0;
    scheduleViewportSync();
    scheduleDebugRefresh();

    if(state.view === 'square' && window.FWAppFeed) window.FWAppFeed.ensureLoaded();
    if(state.view === 'buddy' && window.FWAppBuddy) window.FWAppBuddy.ensureLoaded();
    if(state.view === 'echo' && window.FWAppEcho) window.FWAppEcho.ensureLoaded();
    if(state.view === 'profile' && window.FWAppProfile) window.FWAppProfile.render();
  }

  function registerServiceWorker(){
    if(!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/app/sw.js', {scope:'/app/'}).catch(function(err){
      console.warn('[FW mobile app] service worker register failed', err);
    });
  }

  function bindShell(){
    document.addEventListener('click', function(e){
      var nav = e.target.closest && e.target.closest('[data-app-nav]');
      if(nav){
        e.preventDefault();
        setView(nav.dataset.appNav || 'nav');
        return;
      }

      var profile = e.target.closest && e.target.closest('[data-app-profile-trigger]');
      if(profile){
        e.preventDefault();
        setView('profile');
      }
    });
  }

  function onAuthChange(){
    if(!db() || !window.fwDb.onAuthChange) return;
    try{
      window.fwDb.onAuthChange(function(){
        refreshUser().then(function(){
          if(window.FWAppFeed) window.FWAppFeed.load(true);
          if(window.FWAppBuddy) window.FWAppBuddy.load(true);
          if(window.FWAppEcho) window.FWAppEcho.load(true);
        });
      });
    }catch(e){}
  }

  async function start(){
    bindViewportSync();
    initDebugPanel();
    registerServiceWorker();
    bindShell();
    setStatus('正在连接');
    await refreshUser();
    onAuthChange();
    if(window.FWAppNav) window.FWAppNav.init();
    if(window.FWAppFeed) window.FWAppFeed.init();
    if(window.FWAppPublish) window.FWAppPublish.init();
    if(window.FWAppBuddy) window.FWAppBuddy.init();
    if(window.FWAppEcho) window.FWAppEcho.init();
    if(window.FWAppProfile) window.FWAppProfile.init();
    setView('nav');
  }

  window.FWApp = {
    state:state,
    $:$,
    $$:$$,
    esc:esc,
    initials:initials,
    avatarHtml:avatarHtml,
    db:db,
    waitForDb:waitForDb,
    toast:toast,
    setStatus:setStatus,
    setView:setView,
    refreshUser:refreshUser,
    renderUser:renderUser,
    syncAppViewport:syncAppViewport,
    scheduleViewportSync:scheduleViewportSync,
    refreshDebugPanel:refreshDebugPanel
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
