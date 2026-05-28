(function(){
  if(window.FWAppBuddy) return;

  var bound = false;
  var loaded = false;
  var activeTab = 'messages';
  var friendshipRows = [];
  var profileMap = {};
  var activeTargetId = '';
  var activeConversationId = null;
  var activeProfile = null;
  var chatTimer = null;
  var touchState = null;
  var messageLoading = false;

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

  function injectStyle(){
    if(document.getElementById('fwAppBuddyStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwAppBuddyStyle';
    style.textContent = [
      '[data-app-view="buddy"]{padding-top:72px!important}',
      '[data-app-view="buddy"] > .view-head,[data-app-view="buddy"] > [data-buddy-search],[data-app-view="buddy"] > [data-buddy-search-result]{display:none!important}',
      '[data-app-view="buddy"] > .tabs{position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 72px);z-index:80;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0;padding:8px 0 10px;background:linear-gradient(180deg,rgba(248,244,235,.98),rgba(238,232,220,.94));box-shadow:0 10px 24px rgba(16,23,15,.08)}',
      '[data-app-view="buddy"] > .tabs button{min-height:48px;border:1px solid rgba(30,30,28,.12);border-radius:16px;background:rgba(255,253,247,.94);color:var(--muted);font-size:15px;font-weight:1000;box-shadow:0 8px 22px rgba(16,23,15,.05)}',
      '[data-app-view="buddy"] > .tabs button.active{background:var(--deep);border-color:var(--deep);color:#fff}',
      '[data-app-view="buddy"].is-chatting,[data-app-view="buddy"].is-profile{padding-top:0!important}',
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
      '.buddy-section{display:grid;gap:10px;margin:0 0 14px}',
      '.buddy-section-title{margin:6px 2px 0;color:var(--accent-dark);font-size:13px;font-weight:1000;letter-spacing:.08em}',
      '.buddy-letter{position:sticky;top:calc(env(safe-area-inset-top,0px) + 132px);z-index:5;margin:8px 2px 0;padding:5px 8px;border-radius:999px;background:rgba(16,23,15,.08);color:var(--green);font-size:12px;font-weight:1000;width:max-content}',
      '.buddy-inline-search{display:grid!important;grid-template-columns:minmax(0,1fr) 74px;gap:8px;padding:10px;margin:0 0 10px;border-radius:16px;background:var(--panel);box-shadow:0 8px 22px rgba(16,23,15,.05)}',
      '.buddy-inline-search input{height:42px;border:1px solid rgba(30,30,28,.13);border-radius:999px;background:#fffdf7;padding:0 13px;font-weight:900;min-width:0}',
      '.buddy-inline-search button{height:42px;border:0;border-radius:999px;background:var(--deep);color:#fff;font-weight:1000}',
      '.buddy-search-result{display:grid;gap:10px;margin:0 0 12px}',
      '.buddy-search-clear{justify-self:start;margin-bottom:4px}',
      '.buddy-message-row .list-avatar,.buddy-message-row .buddy-avatar-wrap{position:relative}',
      '.buddy-avatar-wrap{display:inline-grid;position:relative;place-items:center}',
      '.buddy-avatar-wrap .list-avatar{grid-area:1/1}',
      '.buddy-dot{position:absolute;right:1px;top:1px;width:10px;height:10px;border-radius:999px;background:#e64b4b;border:2px solid #fffdf7;box-shadow:0 0 0 1px rgba(230,75,75,.25)}',
      '.buddy-message-snippet{display:block;margin-top:3px;color:var(--muted);font-size:12px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.buddy-message-time{display:block;margin-top:5px;color:var(--accent-dark);font-size:11px;font-weight:1000}',
      '.buddy-contact-list{display:grid;gap:0;border-radius:14px;background:rgba(255,253,247,.72);overflow:hidden;border:1px solid rgba(30,30,28,.08)}',
      '.buddy-contact-row{display:grid;grid-template-columns:48px minmax(0,1fr);align-items:center;gap:12px;min-height:68px;padding:10px 12px;border:0;border-bottom:1px solid rgba(30,30,28,.08);background:#fffdf7;text-align:left;color:var(--text)}',
      '.buddy-contact-row:last-child{border-bottom:0}',
      '.buddy-contact-row .list-avatar{width:44px;height:44px;border-radius:10px}',
      '.buddy-contact-name{font-size:17px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.buddy-profile-panel{display:none;min-height:100%;padding-bottom:8px}',
      '[data-app-view="buddy"].is-profile > .tabs,[data-app-view="buddy"].is-profile > [data-buddy-list]{display:none!important}',
      '[data-app-view="buddy"].is-profile > .buddy-profile-panel{display:block}',
      '.buddy-profile-card{margin-top:8px;border-radius:0;background:#fffdf7;border:0;box-shadow:none;overflow:hidden}',
      '.buddy-profile-top{display:grid;grid-template-columns:82px minmax(0,1fr);gap:18px;align-items:center;padding:34px 8px 30px}',
      '.buddy-profile-top .list-avatar{width:82px;height:82px;border-radius:12px;font-size:22px}',
      '.buddy-profile-name{font-size:30px;line-height:1.15;font-weight:1000;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.buddy-profile-meta{margin-top:8px;color:var(--muted);font-size:15px;line-height:1.65;font-weight:850}',
      '.buddy-profile-section{border-top:10px solid #f0f0f0;background:#fffdf7}',
      '.buddy-profile-line{display:grid;grid-template-columns:96px minmax(0,1fr) 20px;gap:12px;align-items:start;padding:17px 2px;border-bottom:1px solid rgba(30,30,28,.08);font-size:16px}',
      '.buddy-profile-line b{font-weight:1000}',
      '.buddy-profile-line span{color:var(--muted);font-size:14px;line-height:1.6;font-weight:850}',
      '.buddy-profile-arrow{color:#bbb;text-align:right;font-size:24px;line-height:1}',
      '.buddy-profile-actions{display:grid;gap:0;margin-top:0;border-top:10px solid #f0f0f0;background:#fffdf7}',
      '.buddy-profile-action{height:64px;border:0;border-bottom:1px solid rgba(30,30,28,.08);background:#fffdf7;color:#586986;font-size:18px;font-weight:1000}',
      '.buddy-profile-action.danger{color:var(--accent-dark)}',
      '.buddy-chat-panel{display:none;min-height:100%;padding-bottom:8px}',
      '[data-app-view="buddy"].is-chatting > .tabs,[data-app-view="buddy"].is-chatting > [data-buddy-list],[data-app-view="buddy"].is-chatting > .buddy-profile-panel{display:none!important}',
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
      '.buddy-empty-tip{border:1px dashed rgba(30,30,28,.18);border-radius:14px;background:rgba(255,253,247,.68);padding:15px;color:var(--muted);font-size:13px;line-height:1.55;font-weight:900}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureTabs(){
    var tabs = $$('[data-buddy-tab]');
    if(tabs.length >= 3){
      tabs[0].dataset.buddyTab = 'messages';
      tabs[0].textContent = '消息';
      tabs[1].dataset.buddyTab = 'friends';
      tabs[1].textContent = '全部搭子';
      tabs[2].dataset.buddyTab = 'new';
      tabs[2].textContent = '新的搭子';
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
    panel.innerHTML = [
      '<div class="view-head compact buddy-chat-title-wrap">',
        '<button class="back-btn" type="button" data-buddy-chat-back>‹ 搭子资料</button>',
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

  function ensureProfilePanel(){
    var view = $('[data-app-view="buddy"]');
    if(!view) return null;
    var panel = $('[data-buddy-profile-panel]', view);
    if(panel) return panel;
    panel = document.createElement('section');
    panel.className = 'buddy-profile-panel';
    panel.dataset.buddyProfilePanel = 'true';
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

  function otherId(row, meId){ return row.requester_id === meId ? row.receiver_id : row.requester_id; }
  function acceptedRows(){ return friendshipRows.filter(function(row){ return row.status === 'accepted'; }); }
  function incomingRows(){ var me = app().state.user; return me ? friendshipRows.filter(function(row){ return row.status === 'pending' && row.receiver_id === me.id; }) : []; }
  function outgoingRows(){ var me = app().state.user; return me ? friendshipRows.filter(function(row){ return row.status === 'pending' && row.requester_id === me.id; }) : []; }

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
    return '';
  }

  function requestRowHtml(row){
    var me = app().state.user;
    var id = otherId(row, me.id);
    var profile = profileMap[id] || {};
    var name = profile.nickname || '低功耗研究员';
    var sub = profile.lab_code ? '实验品编号：' + profile.lab_code : '实验品编号：未设置';
    if(row.status === 'pending' && row.receiver_id === me.id) sub += ' · 对方想加你为搭子';
    if(row.status === 'pending' && row.requester_id === me.id) sub += ' · 等待对方处理';
    return '<article class="list-item buddy-row" data-buddy-user="' + esc(id) + '" data-buddy-friendship="' + esc(row.id) + '">' + avatar(profile) + '<div class="list-main"><b>' + esc(name) + '</b><span>' + esc(sub) + '</span>' + rowActions(row) + '</div></article>';
  }

  var pinyinCollator = null;
  function collator(){
    if(!pinyinCollator){
      try{ pinyinCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', {numeric:true, sensitivity:'base'}); }
      catch(e){ pinyinCollator = {compare:function(a,b){ return String(a).localeCompare(String(b), 'zh-CN'); }}; }
    }
    return pinyinCollator;
  }

  function sortName(profile){ return String(profile && (profile.nickname || profile.lab_code) || '低功耗研究员'); }

  function initialForName(name){
    name = String(name || '').trim();
    if(!name) return '#';
    var first = name[0];
    var latin = first.match(/[A-Za-z]/);
    if(latin) return latin[0].toUpperCase();
    var digit = first.match(/[0-9]/);
    if(digit) return '#';
    var bounds = [['A','阿'],['B','八'],['C','嚓'],['D','哒'],['E','妸'],['F','发'],['G','旮'],['H','哈'],['J','讥'],['K','咔'],['L','垃'],['M','妈'],['N','拿'],['O','噢'],['P','啪'],['Q','七'],['R','蚺'],['S','仨'],['T','他'],['W','哇'],['X','夕'],['Y','丫'],['Z','匝']];
    var c = collator();
    var letter = '#';
    for(var i = 0; i < bounds.length; i++){
      if(c.compare(first, bounds[i][1]) >= 0) letter = bounds[i][0];
      else break;
    }
    return letter;
  }

  function renderFriendGroups(){
    var list = $('[data-buddy-list]');
    if(!list) return;
    var rows = acceptedRows().slice();
    if(!rows.length){ list.innerHTML = '<div class="empty">暂时还没有搭子，可以到“新的搭子”里搜索实验品。</div>'; return; }
    var me = app().state.user;
    rows.sort(function(a,b){
      var pa = profileMap[otherId(a, me.id)] || {};
      var pb = profileMap[otherId(b, me.id)] || {};
      return collator().compare(sortName(pa), sortName(pb));
    });
    var html = [];
    var last = '';
    var inGroup = false;
    rows.forEach(function(row){
      var id = otherId(row, me.id);
      var p = profileMap[id] || {};
      var letter = initialForName(sortName(p));
      if(letter !== last){
        if(inGroup) html.push('</div>');
        html.push('<div class="buddy-letter">' + esc(letter) + '</div><div class="buddy-contact-list">');
        inGroup = true;
        last = letter;
      }
      html.push('<button class="buddy-contact-row" type="button" data-buddy-profile="' + esc(id) + '">' + avatar(p) + '<span class="buddy-contact-name">' + esc(p.nickname || '低功耗研究员') + '</span></button>');
    });
    if(inGroup) html.push('</div>');
    list.innerHTML = html.join('');
  }

  function renderNewBuddies(){
    var list = $('[data-buddy-list]');
    if(!list) return;
    var incoming = incomingRows();
    var outgoing = outgoingRows();
    var html = [
      '<form class="search-card buddy-inline-search" data-buddy-search>',
        '<input name="q" autocomplete="off" placeholder="搜索实验品编号 / 昵称 / 完整邮箱">',
        '<button type="submit">搜索</button>',
      '</form>',
      '<div class="search-result buddy-search-result" data-buddy-search-result></div>'
    ];
    html.push('<section class="buddy-section"><h2 class="buddy-section-title">收到申请</h2>');
    html.push(incoming.length ? incoming.map(requestRowHtml).join('') : '<div class="empty">暂时没有收到新的搭子申请。</div>');
    html.push('</section>');
    html.push('<section class="buddy-section"><h2 class="buddy-section-title">发出申请</h2>');
    html.push(outgoing.length ? outgoing.map(requestRowHtml).join('') : '<div class="empty">暂时没有发出的搭子申请。</div>');
    html.push('</section>');
    list.innerHTML = html.join('');
  }

  function messageRowHtml(item){
    var profile = item.profile || {};
    var snippet = item.content || '[消息]';
    return '<article class="list-item buddy-row buddy-message-row is-clickable" data-buddy-open-chat="' + esc(item.userId) + '"><span class="buddy-avatar-wrap">' + avatar(profile) + '<i class="buddy-dot" aria-hidden="true"></i></span><div class="list-main"><b>' + esc(profile.nickname || '低功耗搭子') + '</b><span class="buddy-message-snippet">' + esc(snippet) + '</span><span class="buddy-message-time">' + esc(timeText(item.created_at)) + '</span></div></article>';
  }

  async function renderMessages(){
    var list = $('[data-buddy-list]');
    if(!list || messageLoading) return;
    var rows = acceptedRows();
    if(!rows.length){ list.innerHTML = '<div class="empty">暂时还没有搭子消息。先去“新的搭子”加一个搭子吧。</div>'; return; }
    var me = app().state.user;
    var buddyIds = rows.map(function(row){ return otherId(row, me.id); });
    list.innerHTML = '<div class="loading">正在读取搭子消息...</div>';
    messageLoading = true;
    try{
      var messages = fail(await client().from('private_messages').select('id,conversation_id,sender_id,content,is_deleted,created_at').in('sender_id', buddyIds).eq('is_deleted', false).order('created_at', {ascending:false}).limit(120), '消息读取失败') || [];
      var seen = {};
      var latest = [];
      messages.forEach(function(msg){
        if(seen[msg.sender_id]) return;
        seen[msg.sender_id] = true;
        latest.push({userId:msg.sender_id, content:msg.content || '', created_at:msg.created_at, profile:profileMap[msg.sender_id] || {}});
      });
      if(!latest.length){ list.innerHTML = '<div class="empty">暂时没有搭子给你发来的消息。</div>'; return; }
      list.innerHTML = latest.map(messageRowHtml).join('');
    }catch(e){
      console.warn('[FW mobile app] buddy messages tab failed', e);
      list.innerHTML = '<div class="error">搭子消息暂时读取失败，请稍后再试。</div>';
    }finally{
      messageLoading = false;
    }
  }

  function render(){
    ensureTabs();
    ensureChatPanel();
    ensureProfilePanel();
    closeProfile(false);
    var list = $('[data-buddy-list]');
    if(!list) return;
    $$('[data-buddy-tab]').forEach(function(tab){ tab.classList.toggle('active', tab.dataset.buddyTab === activeTab); });
    if(!app().state.user){ list.innerHTML = '<div class="empty">请先登录后查看搭子中心。</div>'; return; }
    if(activeTab === 'messages'){ renderMessages(); return; }
    if(activeTab === 'new'){ renderNewBuddies(); return; }
    renderFriendGroups();
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
      friendshipRows = fail(await c.from('friendships').select('id,requester_id,receiver_id,status,created_at,updated_at').or('requester_id.eq.' + me.id + ',receiver_id.eq.' + me.id).order('updated_at', {ascending:false}), '搭子列表读取失败') || [];
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

  function activeSearchResult(){
    var nodes = $$('[data-buddy-search-result]');
    return nodes.length ? nodes[nodes.length - 1] : null;
  }

  function searchActions(profile, friendship){
    var me = app().state.user;
    if(!me) return '';
    if(String(profile.id) === String(me.id)) return '<div class="buddy-actions"><button class="buddy-mini-btn" type="button" disabled>这是你自己</button></div>';
    if(!friendship) return '<div class="buddy-actions"><button class="buddy-mini-btn dark" type="button" data-buddy-add="' + esc(profile.id) + '">加为搭子</button></div>';
    if(friendship.status === 'accepted') return '<div class="buddy-actions"><button class="buddy-mini-btn dark" type="button" data-buddy-profile="' + esc(profile.id) + '">查看资料</button><button class="buddy-mini-btn danger" type="button" data-buddy-remove="' + esc(friendship.id) + '">解除搭子</button></div>';
    if(friendship.status === 'pending' && friendship.requester_id === me.id) return '<div class="buddy-actions"><button class="buddy-mini-btn" type="button" disabled>等待处理</button><button class="buddy-mini-btn danger" type="button" data-buddy-remove="' + esc(friendship.id) + '">撤回申请</button></div>';
    if(friendship.status === 'pending' && friendship.receiver_id === me.id) return '<div class="buddy-actions"><button class="buddy-mini-btn dark" type="button" data-buddy-accept="' + esc(friendship.id) + '">同意</button><button class="buddy-mini-btn danger" type="button" data-buddy-reject="' + esc(friendship.id) + '">拒绝</button></div>';
    return '<div class="buddy-actions"><button class="buddy-mini-btn dark" type="button" data-buddy-add="' + esc(profile.id) + '">重新申请</button></div>';
  }

  async function search(keyword){
    var result = activeSearchResult();
    if(!result) return;
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
    try{ await action(); loaded = false; await load(true); }
    catch(e){ console.warn('[FW mobile app] buddy action failed', e); toast(e.message || '操作失败，请稍后再试。'); }
    finally{ button.disabled = false; button.textContent = old; }
  }

  function clearSearch(){ var result = activeSearchResult(); if(result) result.innerHTML = ''; }
  async function addBuddy(button){ var targetId = button.dataset.buddyAdd || ''; await handleAction(button, async function(){ await rpc('fw_send_friend_request', {target_user_id:targetId}, '发送申请失败'); toast('搭子申请已发出。'); activeTab = 'new'; clearSearch(); }); }
  async function acceptBuddy(button){ var id = Number(button.dataset.buddyAccept); await handleAction(button, async function(){ await rpc('fw_respond_friendship', {target_friendship_id:id, accept_request:true}, '处理失败'); toast('已同意搭子申请。'); activeTab = 'friends'; clearSearch(); }); }
  async function rejectBuddy(button){ var id = Number(button.dataset.buddyReject); await handleAction(button, async function(){ await rpc('fw_respond_friendship', {target_friendship_id:id, accept_request:false}, '处理失败'); toast('已拒绝搭子申请。'); activeTab = 'new'; }); }
  async function removeBuddy(button){
    var id = Number(button.dataset.buddyRemove);
    var label = String(button.textContent || '处理');
    var ok = true;
    if(/解除/.test(label)) ok = window.confirm('确定解除这个搭子关系吗？');
    if(!ok) return;
    await handleAction(button, async function(){ await rpc('fw_remove_friendship', {target_friendship_id:id}, '操作失败'); toast(/撤回/.test(label) ? '已撤回搭子申请。' : '已处理搭子关系。'); closeChat(false); closeProfile(false); });
  }

  function openProfile(targetId){
    targetId = String(targetId || '');
    if(!targetId) return;
    var profile = profileMap[targetId] || {};
    var relation = friendshipBetween(targetId);
    var panel = ensureProfilePanel();
    var view = $('[data-app-view="buddy"]');
    activeTargetId = targetId;
    activeProfile = profile;
    closeChat(false);
    if(view) view.classList.add('is-profile');
    var remove = relation && relation.status === 'accepted' ? '<button class="buddy-profile-action danger" type="button" data-buddy-remove="' + esc(relation.id) + '">解除搭子</button>' : '';
    panel.innerHTML = [
      '<div class="view-head compact">',
        '<button class="back-btn" type="button" data-buddy-profile-back>‹ 通讯录</button>',
      '</div>',
      '<div class="buddy-profile-card">',
        '<div class="buddy-profile-top">',
          avatar(profile),
          '<div><div class="buddy-profile-name">' + esc(profile.nickname || '低功耗研究员') + '</div><div class="buddy-profile-meta">实验品编号：' + esc(profile.lab_code || '未设置') + '<br>身份：F.w 研究所搭子</div></div>',
        '</div>',
        '<div class="buddy-profile-section">',
          '<div class="buddy-profile-line"><b>搭子资料</b><span>这里显示对方公开昵称、头像和实验品编号。手机号、真实姓名等隐私信息不会展示。</span><i class="buddy-profile-arrow">›</i></div>',
          '<div class="buddy-profile-line"><b>动态</b><span>后续可接入对方公开发布内容。</span><i class="buddy-profile-arrow">›</i></div>',
        '</div>',
        '<div class="buddy-profile-actions">',
          '<button class="buddy-profile-action" type="button" data-buddy-open-chat="' + esc(targetId) + '">💬 发消息</button>',
          remove,
        '</div>',
      '</div>'
    ].join('');
  }

  function closeProfile(resetTarget){
    var view = $('[data-app-view="buddy"]');
    if(view) view.classList.remove('is-profile');
    if(resetTarget){ activeTargetId = ''; activeProfile = null; }
  }

  function openChatShell(){
    var view = $('[data-app-view="buddy"]');
    ensureChatPanel();
    closeProfile(false);
    if(view) view.classList.add('is-chatting');
    var input = $('[data-buddy-chat-form] input');
    setTimeout(function(){ if(input) input.focus(); }, 80);
  }

  function closeChat(clearTarget){
    clearInterval(chatTimer);
    chatTimer = null;
    activeConversationId = null;
    if(clearTarget !== false){ activeTargetId = ''; activeProfile = null; }
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
      chatTimer = setInterval(function(){ var fw = app(); if(fw && fw.state && fw.state.view === 'buddy' && activeConversationId) loadMessages(true); }, 4500);
    }catch(e){ console.warn('[FW mobile app] buddy chat open failed', e); if(box) box.innerHTML = '<div class="buddy-empty-tip">私聊打开失败：' + esc(e.message || '请稍后重试。') + '</div>'; }
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
      var rows = fail(await client().from('private_messages').select('id,conversation_id,sender_id,content,is_deleted,created_at').eq('conversation_id', activeConversationId).eq('is_deleted', false).order('created_at', {ascending:true}).limit(200), '私聊读取失败') || [];
      if(!rows.length){ box.innerHTML = '<div class="buddy-empty-tip">还没有私聊消息。可以先低功耗地打个招呼。</div>'; return; }
      var profiles = await fetchProfiles(rows.map(function(row){ return row.sender_id; }));
      box.innerHTML = rows.map(function(row){ return messageHtml(row, profiles); }).join('');
      if(typeof window.fwRenderStickerMessages === 'function') window.fwRenderStickerMessages();
      box.scrollTop = box.scrollHeight;
    }catch(e){ console.warn('[FW mobile app] buddy messages load failed', e); if(!quiet) box.innerHTML = '<div class="buddy-empty-tip">私聊读取失败，请稍后重试。</div>'; }
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
    }catch(e){ console.warn('[FW mobile app] buddy send failed', e); toast(e.message || '发送失败。'); }
    finally{ button.disabled = false; button.textContent = old; }
  }

  function bindSwipeBack(){
    var main = $('#appMain');
    if(!main) return;
    main.addEventListener('touchstart', function(e){
      var view = $('[data-app-view="buddy"]');
      if(!view || (!view.classList.contains('is-chatting') && !view.classList.contains('is-profile'))) return;
      var touch = e.touches && e.touches[0];
      if(!touch || touch.clientX > 42) return;
      touchState = {x:touch.clientX, y:touch.clientY, mode:view.classList.contains('is-chatting') ? 'chat' : 'profile'};
    }, {passive:true});
    main.addEventListener('touchend', function(e){
      if(!touchState) return;
      var touch = e.changedTouches && e.changedTouches[0];
      if(!touch){ touchState = null; return; }
      var dx = touch.clientX - touchState.x;
      var dy = Math.abs(touch.clientY - touchState.y);
      var mode = touchState.mode;
      touchState = null;
      if(dx >= 72 && dy <= 55){
        if(mode === 'chat' && activeTargetId) openProfile(activeTargetId);
        else closeProfile(true);
      }
    }, {passive:true});
  }

  function bind(){
    if(bound) return;
    bound = true;
    document.addEventListener('click', function(e){
      var nav = e.target.closest && e.target.closest('[data-app-nav]');
      if(nav && nav.dataset.appNav !== 'buddy'){ closeChat(true); closeProfile(true); }
      var clear = e.target.closest && e.target.closest('[data-buddy-clear-search]');
      if(clear){ e.preventDefault(); clearSearch(); return; }
      var profileBack = e.target.closest && e.target.closest('[data-buddy-profile-back]');
      if(profileBack){ e.preventDefault(); closeProfile(true); return; }
      var back = e.target.closest && e.target.closest('[data-buddy-chat-back]');
      if(back){ e.preventDefault(); if(activeTargetId) openProfile(activeTargetId); else closeChat(true); return; }
      var tab = e.target.closest && e.target.closest('[data-buddy-tab]');
      if(tab){ e.preventDefault(); activeTab = tab.dataset.buddyTab || 'messages'; closeChat(true); closeProfile(true); render(); return; }
      var add = e.target.closest && e.target.closest('[data-buddy-add]');
      if(add){ e.preventDefault(); addBuddy(add); return; }
      var accept = e.target.closest && e.target.closest('[data-buddy-accept]');
      if(accept){ e.preventDefault(); acceptBuddy(accept); return; }
      var reject = e.target.closest && e.target.closest('[data-buddy-reject]');
      if(reject){ e.preventDefault(); rejectBuddy(reject); return; }
      var remove = e.target.closest && e.target.closest('[data-buddy-remove]');
      if(remove){ e.preventDefault(); removeBuddy(remove); return; }
      var profileBtn = e.target.closest && e.target.closest('[data-buddy-profile]');
      if(profileBtn){ e.preventDefault(); openProfile(profileBtn.dataset.buddyProfile); return; }
      var chat = e.target.closest && e.target.closest('[data-buddy-open-chat]');
      if(chat){ e.preventDefault(); openChat(chat.dataset.buddyOpenChat); return; }
    });
    document.addEventListener('submit', function(e){
      var form = e.target.closest && e.target.closest('[data-buddy-search]');
      if(form){ e.preventDefault(); search(form.q.value); return; }
      var chatForm = e.target.closest && e.target.closest('[data-buddy-chat-form]');
      if(chatForm){ e.preventDefault(); sendMessage(chatForm); }
    });
    bindSwipeBack();
  }

  function init(){ injectStyle(); ensureTabs(); ensureChatPanel(); ensureProfilePanel(); bind(); }
  function ensureLoaded(){ load(false); }

  window.FWAppBuddy = {init:init, load:load, ensureLoaded:ensureLoaded, openChat:openChat, closeChat:closeChat, openProfile:openProfile};
})();
