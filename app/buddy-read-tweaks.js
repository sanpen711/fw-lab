// F.w 研究所：手机端搭子消息已读/红点修正
// 现在消息列表由 app/buddy.js 主逻辑按会话渲染；本文件只负责单行红点、已读记录和底部 badge 刷新。
(function(){
  if(window.__FW_MOBILE_BUDDY_READ_TWEAKS__) return;
  window.__FW_MOBILE_BUDDY_READ_TWEAKS__ = true;

  var badgeRefreshTimer = 0;

  function app(){ return window.FWApp || null; }
  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function client(){ return window.fwDb && window.fwDb.client; }

  function currentUser(){
    var fw = app();
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

  function requestBadgeRefresh(delay){
    clearTimeout(badgeRefreshTimer);
    badgeRefreshTimer = setTimeout(function(){
      try{ document.dispatchEvent(new CustomEvent('fw:buddy-unread-changed')); }catch(e){}
      if(window.FWAppEcho && typeof window.FWAppEcho.refreshBadges === 'function') window.FWAppEcho.refreshBadges();
    }, delay == null ? 120 : delay);
  }

  function fail(result, message){
    if(result && result.error) throw new Error(message || result.error.message || '读取失败');
    return result ? result.data : null;
  }

  function messageSignature(row){
    if(!row) return '';
    return row.getAttribute('data-buddy-last-message-id') || row.getAttribute('data-buddy-last-message-at') || '';
  }

  async function markLatestMessageReadForUser(userId){
    var me = currentUser();
    var c = client();
    if(!me || !me.id || !userId || !c) return;
    try{
      var conv = await c.rpc('fw_get_or_create_conversation', {target_user_id:userId});
      if(conv && conv.error) throw conv.error;
      var convId = Number(conv && conv.data);
      if(!Number.isFinite(convId) || convId <= 0) return;
      var rows = fail(await c.from('private_messages').select('id,conversation_id,sender_id,is_deleted,created_at').eq('conversation_id', convId).eq('is_deleted', false).order('created_at', {ascending:false}).limit(1), '消息读取失败') || [];
      var latest = rows[0];
      if(latest){
        var map = readMap();
        map[userId] = String(latest.id || latest.created_at || '');
        saveReadMap(map);
      }
    }catch(e){
      console.warn('[FW mobile app] mark latest buddy message read failed', e);
    }
  }

  async function markPrivateNoticeRead(userId){
    var me = currentUser();
    var c = client();
    if(!userId || !me || !me.id || !c) return;
    try{
      var result = await c.from('notifications').update({is_read:true}).eq('user_id', me.id).eq('actor_id', userId).eq('type', 'private_message').eq('is_read', false);
      if(result && result.error) throw result.error;
      requestBadgeRefresh(150);
    }catch(e){
      console.warn('[FW mobile app] mark private notice read failed', e);
    }
  }

  function markReadByRow(row){
    if(!row) return;
    var userId = row.getAttribute('data-buddy-open-chat') || '';
    var sig = messageSignature(row);
    if(!userId) return;
    if(sig){
      var map = readMap();
      map[userId] = sig;
      saveReadMap(map);
    }
    var dot = $('.buddy-dot', row);
    if(dot) dot.hidden = true;
    markPrivateNoticeRead(userId);
    requestBadgeRefresh(180);
  }

  async function markReadByUserId(userId){
    if(!userId) return;
    var row = $('[data-buddy-open-chat="' + String(userId).replace(/"/g, '\\"') + '"].buddy-message-row');
    if(row) markReadByRow(row);
    else{
      await markLatestMessageReadForUser(userId);
      await markPrivateNoticeRead(userId);
      requestBadgeRefresh(180);
    }
  }

  function applyUnreadDots(){
    var me = currentUser();
    var meId = me && me.id;
    var map = readMap();
    var hasUnread = false;
    $$('.buddy-message-row[data-buddy-open-chat]').forEach(function(row){
      var userId = row.getAttribute('data-buddy-open-chat') || '';
      var dot = $('.buddy-dot', row);
      if(!dot || !userId) return;
      var sig = messageSignature(row);
      var sender = row.getAttribute('data-buddy-last-sender') || '';
      var unread = !!(sig && sender !== meId && map[userId] !== sig);
      dot.hidden = !unread;
      if(unread) hasUnread = true;
    });
    if(hasUnread) requestBadgeRefresh(80);
  }

  async function hasUnreadPrivateMessage(){
    var me = currentUser();
    if(!me || !me.id || !client()) return false;
    applyUnreadDots();
    return $$('.buddy-message-row .buddy-dot:not([hidden])').length > 0;
  }

  function injectStyle(){
    if(document.getElementById('fwMobileBuddyReadTweaksStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileBuddyReadTweaksStyle';
    style.textContent = [
      '[data-app-view="buddy"] > .tabs{background:transparent!important;box-shadow:none!important;padding-top:0!important;padding-bottom:10px!important}',
      '[data-app-view="buddy"] > .tabs:before,[data-app-view="buddy"] > .tabs:after{display:none!important;content:none!important}',
      '.buddy-dot[hidden]{display:none!important}',
      '[data-app-nav="buddy"] .mobile-echo-badge{font-size:0!important;line-height:0!important;color:transparent!important;overflow:hidden!important}',
      '[data-app-nav="buddy"] .mobile-echo-badge::before{content:""!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function boot(){
    injectStyle();
    document.addEventListener('click', function(e){
      var chat = e.target.closest && e.target.closest('[data-buddy-open-chat]');
      if(chat){
        var userId = chat.getAttribute('data-buddy-open-chat') || '';
        setTimeout(function(){
          var view = $('[data-app-view="buddy"]');
          if(view && view.classList.contains('is-chatting')) markReadByUserId(userId);
        }, 850);
        setTimeout(applyUnreadDots, 120);
        return;
      }
      var tab = e.target.closest && e.target.closest('[data-buddy-tab]');
      if(tab && tab.dataset.buddyTab === 'messages') setTimeout(applyUnreadDots, 220);
    }, true);
    window.addEventListener('focus', function(){ setTimeout(function(){ applyUnreadDots(); requestBadgeRefresh(220); }, 150); });
    document.addEventListener('visibilitychange', function(){ if(!document.hidden){ setTimeout(applyUnreadDots, 150); requestBadgeRefresh(260); } });
    setInterval(applyUnreadDots, 7500);
  }

  window.FWAppBuddyUnread = {apply:applyUnreadDots, refresh:applyUnreadDots, markRead:markReadByUserId, hasUnread:hasUnreadPrivateMessage, requestBadgeRefresh:requestBadgeRefresh};

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
