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

  function injectStyle(){
    if(document.getElementById('fwMobileCoreFixesStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileCoreFixesStyle';
    style.textContent = [
      '.comment-menu-item[data-comment-report]{display:none!important;}'
    ].join('\n');
    document.head.appendChild(style);
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

  function replaceHashForView(view){
    var hash = routeHashForView(view);
    if(hash == null || !window.history || !window.history.replaceState) return;
    var next = window.location.pathname + window.location.search + hash;
    var current = window.location.pathname + window.location.search + window.location.hash;
    if(next !== current) window.history.replaceState(null, document.title, next);
  }

  function patchSetView(){
    if(!window.FWApp || window.FWApp.__mobileCoreFixesPatched) return false;
    var originalSetView = window.FWApp.setView;
    if(typeof originalSetView !== 'function') return false;
    window.FWApp.setView = function(name){
      var result = originalSetView.apply(this, arguments);
      replaceHashForView(name || 'nav');
      return result;
    };
    window.FWApp.__mobileCoreFixesPatched = true;
    return true;
  }

  function schedulePatchSetView(){
    if(patchSetView()) return;
    [0, 80, 240, 700, 1500].forEach(function(delay){
      setTimeout(patchSetView, delay);
    });
  }

  function bindClickSync(){
    document.addEventListener('click', function(event){
      var target = event.target;
      if(!target || !target.closest) return;

      var nav = target.closest('[data-app-nav]');
      if(nav){
        var navView = nav.dataset.appNav || 'nav';
        setTimeout(function(){ replaceHashForView(navView); }, 0);
        return;
      }

      var profile = target.closest('[data-app-profile-trigger]');
      if(profile){
        setTimeout(function(){ replaceHashForView('profile'); }, 0);
        return;
      }

      var opener = target.closest('[data-app-open]');
      if(opener){
        var openView = opener.dataset.appOpen || 'nav';
        setTimeout(function(){ replaceHashForView(openView); }, 0);
        return;
      }

      var report = target.closest('[data-comment-report]');
      if(report){
        event.preventDefault();
        event.stopImmediatePropagation();
        if(window.FWApp && typeof window.FWApp.toast === 'function'){
          window.FWApp.toast('举报入口正在整理，暂时请先通过处理公告反馈。');
        }
      }
    }, true);
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
    injectStyle();
    normalizeViewport();
    schedulePatchSetView();
    bindClickSync();
    requestServiceWorkerRefresh();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
