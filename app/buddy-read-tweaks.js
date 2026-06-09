// F.w 研究所：手机端搭子消息列表与本地未读红点修正
// 只处理“搭子 → 消息”列表里的单个会话红点；底部导航栏搭子红点由 echo-enhance.js 统一控制。
(function(){
  if(window.__FW_MOBILE_BUDDY_READ_TWEAKS__) return;
  window.__FW_MOBILE_BUDDY_READ_TWEAKS__ = true;

  var rendering = false;
  var lastRenderKey = '';
  var renderTimer = 0;
  var badgeRefreshTimer = 0;

  function app(){ return window.FWApp || null; }
  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function client(){ return window.fwDb && window.fwDb.client; }
  function esc(value){
    var fw = app();
    if(fw && fw.esc) return fw.esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

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

  function fail(result, message){
    if(result && result.error) throw new Error(message || result.error.message || '读取失败');
    return result ? result.data : null;
  }

  function requestBadgeRefresh(delay){
    clearTimeout(badgeRefreshTimer);
    badgeRefreshTimer = setTimeout(function(){
      try{
        document.dispatchEvent(new CustomEvent('fw:buddy-unread-changed'));
      }catch(e){}
      if(window.FWAppEcho && typeof window.FWAppEcho.refreshBadges === 'function'){
        window.FWAppEcho.refreshBadges();
      }
    }, delay == null ? 120 : delay);
  }

  function otherId(row, meId){
    return String(row.requester_id) === String(meId) ? row.receiver_id : row.requester_id;
  }

  function messageSignature(row){
    if(!row) return '';
    return row.getAttribute('data-buddy-last-message-id') || row.getAttribute('data-buddy-last-message-at') || '';
  }

  async function getAcceptedFriendships(meId){
    return fail(
      await client()
        .from('friendships')
        .select('id,requester_id,receiver_id,status,updated_at')
        .or('requester_id.eq.' + meId + ',receiver_id.eq.' + meId)
        .eq('status', 'accepted'),
      '搭子列表读取失败'
    ) || [];
  }

  async function getProfiles(ids){
    var unique = Array.from(new Set((ids || []).filter(Boolean)));
    if(!unique.length) return {};
    var rows = fail(await client().from('profiles').select('id,nickname,avatar_url,lab_code').in('id', unique), '资料读取失败') || [];
    var map = {};
    rows.forEach(function(row){ map[row.id] = row; });
    return map;
  }

  async function getConversationMap(buddyIds){
    var map = {};
    await Promise.all((buddyIds || []).map(async function(userId){
      try{
        var result = await client().rpc('fw_get_or_create_conversation', {target_user_id:userId});
        if(result && result.error) throw result.error;
        var convId = Number(result && result.data);
        if(Number.isFinite(convId) && convId > 0) map[convId] = userId;
      }catch(e){
        console.warn('[FW mobile app] buddy conversation lookup failed', userId, e);
      }
    }));
    return map;
  }

  async function getLatestBuddyMessages(me){
    var friendships = await getAcceptedFriendships(me.id);
    var buddyIds = friendships.map(function(row){ return otherId(row, me.id); }).filter(Boolean);
    if(!buddyIds.length) return {items:[], profiles:{}};

    var profiles = await getProfiles(buddyIds);
    var conversationMap = await getConversationMap(buddyIds);
    var convIds = Object.keys(conversationMap).map(function(id){ return Number(id); }).filter(function(id){ return Number.isFinite(id) && id > 0; });
    if(!convIds.length) return {items:[], profiles:profiles};

    var messages = fail(
      await client()
        .from('private_messages')
        .select('id,conversation_id,sender_id,content,is_deleted,created_at')
        .in('conversation_id', convIds)
        .eq('is_deleted', false)
        .order('created_at', {ascending:false})
        .limit(Math.max(120, convIds.length * 6)),
      '消息读取失败'
    ) || [];

    var latestByBuddy = {};
    messages.forEach(function(msg){
      var userId = conversationMap[msg.conversation_id];
      if(!userId || latestByBuddy[userId]) return;
      latestByBuddy[userId] = {
        id:msg.id,
        userId:userId,
        sender_id:msg.sender_id,
        content:msg.content || '',
        created_at:msg.created_at,
        profile:profiles[userId] || {}
      };
    });

    return {
      items:Object.keys(latestByBuddy).map(function(userId){ return latestByBuddy[userId]; }).sort(function(a,b){ return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); }),
      profiles:profiles
    };
  }

  async function hasUnreadPrivateMessage(){
    var me = currentUser();
    if(!me || !me.id || !client()) return false;
    try{
      var latest = await getLatestBuddyMessages(me);
      var map = readMap();
      return latest.items.some(function(item){
        return item && item.sender_id && item.sender_id !== me.id && map[item.userId] !== String(item.id || item.created_at || '');
      });
    }catch(e){
      console.warn('[FW mobile app] buddy unread check failed', e);
      return false;
    }
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
      var rows = fail(
        await c
          .from('private_messages')
          .select('id,conversation_id,sender_id,is_deleted,created_at')
          .eq('conversation_id', convId)
          .eq('is_deleted', false)
          .order('created_at', {ascending:false})
          .limit(1),
        '消息读取失败'
      ) || [];
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
      var result = await c
        .from('notifications')
        .update({is_read:true})
        .eq('user_id', me.id)
        .eq('actor_id', userId)
        .eq('type', 'private_message')
        .eq('is_read', false);
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

  function scheduleMarkReadAfterChatOpen(userId){
    if(!userId) return;
    setTimeout(function(){
      var view = $('[data-app-view="buddy"]');
      if(view && view.classList.contains('is-chatting')) markReadByUserId(userId);
    }, 850);
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

  function isBuddyMessagesView(){
    var fw = app();
    if(!fw || !fw.state || fw.state.view !== 'buddy') return false;
    var view = $('[data-app-view="buddy"]');
    if(!view || view.classList.contains('is-chatting') || view.classList.contains('is-profile')) return false;
    var active = $('[data-buddy-tab].active');
    return !!(active && active.dataset.buddyTab === 'messages');
  }

  function timeText(value){
    if(!value) return '刚刚';
    var date = new Date(value);
    if(isNaN(date.getTime())) return '刚刚';
    var minutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60000);
    if(minutes < 1) return '刚刚';
    if(minutes < 60) return minutes + '分钟前';
    var hours = Math.floor(minutes / 60);
    if(hours < 24) return hours + '小时前';
    var days = Math.floor(hours / 24);
    return days < 7 ? days + '天前' : date.toLocaleDateString('zh-CN');
  }

  function avatar(profile){
    profile = profile || {};
    var fw = app();
    var name = profile.nickname || '研究员';
    if(profile.avatar_url) return '<span class="list-avatar"><img src="' + esc(profile.avatar_url) + '" alt="' + esc(name) + '"></span>';
    return '<span class="list-avatar">' + esc(fw && fw.initials ? fw.initials(name) : String(name).slice(0, 2)) + '</span>';
  }

  function messageRowHtml(item, meId){
    var profile = item.profile || {};
    var snippet = item.content || '[消息]';
    var unread = item.sender_id && item.sender_id !== meId;
    return '<article class="list-item buddy-row buddy-message-row is-clickable" data-buddy-open-chat="' + esc(item.userId) + '" data-buddy-last-message-id="' + esc(item.id) + '" data-buddy-last-message-at="' + esc(item.created_at) + '" data-buddy-last-sender="' + esc(item.sender_id || '') + '"><span class="buddy-avatar-wrap">' + avatar(profile) + '<i class="buddy-dot" ' + (unread ? '' : 'hidden') + ' aria-hidden="true"></i></span><div class="list-main"><b>' + esc(profile.nickname || '低功耗搭子') + '</b><span class="buddy-message-snippet">' + esc(item.sender_id === meId ? '我：' + snippet : snippet) + '</span><span class="buddy-message-time">' + esc(timeText(item.created_at)) + '</span></div></article>';
  }

  async function renderAccurateMessages(){
    if(rendering || !isBuddyMessagesView()) return;
    var me = currentUser();
    var list = $('[data-buddy-list]');
    if(!me || !list || !client()) return;
    rendering = true;
    try{
      var latest = await getLatestBuddyMessages(me);
      if(!latest.items.length){
        list.innerHTML = '<div class="empty">暂时还没有搭子消息。</div>';
        requestBadgeRefresh(150);
        return;
      }
      var key = latest.items.map(function(item){ return [item.userId, item.id, item.created_at, item.sender_id].join(':'); }).join('|');
      if(key !== lastRenderKey || !$('.buddy-message-row', list)){
        lastRenderKey = key;
        list.innerHTML = latest.items.map(function(item){ return messageRowHtml(item, me.id); }).join('');
      }
      applyUnreadDots();
    }catch(e){
      console.warn('[FW mobile app] accurate buddy messages failed', e);
      if(list && isBuddyMessagesView()) list.innerHTML = '<div class="error">搭子消息暂时读取失败，请稍后再试。</div>';
    }finally{
      rendering = false;
    }
  }

  function scheduleRender(delay){
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderAccurateMessages, delay == null ? 140 : delay);
  }

  function observeBuddyList(){
    var list = $('[data-buddy-list]');
    if(!list || list.__fwBuddyReadObserver) return;
    list.__fwBuddyReadObserver = true;
    var observer = new MutationObserver(function(){
      window.requestAnimationFrame(function(){
        applyUnreadDots();
        if(isBuddyMessagesView()) scheduleRender(180);
      });
    });
    observer.observe(list, {childList:true, subtree:true});
  }

  function boot(){
    injectStyle();
    observeBuddyList();
    scheduleRender(500);
    document.addEventListener('click', function(e){
      var chat = e.target.closest && e.target.closest('[data-buddy-open-chat]');
      if(chat){
        scheduleMarkReadAfterChatOpen(chat.getAttribute('data-buddy-open-chat'));
        setTimeout(applyUnreadDots, 120);
        return;
      }
      var tab = e.target.closest && e.target.closest('[data-buddy-tab]');
      if(tab && tab.dataset.buddyTab === 'messages') scheduleRender(220);
    }, true);
    window.addEventListener('focus', function(){ setTimeout(function(){ applyUnreadDots(); scheduleRender(150); requestBadgeRefresh(220); }, 150); });
    document.addEventListener('visibilitychange', function(){ if(!document.hidden){ scheduleRender(150); requestBadgeRefresh(260); } });
    setInterval(function(){ observeBuddyList(); applyUnreadDots(); if(isBuddyMessagesView()) scheduleRender(0); }, 7500);
  }

  window.FWAppBuddyUnread = {apply:applyUnreadDots, refresh:scheduleRender, markRead:markReadByUserId, hasUnread:hasUnreadPrivateMessage, requestBadgeRefresh:requestBadgeRefresh};

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
