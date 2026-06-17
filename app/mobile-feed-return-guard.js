// F.w 研究所：帖子详情来源返回保护
// 作用：防止 feed.js 旧左滑逻辑把“回声查看帖子”错误带回精神广场。
(function(){
  if(window.__FW_MOBILE_FEED_RETURN_GUARD__) return;
  window.__FW_MOBILE_FEED_RETURN_GUARD__ = true;

  var RETURN_KEY = 'fw_mobile_feed_detail_return_view';
  var OLD_ECHO_RETURN_KEY = 'fw_mobile_echo_detail_return';
  var EDGE_LIMIT = 42;
  var MIN_DISTANCE = 62;
  var MAX_VERTICAL = 58;
  var MAX_TIME = 1000;
  var touchState = null;

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

  function clearReturnView(){
    try{
      sessionStorage.removeItem(RETURN_KEY);
      sessionStorage.removeItem(OLD_ECHO_RETURN_KEY);
    }catch(e){}
  }

  function isSquareDetailActive(){
    var fw = app();
    if(fw && fw.state && fw.state.view === 'square-detail') return true;
    return !!$('[data-app-view="square-detail"].is-active');
  }

  function openView(name){
    var fw = app();
    if(!fw || !name) return false;
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

  function refreshTarget(name){
    if(name === 'echo' && window.FWAppEcho){
      try{ if(typeof window.FWAppEcho.load === 'function') window.FWAppEcho.load(true); }catch(e){}
      try{ if(typeof window.FWAppEcho.refreshBadges === 'function') window.FWAppEcho.refreshBadges(); }catch(e){}
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
    if(!target || target === 'square') return false;
    clearReturnView();
    if(openView(target)){
      setTimeout(function(){ refreshTarget(target); }, 0);
      setTimeout(function(){ refreshTarget(target); }, 180);
      return true;
    }
    return false;
  }

  function stopEvent(event){
    if(!event) return;
    try{ event.preventDefault && event.preventDefault(); }catch(e){}
    try{ event.stopPropagation && event.stopPropagation(); }catch(e){}
    try{ event.stopImmediatePropagation && event.stopImmediatePropagation(); }catch(e){}
  }

  function shouldGuard(){
    return isSquareDetailActive() && !!readReturnView() && readReturnView() !== 'square';
  }

  function onTouchStart(event){
    if(!shouldGuard()) return;
    if(!event.touches || event.touches.length !== 1) return;
    var target = event.target;
    if(target && target.closest && target.closest('input,textarea,select,[contenteditable="true"],button,a,label')) return;
    var touch = event.touches[0];
    if(!touch || touch.clientX > EDGE_LIMIT) return;
    touchState = {x:touch.clientX, y:touch.clientY, at:Date.now()};
  }

  function onTouchMove(event){
    if(!touchState || !shouldGuard()) return;
    if(!event.touches || event.touches.length !== 1) return;
    var touch = event.touches[0];
    var dx = touch.clientX - touchState.x;
    var dy = Math.abs(touch.clientY - touchState.y);
    if(dx > 12 && dx > dy * 1.2 && dy <= MAX_VERTICAL){
      stopEvent(event);
    }
  }

  function onTouchEnd(event){
    if(!touchState) return;
    var state = touchState;
    touchState = null;
    if(!shouldGuard()) return;
    if(!event.changedTouches || event.changedTouches.length !== 1) return;
    var touch = event.changedTouches[0];
    var dx = touch.clientX - state.x;
    var dy = Math.abs(touch.clientY - state.y);
    var elapsed = Date.now() - state.at;
    if(dx >= MIN_DISTANCE && dx > dy * 1.25 && dy <= MAX_VERTICAL && elapsed <= MAX_TIME){
      if(returnFromDetail()) stopEvent(event);
    }
  }

  function onClick(event){
    var back = event.target && event.target.closest && event.target.closest('[data-square-detail-back]');
    if(!back || !shouldGuard()) return;
    if(returnFromDetail()) stopEvent(event);
  }

  function bind(){
    document.addEventListener('touchstart', onTouchStart, {passive:true, capture:true});
    document.addEventListener('touchmove', onTouchMove, {passive:false, capture:true});
    document.addEventListener('touchend', onTouchEnd, {passive:false, capture:true});
    document.addEventListener('touchcancel', function(){ touchState = null; }, {passive:true, capture:true});
    document.addEventListener('click', onClick, true);
    window.FWMobileFeedReturnGuard = {readReturnView:readReturnView, returnFromDetail:returnFromDetail};
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();