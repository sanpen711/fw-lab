// F.w 研究所：手机端搭子私聊进入位置与左滑返回修正
(function(){
  if(window.__FW_MOBILE_BUDDY_CHAT_ENTRY_FIX__) return;
  window.__FW_MOBILE_BUDDY_CHAT_ENTRY_FIX__ = true;

  var wasChatting = false;
  var activeChatKey = '';
  var edgeTouch = null;
  var pending = false;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function isChatting(){
    var view = $('[data-app-view="buddy"]');
    return !!(view && view.classList.contains('is-chatting'));
  }

  function chatKey(){
    var title = $('[data-buddy-chat-title]');
    var sub = $('[data-buddy-chat-sub]');
    return [title ? title.textContent.trim() : '', sub ? sub.textContent.trim() : ''].join('|');
  }

  function scrollToLatest(){
    var box = $('[data-buddy-chat-messages]');
    if(!box) return;
    box.scrollTop = box.scrollHeight;
  }

  function resetMotionResidue(){
    $$('[data-app-view="buddy"], [data-app-view].is-active').forEach(function(node){
      if(!node) return;
      node.classList.remove('fw-view-edge-peek','fw-view-edge-release','fw-view-enter-forward','fw-view-enter-back','fw-view-enter-tab');
      node.style.transform = '';
      node.style.opacity = '';
    });
    var main = $('#appMain');
    if(main){
      main.style.transform = '';
      main.style.opacity = '';
      main.scrollLeft = 0;
    }
    document.documentElement.classList.remove('fw-buddy-swipe-returning');
  }

  function forceLatestOnOpen(){
    // 进入聊天页时强制定位到最新消息；只在刚进入/换聊天对象时触发，不影响之后向上翻历史。
    scrollToLatest();
    requestAnimationFrame(scrollToLatest);
    setTimeout(scrollToLatest, 80);
    setTimeout(scrollToLatest, 240);
    setTimeout(scrollToLatest, 520);
  }

  function closeChatToList(){
    resetMotionResidue();
    if(window.FWAppBuddy && window.FWAppBuddy.closeChat){
      window.FWAppBuddy.closeChat(true);
    }else{
      var view = $('[data-app-view="buddy"]');
      if(view) view.classList.remove('is-chatting');
      document.body.classList.remove('fw-buddy-chatting');
    }
    var viewNode = $('[data-app-view="buddy"]');
    if(viewNode) viewNode.classList.remove('is-profile');
    resetMotionResidue();
    requestAnimationFrame(resetMotionResidue);
    setTimeout(resetMotionResidue, 80);
    setTimeout(resetMotionResidue, 260);
  }

  function watchChatOpen(){
    var chatting = isChatting();
    var key = chatting ? chatKey() : '';
    if(chatting && (!wasChatting || key !== activeChatKey)){
      activeChatKey = key;
      forceLatestOnOpen();
    }
    wasChatting = chatting;
  }

  function scheduleWatchChatOpen(){
    if(pending) return;
    pending = true;
    requestAnimationFrame(function(){
      pending = false;
      watchChatOpen();
    });
  }

  function bindBackOverride(){
    document.addEventListener('click', function(e){
      var back = e.target.closest && e.target.closest('[data-buddy-chat-back]');
      if(!back || !isChatting()) return;
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      closeChatToList();
    }, true);

    document.addEventListener('touchstart', function(e){
      if(!isChatting()) return;
      var touch = e.touches && e.touches[0];
      if(!touch || touch.clientX > 42) return;
      edgeTouch = {x:touch.clientX, y:touch.clientY, at:Date.now()};
      resetMotionResidue();
    }, {capture:true, passive:true});

    document.addEventListener('touchmove', function(e){
      if(!edgeTouch || !isChatting()) return;
      var touch = e.touches && e.touches[0];
      if(!touch) return;
      var dx = touch.clientX - edgeTouch.x;
      var dy = Math.abs(touch.clientY - edgeTouch.y);
      if(dx > 10 && dy <= Math.max(55, dx * .9)) resetMotionResidue();
    }, {capture:true, passive:true});

    document.addEventListener('touchend', function(e){
      if(!edgeTouch || !isChatting()){
        edgeTouch = null;
        resetMotionResidue();
        return;
      }
      var touch = e.changedTouches && e.changedTouches[0];
      if(!touch){ edgeTouch = null; resetMotionResidue(); return; }
      var dx = touch.clientX - edgeTouch.x;
      var dy = Math.abs(touch.clientY - edgeTouch.y);
      var elapsed = Date.now() - edgeTouch.at;
      edgeTouch = null;
      resetMotionResidue();
      if(dx >= 72 && dy <= 55 && elapsed <= 900){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        closeChatToList();
      }
    }, {capture:true, passive:false});

    document.addEventListener('touchcancel', function(){
      edgeTouch = null;
      resetMotionResidue();
    }, {capture:true, passive:true});
  }

  function boot(){
    bindBackOverride();
    var observer = new MutationObserver(scheduleWatchChatOpen);
    observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
    setInterval(function(){ if(isChatting() || wasChatting) watchChatOpen(); }, 1500);
    watchChatOpen();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
