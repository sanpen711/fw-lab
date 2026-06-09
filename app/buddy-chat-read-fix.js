// F.w 研究所：手机端私聊实时已读修正
// 作用：用户停留在某个搭子的私聊页时，实时收到的新消息自动视为已读；返回消息列表不再误显示红点。
(function(){
  if(window.__FW_MOBILE_BUDDY_CHAT_READ_FIX__) return;
  window.__FW_MOBILE_BUDDY_CHAT_READ_FIX__ = true;

  var activeTargetId = '';
  var readTimer = 0;
  var observerReady = false;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function client(){ return window.fwDb && window.fwDb.client; }

  function currentUser(){
    var fw = window.FWApp || null;
    return fw && fw.state && fw.state.user || null;
  }

  function userKey(){
    var user = currentUser();
    return 'fw_mobile_buddy_read:' + (user && user.id || 'guest');
  }

  function readMap(){
    try{ return JSON.parse(localStorage.getItem(userKey()) || '{}') || {}; }
    catch(e){ return {}; }
  }

  function saveReadMap(map){
    try{ localStorage.setItem(userKey(), JSON.stringify(map || {})); }catch(e){}
  }

  function isBuddyChatting(){
    var view = $('[data-app-view="buddy"]');
    return !!(view && view.classList.contains('is-chatting'));
  }

  async function markLatestReadDirect(targetId){
    var me = currentUser();
    var c = client();
    if(!targetId || !me || !me.id || !c) return;
    try{
      var conv = await c.rpc('fw_get_or_create_conversation', {target_user_id:targetId});
      if(conv && conv.error) throw conv.error;
      var convId = Number(conv && conv.data);
      if(!Number.isFinite(convId) || convId <= 0) return;
      var rows = await c
        .from('private_messages')
        .select('id,created_at,sender_id,is_deleted')
        .eq('conversation_id', convId)
        .eq('is_deleted', false)
        .order('created_at', {ascending:false})
        .limit(1);
      if(rows && rows.error) throw rows.error;
      var latest = rows && rows.data && rows.data[0];
      if(latest){
        var map = readMap();
        map[targetId] = String(latest.id || latest.created_at || '');
        saveReadMap(map);
      }
      var notice = await c
        .from('notifications')
        .update({is_read:true})
        .eq('user_id', me.id)
        .eq('actor_id', targetId)
        .eq('type', 'private_message')
        .eq('is_read', false);
      if(notice && notice.error) throw notice.error;
      if(window.FWAppBuddyUnread && typeof window.FWAppBuddyUnread.apply === 'function') window.FWAppBuddyUnread.apply();
      if(window.FWAppEcho && typeof window.FWAppEcho.refreshBadges === 'function') window.FWAppEcho.refreshBadges();
    }catch(e){
      console.warn('[FW mobile app] direct chat read failed', e);
      if(window.FWAppBuddyUnread && typeof window.FWAppBuddyUnread.markRead === 'function'){
        window.FWAppBuddyUnread.markRead(targetId);
      }
    }
  }

  function requestMarkRead(delay, allowAfterBack){
    clearTimeout(readTimer);
    var targetId = activeTargetId;
    readTimer = setTimeout(function(){
      if(!targetId) return;
      if(!allowAfterBack && !isBuddyChatting()) return;
      markLatestReadDirect(targetId);
    }, delay == null ? 350 : delay);
  }

  function bindClicks(){
    document.addEventListener('click', function(event){
      var opener = event.target.closest && event.target.closest('[data-buddy-open-chat]');
      if(opener){
        activeTargetId = opener.getAttribute('data-buddy-open-chat') || '';
        requestMarkRead(1000, false);
        requestMarkRead(2200, false);
        return;
      }
      var back = event.target.closest && event.target.closest('[data-buddy-chat-back]');
      if(back){
        // 返回前用当前会话最新消息 ID 写入已读；不依赖消息列表上的旧 last-message-id。
        requestMarkRead(0, true);
        setTimeout(function(){ activeTargetId = ''; }, 650);
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
      if(activeTargetId && isBuddyChatting()) requestMarkRead(450, false);
    });
    observer.observe(box, {childList:true, subtree:true});
  }

  function boot(){
    bindClicks();
    observeChatBox();
    // 兜底检查降频，主要依赖消息区变化触发，减少聊天过程中的重复查询/写入。
    setInterval(function(){
      if(activeTargetId && isBuddyChatting()) requestMarkRead(0, false);
    }, 9000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
