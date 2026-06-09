// F.w 研究所：手机端私聊实时已读修正
// 作用：用户停留在某个搭子的私聊页时，实时收到的新消息自动视为已读；返回消息列表不再误显示红点。
(function(){
  if(window.__FW_MOBILE_BUDDY_CHAT_READ_FIX__) return;
  window.__FW_MOBILE_BUDDY_CHAT_READ_FIX__ = true;

  var activeTargetId = '';
  var readTimer = 0;
  var observerReady = false;

  function $(selector, root){ return (root || document).querySelector(selector); }

  function isBuddyChatting(){
    var view = $('[data-app-view="buddy"]');
    return !!(view && view.classList.contains('is-chatting'));
  }

  function requestMarkRead(delay){
    clearTimeout(readTimer);
    readTimer = setTimeout(function(){
      if(!activeTargetId || !isBuddyChatting()) return;
      if(window.FWAppBuddyUnread && typeof window.FWAppBuddyUnread.markRead === 'function'){
        window.FWAppBuddyUnread.markRead(activeTargetId);
      }
    }, delay == null ? 350 : delay);
  }

  function bindClicks(){
    document.addEventListener('click', function(event){
      var opener = event.target.closest && event.target.closest('[data-buddy-open-chat]');
      if(opener){
        activeTargetId = opener.getAttribute('data-buddy-open-chat') || '';
        requestMarkRead(1000);
        requestMarkRead(2200);
        return;
      }
      var back = event.target.closest && event.target.closest('[data-buddy-chat-back]');
      if(back){
        requestMarkRead(0);
        setTimeout(function(){ activeTargetId = ''; }, 500);
      }
    }, true);
  }

  function observeChatBox(){
    if(observerReady) return;
    var box = $('[data-buddy-chat-messages]');
    if(!box){ setTimeout(observeChatBox, 700); return; }
    observerReady = true;
    var observer = new MutationObserver(function(){
      // 消息区真的新增/更新时才快速标记已读；避免一直轮询写已读。
      if(activeTargetId && isBuddyChatting()) requestMarkRead(450);
    });
    observer.observe(box, {childList:true, subtree:true});
  }

  function boot(){
    bindClicks();
    observeChatBox();
    // 兜底检查降频，主要依赖消息区变化触发，减少聊天过程中的重复查询/写入。
    setInterval(function(){
      if(activeTargetId && isBuddyChatting()) requestMarkRead(0);
    }, 9000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
