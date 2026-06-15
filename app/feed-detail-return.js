// F.w 研究所：统一帖子详情返回来源
// 作用：让精神广场详情页只通过一个入口处理返回来源，避免回声和帖子详情重复接管。
(function(){
  if(window.__FW_MOBILE_FEED_DETAIL_RETURN__) return;
  window.__FW_MOBILE_FEED_DETAIL_RETURN__ = true;

  var RETURN_KEY = 'fw_mobile_feed_detail_return_view';
  var OLD_ECHO_RETURN_KEY = 'fw_mobile_echo_detail_return';
  var patchedFeed = false;
  var patchedView = false;
  var bound = false;

  function app(){ return window.FWApp || null; }
  function $(selector, root){ return (root || document).querySelector(selector); }

  function normalizeReturnView(value){
    value = String(value || '').trim();
    if(value === 'echo') return 'echo';
    if(value === 'buddy') return 'buddy';
    if(value === 'profile') return 'profile';
    if(value === 'square') return 'square';
    return '';
  }

  function readReturnView(){
    try{
      var direct = normalizeReturnView(sessionStorage.getItem(RETURN_KEY));
      if(direct) return direct;
      if(sessionStorage.getItem(OLD_ECHO_RETURN_KEY) === '1') return 'echo';
    }catch(e){}
    return '';
  }

  function writeReturnView(value){
    value = normalizeReturnView(value);
    try{
      if(value) sessionStorage.setItem(RETURN_KEY, value);
      else sessionStorage.removeItem(RETURN_KEY);
      sessionStorage.removeItem(OLD_ECHO_RETURN_KEY);
    }catch(e){}
  }

  function returnViewFromOptions(options){
    options = options || {};
    var direct = normalizeReturnView(options.returnView || options.return_view);
    if(direct) return direct;
    if(String(options.from || '') === 'echo') return 'echo';
    return '';
  }

  function openView(name){
    var fw = app();
    if(!fw) return false;
    if(typeof fw.openView === 'function'){
      fw.openView(name);
      return true;
    }
    if(typeof fw.setView === 'function'){
      fw.setView(name);
      return true;
    }
    return false;
  }

  function refreshReturnTarget(name){
    if(name === 'echo' && window.FWAppEcho){
      if(typeof window.FWAppEcho.load === 'function'){
        try{ window.FWAppEcho.load(true); }catch(e){}
      }
      if(typeof window.FWAppEcho.refreshBadges === 'function'){
        try{ window.FWAppEcho.refreshBadges(); }catch(e){}
      }
      return;
    }
    if(name === 'buddy' && window.FWAppBuddy && typeof window.FWAppBuddy.ensureLoaded === 'function'){
      try{ window.FWAppBuddy.ensureLoaded(); }catch(e){}
      return;
    }
    if(name === 'profile' && window.FWAppProfile && typeof window.FWAppProfile.render === 'function'){
      try{ window.FWAppProfile.render(); }catch(e){}
    }
  }

  function returnFromDetail(){
    var target = readReturnView();
    if(!target) return false;
    writeReturnView('');
    if(openView(target)){
      setTimeout(function(){ refreshReturnTarget(target); }, 0);
      setTimeout(function(){ refreshReturnTarget(target); }, 180);
      return true;
    }
    return false;
  }

  function isSquareDetailActive(){
    var fw = app();
    if(fw && fw.state && fw.state.view === 'square-detail') return true;
    var active = $('[data-app-view="square-detail"].is-active');
    return !!active;
  }

  function patchFeedOpenDetail(){
    if(patchedFeed) return true;
    if(!window.FWAppFeed || typeof window.FWAppFeed.openDetail !== 'function') return false;
    var originalOpenDetail = window.FWAppFeed.openDetail.bind(window.FWAppFeed);
    window.FWAppFeed.openDetail = function(postId, options){
      var target = returnViewFromOptions(options || {});
      writeReturnView(target);
      return originalOpenDetail(postId, options);
    };
    patchedFeed = true;
    return true;
  }

  function patchSetView(){
    if(patchedView) return true;
    var fw = app();
    if(!fw || typeof fw.setView !== 'function') return false;
    var originalSetView = fw.setView.bind(fw);
    fw.setView = function(name){
      if(name === 'square' && isSquareDetailActive() && readReturnView()){
        if(returnFromDetail()) return;
      }
      return originalSetView.apply(fw, arguments);
    };
    patchedView = true;
    return true;
  }

  function bindBackButton(){
    if(bound) return;
    bound = true;
    document.addEventListener('click', function(event){
      var back = event.target && event.target.closest && event.target.closest('[data-square-detail-back]');
      if(!back || !isSquareDetailActive() || !readReturnView()) return;
      event.preventDefault();
      event.stopPropagation();
      if(event.stopImmediatePropagation) event.stopImmediatePropagation();
      returnFromDetail();
    }, true);
  }

  function install(){
    patchFeedOpenDetail();
    patchSetView();
    bindBackButton();
  }

  function scheduleInstall(){
    install();
    [80, 240, 700, 1500, 3000].forEach(function(delay){ setTimeout(install, delay); });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleInstall);
  else scheduleInstall();
})();
