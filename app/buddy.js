(function(){
  if(window.FWAppBuddy) return;

  var bound = false;
  var loaded = false;
  var activeTab = 'friends';
  var friendshipRows = [];
  var profileMap = {};
  var activeTargetId = '';
  var activeConversationId = null;
  var activeProfile = null;
  var chatTimer = null;
  var touchState = null;

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function $$(selector, root){ return app().$$(selector, root); }
  function esc(value){ return app().esc(value); }
  function db(){ return app().db(); }
  function client(){ return db() && db().client; }
  function toast(message){ app().toast(message); }

  function fail(result, message){
    if(result && result.error) throw new Error(message || result.error.message || '读取失败');
    return result ? result.data : null;
  }

  function hasLink(text){
    return /(https?:\/\/|www\.|[a-z0-9][a-z0-9-]*\.(com|net|org|xyz|top|cn|cc|io|me|vip|club|site|info|online|shop|live|app)(\/|$|\s))/i.test(text || '');
  }

  function isStickerPayload(text){
    return /^\[\[FW_USER_STICKER:[A-Za-z0-9+/=]+\]\]$/.test(String(text || '').trim());
  }

  function avatar(profile, className){
    profile = profile || {};
    var name = profile.nickname || '研究员';
    var cls = className || 'list-avatar';
    if(profile.avatar_url){
      return '<span class="' + cls + '"><img src="' + esc(profile.avatar_url) + '" alt="' + esc(name) + '"></span>';
    }
    return '<span class="' + cls + '">' + esc(app().initials(name)) + '</span>';
  }

  function injectStyle(){
    if(document.getElementById('fwAppBuddyStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwAppBuddyStyle';
    style.textContent = [
      '.buddy-head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px}',
      '.buddy-head .app-btn{min-height:34px;padding:0 12px;font-size:12px}',
      '.search-card[data-buddy-search]{display:grid;grid-template-columns:minmax(0,1fr) 74px;gap:8px;padding:10px;margin-bottom:10px}',
      '.search-card[data-buddy-search] input{height:42px;border:1px solid rgba(30,30,28,.13);border-radius:999px;background:#fffdf7;padding:0 13px;font-weight:900;min-width:0}',
      '.search-card[data-buddy-search] button{height:42px;border:0;border-radius:999px;background:var(--deep);color:#fff;font-weight:1000}',
      '.buddy-search-result{display:grid;gap:10px;margin-bottom:12px}',
      '.buddy-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:9px}',
      '.buddy-mini-btn{min-height:32px;border:1px solid rgba(30,30,28,.14);border-radius:999px;background:#fffdf7;color:var(--text);padding:0 12px;font-size:12px;font-weight:1000}',
      '.buddy-mini-btn.dark{background:var(--deep);border-color:var(--deep);color:#fff}',
      '.buddy-mini-btn.danger{background:#fff7f4;border-color:rgba(217,121,121,.34);color:var(--accent-dark)}',
      '.buddy-mini-btn:disabled{opacity:.55}',
      '.buddy-row{align-items:flex-start}',
      '.buddy-row .list-main{padding-top:2px}',
      '.buddy-row .list-main b{display:block;margin-bottom:3px}',
      '.buddy-row.is-clickable{cursor:pointer}',
      '.buddy-row.is-clickable:active{transform:scale(.995)}',
      '.buddy-chat-panel{display:none;min-height:100%;padding-bottom:8px}',
      '[data-app-view="buddy"].is-chatting > .view-head,[data-app-view="buddy"].is-chatting > [data-buddy-search],[data-app-view="buddy"].is-chatting > [data-buddy-search-result],[data-app-view="buddy"].is-chatting > [data-buddy-tabs],[data-app-view="buddy"].is-chatting > [data-buddy-list]{display:none!important}',
      '[data-app-view="buddy"].is-chatting > .buddy-chat-panel{display:grid;grid-template-rows:auto minmax(280px,1fr) auto;gap:10px}',
      '.buddy-chat-title-wrap h1{font-size:24px;line-height:1.12}',
      '.buddy-chat-title-wrap span{display:block;margin-top:6px;color:var(--muted);font-size:12px;font-weight:900}',
      '.buddy-chat-messages{min-height:280px;max-height:calc(var(--app-viewport-height,100dvh) - 250px);overflow:auto;border:1px solid rgba(30,30,28,.12);border-radius:16px;background:rgba(255,253,247,.72);padding:12px;display:grid;align-content:start;gap:10px}',
      '.buddy-message{max-width:82%;display:grid;gap:5px;justify-self:start}',
      '.buddy-message.mine{justify-self:end;text-align:right}',
      '.buddy-message-name{color:var(--accent-dark);font-size:11px;font-weight:1000}',
      '.buddy-message-bubble{display:inline-block;border-radius:15px;background:#fffdf7;color:var(--text);border:1px solid rgba(30,30,28,.08);padding:10px 12px;font-size:14px;line-height:1.5;font-weight:900;text-align:left;word-break:break-word;white-space:pre-wrap}',
      '.buddy-message.mine .buddy-message-bubble{background:var(--deep);border-color:var(--deep);color:#fff}',
      '.buddy-chat-form{position:sticky;bottom:0;display:grid;grid-template-columns:minmax(0,1fr) 64px;gap:8px;padding:10px;border:1px solid rgba(30,30,28,.12);border-radius:16px;background:#fffdf7;box-shadow:0 -8px 20px rgba(16,23,15,.05)}',
      '.buddy-chat-form input{height:42px;border:1px solid rgba(30,30,28,.14);border-radius:999px;background:#fffaf1;padding:0 13px;font-size:16px;font-weight:900;min-width:0}',
      '.buddy-chat-form button{height:42px;border:0;border-radius:999px;background:var(--deep);color:#fff;font-weight:1000}',
      '.buddy-empty-tip{border:1px dashed rgba(30,30,28,.18);border-radius:14px;background:rgba(255,253,247,.68);padding:15px;color:var(--muted);font-size:13px;line-height:1.55;font-weight:900}',
      '.buddy-search-clear{justify-self:start;margin-bottom:4px}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureHeader(){
    var view = $('[data-app-view="buddy"]');
    var head = view && $('.view-head', view);
    if(!head || head.classList.contains('buddy-head')) return;
    head.classList.add('buddy-head');
    var reload = document.createElement('button');
    reload.className = 'app-btn';
    reload.type = 'button';
    reload.dataset.buddyReload = 'true';
    reload.textContent = '刷新';
    head.appendChild(reload);
  }

  function ensureChatPanel(){
    var view = $('[data-app-view="buddy"]');
    if(!view) return null;
    var panel = $('[data-buddy-chat-panel]', view);
    if(panel) return panel;
    panel = document.createElement('section');
    panel.className = 'buddy-chat-panel';
    panel.dataset.buddyChatPanel = 'true';
    panel.innerHTML = [
      '<div class="view-head compact buddy-chat-title-wrap">',
        '<button class="back-btn" type="button" data-buddy-chat-back>‹ 搭子列表</button>',
        '<p>低功耗私聊</p>',
        '<h1 data-buddy-chat-title>选择一个搭子</h1>',
        '<span data-buddy-chat-sub>先从搭子列表打开一个私聊。</span>',
      '</div>',
      '<div class="buddy-chat-messages" data-buddy-chat-messages><div class="buddy-empty-tip">还没有选择聊天对象。</div></div>',
      '<form class="buddy-chat-form" data-buddy-chat-form>',
        '<input name="message" maxlength="300" autocomplete="off" placeholder="发一句低功耗消息">',
        '<button type="submit">发送</button>',
      '</form>'
    ].join('');
    view.appendChild(panel);
    return panel;
  }

  async function fetchProfiles(ids){
    var c = client();
    var unique = Array.from(new Set((ids || []).filter(Boolean)));
    if(!c || !unique.length) return {};
    var rows = fail(await c.from('profiles').select('id,nickname,avatar_url,lab_code').in('id', unique), '资料读取失败') || [];
    var map = {};
    rows.forEach(function(row){ map[row.id] = row; });
    return map;
  }

  function otherId(row, meId){
    return row.requester_id === meId ? row.receiver_id : row.requester_id;
  }

  function currentRows(){
    var me = app().state.user;
    if(!me) return [];
    if(activeTab === 'incoming') return friendshipRows.filter(function(row){ return row.status === 'pending' && row.receiver_id === me.id; });
    if(activeTab === 'outgoing') return friendshipRows.filter(function(row){ return row.status === 'pending' && row.requester_id === me.id; });
    return friendshipRows.filter(function(row){ return row.status === 'accepted'; });
  }

  function friendshipBetween(targetId){
    var me = app().state.user;
    if(!me || !targetId) return null;
    return friendshipRows.find(function(row){
      return (String(row.requester_id) === String(me.id) && String(row.receiver_id) === String(targetId)) ||
        (String(row.receiver_id) === String(me.id) && String(row.requester_id) === String(targetId));
    }) || null;
  }

  function rowActions(row){
    var me = app().state.user;
    if(!me || !row) return '';
    if(row.status === 'pending' && row.receiver_id === me.id){
      return '<div class="buddy-actions"><button class="buddy-mini-btn dark" type="button" data-buddy-accept="' + esc(row.id) + '">同意</button><button class="buddy-mini-btn danger" type="button" data-buddy-reject="' + esc(row.id) + '">拒绝</button></div>';
    }
    if(row.status === 'pending' && row.requester_id === me.id){
      return '<div class="buddy-actions"><button class="buddy-mini-btn danger" type="button" data-buddy-remove="' + esc(row.id) + '">撤回申请</button></div>';
    }
    if(row.status === 'accepted'){
      var id = otherId(row, me.id);
      return '<div class="buddy-actions"><button class="buddy-mini-btn dark" type="button" data-buddy-open-chat="' + esc(id) + '">私聊</button><button class="buddy-mini-btn danger" type="button" data-buddy-remove="' + esc(row.id) + '">解除搭子</button></div>';
    }
    return '';
  }

  function rowHtml(row){
    var me = app().state.user;
    var id = otherId(row, me.id);
    var profile = profileMap[id] || {};
    var name = profile.nickname || '低功耗研究员';
    var sub = profile.lab_code ? '实验品编号：' + profile.lab_code : '实验品编号：未设置';
    var clickable = row.status === 'accepted';
    if(row.status === 'pending' && row.receiver_id === me.id) sub += ' · 对方想加你为搭子';
    if(row.status === 'pending' && row.requester_id === me.id) sub += ' · 等待对方处理';
    if(row.status === 'accepted') sub += ' · 点击进入私聊';

    return '<article class="list-item buddy-row' + (clickable ? ' is-clickable' : '') + '" data-buddy-user="' + esc(id) + '" data-buddy-friendship="' + esc(row.id) + '">' +
      avatar(profile) +
      '<div class="list-main"><b>' + esc(name) + '</b><span>' + esc(sub) + '</span>' + rowActions(row) + '</div>' +
    '</article>';
  }

  function render(){
    ensureHeader();
    ensureChatPanel();
    var list = $('[data-buddy-list]');
    if(!list) return;

    $$('[data-buddy-tab]').forEach(function(tab){
      tab.classList.toggle('active', tab.dataset.buddyTab === activeTab);
    });

    if(!app().state.user){
      list.innerHTML = '<div class="empty">请先登录后查看搭子中心。</div>';
      return;
    }

    var rows = currentRows();
    if(!rows.length){
      var text = activeTab === 'friends' ? '暂时还没有搭子，可以先搜索实验品。' : activeTab === 'incoming' ? '暂时没有收到新的搭子申请。' : '暂时没有发出的搭子申请。';
      list.innerHTML = '<div class="empty">' + text + '</div>';
      return;
    }
    list.innerHTML = rows.map(rowHtml).join('');
  }

  async function load(force){
    if(loaded && !force){ render(); return; }
    var list = $('[data-buddy-list]');
    if(list) list.innerHTML = '<div class="loading">正在读取搭子列表...</div>';

    try{
      await app().refreshUser();
      var me = app().state.user;
      if(!me){ loaded = true; render(); return; }
      if(!(await app().waitForDb())) throw new Error('暂时无法连接数据服务。');
      var c = client();
      friendshipRows = fail(
        await c
          .from('friendships')
          .select('id,requester_id,receiver_id,status,created_at,updated_at')
          .or('requester_id.eq.' + me.id + ',receiver_id.eq.' + me.id)
          .order('updated_at', {ascending:false}),
        '搭子列表读取失败'
      ) || [];
      var ids = [];
      friendshipRows.forEach(function(row){ ids.push(row.requester_id, row.receiver_id); });
      profileMap = await fetchProfiles(ids);
      loaded = true;
      render();
    }catch(e){
      console.warn('[FW mobile app] buddy load failed', e);
      if(list) list.innerHTML = '<div class="error">搭子列表暂时读取失败，请稍后再试。</div>';
    }
  }

  function searchActions(profile, friendship){
    var me = app().state.user;
    if(!me) return '';
    if(String(profile.id) === String(me.id)){
      return '<div class="buddy-actions"><button class="buddy-mini-btn" type="button" disabled>这是你自己</button></div>';
    }
    if(!friendship){
      return '<div class="buddy-actions"><button class="buddy-mini-btn dark" type="button" data-buddy-add="' + esc(profile.id) + '">加为搭子</button></div>';
    }
    if(friendship.status === 'accepted'){
      return '<div class="buddy-actions"><button class="buddy-mini-btn dark" type="button" data-buddy-open-chat="' + esc(profile.id) + '">打开私聊</button><button class="buddy-mini-btn danger" type="button" data-buddy-remove="' + esc(friendship.id) + '">解除搭子</button></div>';
    }
    if(friendship.status === 'pending' && friendship.requester_id === me.id){
      return '<div class="buddy-actions"><button class="buddy-mini-btn" type="button" disabled>等待处理</button><button class="buddy-mini-btn danger" type="button" data-buddy-remove="' + esc(friendship.id) + '">撤回申请</button></div>';
    }
    if(friendship.status === 'pending' && friendship.receiver_id === me.id){
      return '<div class="buddy-actions"><button class="buddy-mini-btn dark" type="button" data-buddy-accept="' + esc(friendship.id) + '">同意</button><button class="buddy-mini-btn danger" type="button" data-buddy-reject="' + esc(friendship.id) + '">拒绝</button></div>';
    }
    return '<div class="buddy-actions"><button class="buddy-mini-btn dark" type="button" data-buddy-add="' + esc(profile.id) + '">重新申请</button></div>';
  }

  async function search(keyword){
    var result = $('[data-buddy-search-result]');
    if(!result) return;
    var q = String(keyword || '').trim();
    if(q.length < 2){
      toast('至少输入 2 个字符；邮箱需要完整输入。');
      return;
    }
    await app().refreshUser();
    if(!app().state.user){ toast('请先登录后再搜索搭子。'); app().setView('profile'); return; }
    result.classList.add('buddy-search-result');
    result.innerHTML = '<div class="loading">正在搜索实验品...</div>';

    try{
      if(!(await app().waitForDb())) throw new Error('暂时无法连接数据服务。');
      if(!loaded) await load(true);
      var rows = fail(await client().rpc('fw_search_profiles', {search_text:q}), '搜索失败') || [];
      if(!rows.length){ result.innerHTML = '<div class="empty">没有找到对应实验品。</div>'; return; }
      var html = ['<button class="buddy-mini-btn buddy-search-clear" type="button" data-buddy-clear-search>清空搜索结果</button>'];
      rows.forEach(function(profile){
        var friendship = friendshipBetween(profile.id);
        var sub = profile.lab_code ? '实验品编号：' + profile.lab_code : '实验品编号：未设置';
        html.push('<article class="list-item buddy-row">' + avatar(profile) + '<div class="list-main"><b>' + esc(profile.nickname || '低功耗研究员') + '</b><span>' + esc(sub) + '</span>' + searchActions(profile, friendship) + '</div></article>');
      });
      result.innerHTML = html.join('');
    }catch(e){
      console.warn('[FW mobile app] buddy search failed', e);
      result.innerHTML = '<div class="error">搜索暂时失败，请稍后再试。</div>';
    }
  }

  async function rpc(name, args, message){
    var result = await client().rpc(name, args || {});
    if(result && result.error) throw new Error(message || result.error.message || '操作失败');
    return result ? result.data : null;
  }

  async function handleAction(button, action){
    if(!button) return;
    await app().refreshUser();
    if(!app().state.user){ toast('请先登录。'); app().setView('profile'); return; }
    if(!(await app().waitForDb())){ toast('暂时无法连接数据服务。'); return; }
    var old = button.textContent;
    button.disabled = true;
    button.textContent = '处理中...';
    try{
      await action();
      loaded = false;
      await load(true);
    }catch(e){
      console.warn('[FW mobile app] buddy action failed', e);
      toast(e.message || '操作失败，请稍后再试。');
    }finally{
      button.disabled = false;
      button.textContent = old;
    }
  }

  async function addBuddy(button){
    var targetId = button.dataset.buddyAdd || '';
    await handleAction(button, async function(){
      await rpc('fw_send_friend_request', {target_user_id:targetId}, '发送申请失败');
      toast('搭子申请已发出。');
      activeTab = 'outgoing';
      var result = $('[data-buddy-search-result]');
      if(result) result.innerHTML = '';
    });
  }

  async function acceptBuddy(button){
    var id = Number(button.dataset.buddyAccept);
    await handleAction(button, async function(){
      await rpc('fw_respond_friendship', {target_friendship_id:id, accept_request:true}, '处理失败');
      toast('已同意搭子申请。');
      activeTab = 'friends';
      var result = $('[data-buddy-search-result]');
      if(result) result.innerHTML = '';
    });
  }

  async function rejectBuddy(button){
    var id = Number(button.dataset.buddyReject);
    await handleAction(button, async function(){
      await rpc('fw_respond_friendship', {target_friendship_id:id, accept_request:false}, '处理失败');
      toast('已拒绝搭子申请。');
      activeTab = 'incoming';
    });
  }

  async function removeBuddy(button){
    var id = Number(button.dataset.buddyRemove);
    var label = String(button.textContent || '处理');
    var ok = true;
    if(/解除/.test(label)) ok = window.confirm('确定解除这个搭子关系吗？');
    if(!ok) return;
    await handleAction(button, async function(){
      await rpc('fw_remove_friendship', {target_friendship_id:id}, '操作失败');
      toast(/撤回/.test(label) ? '已撤回搭子申请。' : '已处理搭子关系。');
      closeChat(false);
    });
  }

  function openChatShell(){
    var view = $('[data-app-view="buddy"]');
    ensureChatPanel();
    if(view) view.classList.add('is-chatting');
    var input = $('[data-buddy-chat-form] input');
    setTimeout(function(){ if(input) input.focus(); }, 80);
  }

  function closeChat(clearTarget){
    clearInterval(chatTimer);
    chatTimer = null;
    activeConversationId = null;
    if(clearTarget !== false){
      activeTargetId = '';
      activeProfile = null;
    }
    var view = $('[data-app-view="buddy"]');
    if(view) view.classList.remove('is-chatting');
  }

  async function openChat(targetId){
    targetId = String(targetId || '');
    if(!targetId) return;
    await app().refreshUser();
    if(!app().state.user){ toast('请先登录后再私聊。'); app().setView('profile'); return; }
    if(!(await app().waitForDb())){ toast('暂时无法连接数据服务。'); return; }
    if(!loaded) await load(true);

    activeTargetId = targetId;
    openChatShell();
    var title = $('[data-buddy-chat-title]');
    var sub = $('[data-buddy-chat-sub]');
    var box = $('[data-buddy-chat-messages]');
    if(box) box.innerHTML = '<div class="buddy-empty-tip">正在打开私聊...</div>';

    try{
      var profiles = await fetchProfiles([targetId]);
      activeProfile = profiles[targetId] || profileMap[targetId] || {};
      if(title) title.textContent = '和 ' + (activeProfile.nickname || '摸鱼搭子') + ' 私聊';
      if(sub) sub.textContent = activeProfile.lab_code ? '实验品编号：' + activeProfile.lab_code : '实验品编号：未设置';
      var convId = Number(await rpc('fw_get_or_create_conversation', {target_user_id:targetId}, '私聊会话创建失败'));
      if(!Number.isFinite(convId) || convId <= 0) throw new Error('私聊会话创建失败。');
      activeConversationId = convId;
      await loadMessages();
      clearInterval(chatTimer);
      chatTimer = setInterval(function(){
        var fw = app();
        if(fw && fw.state && fw.state.view === 'buddy' && activeConversationId) loadMessages(true);
      }, 4500);
    }catch(e){
      console.warn('[FW mobile app] buddy chat open failed', e);
      if(box) box.innerHTML = '<div class="buddy-empty-tip">私聊打开失败：' + esc(e.message || '请稍后重试。') + '</div>';
    }
  }

  function messageHtml(message, profiles){
    var me = app().state.user;
    var mine = !!(me && message.sender_id === me.id);
    var p = profiles[message.sender_id] || {};
    var name = mine ? '你' : (p.nickname || '搭子');
    return '<div class="buddy-message' + (mine ? ' mine' : '') + '"><div class="buddy-message-name">' + esc(name) + '</div><div class="buddy-message-bubble">' + esc(message.content || '') + '</div></div>';
  }

  async function loadMessages(quiet){
    var box = $('[data-buddy-chat-messages]');
    if(!box || !activeConversationId) return;
    if(!quiet) box.innerHTML = '<div class="buddy-empty-tip">正在读取私聊...</div>';
    try{
      var rows = fail(await client()
        .from('private_messages')
        .select('id,conversation_id,sender_id,content,is_deleted,created_at')
        .eq('conversation_id', activeConversationId)
        .eq('is_deleted', false)
        .order('created_at', {ascending:true})
        .limit(200), '私聊读取失败') || [];
      if(!rows.length){
        box.innerHTML = '<div class="buddy-empty-tip">还没有私聊消息。可以先低功耗地打个招呼。</div>';
        return;
      }
      var profiles = await fetchProfiles(rows.map(function(row){ return row.sender_id; }));
      box.innerHTML = rows.map(function(row){ return messageHtml(row, profiles); }).join('');
      if(typeof window.fwRenderStickerMessages === 'function') window.fwRenderStickerMessages();
      box.scrollTop = box.scrollHeight;
    }catch(e){
      console.warn('[FW mobile app] buddy messages load failed', e);
      if(!quiet) box.innerHTML = '<div class="buddy-empty-tip">私聊读取失败，请稍后重试。</div>';
    }
  }

  async function sendMessage(form){
    if(!activeTargetId){ toast('先选择一个搭子。'); return; }
    var input = form.querySelector('input[name="message"]');
    var text = String(input && input.value || '').trim();
    if(!text){ if(input) input.focus(); return; }
    var stickerPayload = isStickerPayload(text);
    if(!stickerPayload && text.length > 300){ toast('私聊最多 300 字。'); return; }
    if(!stickerPayload && hasLink(text)){ toast('私聊暂不支持链接。'); return; }
    var button = form.querySelector('button');
    var old = button.textContent;
    button.disabled = true;
    button.textContent = '发送中...';
    try{
      var convId = Number(await rpc('fw_send_private_message_to_user', {target_user_id:activeTargetId, message_text:text}, '发送失败'));
      if(Number.isFinite(convId) && convId > 0) activeConversationId = convId;
      input.value = '';
      await loadMessages();
    }catch(e){
      console.warn('[FW mobile app] buddy send failed', e);
      toast(e.message || '发送失败。');
    }finally{
      button.disabled = false;
      button.textContent = old;
    }
  }

  function bindSwipeBack(){
    var main = $('#appMain');
    if(!main) return;
    main.addEventListener('touchstart', function(e){
      var view = $('[data-app-view="buddy"]');
      if(!view || !view.classList.contains('is-chatting')) return;
      var touch = e.touches && e.touches[0];
      if(!touch || touch.clientX > 42) return;
      touchState = {x:touch.clientX, y:touch.clientY};
    }, {passive:true});
    main.addEventListener('touchend', function(e){
      if(!touchState) return;
      var touch = e.changedTouches && e.changedTouches[0];
      if(!touch){ touchState = null; return; }
      var dx = touch.clientX - touchState.x;
      var dy = Math.abs(touch.clientY - touchState.y);
      touchState = null;
      if(dx >= 72 && dy <= 55) closeChat(true);
    }, {passive:true});
  }

  function bind(){
    if(bound) return;
    bound = true;

    document.addEventListener('click', function(e){
      var nav = e.target.closest && e.target.closest('[data-app-nav]');
      if(nav && nav.dataset.appNav !== 'buddy') closeChat(true);

      var reload = e.target.closest && e.target.closest('[data-buddy-reload]');
      if(reload){ e.preventDefault(); loaded = false; load(true); return; }

      var clearSearch = e.target.closest && e.target.closest('[data-buddy-clear-search]');
      if(clearSearch){ e.preventDefault(); var result = $('[data-buddy-search-result]'); if(result) result.innerHTML = ''; return; }

      var back = e.target.closest && e.target.closest('[data-buddy-chat-back]');
      if(back){ e.preventDefault(); closeChat(true); return; }

      var tab = e.target.closest && e.target.closest('[data-buddy-tab]');
      if(tab){
        e.preventDefault();
        activeTab = tab.dataset.buddyTab || 'friends';
        closeChat(true);
        var resultNode = $('[data-buddy-search-result]');
        if(resultNode) resultNode.innerHTML = '';
        render();
        return;
      }

      var add = e.target.closest && e.target.closest('[data-buddy-add]');
      if(add){ e.preventDefault(); addBuddy(add); return; }
      var accept = e.target.closest && e.target.closest('[data-buddy-accept]');
      if(accept){ e.preventDefault(); acceptBuddy(accept); return; }
      var reject = e.target.closest && e.target.closest('[data-buddy-reject]');
      if(reject){ e.preventDefault(); rejectBuddy(reject); return; }
      var remove = e.target.closest && e.target.closest('[data-buddy-remove]');
      if(remove){ e.preventDefault(); removeBuddy(remove); return; }
      var chat = e.target.closest && e.target.closest('[data-buddy-open-chat]');
      if(chat){ e.preventDefault(); openChat(chat.dataset.buddyOpenChat); return; }

      var row = e.target.closest && e.target.closest('[data-buddy-user]');
      if(row && !e.target.closest('button')){
        var friendshipId = row.dataset.buddyFriendship || '';
        var f = friendshipRows.find(function(item){ return String(item.id) === String(friendshipId); });
        if(f && f.status === 'accepted') openChat(row.dataset.buddyUser);
      }
    });

    document.addEventListener('submit', function(e){
      var form = e.target.closest && e.target.closest('[data-buddy-search]');
      if(form){
        e.preventDefault();
        search(form.q.value);
        return;
      }
      var chatForm = e.target.closest && e.target.closest('[data-buddy-chat-form]');
      if(chatForm){
        e.preventDefault();
        sendMessage(chatForm);
      }
    });

    bindSwipeBack();
  }

  function init(){ injectStyle(); ensureHeader(); ensureChatPanel(); bind(); }
  function ensureLoaded(){ load(false); }

  window.FWAppBuddy = {init:init, load:load, ensureLoaded:ensureLoaded, openChat:openChat, closeChat:closeChat};
})();
