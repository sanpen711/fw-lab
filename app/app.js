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
  var debugContent = null;
  var debugSafeProbe = null;
  var debugTimers = [];
  var debugListenersBound = false;
  var debugGestureBound = false;
  var debugGestureCount = 0;
  var debugGestureStartedAt = 0;
  var debugGestureTimer = null;

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

  function setDebugStorage(enabled){
    try{
      if(!window.localStorage) return;
      if(enabled) window.localStorage.setItem('fwAppDebug', '1');
      else window.localStorage.removeItem('fwAppDebug');
    }catch(e){}
  }

  function clearDebugUrlFlag(){
    try{
      var url = new URL(window.location.href);
      var changed = false;
      if(url.searchParams.get('debug') === '1'){
        url.searchParams.delete('debug');
        changed = true;
      }
      if(String(url.hash || '').toLowerCase() === '#debug'){
        url.hash = '';
        changed = true;
      }
      if(changed && window.history && window.history.replaceState){
        window.history.replaceState(null, document.title, url.pathname + url.search + url.hash);
      }
    }catch(e){}
  }

  function isDebugEnabled(){
    var enableFromUrl = false;
    var disableFromUrl = false;
    try{
      var params = new URLSearchParams(window.location.search);
      enableFromUrl = params.get('debug') === '1';
      disableFromUrl = params.get('debug') === '0' || params.get('clearDebug') === '1';
    }catch(e){}

    var hash = String(window.location.hash || '').replace(/^#/, '').toLowerCase();
    if(hash === 'debug') enableFromUrl = true;
    if(hash === 'debugoff') disableFromUrl = true;

    if(disableFromUrl){
      setDebugStorage(false);
      return false;
    }
    if(enableFromUrl){
      setDebugStorage(true);
      return true;
    }

    try{
      return !!(window.localStorage && window.localStorage.getItem('fwAppDebug') === '1');
    }catch(e){
      return false;
    }
  }

  function removeDebugPanel(){
    debugTimers.forEach(function(timer){ clearTimeout(timer); });
    debugTimers = [];
    if(debugPanel && debugPanel.parentNode) debugPanel.parentNode.removeChild(debugPanel);
    if(debugSafeProbe && debugSafeProbe.parentNode) debugSafeProbe.parentNode.removeChild(debugSafeProbe);
    debugPanel = null;
    debugContent = null;
    debugSafeProbe = null;
  }

  function closeDebug(){
    setDebugStorage(false);
    clearDebugUrlFlag();
    removeDebugPanel();
    toast('调试面板已关闭');
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
    if(!debugContent) return;
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
    debugContent.textContent = lines.join('\n');
  }

  function scheduleDebugRefresh(){
    if(!debugContent) return;
    refreshDebugPanel();
    debugTimers.forEach(function(timer){ clearTimeout(timer); });
    debugTimers = [500, 1500].map(function(delay){
      return setTimeout(refreshDebugPanel, delay);
    });
  }

  function initDebugPanel(){
    if(!isDebugEnabled() || debugPanel) return;
    if(!$('#fwAppDebugStyle')){
      var style = document.createElement('style');
      style.id = 'fwAppDebugStyle';
      style.textContent = '.fw-app-debug-panel{position:fixed;right:8px;top:calc(env(safe-area-inset-top,0px) + 8px);z-index:99999;max-width:min(360px,calc(100vw - 16px));max-height:72vh;overflow:auto;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.78);color:#fff;box-shadow:0 12px 32px rgba(0,0,0,.3);touch-action:manipulation}.fw-app-debug-content{margin:8px 0 0;color:#fff;font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap}.fw-app-debug-close{min-height:28px;border:1px solid rgba(255,255,255,.34);border-radius:999px;background:rgba(255,255,255,.16);color:#fff;padding:0 10px;font:12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.fw-app-debug-safe-probe{position:fixed;left:0;bottom:0;width:1px;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;z-index:-1}';
      document.head.appendChild(style);
    }

    debugSafeProbe = document.createElement('div');
    debugSafeProbe.className = 'fw-app-debug-safe-probe';
    document.body.appendChild(debugSafeProbe);

    debugPanel = document.createElement('div');
    debugPanel.className = 'fw-app-debug-panel';
    debugPanel.setAttribute('aria-label', 'FW App debug panel');
    debugPanel.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      scheduleDebugRefresh();
    });

    var closeButton = document.createElement('button');
    closeButton.className = 'fw-app-debug-close';
    closeButton.type = 'button';
    closeButton.textContent = '关闭 debug';
    closeButton.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      closeDebug();
    });
    debugPanel.appendChild(closeButton);

    debugContent = document.createElement('pre');
    debugContent.className = 'fw-app-debug-content';
    debugPanel.appendChild(debugContent);
    document.body.appendChild(debugPanel);

    scheduleDebugRefresh();
    if(!debugListenersBound){
      debugListenersBound = true;
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
  }

  function resetDebugGesture(){
    debugGestureCount = 0;
    debugGestureStartedAt = 0;
    if(debugGestureTimer){
      clearTimeout(debugGestureTimer);
      debugGestureTimer = null;
    }
  }

  function toggleDebugFromGesture(){
    var enable = !isDebugEnabled();
    setDebugStorage(enable);
    if(enable){
      initDebugPanel();
      scheduleDebugRefresh();
      toast('调试面板已开启');
      return;
    }
    clearDebugUrlFlag();
    removeDebugPanel();
    toast('调试面板已关闭');
  }

  function bindDebugGesture(){
    if(debugGestureBound) return;
    debugGestureBound = true;
    document.addEventListener('click', function(e){
      var target = e.target;
      if(!target || !target.closest) return;
      if(!target.closest('.app-logo, .app-brand strong')) return;

      var now = Date.now();
      if(!debugGestureStartedAt || now - debugGestureStartedAt > 5000){
        debugGestureStartedAt = now;
        debugGestureCount = 0;
      }
      debugGestureCount += 1;
      if(debugGestureTimer) clearTimeout(debugGestureTimer);
      debugGestureTimer = setTimeout(resetDebugGesture, 5000);

      if(debugGestureCount >= 7){
        resetDebugGesture();
        toggleDebugFromGesture();
      }
    }, false);
  }

  function applyTabbarVisuals(){
    var home = $('[data-app-nav="nav"]');
    if(home){
      var homeLabel = $('b', home);
      if(homeLabel) homeLabel.textContent = '首页';
    }

    var buddyIcon = $('[data-app-nav="buddy"] span');
    if(buddyIcon){
      buddyIcon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="display:block"><circle cx="9" cy="8" r="3.5"></circle><path d="M3.5 20a5.5 5.5 0 0 1 11 0"></path><circle cx="16.5" cy="9.5" r="3"></circle><path d="M14 16.5a5 5 0 0 1 6.5 3.5"></path></svg>';
    }

    var profileIcon = $('[data-app-nav="profile"] span');
    if(profileIcon){
      profileIcon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="display:block"><circle cx="12" cy="7.5" r="4"></circle><path d="M4.5 21a7.5 7.5 0 0 1 15 0"></path></svg>';
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

  function updateHeaderStatus(){
    if(navigator.onLine === false){
      setStatus('离线 · 浏览缓存');
      return;
    }
    if(state.user){
      setStatus('已登录');
      return;
    }
    setStatus(db() ? '可浏览，登录后互动' : '正在连接');
  }

  function syncNetworkStatus(event){
    var offline = navigator.onLine === false;
    var banner = $('[data-app-network-banner]');
    document.body.classList.toggle('is-offline', offline);
    if(banner) banner.hidden = !offline;
    updateHeaderStatus();
    if(event && event.type === 'online') toast('网络已恢复，正在刷新数据');
    if(event && event.type === 'offline') toast('网络已断开，当前展示缓存内容');
    if(!offline && event && event.type === 'online'){
      if((state.view === 'square' || state.view === 'square-detail') && window.FWAppFeed) window.FWAppFeed.load(true, {silent:true, preserveScroll:true});
      if(state.view === 'buddy' && window.FWAppBuddy) window.FWAppBuddy.load(true);
      if(state.view === 'echo' && window.FWAppEcho) window.FWAppEcho.load(true);
      else if(window.FWAppEcho && window.FWAppEcho.refreshBadges) window.FWAppEcho.refreshBadges();
    }
  }

  function bindNetworkStatus(){
    window.addEventListener('online', syncNetworkStatus);
    window.addEventListener('offline', syncNetworkStatus);
    document.addEventListener('click', function(e){
      var retry = e.target.closest && e.target.closest('[data-app-network-retry]');
      if(!retry) return;
      e.preventDefault();
      if(navigator.onLine === false){
        toast('仍未连接网络，请检查 Wi-Fi 或移动数据');
        return;
      }
      window.location.reload();
    });
    syncNetworkStatus();
  }

  function renderUser(){
    var label = $('[data-app-user-label]');
    var avatar = $('[data-app-avatar]');
    if(!label || !avatar) return;

    if(state.user){
      label.textContent = state.user.nickname || '研究员';
      avatar.innerHTML = avatarHtml(state.user);
      updateHeaderStatus();
      return;
    }

    label.textContent = '未登录';
    avatar.textContent = 'F';
    updateHeaderStatus();
  }

  async function refreshUser(){
    var previousUserId = state.user && state.user.id || '';
    if(!(await waitForDb())){
      state.user = null;
      renderUser();
      if(previousUserId) document.dispatchEvent(new CustomEvent('fw:app-userchange', {detail:{user:null, previousUserId:previousUserId}}));
      return null;
    }

    try{
      state.user = await window.fwDb.getCurrentUser();
    }catch(e){
      state.user = null;
    }

    renderUser();
    if(window.FWAppProfile) window.FWAppProfile.render();
    var nextUserId = state.user && state.user.id || '';
    if(previousUserId !== nextUserId){
      document.dispatchEvent(new CustomEvent('fw:app-userchange', {detail:{user:state.user, previousUserId:previousUserId}}));
    }
    return state.user;
  }

  function tabForView(name){
    if(name === 'buddy' || name === 'echo' || name === 'profile') return name;
    return 'nav';
  }

  function setView(name){
    var previousView = state.view;
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
    if(previousView !== state.view){
      document.dispatchEvent(new CustomEvent('fw:app-viewchange', {detail:{view:state.view, previousView:previousView}}));
    }
  }

  function registerServiceWorker(){
    if(!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js', {scope:'./'}).catch(function(err){
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
          if((state.view === 'square' || state.view === 'square-detail') && window.FWAppFeed) window.FWAppFeed.load(true, {silent:true, preserveScroll:true});
          if(state.view === 'buddy' && window.FWAppBuddy) window.FWAppBuddy.load(true);
          if(state.view === 'echo' && window.FWAppEcho) window.FWAppEcho.load(true);
          else if(window.FWAppEcho && window.FWAppEcho.refreshBadges) window.FWAppEcho.refreshBadges();
        });
      });
    }catch(e){}
  }

  async function start(){
    bindViewportSync();
    initDebugPanel();
    bindDebugGesture();
    applyTabbarVisuals();
    registerServiceWorker();
    bindShell();
    setStatus('正在连接');
    bindNetworkStatus();
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
    syncNetworkStatus:syncNetworkStatus,
    setView:setView,
    refreshUser:refreshUser,
    renderUser:renderUser,
    syncAppViewport:syncAppViewport,
    scheduleViewportSync:scheduleViewportSync,
    refreshDebugPanel:refreshDebugPanel
  };

  function emitAppVisibility(visible){
    document.dispatchEvent(new CustomEvent('fw:app-visibility', {detail:{visible:visible !== false, view:state.view}}));
  }

  document.addEventListener('visibilitychange', function(){
    emitAppVisibility(!document.hidden);
  }, {passive:true});
  document.addEventListener('fw:app-native-lifecycle', function(event){
    emitAppVisibility(!!(event && event.detail && event.detail.visible));
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
