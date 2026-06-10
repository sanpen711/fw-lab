// F.w 研究所：手机端搭子消息已读/红点修正
// 搭子未读、搭子申请和搭子底部红点由本文件自己管理；不再依赖回声模块。
(function(){
  if(window.__FW_MOBILE_BUDDY_READ_TWEAKS__) return;
  window.__FW_MOBILE_BUDDY_READ_TWEAKS__ = true;

  var badgeRefreshTimer = 0;

  function app(){ return window.FWApp || null; }
  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function client(){ return window.fwDb && window.fwDb.client; }
  function currentUser(){ var fw = app(); return fw && fw.state && fw.state.user || null; }
  function fail(result, message){ if(result && result.error) throw new Error(message || result.error.message || '读取失败'); return result ? result.data : null; }

  function userKey(){ var user = currentUser(); return 'fw_mobile_buddy_read:' + (user && user.id || 'guest'); }
  function readMap(){ try{ return JSON.parse(localStorage.getItem(userKey()) || '{}') || {}; }catch(e){ return {}; } }
  function saveReadMap(map){ try{ localStorage.setItem(userKey(), JSON.stringify(map || {})); }catch(e){} }

  function setBuddyBadge(count){
    var button = $('[data-app-nav="buddy"]');
    if(!button) return;
    var badge = button.querySelector('.mobile-buddy-badge');
    if(!badge){
      badge = document.createElement('span');
      badge.className = 'mobile-buddy-badge';
      badge.setAttribute('aria-hidden', 'true');
      button.appendChild(badge);
    }
    if(Number(count || 0) > 0){
      badge.classList.add('show');
      button.classList.add('has-mobile-buddy-badge');
    }else{
      badge.classList.remove('show');
      button.classList.remove('has-mobile-buddy-badge');
    }
  }

  async function refreshBuddyBadge(){
    var me = currentUser();
    var c = client();
    if(!me || !me.id || !c){ setBuddyBadge(0); return false; }
    var hasDomUnread = $$('.buddy-message-row .buddy-dot:not([hidden])').length > 0;
    try{
      var rows = fail(await c.from('notifications').select('id,type').eq('user_id', me.id).eq('is_read', false).in('type', ['private_message','friend_request','friend_accept']).limit(100), '搭子通知读取失败') || [];
      var pending = await c.from('friendships').select('id', {count:'exact', head:true}).eq('receiver_id', me.id).eq('status', 'pending');
      var pendingCount = pending && !pending.error ? (pending.count || 0) : 0;
      var hasBadge = hasDomUnread || rows.length > 0 || pendingCount > 0;
      setBuddyBadge(hasBadge ? 1 : 0);
      return hasBadge;
    }catch(e){
      console.warn('[FW mobile app] buddy badge refresh failed', e);
      setBuddyBadge(hasDomUnread ? 1 : 0);
      return hasDomUnread;
    }
  }

  function requestBadgeRefresh(delay){
    clearTimeout(badgeRefreshTimer);
    badgeRefreshTimer = setTimeout(function(){
      try{ document.dispatchEvent(new CustomEvent('fw:buddy-unread-changed')); }catch(e){}
      refreshBuddyBadge();
    }, delay == null ? 120 : delay);
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
    }catch(e){ console.warn('[FW mobile app] mark latest buddy message read failed', e); }
  }

  async function markPrivateNoticeRead(userId){
    var me = currentUser();
    var c = client();
    if(!userId || !me || !me.id || !c) return;
    try{
      var result = await c.from('notifications').update({is_read:true}).eq('user_id', me.id).eq('actor_id', userId).eq('type', 'private_message').eq('is_read', false);
      if(result && result.error) throw result.error;
      requestBadgeRefresh(150);
    }catch(e){ console.warn('[FW mobile app] mark private notice read failed', e); }
  }

  function markReadByRow(row){
    if(!row) return;
    var userId = row.getAttribute('data-buddy-open-chat') || '';
    var sig = messageSignature(row);
    if(!userId) return;
    if(sig){ var map = readMap(); map[userId] = sig; saveReadMap(map); }
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
    else requestBadgeRefresh(220);
  }

  async function hasUnreadPrivateMessage(){
    var me = currentUser();
    if(!me || !me.id || !client()) return false;
    applyUnreadDots();
    if($$('.buddy-message-row .buddy-dot:not([hidden])').length > 0) return true;
    return await refreshBuddyBadge();
  }

  function injectStyle(){
    if(document.getElementById('fwMobileBuddyReadTweaksStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileBuddyReadTweaksStyle';
    style.textContent = [
      '[data-app-view="buddy"] > .tabs{background:transparent!important;box-shadow:none!important;padding-top:0!important;padding-bottom:10px!important}',
      '[data-app-view="buddy"] > .tabs:before,[data-app-view="buddy"] > .tabs:after{display:none!important;content:none!important}',
      '.buddy-dot[hidden]{display:none!important}',
      '.app-tabbar button{position:relative}',
      '[data-app-nav="buddy"] .mobile-buddy-badge{position:absolute;right:22px;top:6px;width:13px;min-width:13px;height:13px;padding:0;border-radius:999px;background:#d95353;border:2px solid #10170f;display:none;box-shadow:0 4px 12px rgba(0,0,0,.22);box-sizing:border-box}',
      '[data-app-nav="buddy"] .mobile-buddy-badge.show{display:block}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function boot(){
    injectStyle();
    document.addEventListener('click', function(e){
      var chat = e.target.closest && e.target.closest('[data-buddy-open-chat]');
      if(chat){
        var userId = chat.getAttribute('data-buddy-open-chat') || '';
        setTimeout(function(){ var view = $('[data-app-view="buddy"]'); if(view && view.classList.contains('is-chatting')) markReadByUserId(userId); }, 850);
        setTimeout(applyUnreadDots, 120);
        return;
      }
      var tab = e.target.closest && e.target.closest('[data-buddy-tab]');
      if(tab && tab.dataset.buddyTab === 'messages') setTimeout(applyUnreadDots, 220);
    }, true);
    window.addEventListener('focus', function(){ setTimeout(function(){ applyUnreadDots(); requestBadgeRefresh(220); }, 150); });
    document.addEventListener('visibilitychange', function(){ if(!document.hidden){ setTimeout(applyUnreadDots, 150); requestBadgeRefresh(260); } });
    setInterval(applyUnreadDots, 7500);
    refreshBuddyBadge();
  }

  window.FWAppBuddyUnread = {apply:applyUnreadDots, refresh:applyUnreadDots, refreshBadge:refreshBuddyBadge, markRead:markReadByUserId, hasUnread:hasUnreadPrivateMessage, requestBadgeRefresh:requestBadgeRefresh};
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
