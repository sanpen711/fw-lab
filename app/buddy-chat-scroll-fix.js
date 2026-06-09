// F.w 研究所：手机端搭子私聊滚动位置保护
(function(){
  if(window.__FW_MOBILE_BUDDY_CHAT_SCROLL_FIX__) return;
  window.__FW_MOBILE_BUDDY_CHAT_SCROLL_FIX__ = true;

  var box = null;
  var observer = null;
  var userReadingHistory = false;
  var preserveTop = 0;
  var preserveHeight = 0;
  var restoring = false;
  var lastUserScrollAt = 0;
  var pendingInstall = false;

  function $(selector, root){ return (root || document).querySelector(selector); }

  function isChatting(){ return document.body.classList.contains('fw-buddy-chatting'); }

  function getBox(){ return $('[data-buddy-chat-messages]'); }

  function distanceToBottom(el){
    if(!el) return 0;
    return el.scrollHeight - el.scrollTop - el.clientHeight;
  }

  function isNearBottom(el){ return distanceToBottom(el) <= 90; }

  function rememberPosition(el){
    if(!el) return;
    preserveTop = el.scrollTop;
    preserveHeight = el.scrollHeight;
  }

  function setReadingStateFromUser(el){
    if(!el || !isChatting()) return;
    lastUserScrollAt = Date.now();
    userReadingHistory = !isNearBottom(el);
    rememberPosition(el);
  }

  function restorePositionAfterRender(){
    var el = getBox();
    if(!el || !isChatting()) return;

    var shouldPreserve = userReadingHistory && preserveHeight > 0;
    if(!shouldPreserve) return;

    var nextTop = preserveTop + Math.max(0, el.scrollHeight - preserveHeight);
    nextTop = Math.max(0, Math.min(nextTop, Math.max(0, el.scrollHeight - el.clientHeight)));

    restoring = true;
    el.scrollTop = nextTop;
    requestAnimationFrame(function(){
      el.scrollTop = nextTop;
      setTimeout(function(){
        el.scrollTop = nextTop;
        restoring = false;
        rememberPosition(el);
      }, 0);
    });
  }

  function bindBox(el){
    if(!el || el.__fwBuddyScrollFixBound) return;
    el.__fwBuddyScrollFixBound = true;

    el.addEventListener('touchstart', function(){
      if(!isChatting()) return;
      rememberPosition(el);
    }, {passive:true});

    el.addEventListener('touchmove', function(){
      if(!isChatting()) return;
      setReadingStateFromUser(el);
    }, {passive:true});

    el.addEventListener('wheel', function(){
      if(!isChatting()) return;
      setReadingStateFromUser(el);
    }, {passive:true});

    el.addEventListener('scroll', function(){
      if(!isChatting() || restoring) return;
      // 只把用户最近操作后的滚动当成阅读状态；自动刷新造成的滚动不立即覆盖保存位置。
      if(Date.now() - lastUserScrollAt < 1200){
        userReadingHistory = !isNearBottom(el);
        rememberPosition(el);
      }else if(isNearBottom(el)){
        userReadingHistory = false;
        rememberPosition(el);
      }
    }, {passive:true});
  }

  function observeBox(el){
    if(!el) return;
    if(observer) observer.disconnect();
    observer = new MutationObserver(function(){
      if(!isChatting()) return;
      if(userReadingHistory){
        restorePositionAfterRender();
      }else if(isNearBottom(el)){
        // 用户本来就在底部附近，允许原逻辑继续贴底。
        rememberPosition(el);
      }
    });
    observer.observe(el, {childList:true, subtree:true});
  }

  function install(){
    var el = getBox();
    if(!el){ box = null; return; }
    if(el !== box){
      box = el;
      userReadingHistory = false;
      rememberPosition(el);
      bindBox(el);
      observeBox(el);
    }
  }

  function scheduleInstall(){
    if(pendingInstall) return;
    pendingInstall = true;
    requestAnimationFrame(function(){
      pendingInstall = false;
      install();
    });
  }

  function boot(){
    install();
    var bodyObserver = new MutationObserver(scheduleInstall);
    bodyObserver.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
    setInterval(function(){ if(isChatting() || box) install(); }, 2500);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
