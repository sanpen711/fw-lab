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

  function ensureChatPanel(){
    var view = $('[data-app-view="buddy"]');
    if(!view) return null;
    var panel = $('[data-buddy-chat-panel]', view);
    if(panel) return panel;
    panel = document.createElement('section');
    panel.className = 'buddy-chat-panel';
    panel.dataset.buddyChatPanel = 'true';
    panel.innerHTML = '<div class="view-head compact buddy-chat-title-wrap"><button class="back-btn" type="button" data-buddy-chat-back>‹ 消息</button><p>低功耗私聊</p><h1 data-buddy-chat-title>选择一个搭子</h1><span data-buddy-chat-sub>先从搭子列表打开一个私聊。</span></div><div class="buddy-chat-messages" data-buddy-chat-messages><div class="buddy-empty-tip">还没有选择聊天对象。</div></div><form class="buddy-chat-form" data-buddy-chat-form><input name="message" autocomplete="off" maxlength="300" placeholder="低功耗输入..."><button type="submit">发送</button></form>';
    view.appendChild(panel);
    return panel;
  }

  function contactName(targetId){
    var card = $('[data-buddy-open-chat="' + String(targetId).replace(/"/g, '\\"') + '"]');
    if(!card) return '摸鱼搭子';
    var name = $('.buddy-contact-name', card) || $('.list-main b', card) || card;
    return String(name.textContent || '').trim() || '摸鱼搭子';
  }

  function messageHtml(message){
    var mine = String(message.sender_id || '') === currentUserId();
    var name = mine ? '你' : '搭子';
    return '<div class="buddy-message' + (mine ? ' mine' : '') + '"><div class="buddy-message-name">' + esc(name) + '</div><div class="buddy-message-bubble">' + esc(messageText(message.content || '')) + '</div></div>';
  }

  function openCachedShell(targetId, rows, source){
    if(!targetId || !Array.isArray(rows) || !rows.length) return false;
    var view = $('[data-app-view="buddy"]');
    var panel = ensureChatPanel();
    if(!view || !panel) return false;
    view.classList.add('is-chatting');
    document.body.classList.add('fw-buddy-chatting');
    var title = $('[data-buddy-chat-title]', panel);
    var sub = $('[data-buddy-chat-sub]', panel);
    var box = $('[data-buddy-chat-messages]', panel);
    if(title) title.textContent = '和 ' + contactName(targetId) + ' 私聊';
    if(sub) sub.textContent = source === 'idb' ? '离线缓存：正在展示最近聊天' : '本地缓存：正在展示最近聊天';
    if(box){
      box.innerHTML = '<div class="buddy-empty-tip">' + esc(source === 'idb' ? '离线模式：正在显示最近缓存聊天。恢复网络后会自动刷新。' : '正在显示本地聊天缓存，稍后自动刷新。') + '</div>' + rows.map(messageHtml).join('');
      if(typeof window.fwRenderStickerMessages === 'function') window.fwRenderStickerMessages();
      box.scrollTop = box.scrollHeight;
    }
    return true;
  }

  function showCached(targetId){
    targetId = String(targetId || '');
    if(!targetId) return;
    var localRows = readLegacy(targetId);
    if(localRows.length) openCachedShell(targetId, localRows, 'local');
    var api = cache();
    if(api && typeof api.getChat === 'function'){
      api.getChat(currentUserId(), targetId).then(function(data){
        if(data && Array.isArray(data.rows) && data.rows.length) openCachedShell(targetId, data.rows, 'idb');
      }).catch(function(){});
    }
  }

  function patchBuddy(){
    if(patched || !window.FWAppBuddy || typeof window.FWAppBuddy.openChat !== 'function') return !!patched;
    var originalOpenChat = window.FWAppBuddy.openChat;
    window.FWAppBuddy.openChat = function(targetId){
      showCached(targetId);
      return originalOpenChat.apply(window.FWAppBuddy, arguments);
    };
    window.FWAppBuddy.__idbChatBridgePatched = true;
    patched = true;
    return true;
  }

  function schedulePatch(){
    if(patchBuddy()) return;
    [80, 240, 700, 1500, 3000].forEach(function(delay){ setTimeout(patchBuddy, delay); });
  }

  function bindEvents(){
    document.addEventListener('click', function(event){
      var target = event.target;
      if(!target || !target.closest) return;
      var chat = target.closest('[data-buddy-open-chat]');
      if(chat){
        var id = chat.getAttribute('data-buddy-open-chat') || chat.dataset.buddyOpenChat || '';
        setTimeout(function(){ showCached(id); }, 0);
        setTimeout(syncSoon, 1500);
      }
    }, true);
    document.addEventListener('visibilitychange', function(){ if(document.hidden) syncLegacyChats(); else syncSoon(); }, {passive:true});
    window.addEventListener('pagehide', syncLegacyChats, {passive:true});
    window.addEventListener('pageshow', syncSoon, {passive:true});
    window.addEventListener('focus', syncSoon, {passive:true});
  }

  function start(){
    schedulePatch();
    bindEvents();
    setTimeout(syncLegacyChats, 1200);
    window.FWMobileChatIDBBridge = {sync:syncLegacyChats, showCached:showCached};
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();