(function(){
  if(window.FWAppBuddy) return;

  var bound = false;
  var loaded = false;
  var activeTab = 'messages';
  var friendshipRows = [];
  var profileMap = {};
  var conversationCache = {};
  var messageListCacheHtml = '';
  var activeTargetId = '';
  var activeConversationId = null;
  var chatTimer = null;
  var messageLoading = false;
  var chatOpening = false;
  var CHAT_REFRESH_DELAY = 12000;
  var chatGeneration = 0, messageGeneration = 0, listGeneration = 0, relationGeneration = 0;
  var olderRows=[],hasOlder=false,olderLoading=false;
  var displayedRows = [], readPending = null, readFailureSignature = '';
  function sameUser(uid){return app().state.user && app().state.user.id === uid;}
  function currentChat(token,targetId,conversationId,uid){return token===chatGeneration && sameUser(uid) && activeTargetId===targetId && activeConversationId===conversationId;}
  function buddyChanged(){document.dispatchEvent(new CustomEvent('fw:buddy-unread-changed'));}
  function visibleChat(){return !document.hidden && app().state.view==='buddy' && !!activeTargetId && !chatOpening;}


  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function $$(selector, root){ return app().$$(selector, root); }
  function esc(value){ return app().esc(value); }
  function client(){ return app().db() && app().db().client; }
  function toast(message){ app().toast(message); }
  function fail(result, message){ if(result && result.error) throw new Error(message || result.error.message || '读取失败'); return result ? result.data : null; }

  function injectStyle(){
    if(document.getElementById('fwAppBuddyStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwAppBuddyStyle';
    style.textContent = [
      '[data-app-view="buddy"]{padding-top:70px!important}',
      '[data-app-view="buddy"] > .view-head,[data-app-view="buddy"] > [data-buddy-search],[data-app-view="buddy"] > [data-buddy-search-result]{display:none!important}',
      '[data-app-view="buddy"] > .tabs{position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 12px);z-index:80;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0;padding:8px 0 10px;background:linear-gradient(180deg,rgba(248,244,235,.98),rgba(238,232,220,.94))}',
      '[data-app-view="buddy"] > .tabs button{min-height:48px;border:1px solid rgba(30,30,28,.12);border-radius:16px;background:#fffdf7;color:var(--muted);font-size:15px;font-weight:1000}',
      '[data-app-view="buddy"] > .tabs button.active{background:var(--deep);border-color:var(--deep);color:#fff}',
      '[data-app-view="buddy"].is-chatting{padding-top:0!important}',
      '.buddy-row{align-items:flex-start}.buddy-row .list-main{padding-top:2px}.buddy-row .list-main b{display:block;margin-bottom:3px}.buddy-row.is-clickable{cursor:pointer}',
      '.buddy-section{display:grid;gap:10px;margin:0 0 14px}.buddy-section-title{margin:6px 2px 0;color:var(--accent-dark);font-size:13px;font-weight:1000;letter-spacing:.08em}',
      '.buddy-letter{margin:14px 2px 6px;color:var(--green);font-size:12px;font-weight:1000}',
      '.buddy-contact-list{display:grid;gap:0;border-radius:14px;background:rgba(255,253,247,.72);overflow:hidden;border:1px solid rgba(30,30,28,.08)}',
      '.buddy-contact-card{display:grid;grid-template-columns:48px minmax(0,1fr) 44px;align-items:center;gap:12px;min-height:66px;padding:9px 8px 9px 12px;border-bottom:1px solid rgba(30,30,28,.08);background:#fffdf7;color:var(--text)}',
      '.buddy-contact-card:last-child{border-bottom:0}.buddy-contact-card .list-avatar{width:44px;height:44px;border-radius:10px}.buddy-contact-name{font-size:17px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.buddy-contact-more{width:38px;height:38px;border:0;border-radius:999px;background:transparent;color:rgba(16,23,15,.62);font-size:24px;font-weight:1000}',
      '.buddy-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:9px}.buddy-mini-btn{min-height:32px;border:1px solid rgba(30,30,28,.14);border-radius:999px;background:#fffdf7;color:var(--text);padding:0 12px;font-size:12px;font-weight:1000}.buddy-mini-btn.dark{background:var(--deep);border-color:var(--deep);color:#fff}.buddy-mini-btn.danger{background:#fff7f4;border-color:rgba(217,121,121,.34);color:var(--accent-dark)}',
      '.buddy-avatar-wrap{display:inline-grid;position:relative;place-items:center}.buddy-avatar-wrap .list-avatar{grid-area:1/1}.buddy-dot{position:absolute;right:1px;top:1px;width:10px;height:10px;border-radius:999px;background:#e64b4b;border:2px solid #fffdf7}.buddy-dot[hidden]{display:none!important}.buddy-message-snippet{display:block;margin-top:3px;color:var(--muted);font-size:12px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.buddy-message-time{display:block;margin-top:5px;color:var(--accent-dark);font-size:11px;font-weight:1000}',
      '.buddy-chat-panel{display:none;min-height:100%;padding-bottom:8px}[data-app-view="buddy"].is-chatting > .tabs,[data-app-view="buddy"].is-chatting > [data-buddy-list]{display:none!important}[data-app-view="buddy"].is-chatting > .buddy-chat-panel{display:grid;grid-template-rows:auto minmax(280px,1fr) auto;gap:10px}',
      '.buddy-chat-messages{min-height:280px;max-height:calc(var(--app-viewport-height,100dvh) - 250px);overflow:auto;border:1px solid rgba(30,30,28,.12);border-radius:16px;background:rgba(255,253,247,.72);padding:12px;display:grid;align-content:start;gap:10px}.buddy-message{max-width:82%;display:grid;gap:5px;justify-self:start}.buddy-message.mine{justify-self:end;text-align:right}.buddy-message-name{color:var(--accent-dark);font-size:11px;font-weight:1000}.buddy-message-bubble{display:inline-block;border-radius:15px;background:#fffdf7;color:var(--text);border:1px solid rgba(30,30,28,.08);padding:10px 12px;font-size:14px;line-height:1.5;font-weight:900;text-align:left;word-break:break-word;white-space:pre-wrap}.buddy-message.mine .buddy-message-bubble{background:var(--deep);border-color:var(--deep);color:#fff}',
      '.buddy-chat-form{position:sticky;bottom:0;display:grid;grid-template-columns:minmax(0,1fr) 64px;gap:8px;padding:10px;border:1px solid rgba(30,30,28,.12);border-radius:16px;background:#fffdf7}.buddy-chat-form input{height:42px;border:1px solid rgba(30,30,28,.14);border-radius:999px;background:#fffaf1;padding:0 13px;font-size:16px;font-weight:900;min-width:0}.buddy-chat-form button{height:42px;border:0;border-radius:999px;background:var(--deep);color:#fff;font-weight:1000}.buddy-chat-form button:disabled{opacity:.72}.buddy-empty-tip{border:1px dashed rgba(30,30,28,.18);border-radius:14px;background:rgba(255,253,247,.68);padding:15px;color:var(--muted);font-size:13px;line-height:1.55;font-weight:900}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureTabs(){
    var tabs = $$('[data-buddy-tab]');
    if(tabs.length >= 3){
      tabs[0].dataset.buddyTab = 'messages'; tabs[0].textContent = '消息';
      tabs[1].dataset.buddyTab = 'friends'; tabs[1].textContent = '全部搭子';
      tabs[2].dataset.buddyTab = 'new'; tabs[2].textContent = '新的搭子';
    }
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

  function avatar(profile, className){
    profile = profile || {};
    var name = profile.nickname || '研究员';
    var cls = className || 'list-avatar';
    var interactive = profile.id ? ' data-profile-user="' + esc(profile.id) + '" role="button" tabindex="0"' : '';
    if(profile.avatar_url) return '<span class="' + cls + '"' + interactive + '><img src="' + esc(profile.avatar_url) + '" alt="' + esc(name) + '"></span>';
    return '<span class="' + cls + '"' + interactive + '>' + esc(app().initials(name)) + '</span>';
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
  function isStickerPayload(text){ return /^\[\[FW_USER_STICKER:[A-Za-z0-9+/=]+\]\]$/.test(String(text || '').trim()); }
  function messagePreview(content){ return isStickerPayload(content) ? '动画表情' : (content || '[消息]'); }
  function acceptedRows(){ return friendshipRows.filter(function(row){ return row.status === 'accepted'; }); }
  function incomingRows(){ var me = app().state.user; return friendshipRows.filter(function(row){ return row.status === 'pending' && me && row.receiver_id === me.id; }); }
  function outgoingRows(){ var me = app().state.user; return friendshipRows.filter(function(row){ return row.status === 'pending' && me && row.requester_id === me.id; }); }
  function otherId(row, meId){ return String(row.requester_id) === String(meId) ? row.receiver_id : row.requester_id; }
  function friendshipBetween(userId){ var me = app().state.user; if(!me) return null; return friendshipRows.find(function(row){ return (String(row.requester_id) === String(me.id) && String(row.receiver_id) === String(userId)) || (String(row.receiver_id) === String(me.id) && String(row.requester_id) === String(userId)); }) || null; }

  async function fetchProfiles(ids){
    ids = Array.from(new Set((ids || []).filter(Boolean)));
    if(!ids.length) return {};
    var owner=app().state.user && app().state.user.id;
    try{
      var data = fail(await client().from('profiles').select('id,nickname,lab_code,avatar_url').in('id', ids), '资料读取失败') || [];
      var map = {};
      data.forEach(function(row){ map[row.id] = row; if(sameUser(owner)) profileMap[row.id] = row; });
      return map;
    }catch(e){ console.warn('[FW mobile app] profile fetch failed', e); return {}; }
  }

  function renderFriendGroups(){
    var list = $('[data-buddy-list]');
    if(!list) return;
    var rows = acceptedRows().slice();
    if(!rows.length){ list.innerHTML = '<div class="empty">暂时还没有搭子，可以到“新的搭子”里搜索实验品。</div>'; return; }
    var me = app().state.user;
    rows.sort(function(a,b){ return String((profileMap[otherId(a, me.id)] || {}).nickname || '').localeCompare(String((profileMap[otherId(b, me.id)] || {}).nickname || ''), 'zh-CN'); });
    var html = ['<div class="buddy-contact-list">'];
    rows.forEach(function(row){
      var id = otherId(row, me.id);
      var p = profileMap[id] || {};
      html.push('<div class="buddy-contact-card" data-buddy-open-chat="' + esc(id) + '" data-buddy-contact-card="' + esc(id) + '">' + avatar(p) + '<span class="buddy-contact-name">' + esc(p.nickname || '低功耗研究员') + '</span><button class="buddy-contact-more" type="button" data-buddy-contact-more="' + esc(id) + '" data-buddy-contact-name="' + esc(p.nickname || '这个搭子') + '" aria-label="更多操作">⋯</button></div>');
    });
    html.push('</div>');
    list.innerHTML = html.join('');
  }

  function messageRowHtml(item){
    var me = app().state.user;
    var meId = me && me.id;
    var profile = item.profile || {};
    var snippet = (item.sender_id === meId ? '我：' : '') + messagePreview(item.content || '');
    var unread = !!item.unread;
    return '<article class="list-item buddy-row buddy-message-row is-clickable" data-buddy-open-chat="' + esc(item.userId) + '" data-buddy-last-message-id="' + esc(item.id) + '" data-buddy-last-message-at="' + esc(item.created_at) + '" data-buddy-last-sender="' + esc(item.sender_id || '') + '"><span class="buddy-avatar-wrap">' + avatar(profile) + '<i class="buddy-dot" ' + (unread ? '' : 'hidden') + ' aria-hidden="true"></i></span><div class="list-main"><b>' + esc(profile.nickname || '低功耗搭子') + '</b><span class="buddy-message-snippet">' + esc(snippet) + '</span><span class="buddy-message-time">' + esc(timeText(item.created_at)) + '</span></div></article>';
  }

  async function renderMessages(){
    var list=$('[data-buddy-list]'),me=app().state.user;
    if(!list || !me || activeTab!=='messages')return;
    var generation=++listGeneration;
    if(!list.querySelector('.buddy-message-row') && !messageListCacheHtml)list.innerHTML='<div class="loading">正在读取搭子消息...</div>';
    try{
      var inbox=await rpc('fw_mobile_buddy_inbox',{},'消息读取失败');
      if(generation!==listGeneration || !sameUser(me.id) || activeTab!=='messages')return;
      var latest=(inbox||[]).filter(function(row){return row.message;}).map(function(row){
        return Object.assign({},row.message,{userId:row.user_id,unread:row.unread,profile:profileMap[row.user_id]||{}});
      }).sort(function(a,b){return new Date(b.created_at)-new Date(a.created_at);});
      messageListCacheHtml=latest.map(messageRowHtml).join('');
      list.innerHTML=messageListCacheHtml||'<div class="empty">暂时没有搭子消息。先去“新的搭子”加一个搭子吧。</div>';
      if(window.FWAppBuddyUnread && window.FWAppBuddyUnread.setInbox)window.FWAppBuddyUnread.setInbox(inbox,me.id);
      acknowledgeFriendNotices('friend_accept',acceptedRows().map(function(row){return String(row.id);}));
    }catch(e){console.warn('[FW mobile app] buddy messages tab failed',e);if(generation===listGeneration && sameUser(me.id) && activeTab==='messages' && !messageListCacheHtml)list.innerHTML='<div class="error">搭子消息暂时读取失败，请稍后再试。</div>';}
  }

  async function acknowledgeFriendNotices(type,targets){
    var me=app().state.user,tab=activeTab;
    if(!me || !targets.length || document.hidden || app().state.view!=='buddy' || activeTargetId)return;
    try{
      var rows=fail(await client().from('notifications').select('id').eq('user_id',me.id).eq('type',type).eq('target_type','friendship').in('target_id',targets).eq('is_read',false),'提醒读取失败')||[];
      if(!sameUser(me.id) || activeTab!==tab || activeTargetId || document.hidden || app().state.view!=='buddy')return;
      if(rows.length){
        var ids=rows.map(function(row){return String(row.id);});
        var saved=fail(await client().from('notifications').update({is_read:true}).eq('user_id',me.id).eq('type',type).in('id',ids).select('id'),'提醒已读失败')||[];
        if(saved.length!==ids.length)throw new Error('提醒已读未保存');
      }
      buddyChanged();
    }catch(e){console.warn('[FW mobile app] friend notice read failed',e);}
  }

  function requestRowHtml(row){
    var me = app().state.user;
    var id = otherId(row, me.id);
    var p = profileMap[id] || {};
    var incoming = row.receiver_id === me.id;
    var actions = incoming ? '<button class="buddy-mini-btn dark" type="button" data-buddy-accept="' + esc(row.id) + '">同意</button><button class="buddy-mini-btn danger" type="button" data-buddy-reject="' + esc(row.id) + '">拒绝</button>' : '<button class="buddy-mini-btn danger" type="button" data-buddy-remove="' + esc(row.id) + '">撤回申请</button>';
    return '<article class="list-item buddy-row">' + avatar(p) + '<div class="list-main"><b>' + esc(p.nickname || '低功耗研究员') + '</b><span>实验品编号：' + esc(p.lab_code || '未设置') + '</span><div class="buddy-actions">' + actions + '</div></div></article>';
  }
  function renderNewBuddies(){
    var list = $('[data-buddy-list]'); if(!list) return;
    var html = ['<form class="search-card buddy-inline-search" data-buddy-search><input name="q" autocomplete="off" placeholder="搜索实验品编号 / 昵称 / 完整邮箱"><button type="submit">搜索</button></form><div class="search-result buddy-search-result" data-buddy-search-result></div>'];
    html.push('<section class="buddy-section"><h2 class="buddy-section-title">收到申请</h2>' + (incomingRows().length ? incomingRows().map(requestRowHtml).join('') : '<div class="empty">暂时没有收到新的搭子申请。</div>') + '</section>');
    html.push('<section class="buddy-section"><h2 class="buddy-section-title">发出申请</h2>' + (outgoingRows().length ? outgoingRows().map(requestRowHtml).join('') : '<div class="empty">暂时没有发出的搭子申请。</div>') + '</section>');
    list.innerHTML = html.join('');
  }

  function render(){
    ensureTabs(); ensureChatPanel();
    var list = $('[data-buddy-list]'); if(!list) return;
    $$('[data-buddy-tab]').forEach(function(tab){ tab.classList.toggle('active', tab.dataset.buddyTab === activeTab); });
    if(!app().state.user){ list.innerHTML = '<div class="empty">请先登录后查看搭子中心。</div>'; return; }
    if(activeTab === 'messages') return renderMessages();
    if(activeTab === 'new'){ renderNewBuddies(); acknowledgeFriendNotices('friend_request',incomingRows().map(function(row){return String(row.id);})); return; }
    renderFriendGroups(); acknowledgeFriendNotices('friend_accept',acceptedRows().map(function(row){return String(row.id);}));
  }

  async function load(force){
    if(loaded && !force){ await render(); return; }
    var generation=++relationGeneration;
    var list = $('[data-buddy-list]');
    if(list && !(activeTab === 'messages' && messageListCacheHtml)) list.innerHTML = '<div class="loading">正在读取搭子列表...</div>';
    try{
      await app().refreshUser();
      var me = app().state.user;
      if(generation!==relationGeneration)return;
      if(!me){ loaded = true; render(); return; }
      if(!(await app().waitForDb())) throw new Error('暂时无法连接数据服务。');
      var nextRelations = fail(await client().from('friendships').select('id,requester_id,receiver_id,status,created_at,updated_at').or('requester_id.eq.' + me.id + ',receiver_id.eq.' + me.id).order('updated_at', {ascending:false}), '搭子列表读取失败') || [];
      var ids = [];
      nextRelations.forEach(function(row){ ids.push(row.requester_id, row.receiver_id); });
      var nextProfiles=await fetchProfiles(ids);
      if(generation!==relationGeneration || !sameUser(me.id))return;
      friendshipRows=nextRelations; profileMap=nextProfiles; loaded=true;
      await render();
    }catch(e){ console.warn('[FW mobile app] buddy load failed', e); if(generation===relationGeneration && list && !(activeTab === 'messages' && messageListCacheHtml)) list.innerHTML = '<div class="error">搭子列表暂时读取失败，请稍后再试。</div>'; }
  }

  function activeSearchResult(){ var nodes = $$('[data-buddy-search-result]'); return nodes.length ? nodes[nodes.length - 1] : null; }
  function clearSearch(){ var result = activeSearchResult(); if(result) result.innerHTML = ''; }
  function searchActions(profile, friendship){
    var me = app().state.user; if(!me) return '';
    if(String(profile.id) === String(me.id)) return '<div class="buddy-actions"><button class="buddy-mini-btn" type="button" disabled>这是你自己</button></div>';
    if(!friendship) return '<div class="buddy-actions"><button class="buddy-mini-btn dark" type="button" data-buddy-add="' + esc(profile.id) + '">加为搭子</button></div>';
    if(friendship.status === 'accepted') return '<div class="buddy-actions"><button class="buddy-mini-btn dark" type="button" data-buddy-open-chat="' + esc(profile.id) + '">发消息</button><button class="buddy-mini-btn danger" type="button" data-buddy-remove="' + esc(friendship.id) + '">解除搭子</button></div>';
    if(friendship.status === 'pending' && friendship.requester_id === me.id) return '<div class="buddy-actions"><button class="buddy-mini-btn" type="button" disabled>等待处理</button><button class="buddy-mini-btn danger" type="button" data-buddy-remove="' + esc(friendship.id) + '">撤回申请</button></div>';
    if(friendship.status === 'pending' && friendship.receiver_id === me.id) return '<div class="buddy-actions"><button class="buddy-mini-btn dark" type="button" data-buddy-accept="' + esc(friendship.id) + '">同意</button><button class="buddy-mini-btn danger" type="button" data-buddy-reject="' + esc(friendship.id) + '">拒绝</button></div>';
    return '<div class="buddy-actions"><button class="buddy-mini-btn dark" type="button" data-buddy-add="' + esc(profile.id) + '">重新申请</button></div>';
  }
  async function search(keyword){
    var result = activeSearchResult(); if(!result) return;
    var q = String(keyword || '').trim();
    if(q.length < 2){ toast('至少输入 2 个字符；邮箱需要完整输入。'); return; }
    await app().refreshUser();
    if(!app().state.user){ toast('请先登录后再搜索搭子。'); app().setView('profile'); return; }
    result.innerHTML = '<div class="loading">正在搜索实验品...</div>';
    try{
      if(!(await app().waitForDb())) throw new Error('暂时无法连接数据服务。');
      if(!loaded) await load(true);
      var rows = fail(await client().rpc('fw_search_profiles', {search_text:q}), '搜索失败') || [];
      if(!rows.length){ result.innerHTML = '<div class="empty">没有找到对应实验品。</div>'; return; }
      var html = ['<button class="buddy-mini-btn buddy-search-clear" type="button" data-buddy-clear-search>清空搜索结果</button>'];
      rows.forEach(function(profile){ profileMap[profile.id] = profile; var friendship = friendshipBetween(profile.id); html.push('<article class="list-item buddy-row">' + avatar(profile) + '<div class="list-main"><b>' + esc(profile.nickname || '低功耗研究员') + '</b><span>实验品编号：' + esc(profile.lab_code || '未设置') + '</span>' + searchActions(profile, friendship) + '</div></article>'); });
      result.innerHTML = html.join('');
    }catch(e){ console.warn('[FW mobile app] buddy search failed', e); result.innerHTML = '<div class="error">搜索暂时失败，请稍后再试。</div>'; }
  }

  async function rpc(name, args, message){ var result = await client().rpc(name, args || {}); if(result && result.error){var error=new Error((message ? message+'：' : '')+(result.error.message || '操作失败'));error.code=result.error.code;throw error;} return result ? result.data : null; }
  async function handleAction(button, action){
    if(!button) return;
    await app().refreshUser();
    if(!app().state.user){ toast('请先登录。'); app().setView('profile'); return; }
    if(!(await app().waitForDb())){ toast('暂时无法连接数据服务。'); return; }
    var owner=app().state.user.id;
    var old = button.textContent; button.disabled = true; button.textContent = '处理中...';
    try{ await action(); if(!sameUser(owner))return; loaded = false; await load(true); buddyChanged(); }catch(e){ console.warn('[FW mobile app] buddy action failed', e); toast(e.message || '操作失败，请稍后再试。'); }finally{ button.disabled = false; button.textContent = old; }
  }
  function addBuddy(button){ return handleAction(button, async function(){ await rpc('fw_send_friend_request', {target_user_id:button.dataset.buddyAdd || ''}, '发送申请失败'); toast('搭子申请已发出。'); activeTab = 'new'; clearSearch(); }); }
  function acceptBuddy(button){ return handleAction(button, async function(){ await rpc('fw_respond_friendship', {target_friendship_id:Number(button.dataset.buddyAccept), accept_request:true}, '处理失败'); toast('已同意搭子申请。'); activeTab = 'friends'; clearSearch(); }); }
  function rejectBuddy(button){ return handleAction(button, async function(){ await rpc('fw_respond_friendship', {target_friendship_id:Number(button.dataset.buddyReject), accept_request:false}, '处理失败'); toast('已拒绝搭子申请。'); activeTab = 'new'; }); }
  function removeBuddy(button){ var ok = !/解除|删除/.test(String(button.textContent || '')) || window.confirm('确定解除这个搭子关系吗？'); if(!ok) return; return handleAction(button, async function(){ await rpc('fw_remove_friendship', {target_friendship_id:Number(button.dataset.buddyRemove)}, '操作失败'); toast('已处理搭子关系。'); closeChat(false); }); }

  function chatCacheKey(targetId){ var me = app().state.user; return 'fw_mobile_buddy_chat_cache:' + (me && me.id || 'guest') + ':' + targetId; }
  function readChatCache(targetId){ try{ var row = JSON.parse(localStorage.getItem(chatCacheKey(targetId)) || '{}'); return Array.isArray(row.rows) ? row.rows : []; }catch(e){ return []; } }
  function saveChatCache(targetId, rows){ try{ localStorage.setItem(chatCacheKey(targetId), JSON.stringify({rows:(rows || []).slice(-80), updated_at:Date.now()})); }catch(e){} }
  function renderCachedMessages(targetId){
    var rows = readChatCache(targetId), box = $('[data-buddy-chat-messages]');
    if(!box || !rows.length) return false;
    box.innerHTML = rows.map(function(row){ return messageHtml(row, profileMap); }).join('');
    box.dataset.messageSignature = messageSignature(rows);
    if(typeof window.fwRenderStickerMessages === 'function') window.fwRenderStickerMessages();
    box.scrollTop = box.scrollHeight;
    return true;
  }
  function openChatShell(){ var view = $('[data-app-view="buddy"]'); ensureChatPanel(); if(view) view.classList.add('is-chatting'); document.body.classList.add('fw-buddy-chatting'); var input = $('[data-buddy-chat-form] input'); setTimeout(function(){ if(input) input.focus(); }, 80); }
  function stopChatPolling(){ clearTimeout(chatTimer); chatTimer = null; }
  function shouldPollChat(){ return !document.hidden && app().state && app().state.view === 'buddy' && !!activeConversationId; }
  function scheduleChatPolling(delay){
    stopChatPolling();
    if(!shouldPollChat()) return;
    chatTimer = setTimeout(async function(){
      if(shouldPollChat()) await loadMessages(true);
      scheduleChatPolling(CHAT_REFRESH_DELAY);
    }, delay == null ? CHAT_REFRESH_DELAY : delay);
  }
  function closeChat(clearTarget){ ++chatGeneration; ++messageGeneration; displayedRows=[]; olderRows=[]; hasOlder=false; olderLoading=false; readPending=null; stopChatPolling(); activeConversationId = null; chatOpening = false; activeTargetId = ''; var view = $('[data-app-view="buddy"]'); if(view) view.classList.remove('is-chatting'); document.body.classList.remove('fw-buddy-chatting'); if(activeTab === 'messages') renderMessages(); }
  async function getConversationId(targetId){ if(conversationCache[targetId]) return conversationCache[targetId]; var owner=app().state.user && app().state.user.id; var convId = Number(await rpc('fw_get_or_create_conversation', {target_user_id:targetId}, '私聊会话创建失败')); if(Number.isFinite(convId) && convId > 0){ if(sameUser(owner))conversationCache[targetId] = convId; return convId; } throw new Error('私聊会话创建失败。'); }

  async function openChat(targetId){
    targetId = String(targetId || '');
    if(!targetId || (chatOpening && activeTargetId === targetId)) return;
    var token=++chatGeneration; ++messageGeneration; stopChatPolling();
    activeTargetId=targetId; activeConversationId=null; displayedRows=[]; olderRows=[]; hasOlder=false; olderLoading=false; readPending=null; chatOpening=true;
    await app().refreshUser();
    if(token!==chatGeneration)return;
    if(!app().state.user){ closeChat(true); toast('请先登录后再私聊。'); app().setView('profile'); return; }
    var uid=app().state.user.id;
    if(!(await app().waitForDb())){ if(token===chatGeneration){closeChat(true);toast('暂时无法连接数据服务。');} return; }
    if(!loaded) await load(true);
    if(token!==chatGeneration || !sameUser(uid))return;
    activeTargetId = targetId;
    openChatShell();
    var profile = profileMap[targetId] || {};
    var title = $('[data-buddy-chat-title]'), sub = $('[data-buddy-chat-sub]'), box = $('[data-buddy-chat-messages]');
    if(title) title.textContent = '和 ' + (profile.nickname || '摸鱼搭子') + ' 私聊';
    if(sub) sub.textContent = profile.lab_code ? '实验品编号：' + profile.lab_code : '低功耗私聊';
    if(box){box.dataset.messageSignature='';box.dataset.buddyServerGeneration='';}
    var input=$('[data-buddy-chat-form] input');if(input)input.value='';
    if(!renderCachedMessages(targetId) && box) box.innerHTML = '<div class="buddy-empty-tip">正在读取私聊...</div>';
    document.dispatchEvent(new CustomEvent('fw:buddy-chat-opened',{detail:{targetId:targetId,generation:token}}));
    chatOpening = true;
    try{
      var conversationId=await getConversationId(targetId);
      if(token!==chatGeneration || !sameUser(uid))return;
      activeConversationId=conversationId; chatOpening=false;
      await loadMessages(true);
      if(token===chatGeneration)scheduleChatPolling();
    }catch(e){ console.warn('[FW mobile app] buddy chat open failed', e); if(token===chatGeneration && sameUser(uid) && box) box.innerHTML = '<div class="buddy-empty-tip">私聊打开失败：' + esc(e.message || '请稍后重试。') + '</div>'; }
    finally{ if(token===chatGeneration)chatOpening = false; }
  }
  function messageHtml(message, profiles){ var me = app().state.user; var mine = !!(me && message.sender_id === me.id); var p = profiles[message.sender_id] || {}; var name = mine ? '你' : (p.nickname || '搭子'); return '<div class="buddy-message' + (mine ? ' mine' : '') + '"><div class="buddy-message-name">' + esc(name) + '</div><div class="buddy-message-bubble">' + esc(message.content || '') + '</div></div>'; }
  function messageSignature(rows){ return (rows || []).map(function(row){ return [row.id || '', row.sender_id || '', row.content || '', row.created_at || ''].join(':'); }).join('|'); }
  async function acknowledgeDisplayed(){
    if(!visibleChat() || !activeConversationId || !displayedRows.length)return false;
    if(readPending)return readPending;
    var token=chatGeneration,targetId=activeTargetId,conversationId=activeConversationId,me=app().state.user;
    if(!me)return false;
    var rows=displayedRows.slice(), ids=rows.filter(function(row){return row.sender_id!==me.id && /^\d+$/.test(String(row.id));}).map(function(row){return String(row.id);});
    var systemIds=rows.map(function(row){var match=/^notice:(\d+)$/.exec(String(row.id));return match && match[1];}).filter(Boolean);
    var signature=messageSignature(rows);
    if(!ids.length && !systemIds.length)return true;
    var promise=(async function(){await Promise.resolve();try{
      var matches=ids.length?fail(await client().from('notifications').select('id').eq('user_id',me.id).eq('actor_id',targetId).eq('type','private_message').eq('target_type','private_message').eq('is_read',false).in('target_id',ids),'未读消息读取失败')||[]:[];
      var noticeIds=Array.from(new Set(matches.map(function(row){return String(row.id);}).concat(systemIds)));
      if(!currentChat(token,targetId,conversationId,me.id) || !visibleChat())return false;
      if(noticeIds.length){
        var updated=fail(await client().from('notifications').update({is_read:true}).eq('user_id',me.id).eq('actor_id',targetId).eq('type','private_message').in('id',noticeIds).select('id'),'已读状态保存失败')||[];
        if(updated.length!==noticeIds.length)throw new Error('已读状态未保存');
      }
      if(!sameUser(me.id))return false;
      readFailureSignature='';buddyChanged();return true;
    }catch(e){
      console.warn('[FW mobile app] displayed chat read failed',e);
      if(currentChat(token,targetId,conversationId,me.id) && readFailureSignature!==signature){toast('消息已显示，但已读状态未保存，请稍后重试。');readFailureSignature=signature;}
      buddyChanged();return false;
    }finally{if(readPending===promise)readPending=null;}})();
    readPending=promise;return promise;
  }
  async function loadMessages(quiet){
    var box=$('[data-buddy-chat-messages]'),me=app().state.user;
    if(!box || !activeConversationId || !me || olderLoading)return;
    var token=chatGeneration,targetId=activeTargetId,conversationId=activeConversationId,generation=++messageGeneration;
    try{
      var results=await Promise.all([
        client().from('private_messages').select('id,conversation_id,sender_id,content,is_deleted,created_at').eq('conversation_id',conversationId).eq('is_deleted',false).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(200),
        client().from('notifications').select('id,actor_id,content,created_at').eq('user_id',me.id).eq('actor_id',targetId).eq('type','private_message').eq('target_type','system').order('created_at',{ascending:false}).limit(100)
      ]);
      var rows=fail(results[0],'私聊读取失败')||[];
      if(!olderRows.length)hasOlder=rows.length===200;
      var seen=new Set(rows.map(function(row){return String(row.id);}));
      rows=rows.concat(olderRows.filter(function(row){return !seen.has(String(row.id));}));
      var info=fail(results[1],'搭子通知读取失败')||[];
      rows=rows.concat(info.map(function(row){return {id:'notice:'+row.id,sender_id:row.actor_id,content:row.content,created_at:row.created_at};})).sort(function(a,b){return new Date(a.created_at)-new Date(b.created_at)||String(a.id).localeCompare(String(b.id),undefined,{numeric:true});});
      await fetchProfiles(rows.map(function(row){return row.sender_id;}));
      if(generation!==messageGeneration || !currentChat(token,targetId,conversationId,me.id))return;
      var signature=rows.length?messageSignature(rows):'empty';
      displayedRows=rows; box.dataset.buddyServerGeneration=String(token);
      if(box.dataset.messageSignature!==signature){
        var nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<72;
        box.innerHTML=(hasOlder?'<button type="button" class="buddy-mini-btn" data-buddy-older>查看更早消息</button>':'')+(rows.length?rows.map(function(row){return messageHtml(row,profileMap);}).join(''):'<div class="buddy-empty-tip">还没有私聊消息。可以先低功耗地打个招呼。</div>');
        box.dataset.messageSignature=signature; box.dataset.buddyTargetId=targetId;
        saveChatCache(targetId,rows);
        if(typeof window.fwRenderStickerMessages==='function')window.fwRenderStickerMessages();
        if(nearBottom)box.scrollTop=box.scrollHeight;
      }
      await acknowledgeDisplayed();
    }catch(e){console.warn('[FW mobile app] buddy messages load failed',e);if(!quiet && generation===messageGeneration && currentChat(token,targetId,conversationId,me.id))box.innerHTML='<div class="buddy-empty-tip">私聊读取失败，请稍后重试。</div>';}
  }
  async function loadOlderMessages(){
    var me=app().state.user,box=$('[data-buddy-chat-messages]');
    var messages=displayedRows.filter(function(row){return /^\d+$/.test(String(row.id));});
    if(!me || !box || !messages.length || !hasOlder || olderLoading)return;
    var first=messages[0],token=chatGeneration,targetId=activeTargetId,conversationId=activeConversationId,generation=++messageGeneration;
    olderLoading=true;
    var button=box.querySelector && box.querySelector('[data-buddy-older]');if(button)button.disabled=true;
    try{
      var rows=fail(await client().from('private_messages').select('id,conversation_id,sender_id,content,is_deleted,created_at')
        .eq('conversation_id',conversationId).eq('is_deleted',false)
        .or('created_at.lt.'+first.created_at+',and(created_at.eq.'+first.created_at+',id.lt.'+first.id+')')
        .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(200),'历史消息读取失败')||[];
      await fetchProfiles(rows.map(function(row){return row.sender_id;}));
      if(generation!==messageGeneration || !currentChat(token,targetId,conversationId,me.id))return;
      hasOlder=rows.length===200;
      var seen=new Set(displayedRows.map(function(row){return String(row.id);}));
      displayedRows=displayedRows.concat(rows.filter(function(row){return !seen.has(String(row.id));})).sort(function(a,b){return new Date(a.created_at)-new Date(b.created_at)||String(a.id).localeCompare(String(b.id),undefined,{numeric:true});});
      olderRows=displayedRows.filter(function(row){return /^\d+$/.test(String(row.id));});
      var top=box.scrollTop,height=box.scrollHeight;
      box.innerHTML=(hasOlder?'<button type="button" class="buddy-mini-btn" data-buddy-older>查看更早消息</button>':'')+displayedRows.map(function(row){return messageHtml(row,profileMap);}).join('');
      box.dataset.messageSignature=messageSignature(displayedRows);
      if(typeof window.fwRenderStickerMessages==='function')window.fwRenderStickerMessages();
      box.scrollTop=top+box.scrollHeight-height;
      await acknowledgeDisplayed();
    }catch(e){if(currentChat(token,targetId,conversationId,me.id))toast(e.message||'历史消息读取失败，请重试。');}
    finally{if(token===chatGeneration){olderLoading=false;if(button)button.disabled=false;}}
  }
  async function sendToTarget(targetId,text,conversationId){
    try{return Number(await rpc('fw_send_private_message_to_user',{target_user_id:targetId,message_text:text},'发送失败'))||conversationId;}
    catch(error){
      // A timeout can mean the first send succeeded: never send again automatically.
      if(error.code!=='PGRST202' && error.code!=='42883')throw error;
      await rpc('fw_send_private_message',{target_conversation_id:conversationId,message_text:text},'发送失败');return conversationId;
    }
  }
  async function sendMessage(form){
    if(!activeTargetId){ toast('先选择一个搭子。'); return; }
    var input = form.querySelector('input[name="message"]'); var text = String(input && input.value || '').trim();
    if(!text){ if(input) input.focus(); return; }
    if(!/^\[\[FW_USER_STICKER:[A-Za-z0-9+/=]+\]\]$/.test(text) && text.length > 300){ toast('私聊最多 300 字。'); return; }
    if(!/^\[\[FW_USER_STICKER:[A-Za-z0-9+/=]+\]\]$/.test(text) && /(https?:\/\/|www\.)/i.test(text)){ toast('私聊暂不支持链接。'); return; }
    var targetId=activeTargetId,token=chatGeneration,uid=app().state.user && app().state.user.id,conversationId=activeConversationId;
    var button = form.querySelector('button');
    if(button) button.disabled = true;
    try{
      if(!conversationId)conversationId=await getConversationId(targetId);
      if(token!==chatGeneration || activeTargetId!==targetId || !sameUser(uid))throw new Error('会话已切换，请重新发送。');
      var convId=await sendToTarget(targetId,text,conversationId);
      if(currentChat(token,targetId,activeConversationId,uid)){activeConversationId=convId;conversationCache[targetId]=convId;if(input.value===text)input.value='';await loadMessages();}
      buddyChanged();
    }catch(e){ console.warn('[FW mobile app] buddy send failed', e); toast(e.message || '发送失败。'); }
    finally{ if(button) button.disabled = false; }
  }
  async function sendMediaMarker(marker, expectedTargetId){
    var targetId = String(expectedTargetId || '');
    if(!targetId || String(activeTargetId) !== targetId) throw new Error('会话已切换，请重新选择视频。');
    if(!/^\[\[FW_MEDIA_VIDEO:[A-Za-z0-9+/=]+\]\]$/.test(marker)) throw new Error('视频格式不正确。');
    var token=chatGeneration,uid=app().state.user && app().state.user.id;
    var conversationId = activeConversationId || await getConversationId(targetId);
    if(String(activeTargetId) !== targetId) throw new Error('会话已切换，请重新选择视频。');
    if(token!==chatGeneration || !sameUser(uid))throw new Error('会话已切换，请重新选择视频。');
    conversationId=await sendToTarget(targetId,marker,conversationId);
    if(token===chatGeneration && sameUser(uid) && String(activeTargetId)===targetId){
      activeConversationId=conversationId;
      await loadMessages();
      if(activeTab==='messages') renderMessages();
    }
    buddyChanged();
  }

  function bind(){
    if(bound) return; bound = true;
    document.addEventListener('click', function(e){
      var nav = e.target.closest && e.target.closest('[data-app-nav]'); if(nav && nav.dataset.appNav !== 'buddy') closeChat(true);
      var clear = e.target.closest && e.target.closest('[data-buddy-clear-search]'); if(clear){ e.preventDefault(); clearSearch(); return; }
      var older=e.target.closest && e.target.closest('[data-buddy-older]');if(older){e.preventDefault();loadOlderMessages();return;}
      var back = e.target.closest && e.target.closest('[data-buddy-chat-back]'); if(back){ e.preventDefault(); closeChat(true); return; }
      var tab = e.target.closest && e.target.closest('[data-buddy-tab]'); if(tab){ e.preventDefault(); activeTab = tab.dataset.buddyTab || 'messages'; closeChat(true); render(); return; }
      var add = e.target.closest && e.target.closest('[data-buddy-add]'); if(add){ e.preventDefault(); addBuddy(add); return; }
      var accept = e.target.closest && e.target.closest('[data-buddy-accept]'); if(accept){ e.preventDefault(); acceptBuddy(accept); return; }
      var reject = e.target.closest && e.target.closest('[data-buddy-reject]'); if(reject){ e.preventDefault(); rejectBuddy(reject); return; }
      var remove = e.target.closest && e.target.closest('[data-buddy-remove]'); if(remove){ e.preventDefault(); removeBuddy(remove); return; }
      var chat = e.target.closest && e.target.closest('[data-buddy-open-chat]'); if(chat){ e.preventDefault(); openChat(chat.getAttribute('data-buddy-open-chat') || chat.dataset.buddyOpenChat); return; }
    });
    document.addEventListener('submit', function(e){ var form = e.target.closest && e.target.closest('[data-buddy-search]'); if(form){ e.preventDefault(); search(form.q.value); return; } var chatForm = e.target.closest && e.target.closest('[data-buddy-chat-form]'); if(chatForm){ e.preventDefault(); sendMessage(chatForm); } });
    window.addEventListener('focus', function(){ if(app().state && app().state.view === 'buddy') setTimeout(function(){ load(true); }, 120); });
    document.addEventListener('fw:app-visibility', function(event){
      var visible = !!(event && event.detail && event.detail.visible);
      if(!visible){ stopChatPolling(); return; }
      if(app().state && app().state.view === 'buddy'){
        setTimeout(function(){ load(true); if(activeConversationId){ loadMessages(true); scheduleChatPolling(); } }, 120);
      }
    });
    document.addEventListener('fw:app-userchange',function(){
      closeChat(true); ++listGeneration; ++relationGeneration; friendshipRows=[]; profileMap={}; conversationCache={}; messageListCacheHtml=''; loaded=false;
      var list=$('[data-buddy-list]'),box=$('[data-buddy-chat-messages]');if(list)list.innerHTML='';if(box){box.innerHTML='';box.dataset.messageSignature='';}
      if(app().state.view==='buddy')load(true);
    });
    document.addEventListener('fw:app-viewchange', function(event){
      var view = event && event.detail && event.detail.view;
      if(view !== 'buddy' && activeConversationId) closeChat(true);
      else if(view === 'buddy' && activeConversationId) scheduleChatPolling(300);
    });
  }

  function init(){ injectStyle(); ensureTabs(); ensureChatPanel(); bind(); }
  function ensureLoaded(){ load(false); }
  function openProfile(targetId){ openChat(targetId); }
  window.FWAppBuddy = {init:init, load:load, ensureLoaded:ensureLoaded, openChat:openChat, closeChat:closeChat, openProfile:openProfile, renderMessages:renderMessages, sendMediaMarker:sendMediaMarker, getActiveTargetId:function(){return activeTargetId;},loadMessages:loadMessages,loadOlderMessages:loadOlderMessages,acknowledgeDisplayed:acknowledgeDisplayed,getChatGeneration:function(){return chatGeneration;}};
})();
