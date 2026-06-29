// F.w 研究所：手机端 PWA / APK 返回统一处理
// 作用：统一左边缘向右滑返回，并用 History Guard 接住 Android / APK 系统返回键。
(function(){
  if(window.__FW_MOBILE_SWIPE_BACK__) return;
  window.__FW_MOBILE_SWIPE_BACK__ = true;
  window.__FW_MOBILE_UNIFIED_BACK_ENABLED__ = true;

  // 这里故意收窄触发区，避免首页和普通横向滑动误触。
  var EDGE_LIMIT = 36;
  var MIN_DISTANCE = 74;
  var MAX_VERTICAL = 54;
  var MAX_TIME = 850;
  var touchState = null;
  var historyGuardActive = false;
  var suppressGuardOnce = false;
  var booted = false;
  var RETURN_KEY = 'fw_mobile_feed_detail_return_view';
  var OLD_ECHO_RETURN_KEY = 'fw_mobile_echo_detail_return';

  var FALLBACK_VIEWS = {
    square:'nav',
    rooms:'nav',
    bird:'nav',
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

  function normalizeReturnView(value){
    value = String(value || '').trim();
    if(value === 'echo') return 'echo';
    if(value === 'buddy') return 'buddy';
    if(value === 'profile') return 'profile';
    if(value === 'square') return 'square';
    return '';
  }

  function readFeedReturnView(){
    try{
      var direct = normalizeReturnView(sessionStorage.getItem(RETURN_KEY));
      if(direct) return direct;
      if(sessionStorage.getItem(OLD_ECHO_RETURN_KEY) === '1') return 'echo';
    }catch(e){}
    return '';
  }

  function clearFeedReturnView(){
    try{
      sessionStorage.removeItem(RETURN_KEY);
      sessionStorage.removeItem(OLD_ECHO_RETURN_KEY);
    }catch(e){}
  }

  function refreshReturnTarget(name){
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

  function returnFromFeedDetailSource(){
    var target = readFeedReturnView();
    if(!target || target === 'square') return false;
    clearFeedReturnView();
    if(setView(target)){
      setTimeout(function(){ refreshReturnTarget(target); }, 0);
      setTimeout(function(){ refreshReturnTarget(target); }, 180);
      return true;
    }
    return false;
  }

  function isIOS(){
    var ua = String(navigator.userAgent || '');
    return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isAndroidLike(){
    var ua = String(navigator.userAgent || '');
    return /Android|wv/i.test(ua);
  }

  function isLikelyMobileShell(){
    var standalone = !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var ua = String(navigator.userAgent || '');
    return standalone || coarse || /Android|iPhone|iPad|iPod|Mobile|wv/i.test(ua);
  }

  function shouldUseHistoryGuard(){
    // iPhone / iPad 的 PWA 不需要 Android 返回键保护。
    // 在 iOS 上写入额外 history 反而会让左/右边缘滑动把旧状态滑出来。
    return isLikelyMobileShell() && isAndroidLike() && !isIOS();
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

  function stopEvent(event){
    if(!event) return;
    try{ event.stopPropagation(); }catch(e){}
    try{ if(event.stopImmediatePropagation) event.stopImmediatePropagation(); }catch(e){}
  }

  function isEditableOrControl(target){
    // 只屏蔽真正会输入/编辑的控件；普通按钮、卡片按钮和链接允许从左边缘开始滑动返回。
    // 这样能避免精神广场详情、观鸟台卡片等区域被 button/a 误拦截。
    return !!(target && target.closest && target.closest('input,textarea,select,[contenteditable="true"]'));
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

  function shouldBlockEdgeSwipe(view){
    // 首页也要拦一下左边缘右滑，防止 iOS / 浏览器历史手势把旧页面状态滑出来。
    if(view === 'nav') return true;
    return shouldHandleView(view);
  }

  function goBack(view, source){
    view = view || currentView();
    var active = activeView();

    // 回声 / 搭子 / 我的 打开帖子详情时，必须优先回来源页，不能被旧 feed.js 带回精神广场。
    if(view === 'square-detail' && returnFromFeedDetailSource()) return true;

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
    if(!event.touches || event.touches.length !== 1) return;
    if(isEditableOrControl(event.target) || isHorizontalControl(event.target)) return;

    var touch = event.touches[0];
    if(!touch || touch.clientX > EDGE_LIMIT) return;

    var view = currentView();
    if(!shouldBlockEdgeSwipe(view)) return;

    touchState = {
      x:touch.clientX,
      y:touch.clientY,
      at:Date.now(),
      view:view,
      blockOnly:!shouldHandleView(view)
    };
  }

  function onTouchMove(event){
    if(!touchState) return;
    if(!event.touches || event.touches.length !== 1) return;
    if(currentView() !== touchState.view) return;

    var touch = event.touches[0];
    if(!touch) return;
    var dx = touch.clientX - touchState.x;
    var dy = Math.abs(touch.clientY - touchState.y);
    var horizontal = dx > 12 && dx > dy * 1.25;
    if(horizontal && dy <= MAX_VERTICAL){
      if(event.cancelable) event.preventDefault();
      stopEvent(event);
    }
  }

  function onTouchEnd(event){
    if(!touchState) return;
    var state = touchState;
    reset();

    if(currentView() !== state.view) return;
    if(!event.changedTouches || event.changedTouches.length !== 1) return;

    var touch = event.changedTouches[0];
    if(!touch) return;
    var dx = touch.clientX - state.x;
    var dy = Math.abs(touch.clientY - state.y);
    var elapsed = Date.now() - state.at;

    var horizontal = dx >= MIN_DISTANCE && dx > dy * 1.35;
    if(horizontal && dy <= MAX_VERTICAL && elapsed <= MAX_TIME){
      stopEvent(event);
      if(state.blockOnly) return;
      if(!shouldHandleView(state.view)) return;
      var handled = goBack(state.view, 'swipe');
      if(handled) ensureHistoryGuardSoon();
    }
  }

  function ensureHistoryGuard(){
    if(!shouldUseHistoryGuard()) return;
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
    if(!shouldUseHistoryGuard()) return;
    [30, 160, 420].forEach(function(delay){ setTimeout(ensureHistoryGuard, delay); });
  }

  function bindAndroidBackGuard(){
    if(!shouldUseHistoryGuard()) return;
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
    if(!shouldUseHistoryGuard()) return true;
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
    if(!shouldUseHistoryGuard()) return;
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
    // 用 document 捕获阶段接管返回手势，防止 feed.js / profile.js 的旧局部滑动先执行，尤其是回声详情返回。
    document.addEventListener('touchstart', onTouchStart, {passive:true, capture:true});
    document.addEventListener('touchmove', onTouchMove, {passive:false, capture:true});
    document.addEventListener('touchend', onTouchEnd, {passive:true, capture:true});
    document.addEventListener('touchcancel', reset, {passive:true, capture:true});
    schedulePatchSetViewForGuard();
    bindAndroidBackGuard();
    bindClicksForGuard();
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) ensureHistoryGuardSoon(); });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();