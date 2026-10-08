// F.w 研究所：私聊 IndexedDB 离线缓存桥接
// 作用：把现有私聊 localStorage 缓存同步到 IndexedDB，并在弱网/离线时先展示最近聊天。
(function(){
  if(window.__FW_MOBILE_CHAT_IDB_BRIDGE__) return;
  window.__FW_MOBILE_CHAT_IDB_BRIDGE__ = true;

  var CHAT_PREFIX = 'fw_mobile_buddy_chat_cache:';
  var SYNC_DELAY = 520;
  var syncTimer = 0;
  var patched = false;

  function app(){ return window.FWApp || null; }
  function cache(){ return window.FWMobileDataCache || null; }
  function $(selector, root){ return (root || document).querySelector(selector); }
  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function currentUserId(){
    var fw = app();
    var user = fw && fw.state && fw.state.user;
    return user && user.id ? String(user.id) : 'guest';
  }
  function chatKey(targetId){ return CHAT_PREFIX + currentUserId() + ':' + String(targetId || ''); }
  function isStickerPayload(text){ return /^\[\[FW_USER_STICKER:[A-Za-z0-9+/=]+\]\]$/.test(String(text || '').trim()); }
  function messageText(text){ return isStickerPayload(text) ? '动画表情' : String(text || ''); }

  function readLegacy(targetId){
    try{
      if(!window.localStorage) return [];
      var row = JSON.parse(localStorage.getItem(chatKey(targetId)) || '{}');
      return Array.isArray(row.rows) ? row.rows : [];
    }catch(e){ return []; }
  }

  function parseLegacyKey(key){
    if(!key || key.indexOf(CHAT_PREFIX) !== 0) return null;
    var rest = key.slice(CHAT_PREFIX.length).split(':');
    var meId = rest.shift() || 'guest';
    var targetId = rest.join(':');
    return targetId ? {meId:meId, targetId:targetId} : null;
  }

  function syncLegacyChats(){
    var api = cache();
    if(!api || typeof api.setChat !== 'function' || !window.localStorage) return;
    try{
      for(var i = 0; i < localStorage.length; i += 1){
        var key = localStorage.key(i);
        var info = parseLegacyKey(key);
        if(!info) continue;
        var raw = JSON.parse(localStorage.getItem(key) || '{}');
        var rows = Array.isArray(raw.rows) ? raw.rows : [];
        if(rows.length) api.setChat(info.meId, info.targetId, rows, {at:Number(raw.updated_at || raw.at || Date.now())});
      }
    }catch(e){}
  }

  function syncSoon(){
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncLegacyChats, SYNC_DELAY);
  }

  // Core owns the chat shell. An asynchronous cache may only fill the same
  // open session, before its first server snapshot has arrived.
  function showCached(targetId){
    var buddy=window.FWAppBuddy,api=cache(),uid=currentUserId();
    if(!buddy || !api || !api.getChat || uid==='guest' || readLegacy(targetId).length)return;
    var token=buddy.getChatGeneration();
    api.getChat(uid,targetId).then(function(data){
      var fw=app(),box=$('[data-buddy-chat-messages]'),view=$('[data-app-view="buddy"]');
      if(currentUserId()!==uid || buddy.getChatGeneration()!==token || buddy.getActiveTargetId()!==targetId
        || !fw || fw.state.view!=='buddy' || !view || !view.classList.contains('is-chatting')
        || !box || box.dataset.buddyServerGeneration===String(token) || !data || !Array.isArray(data.rows) || !data.rows.length)return;
      box.innerHTML=data.rows.map(function(row){
        var mine=String(row.sender_id)===uid;
        return '<div class="buddy-message'+(mine?' mine':'')+'"><div class="buddy-message-name">'+(mine?'你':'搭子')+'</div><div class="buddy-message-bubble">'+esc(row.content||'')+'</div></div>';
      }).join('');
      if(typeof window.fwRenderStickerMessages==='function')window.fwRenderStickerMessages();
      box.scrollTop=box.scrollHeight;
    }).catch(function(){});
  }
  function start(){
    document.addEventListener('fw:buddy-chat-opened',function(event){showCached(event.detail.targetId);syncSoon();});
    document.addEventListener('visibilitychange',function(){if(document.hidden)syncLegacyChats();else syncSoon();});
    window.addEventListener('pagehide',syncLegacyChats);
    window.addEventListener('focus',syncSoon);
    setTimeout(syncLegacyChats,1200);
    window.FWMobileChatIDBBridge={sync:syncLegacyChats,showCached:showCached};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
