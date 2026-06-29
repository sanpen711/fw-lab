// F.w 研究所：搭子私聊左滑返回兼容层
// 统一左滑已交给 mobile-swipe-back.js；本文件只在统一主控未加载时兜底。
(function(){
  if(window.__FW_MOBILE_BUDDY_CHAT_SWIPE__) return;
  window.__FW_MOBILE_BUDDY_CHAT_SWIPE__ = true;

  var EDGE_LIMIT = 96;
  var MIN_DISTANCE = 54;
  var MAX_VERTICAL = 64;
  var MAX_TIME = 950;
  var state = null;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function unifiedEnabled(){ return !!window.__FW_MOBILE_UNIFIED_BACK_ENABLED__; }

  function isBuddyChatting(){
    var buddy = $('[data-app-view="buddy"].is-active') || $('[data-app-view="buddy"]');
    if(!buddy) return false;
    if(buddy.classList && buddy.classList.contains('is-chatting')) return true;
    if(document.body.classList && document.body.classList.contains('fw-buddy-chatting')) return true;
    var panel = $('[data-buddy-chat-panel]', buddy);
    if(!panel) return false;
    var st = window.getComputedStyle ? getComputedStyle(panel) : null;
    return !!(st && st.display !== 'none' && st.visibility !== 'hidden');
  }

  function isBlockedTarget(target){
    return !!(target && target.closest && target.closest('input,textarea,select,[contenteditable="true"],button,a,label,.comment-sticker-grid,.app-publish-sticker-grid'));
  }

  function stopEvent(event){
    if(!event) return;
    try{ event.stopPropagation(); }catch(e){}
    try{ if(event.stopImmediatePropagation) event.stopImmediatePropagation(); }catch(e){}
  }

  function closeBuddyChat(){
    if(window.FWAppBuddy && typeof window.FWAppBuddy.closeChat === 'function'){
      try{ window.FWAppBuddy.closeChat(true); return true; }catch(e){}
    }
    var back = $('[data-buddy-chat-back]');
    if(back){
      try{ back.click(); return true; }catch(e){}
    }
    var buddy = $('[data-app-view="buddy"]');
    if(buddy) buddy.classList.remove('is-chatting');
    if(document.body.classList) document.body.classList.remove('fw-buddy-chatting');
    return !!buddy;
  }

  function onStart(event){
    if(unifiedEnabled()) return;
    if(!event.touches || event.touches.length !== 1) return;
    if(!isBuddyChatting()) return;
    if(isBlockedTarget(event.target)) return;
    var touch = event.touches[0];
    if(!touch || touch.clientX > EDGE_LIMIT) return;
    state = {x:touch.clientX, y:touch.clientY, at:Date.now()};
  }

  function onMove(event){
    if(unifiedEnabled()){ state = null; return; }
    if(!state) return;
    if(!event.touches || event.touches.length !== 1) return;
    if(!isBuddyChatting()){ state = null; return; }
    var touch = event.touches[0];
    var dx = touch.clientX - state.x;
    var dy = Math.abs(touch.clientY - state.y);
    if(dx > 10 && dx > dy * 1.2 && dy <= MAX_VERTICAL){
      if(event.cancelable) event.preventDefault();
      stopEvent(event);
    }
  }

  function onEnd(event){
    if(unifiedEnabled()){ state = null; return; }
    if(!state) return;
    var start = state;
    state = null;
    if(!event.changedTouches || event.changedTouches.length !== 1) return;
    if(!isBuddyChatting()) return;
    var touch = event.changedTouches[0];
    var dx = touch.clientX - start.x;
    var dy = Math.abs(touch.clientY - start.y);
    var elapsed = Date.now() - start.at;
    if(dx >= MIN_DISTANCE && dx > dy * 1.25 && dy <= MAX_VERTICAL && elapsed <= MAX_TIME){
      stopEvent(event);
      closeBuddyChat();
    }
  }

  function reset(){ state = null; }

  document.addEventListener('touchstart', onStart, {passive:true, capture:true});
  document.addEventListener('touchmove', onMove, {passive:false, capture:true});
  document.addEventListener('touchend', onEnd, {passive:true, capture:true});
  document.addEventListener('touchcancel', reset, {passive:true, capture:true});
})();