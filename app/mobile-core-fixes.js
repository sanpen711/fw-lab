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

  function replaceHashForView(view){
    var hash = routeHashForView(view);
    if(hash == null || !window.history || !window.history.replaceState) return;
    var next = window.location.pathname + window.location.search + hash;
    var current = window.location.pathname + window.location.search + window.location.hash;
    if(next !== current) window.history.replaceState(null, document.title, next);
  }

  function resetProfileHome(){
    var panel = $('[data-profile-panel]');
    var back = panel && $('[data-profile-back]', panel);
    if(back){
      try{ back.click(); }catch(e){}
    }
  }

  function scheduleProfileHomeReset(){
    [0, 80, 220].forEach(function(delay){ setTimeout(resetProfileHome, delay); });
  }

  function patchSetView(){
    if(!window.FWApp || window.FWApp.__mobileCoreFixesPatched) return false;
    var originalSetView = window.FWApp.setView;
    if(typeof originalSetView !== 'function') return false;
    window.FWApp.setView = function(name){
      var view = normalizeView(name || 'nav');
      var previousView = this && this.state && this.state.view || '';
      var result = originalSetView.call(this, view);
      if(view === 'profile' && previousView !== 'profile') scheduleProfileHomeReset();
      replaceHashForView(view);
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
      var result = window.FWApp.setView(view);
      if(!options || options.updateHash !== false) replaceHashForView(view);
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
      api.setView(view);
      if(!options || options.updateHash !== false) replaceHashForView(view);
      return true;
    }
    return false;
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
        setTimeout(function(){ replaceHashForView(openView); }, 0);
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

  function ensureFeedDetailReturnBridge(){
    loadScriptOnce('__FW_MOBILE_FEED_DETAIL_RETURN__', 'data-mobile-feed-detail-return', './feed-detail-return.js?v=mobile-feed-detail-return-20260614-1');
  }

  function ensureMobileSwipeBack(){
    loadScriptOnce('__FW_MOBILE_SWIPE_BACK__', 'data-mobile-swipe-back', './mobile-swipe-back.js?v=mobile-swipe-back-20260616-1');
  }

  function ensureMobileTransitions(){
    loadScriptOnce('__FW_MOBILE_TRANSITIONS__', 'data-mobile-transitions', './mobile-transitions.js?v=mobile-transitions-20260614-1');
  }

  function ensurePriorityFixes(){
    loadScriptOnce('__FW_MOBILE_PRIORITY_FIXES__', 'data-mobile-priority-fixes', './mobile-priority-fixes.js?v=mobile-priority-fixes-20260614-1');
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
    bindClickSync();
    ensureReportBridge();
    ensureBuddyChatReadFix();
    ensureFeedDetailReturnBridge();
    ensureMobileSwipeBack();
    ensureMobileTransitions();
    ensurePriorityFixes();
    requestServiceWorkerRefresh();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
