(function(){
  if(window.FWMobileCoreFixes) return;
  window.FWMobileCoreFixes = true;

  var ROUTABLE_VIEWS = {
    nav:'',
    square:'#square',
    rooms:'#rooms',
    bird:'#bird',
    archive:'#archive',
    rules:'#rules',
    moderation:'#moderation',
    buddy:'#buddy',
    echo:'#echo',
    profile:'#profile'
  };
  var HASH_VIEW_ALIASES = {
    home:'nav',
    nav:'nav',
    index:'nav',
    square:'square',
    rooms:'rooms',
    bird:'bird',
    archive:'archive',
    rules:'rules',
    moderation:'moderation',
    admin:'moderation',
    buddy:'buddy',
    echo:'echo',
    profile:'profile',
    me:'profile'
  };
  var routeSyncing = false;
  var setViewHistoryMuted = false;
  var popStateBound = false;

  function $(selector, root){
    return (root || document).querySelector(selector);
  }

  function normalizeViewport(){
    var meta = $('meta[name="viewport"]');
    if(!meta) return;
    var next = 'width=device-width, initial-scale=1, viewport-fit=cover';
    if(meta.getAttribute('content') !== next) meta.setAttribute('content', next);
  }

  function routeHashForView(view){
    return Object.prototype.hasOwnProperty.call(ROUTABLE_VIEWS, view) ? ROUTABLE_VIEWS[view] : null;
  }

  function viewFromHash(){
    var hash = String(window.location.hash || '').replace(/^#/, '').toLowerCase();
    return HASH_VIEW_ALIASES[hash] || 'nav';
  }

  function hasAppView(view){
    var views = document.querySelectorAll('[data-app-view]');
    for(var i = 0; i < views.length; i += 1){
      if(views[i].dataset && views[i].dataset.appView === view) return true;
    }
    return false;
  }

  function normalizeView(view){
    view = view || 'nav';
    if(routeHashForView(view) != null) return view;
    return hasAppView(view) ? view : 'nav';
  }

  function urlForView(view){
    var hash = routeHashForView(view);
    if(hash == null) hash = '';
    return window.location.pathname + window.location.search + hash;
  }

  function currentUrl(){
    return window.location.pathname + window.location.search + window.location.hash;
  }

  function historyStateForView(view){
    return {fwAppView:normalizeView(view), fwApp:true};
  }

  function replaceHashForView(view){
    if(!window.history || !window.history.replaceState) return;
    view = normalizeView(view || 'nav');
    var next = urlForView(view);
    if(next !== currentUrl() || !history.state || !history.state.fwApp){
      window.history.replaceState(historyStateForView(view), document.title, next);
    }
  }

  function pushHashForView(view){
    if(!window.history || !window.history.pushState){
      replaceHashForView(view);
      return;
    }
    view = normalizeView(view || 'nav');
    var next = urlForView(view);
    if(next === currentUrl()){
      window.history.replaceState(historyStateForView(view), document.title, next);
      return;
    }
    window.history.pushState(historyStateForView(view), document.title, next);
  }

  function updateHistoryForView(view, options, fallbackMode){
    if(routeSyncing) return;
    if(options && options.updateHash === false) return;
    var mode = (options && options.historyMode) || fallbackMode || 'replace';
    if(mode === 'none') return;
    if(mode === 'push') pushHashForView(view);
    else replaceHashForView(view);
  }

  function patchSetView(){
    if(!window.FWApp || window.FWApp.__mobileCoreFixesPatched) return false;
    var originalSetView = window.FWApp.setView;
    if(typeof originalSetView !== 'function') return false;
    window.FWApp.setView = function(name){
      var view = normalizeView(name || 'nav');
      var result = originalSetView.call(this, view);
      if(!setViewHistoryMuted) updateHistoryForView(view, null, 'replace');
      return result;
    };
    window.FWApp.__mobileCoreFixesPatched = true;
    return true;
  }

  function ensureOpenView(){
    if(!window.FWApp || window.FWApp.__mobileCoreOpenView) return false;
    if(typeof window.FWApp.setView !== 'function') return false;
    window.FWApp.openView = function(name, options){
      var view = normalizeView(name || 'nav');
      var result;
      setViewHistoryMuted = true;
      try{
        result = window.FWApp.setView(view);
      }finally{
        setViewHistoryMuted = false;
      }
      updateHistoryForView(view, options, 'push');
      return result;
    };
    window.FWApp.__mobileCoreOpenView = true;
    return true;
  }

  function patchAppViewApi(){
    var patched = patchSetView();
    var opened = ensureOpenView();
    return patched && opened;
  }

  function schedulePatchSetView(){
    if(patchAppViewApi()) return;
    [0, 80, 240, 700, 1500].forEach(function(delay){
      setTimeout(patchAppViewApi, delay);
    });
  }

  function openAppView(view, options){
    var api = window.FWApp;
    view = normalizeView(view || 'nav');
    if(!api) return false;
    if(typeof api.openView === 'function'){
      api.openView(view, options);
      return true;
    }
    if(typeof api.setView === 'function'){
      var result;
      setViewHistoryMuted = true;
      try{
        result = api.setView(view);
      }finally{
        setViewHistoryMuted = false;
      }
      updateHistoryForView(view, options, 'push');
      return true;
    }
    return false;
  }

  function syncRouteFromLocation(){
    var view = normalizeView(viewFromHash());
    var api = window.FWApp;
    if(!api || typeof api.setView !== 'function') return false;
    routeSyncing = true;
    setViewHistoryMuted = true;
    try{
      api.setView(view);
    }finally{
      setViewHistoryMuted = false;
      routeSyncing = false;
    }
    return true;
  }

  function bindPopStateRoute(){
    if(popStateBound) return;
    popStateBound = true;
    window.addEventListener('popstate', function(){
      syncRouteFromLocation();
    });
  }

  function scheduleInitialRouteSync(){
    [0, 180, 700].forEach(function(delay){
      setTimeout(function(){
        patchAppViewApi();
        if(window.location.hash) syncRouteFromLocation();
        else replaceHashForView('nav');
      }, delay);
    });
  }

  function suppressNextViewMotion(){
    window.__FW_MOBILE_SKIP_NEXT_VIEW_MOTION__ = true;
    setTimeout(function(){
      if(window.__FW_MOBILE_SKIP_NEXT_VIEW_MOTION__) window.__FW_MOBILE_SKIP_NEXT_VIEW_MOTION__ = false;
    }, 180);
  }

  function bindClickSync(){
    document.addEventListener('click', function(event){
      var target = event.target;
      if(!target || !target.closest) return;

      var nav = target.closest('[data-app-nav]');
      if(nav){
        var navView = normalizeView(nav.dataset.appNav || 'nav');
        suppressNextViewMotion();
        if(openAppView(navView)){
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        setTimeout(function(){ replaceHashForView(navView); }, 0);
        return;
      }

      var profile = target.closest('[data-app-profile-trigger]');
      if(profile){
        if(openAppView('profile')){
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        setTimeout(function(){ replaceHashForView('profile'); }, 0);
        return;
      }

      var opener = target.closest('[data-app-open]');
      if(opener){
        var openView = normalizeView(opener.dataset.appOpen || 'nav');
        setTimeout(function(){
          if(window.FWApp && window.FWApp.state && window.FWApp.state.view === openView) pushHashForView(openView);
        }, 0);
      }
    }, true);
  }

  function loadScriptOnce(flagName, dataName, src){
    if(window[flagName]) return;
    if(document.querySelector('script[' + dataName + ']')) return;
    var script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.setAttribute(dataName, '1');
    document.body.appendChild(script);
  }

  function ensureReportBridge(){
    loadScriptOnce('__FW_MOBILE_REPORT_BRIDGE__', 'data-mobile-report-bridge', './report.js?v=mobile-report-20260609-1');
  }

  function ensureBuddyChatReadFix(){
    loadScriptOnce('__FW_MOBILE_BUDDY_CHAT_READ_FIX__', 'data-mobile-buddy-chat-read-fix', './buddy-chat-read-fix.js?v=mobile-buddy-chat-read-20260609-4');
  }

  function ensureMobileSwipeBack(){
    loadScriptOnce('__FW_MOBILE_SWIPE_BACK__', 'data-mobile-swipe-back', './mobile-swipe-back.js?v=mobile-swipe-back-20260612-1');
  }

  function ensureMobileTransitions(){
    loadScriptOnce('__FW_MOBILE_TRANSITIONS__', 'data-mobile-transitions', './mobile-transitions.js?v=mobile-transitions-20260612-5');
  }

  function requestServiceWorkerRefresh(){
    if(!('serviceWorker' in navigator)) return;
    try{
      navigator.serviceWorker.getRegistration('./').then(function(registration){
        if(registration && registration.update) registration.update();
      }).catch(function(){});
    }catch(e){}
  }

  function start(){
    normalizeViewport();
    schedulePatchSetView();
    bindPopStateRoute();
    bindClickSync();
    ensureReportBridge();
    ensureBuddyChatReadFix();
    ensureMobileSwipeBack();
    ensureMobileTransitions();
    scheduleInitialRouteSync();
    requestServiceWorkerRefresh();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();