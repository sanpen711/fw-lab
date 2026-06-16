// F.w 研究所：手机端 PWA / APK 返回统一处理
// 作用：统一左边缘向右滑返回，并用 History Guard 接住 Android / APK 系统返回键。
(function(){
  if(window.__FW_MOBILE_SWIPE_BACK__) return;
  window.__FW_MOBILE_SWIPE_BACK__ = true;
  window.__FW_MOBILE_UNIFIED_BACK_ENABLED__ = true;

  var EDGE_LIMIT = 84;
  var MIN_DISTANCE = 58;
  var MAX_VERTICAL = 82;
  var MAX_TIME = 1200;
  var touchState = null;
  var historyGuardActive = false;
  var suppressGuardOnce = false;
  var booted = false;

  var FALLBACK_VIEWS = {
    square:'nav',
    archive:'nav',
    rules:'nav',
    moderation:'nav',
    echo:'nav',
    buddy:'nav',
    profile:'nav'
  };

  var PARENT_VIEWS = {
    'square-detail':'square',
    'square-publish':'square',
    'rooms-compose':'rooms',
    'bird-detail':'bird',
    'bird-compose':'bird',
    'bird-guide':'bird'
  };

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function app(){ return window.FWApp || null; }

  function isLikelyMobileShell(){
    var standalone = !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var ua = String(navigator.userAgent || '');
    return standalone || coarse || /Android|iPhone|iPad|iPod|Mobile|wv/i.test(ua);
  }

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
    return !!(target && target.closest && target.closest('.tabs,.status-filter,.status-picks,.rooms-filter,.mobile-admin-tabs,.mobile-bird-images,.profile-sticker-grid,.mobile-bird-preview-grid,.app-publish-sticker-grid,.comment-sticker-grid'));
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
    return !!((buddy && buddy.classList && buddy.classList.contains('is-chatting')) || document.body.classList.contains('fw-buddy-chatting'));
  }

  function backSelectors(){
    return '[data-square-detail-back],[data-publish-back-square],[data-mobile-bird-back],[data-profile-back],[data-buddy-chat-back],.back-btn';
  }

  function hasInternalBack(view){
    var active = activeView();
    if(view === 'buddy' && isBuddyChatting()) return true;
    if(active && $$(backSelectors(), active).some(visible)) return true;
    if(Object.prototype.hasOwnProperty.call(PARENT_VIEWS, view)) return true;
    if(Object.prototype.hasOwnProperty.call(FALLBACK_VIEWS, view)) return true;
    return false;
  }

  function shouldHandleView(view){
    if(!view || view === 'nav') return false;
    return hasInternalBack(view);
  }

  function goBack(view, source){
    view = view || currentView();
    var active = activeView();

    // 私聊优先回到搭子列表；搭子一级页再回首页。
    if(view === 'buddy' && isBuddyChatting()){
      if(window.FWAppBuddy && typeof window.FWAppBuddy.closeChat === 'function'){
        window.FWAppBuddy.closeChat(true);
        return true;
      }
      if(clickFirst('[data-buddy-chat-back]', active || document)) return true;
    }

    // 详情页、发布页、个人中心二级页优先点自己的返回按钮。
    // 这样：回声查看帖子返回仍由 feed-detail-return.js 统一接管。
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
      goBack(state.view, 'swipe');
      ensureHistoryGuardSoon();
    }
  }

  function ensureHistoryGuard(){
    if(!isLikelyMobileShell()) return;
    if(!window.history || !window.history.pushState || !window.history.replaceState) return;
    if(historyGuardActive || suppressGuardOnce) return;
    try{
      var state = window.history.state;
      if(!state || !state.fwAppBase){
        window.history.replaceState({fwAppBase:true, view:currentView() || 'nav'}, document.title, window.location.href);
      }
      window.history.pushState({fwAppGuard:true, view:currentView() || 'nav'}, document.title, window.location.href);
      historyGuardActive = true;
    }catch(e){}
  }

  function ensureHistoryGuardSoon(){
    if(!isLikelyMobileShell()) return;
    [30, 160, 420].forEach(function(delay){ setTimeout(ensureHistoryGuard, delay); });
  }

  function bindAndroidBackGuard(){
    if(!isLikelyMobileShell()) return;
    ensureHistoryGuardSoon();
    window.addEventListener('popstate', function(){
      historyGuardActive = false;
      var view = currentView();
      if(shouldHandleView(view)){
        var handled = goBack(view, 'system');
        if(handled) ensureHistoryGuardSoon();
        return;
      }
      // 已经在首页或没有内部返回目标时，放行下一次系统返回，避免 APK 卡住不能退出。
      suppressGuardOnce = true;
      setTimeout(function(){ suppressGuardOnce = false; }, 900);
    });
  }

  function patchSetViewForGuard(){
    var fw = app();
    if(!fw || fw.__mobileUnifiedBackGuardPatched || typeof fw.setView !== 'function') return false;
    var original = fw.setView;
    fw.setView = function(){
      var result = original.apply(this, arguments);
      ensureHistoryGuardSoon();
      return result;
    };
    fw.__mobileUnifiedBackGuardPatched = true;
    return true;
  }

  function schedulePatchSetViewForGuard(){
    if(patchSetViewForGuard()) return;
    [0, 80, 240, 700, 1500].forEach(function(delay){ setTimeout(patchSetViewForGuard, delay); });
  }

  function bindClicksForGuard(){
    document.addEventListener('click', function(event){
      var target = event.target;
      if(!target || !target.closest) return;
      if(target.closest('[data-app-nav],[data-app-open],[data-app-profile-trigger],[data-publish-open],[data-mobile-echo-post],[data-priority-reply-post],[data-square-detail-back],[data-profile-back],[data-publish-back-square],[data-buddy-chat-back],[data-mobile-bird-back]')){
        ensureHistoryGuardSoon();
      }
    }, true);
  }

  function bind(){
    if(booted) return;
    booted = true;
    var main = $('#appMain') || document;
    main.addEventListener('touchstart', onTouchStart, {passive:true});
    main.addEventListener('touchend', onTouchEnd, {passive:true});
    main.addEventListener('touchcancel', reset, {passive:true});
    schedulePatchSetViewForGuard();
    bindAndroidBackGuard();
    bindClicksForGuard();
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) ensureHistoryGuardSoon(); });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
