// F.w 研究所：手机端 PWA 左滑/右滑返回统一处理
(function(){
  if(window.__FW_MOBILE_SWIPE_BACK__) return;
  window.__FW_MOBILE_SWIPE_BACK__ = true;

  // iOS PWA 没有安卓系统返回键，左边缘必须更宽一点才不费劲。
  var EDGE_LIMIT = 96;
  var MIN_DISTANCE = 54;
  var MAX_VERTICAL = 78;
  var MAX_TIME = 1200;
  var touchState = null;

  var FALLBACK_VIEWS = {
    archive:'nav',
    rules:'nav',
    moderation:'nav',
    echo:'nav',
    buddy:'nav',
    profile:'nav'
  };

  var PARENT_VIEWS = {
    'square-detail':'square',
    'rooms-compose':'rooms',
    'bird-detail':'bird',
    'bird-compose':'bird',
    'bird-guide':'bird'
  };

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function app(){ return window.FWApp || null; }

  function currentView(){
    var fw = app();
    if(fw && fw.state && fw.state.view) return fw.state.view;
    var active = $('[data-app-view].is-active');
    return active && active.dataset ? active.dataset.appView : '';
  }

  function activeView(){
    return $('[data-app-view].is-active');
  }

  function visible(el){
    if(!el || el.disabled || el.hidden) return false;
    var node = el;
    while(node && node !== document.body){
      if(node.hidden) return false;
      var st = window.getComputedStyle ? getComputedStyle(node) : null;
      if(st && (st.display === 'none' || st.visibility === 'hidden')) return false;
      node = node.parentElement;
    }
    var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    return !rect || (rect.width > 0 && rect.height > 0);
  }

  function clickFirst(selector, root){
    var nodes = $$(selector, root);
    for(var i = 0; i < nodes.length; i += 1){
      if(visible(nodes[i])){
        nodes[i].click();
        return true;
      }
    }
    return false;
  }

  function isEditableOrControl(target){
    return !!(target && target.closest && target.closest('input,textarea,select,[contenteditable="true"],button,a,label'));
  }

  function isHorizontalControl(target){
    return !!(target && target.closest && target.closest('.tabs,.status-filter,.status-picks,.rooms-filter,.mobile-admin-tabs,.mobile-bird-images,.profile-sticker-grid,.mobile-bird-preview-grid'));
  }

  function setView(name){
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

  function isBuddyChatting(){
    var buddy = $('[data-app-view="buddy"]');
    return !!(buddy && buddy.classList && buddy.classList.contains('is-chatting'));
  }

  function hasInternalBack(view){
    var active = activeView();
    if(view === 'buddy' && isBuddyChatting()) return true;
    if(active && clickFirst.__probe){ return false; }
    if(active && $$(backSelectors(), active).some(visible)) return true;
    if(Object.prototype.hasOwnProperty.call(PARENT_VIEWS, view)) return true;
    if(Object.prototype.hasOwnProperty.call(FALLBACK_VIEWS, view)) return true;
    return false;
  }

  function backSelectors(){
    return '[data-square-detail-back],[data-mobile-bird-back],[data-profile-back],[data-buddy-chat-back],.back-btn';
  }

  function shouldHandleView(view){
    if(!view || view === 'nav') return false;
    return hasInternalBack(view);
  }

  function goBack(view){
    var active = activeView();

    // 搭子私聊页优先回消息列表；搭子一级页则回首页。
    if(view === 'buddy' && isBuddyChatting()){
      if(window.FWAppBuddy && typeof window.FWAppBuddy.closeChat === 'function'){
        window.FWAppBuddy.closeChat(true);
        return true;
      }
      if(clickFirst('[data-buddy-chat-back]', active || document)) return true;
    }

    // 优先点击当前二级页自己的返回按钮，这样回声查看帖子能走 echo.js 的返回逻辑。
    if(active && clickFirst(backSelectors(), active)) return true;

    if(Object.prototype.hasOwnProperty.call(PARENT_VIEWS, view)){
      return setView(PARENT_VIEWS[view]);
    }

    if(Object.prototype.hasOwnProperty.call(FALLBACK_VIEWS, view)){
      return setView(FALLBACK_VIEWS[view]);
    }

    return false;
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

    var horizontal = dx >= MIN_DISTANCE && dx > dy * 1.15;
    if(horizontal && dy <= MAX_VERTICAL && elapsed <= MAX_TIME){
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
