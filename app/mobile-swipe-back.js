// F.w 研究所：手机端 PWA 缺口页面左边缘右滑返回
(function(){
  if(window.__FW_MOBILE_SWIPE_BACK__) return;
  window.__FW_MOBILE_SWIPE_BACK__ = true;

  var EDGE_LIMIT = 42;
  var MIN_DISTANCE = 72;
  var MAX_VERTICAL = 55;
  var MAX_TIME = 900;
  var touchState = null;

  var FALLBACK_VIEWS = {
    archive:'nav',
    rules:'nav',
    moderation:'nav',
    echo:'nav',
    buddy:'nav',
    profile:'nav'
  };

  function $(selector, root){ return (root || document).querySelector(selector); }
  function app(){ return window.FWApp || null; }

  function currentView(){
    var fw = app();
    if(fw && fw.state && fw.state.view) return fw.state.view;
    var active = $('[data-app-view].is-active');
    return active && active.dataset ? active.dataset.appView : '';
  }

  function isEditableOrControl(target){
    return !!(target && target.closest && target.closest('input,textarea,select,[contenteditable="true"],button,a,label'));
  }

  function isHorizontalControl(target){
    return !!(target && target.closest && target.closest('.tabs,.status-filter,.status-picks,.mobile-admin-tabs,.mobile-bird-images,.profile-sticker-grid'));
  }

  function shouldHandleView(view){
    if(!Object.prototype.hasOwnProperty.call(FALLBACK_VIEWS, view)) return false;

    // 搭子私聊已有专门手势返回，这里只处理搭子主列表。
    if(view === 'buddy'){
      var buddyView = $('[data-app-view="buddy"]');
      if(buddyView && buddyView.classList.contains('is-chatting')) return false;
    }

    // “我的”子页面已有 profile.js 专门处理，这里只处理“我的”首页回导航。
    if(view === 'profile'){
      var profileView = $('[data-app-view="profile"].is-active') || $('[data-app-view="profile"]');
      if(profileView && profileView.querySelector('[data-profile-back]')) return false;
    }

    return true;
  }

  function goBack(view){
    var fw = app();
    var target = FALLBACK_VIEWS[view] || 'nav';
    if(fw && typeof fw.setView === 'function') fw.setView(target);
  }

  function reset(){ touchState = null; }

  function onTouchStart(event){
    var view = currentView();
    if(!shouldHandleView(view)) return;
    if(!event.touches || event.touches.length !== 1) return;
    if(isEditableOrControl(event.target) || isHorizontalControl(event.target)) return;

    var touch = event.touches[0];
    if(!touch || touch.clientX > EDGE_LIMIT) return;
    touchState = {
      x:touch.clientX,
      y:touch.clientY,
      at:Date.now(),
      view:view
    };
  }

  function onTouchEnd(event){
    if(!touchState) return;
    var state = touchState;
    reset();

    if(!shouldHandleView(state.view)) return;
    if(currentView() !== state.view) return;
    if(!event.changedTouches || event.changedTouches.length !== 1) return;

    var touch = event.changedTouches[0];
    if(!touch) return;
    var dx = touch.clientX - state.x;
    var dy = Math.abs(touch.clientY - state.y);
    var elapsed = Date.now() - state.at;

    if(dx >= MIN_DISTANCE && dy <= MAX_VERTICAL && elapsed <= MAX_TIME){
      goBack(state.view);
    }
  }

  function bind(){
    var main = $('#appMain') || document;
    main.addEventListener('touchstart', onTouchStart, {passive:true});
    main.addEventListener('touchend', onTouchEnd, {passive:true});
    main.addEventListener('touchcancel', reset, {passive:true});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();