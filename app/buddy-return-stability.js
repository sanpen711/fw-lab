// F.w 研究所：搭子私聊返回稳定补丁
// 作用：避免搭子历史聊天返回时卡住，或被旧返回来源误带到精神广场。
(function(){
  if(window.__FW_BUDDY_RETURN_STABILITY__) return;
  window.__FW_BUDDY_RETURN_STABILITY__ = true;

  var FEED_RETURN_KEY = 'fw_mobile_feed_detail_return_view';
  var OLD_ECHO_RETURN_KEY = 'fw_mobile_echo_detail_return';
  var patched = false;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function app(){ return window.FWApp || null; }

  function isBuddyChatting(){
    var view = $('[data-app-view="buddy"]');
    return !!((view && view.classList && view.classList.contains('is-chatting')) || (document.body && document.body.classList && document.body.classList.contains('fw-buddy-chatting')));
  }

  function clearFeedReturnSource(){
    try{
      sessionStorage.removeItem(FEED_RETURN_KEY);
      sessionStorage.removeItem(OLD_ECHO_RETURN_KEY);
    }catch(e){}
  }

  function forceBuddyView(){
    var fw = app();
    if(fw && fw.state && fw.state.view !== 'buddy'){
      try{
        if(typeof fw.openView === 'function') fw.openView('buddy', {updateHash:false});
        else if(typeof fw.setView === 'function') fw.setView('buddy');
      }catch(e){}
    }
  }

  function enforceBuddyList(){
    var view = $('[data-app-view="buddy"]');
    if(view) view.classList.remove('is-chatting');
    if(document.body && document.body.classList) document.body.classList.remove('fw-buddy-chatting');
    forceBuddyView();
    if(window.FWAppBuddy && typeof window.FWAppBuddy.renderMessages === 'function'){
      try{ window.FWAppBuddy.renderMessages(); }catch(e){}
    }
  }

  function stableClose(clearTarget){
    var buddyWasChatting = isBuddyChatting();
    clearFeedReturnSource();
    forceBuddyView();
    var api = window.FWAppBuddy;
    if(api && api.__fwOriginalCloseChat){
      try{ api.__fwOriginalCloseChat(clearTarget !== false); }catch(e){}
    }
    enforceBuddyList();
    if(buddyWasChatting){
      setTimeout(enforceBuddyList, 80);
      setTimeout(enforceBuddyList, 260);
    }
    return true;
  }

  function patchBuddyApi(){
    var api = window.FWAppBuddy;
    if(!api || patched || typeof api.closeChat !== 'function') return false;
    api.__fwOriginalCloseChat = api.closeChat;
    api.closeChat = function(clearTarget){
      return stableClose(clearTarget !== false);
    };
    api.closeChatStable = stableClose;
    patched = true;
    return true;
  }

  function schedulePatch(){
    if(patchBuddyApi()) return;
    [0, 80, 240, 700, 1500, 3000].forEach(function(delay){ setTimeout(patchBuddyApi, delay); });
  }

  function bindBackButton(){
    document.addEventListener('click', function(event){
      var target = event.target;
      var back = target && target.closest && target.closest('[data-buddy-chat-back]');
      if(!back || !isBuddyChatting()) return;
      event.preventDefault();
      event.stopPropagation();
      if(event.stopImmediatePropagation) event.stopImmediatePropagation();
      patchBuddyApi();
      stableClose(true);
    }, true);
  }

  function bindLifecycleGuard(){
    document.addEventListener('visibilitychange', function(){
      if(document.hidden) return;
      if(isBuddyChatting() && app() && app().state && app().state.view !== 'buddy'){
        stableClose(true);
      }
    });
  }

  function boot(){
    schedulePatch();
    bindBackButton();
    bindLifecycleGuard();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
