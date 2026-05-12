// F.w 研究所：学术研讨聊天模块
// 说明：当前 rooms.html 内仍保留早期内联脚本。这个模块会在事件捕获阶段接管房间入口、消息发送与消息操作，
// 避免后续继续修改超长 HTML。后续确认稳定后，可再把 rooms.html 内联脚本彻底删除。
(function(){
  if(window.__FW_ROOMS_CHAT_REFACTOR__) return;
  window.__FW_ROOMS_CHAT_REFACTOR__ = true;

  const isRoomsPage = /(^|\/)rooms\.html$/.test(location.pathname) || /(^|\/)rooms\/?$/.test(location.pathname);
  if(!isRoomsPage) return;

  const MAX_LEN = 300;
  const ROOM_INFO = {
    complain:{type:'实时发泄区',title:'今日牢骚房',desc:'把当天不爽先放这里，不一定要被解决。'},
    lowpower:{type:'安静研讨区',title:'低功耗休息区',desc:'不想说太多，只想证明自己还在。'},
    nonsense:{type:'荒诞语录区',title:'废话研究室',desc:'专门研究看似有道理但没有用的话。'},
    offline:{type:'放空聊天区',title:'精神离岗室',desc:'身体在场，意识暂时请假。'},
    countdown:{type:'时间观察区',title:'下班倒计时区',desc:'距离下班还有多久，这件事值得被严肃研究。'},
    tea:{type:'轻聊天区',title:'茶水间回声',desc:'像在茶水间遇到同事一样，随便说两句。'}
  };

  const BLOCKED_TERMS = ['黄色网站','裸聊','约炮','赌博','博彩','代开发票','加微信','加qq'];
  const LINK_REG = /(https?:\/\/|www\.|[a-z0-9][a-z0-9-]*\.(com|net|org|xyz|top|cn|cc|io|me|vip|club|site|info|online|shop|live|app)(\/|$|\s))/i;
  const FALLBACK_USERS = ['低功耗研究员','会议幸存者','工位植物','学术观察员','茶水间路人'];

  let currentUser = null;
  let currentRoom = '';
  let pollTimer = null;
  let quoteTarget = null;
  let lastRows = [];
  let lastProfiles = {};
  let lastAgrees = {};
  let lastAgreeEvents = [];

  function $(s, root=document){ return root.querySelector(s); }
  function $$(s, root=document){ return Array.from(root.querySelectorAll(s)); }
  function modal(){ return $('[data-room-modal]'); }
  function msgBox(){ return $('[data-room-messages]'); }
  function usersBox(){ return $('[data-room-users]'); }
  function form(){ return $('[data-room-form]'); }
  function quoteBar(){ return $('[data-quote-bar]'); }
  function quoteText(){ return $('[data-quote-text]'); }

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function toast(msg){
    let t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwRoomsChatToast);
    window.__fwRoomsChatToast = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function cleanText(v){ return String(v || '').trim(); }

  function validateText(text){
    if(!text) return '先说点什么。';
    if(text.length > MAX_LEN) return '每条消息最多 300 字。';
    if(LINK_REG.test(text)) return '当前暂不支持发送链接。';
    const lower = text.toLowerCase();
    if(BLOCKED_TERMS.some(t => lower.includes(t.toLowerCase()))) return '内容包含不合适词语，请修改后再发送。';
    return '';
  }

  function avatar(name, url){
    const label = esc(String(name || 'FW').slice(0,2));
    if(url) return '<span class="fw-avatar room"><img src="'+esc(url)+'" alt="'+esc(name || '研究员')+'"></span>';
    return '<span class="fw-avatar room">'+label+'</span>';
  }

  function waitForFwDb(){
    return new Promise(resolve => {
      if(window.fwDb?.enabled && window.fwDb?.client) return resolve(true);
      let c = 0;
      const timer = setInterval(() => {
        c += 1;
        if(window.fwDb?.enabled && window.fwDb?.client){ clearInterval(timer); resolve(true); }
        if(c > 80){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  async function getUser(){
    await waitForFwDb();
    if(!window.fwDb?.enabled) return null;
    try{ return await window.fwDb.getCurrentUser(); }
    catch(e){ return null; }
  }

  function openLogin(){
    const btn = $('[data-fw-open], [data-login-cta], [data-sb-open]');
    if(btn) btn.click();
    else toast('请先注册 / 登录。');
  }

  async function fetchProfiles(ids){
    const unique = [...new Set(ids.filter(Boolean))];
    if(!unique.length) return {};
    const result = await window.fwDb.client.from('profiles').select('id,nickname,avatar_url,role').in('id', unique);
    if(result.error) return {};
    const map = {};
    (result.data || []).forEach(p => map[p.id] = p);
    return map;
  }

  async function fetchAgreeEvents(ids){
    const empty = {counts:{}, events:[]};
    if(!ids.length) return empty;

    const full = await window.fwDb.client
      .from('chat_message_reactions')
      .select('message_id,user_id,type,created_at')
      .in('message_id', ids)
      .eq('type', 'agree')
      .order('created_at', {ascending:true});

    if(!full.error){
      const counts = {};
      const events = (full.data || []).filter(r => r.message_id && r.user_id);
      (full.data || []).forEach(r => { counts[r.message_id] = (counts[r.message_id] || 0) + 1; });
      return {counts, events};
    }

    const result = await window.fwDb.client
      .from('chat_message_reactions')
      .select('message_id,type')
      .in('message_id', ids)
      .eq('type', 'agree');

    if(result.error) return empty;
    const counts = {};
    (result.data || []).forEach(r => { counts[r.message_id] = (counts[r.message_id] || 0) + 1; });
    return {counts, events:[]};
  }

  function getProfileName(userId, profiles){
    const isMe = currentUser && userId === currentUser.id;
    const p = profiles[userId] || {};
    return p.nickname || (isMe ? currentUser.nickname : '研究员');
  }

  function getAgreeTipText(event, target, profiles){
    const actorIsMe = currentUser && event.user_id === currentUser.id;
    const targetIsMe = currentUser && target.user_id === currentUser.id;
    const actorName = actorIsMe ? '你' : getProfileName(event.user_id, profiles);
    const targetName = targetIsMe ? '你' : getProfileName(target.user_id, profiles);
    if(actorIsMe && targetIsMe) return '你赞同了自己一下';
    if(actorIsMe) return '你赞同了 ' + targetName;
    if(targetIsMe) return actorName + ' 赞同了你';
    return actorName + ' 赞同了 ' + targetName;
  }

  function renderAgreeTip(event, byId, profiles){
    const target = byId[event.message_id];
    if(!target || !event.user_id) return '';
    return '<div class="fw-agree-tip" data-agree-message-id="'+esc(event.message_id)+'">'+esc(getAgreeTipText(event, target, profiles))+'</div>';
  }

  function renderMessageItem(row, profiles, agrees, byId){
    const profile = profiles[row.user_id] || {};
    const isMe = currentUser && row.user_id === currentUser.id;
    const isAdmin = !!currentUser?.isAdmin || currentUser?.role === 'admin';
    const name = profile.nickname || (isMe ? currentUser.nickname : '研究员');
    const url = profile.avatar_url || (isMe ? currentUser.avatar_url : '');
    const created = new Date(row.created_at).getTime();
    const canRecall = isMe && (Date.now() - created <= 120000);
    const reply = row.reply_to_id ? byId[row.reply_to_id] : null;
    const replyProfile = reply ? (profiles[reply.user_id] || {}) : null;
    const replyName = reply ? (replyProfile.nickname || (reply.user_id === currentUser?.id ? currentUser.nickname : '研究员')) : '';
    const quoteHtml = reply ? '<div class="fw-quote-in-msg">引用 '+esc(replyName)+'：'+esc(reply.content).slice(0,70)+'</div>' : '';

    const actions = [
      '<button type="button" data-msg-action="quote">引用</button>',
      '<button type="button" data-msg-action="agree">赞同 '+(agrees[row.id] || 0)+'</button>',
      '<button type="button" data-msg-action="report">举报</button>'
    ];
    if(canRecall) actions.push('<button type="button" class="danger" data-msg-action="recall">撤回</button>');
    if(isAdmin){
      actions.push('<button type="button" class="danger" data-msg-action="admin-delete">删除</button>');
      actions.push('<button type="button" class="danger" data-msg-action="admin-mute">禁言24h</button>');
      actions.push('<button type="button" class="danger" data-msg-action="admin-ban">封号</button>');
    }

    return '<div class="fw-msg '+(isMe ? 'me' : '')+'" data-message-id="'+esc(row.id)+'" data-user-id="'+esc(row.user_id)+'">'
      + avatar(name, url)
      + '<div class="fw-msg-stack"><div class="fw-msg-name">'+esc(name)+(isMe ? '（我）' : '')+'</div><div class="fw-bubble">'+quoteHtml+'<p>'+esc(row.content)+'</p></div><div class="fw-msg-actions">'+actions.join('')+'</div></div></div>';
  }

  function renderMessages(rows, profiles, agrees, agreeEvents){
    const box = msgBox();
    if(!box) return;
    if(!rows.length){
      box.innerHTML = '<div class="fw-room-empty">这个房间暂时很安静，推门的人还没说话。</div>';
      return;
    }

    const byId = {};
    rows.forEach(r => byId[r.id] = r);
    const messageItems = rows.map(row => ({
      type:'message',
      time:new Date(row.created_at).getTime(),
      html:renderMessageItem(row, profiles, agrees, byId)
    }));
    const agreeItems = (agreeEvents || []).map((event, i) => {
      const target = byId[event.message_id];
      if(!target) return null;
      const time = new Date(event.created_at || target.created_at).getTime();
      return {type:'agree', time:Number.isFinite(time) ? time + i / 100 : Date.now() + i / 100, html:renderAgreeTip(event, byId, profiles)};
    }).filter(item => item && item.html);

    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = [...messageItems, ...agreeItems].sort((a,b) => a.time - b.time).map(item => item.html).join('');
    if(nearBottom || !box.dataset.userScrolled) box.scrollTop = box.scrollHeight;
  }

  function renderRecentUsers(rows, profiles){
    const box = usersBox();
    if(!box) return;
    const list = [];
    if(currentUser) list.push({nickname:currentUser.nickname || '我', avatar_url:currentUser.avatar_url || '', isMe:true});
    rows.slice().reverse().forEach(row => {
      const p = profiles[row.user_id];
      if(!p) return;
      if(list.some(x => x.nickname === p.nickname)) return;
      list.push({nickname:p.nickname || '研究员', avatar_url:p.avatar_url || '', isMe:false});
    });
    FALLBACK_USERS.forEach(name => {
      if(list.length >= 6) return;
      if(!list.some(x => x.nickname === name)) list.push({nickname:name, avatar_url:'', isMe:false});
    });
    box.innerHTML = list.slice(0,6).map(u => '<div class="fw-online-user">'+avatar(u.nickname,u.avatar_url)+'<span>'+esc(u.nickname)+(u.isMe ? '（我）' : '')+'</span></div>').join('');
  }

  async function loadMessages(roomKey, silent){
    if(!window.fwDb?.client) return;
    const box = msgBox();
    if(!box) return;
    if(!silent) box.innerHTML = '<div class="fw-room-empty">正在读取房间消息...</div>';

    const result = await window.fwDb.client
      .from('chat_messages')
      .select('id,user_id,content,created_at,reply_to_id')
      .eq('room_key', roomKey)
      .eq('is_deleted', false)
      .order('created_at', {ascending:false})
      .limit(500);

    if(result.error){
      box.innerHTML = '<div class="fw-room-empty">聊天数据表还没配置。请先在 Supabase 运行 SQL。</div>';
      toast('聊天数据表还没配置，请先运行 SQL。');
      return;
    }

    const rows = (result.data || []).reverse();
    const agreeData = await fetchAgreeEvents(rows.map(r => r.id));
    const profiles = await fetchProfiles([...rows.map(r => r.user_id), ...agreeData.events.map(r => r.user_id)]);
    lastRows = rows;
    lastProfiles = profiles;
    lastAgrees = agreeData.counts;
    lastAgreeEvents = agreeData.events;
    renderMessages(rows, profiles, agreeData.counts, agreeData.events);
    renderRecentUsers(rows, profiles);
  }

  function setupRoom(roomKey){
    const room = ROOM_INFO[roomKey] || ROOM_INFO.complain;
    $('[data-room-type]') && ($('[data-room-type]').textContent = room.type);
    $('[data-room-title]') && ($('[data-room-title]').textContent = room.title);
    $('[data-room-desc]') && ($('[data-room-desc]').textContent = room.desc);
    $('[data-room-head-title]') && ($('[data-room-head-title]').textContent = room.title);
    $('[data-room-head-status]') && ($('[data-room-head-status]').textContent = '最近 500 条 · 仅文字');
  }

  function startPolling(){
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if(modal()?.classList.contains('show') && currentRoom) loadMessages(currentRoom, true);
    }, 5000);
  }

  function closeRoom(){
    modal()?.classList.remove('show');
    clearInterval(pollTimer);
    clearQuote();
  }

  async function enterRoom(roomKey){
    const user = await getUser();
    if(!user){
      sessionStorage.setItem('fw_pending_room', roomKey);
      toast('登录后才能进入学术研讨。');
      openLogin();
      return;
    }
    currentUser = user;
    currentRoom = roomKey;
    sessionStorage.removeItem('fw_pending_room');
    setupRoom(roomKey);
    modal()?.classList.add('show');
    await loadMessages(roomKey, false);
    startPolling();
    setTimeout(() => form()?.querySelector('input')?.focus(), 120);
  }

  async function checkPendingRoom(){
    const key = sessionStorage.getItem('fw_pending_room');
    if(!key) return;
    const user = await getUser();
    if(user) enterRoom(key);
  }

  function setQuote(row){
    const p = lastProfiles[row.user_id] || {};
    const name = p.nickname || (row.user_id === currentUser?.id ? currentUser.nickname : '研究员');
    quoteTarget = {id:row.id, name, content:row.content};
    const text = quoteText();
    if(text) text.textContent = '引用 ' + name + '：' + row.content.slice(0,60);
    quoteBar()?.classList.add('show');
    form()?.querySelector('input')?.focus();
  }

  function clearQuote(){
    quoteTarget = null;
    quoteBar()?.classList.remove('show');
    const text = quoteText();
    if(text) text.textContent = '';
  }

  async function handleMsgAction(btn){
    const wrap = btn.closest('[data-message-id]');
    const id = Number(wrap?.dataset.messageId);
    const userId = wrap?.dataset.userId;
    const row = lastRows.find(r => Number(r.id) === id);
    const act = btn.dataset.msgAction;
    if(!id) return;

    try{
      if(act === 'quote' && row){ setQuote(row); return; }
      if(act === 'agree'){
        await window.fwDb.client.rpc('agree_chat_message', {target_message_id:id});
        await loadMessages(currentRoom, true);
        return;
      }
      if(act === 'report'){
        await window.fwDb.client.rpc('report_chat_message', {target_message_id:id, report_reason:'用户举报'});
        toast('已收到举报。');
        return;
      }
      if(act === 'recall'){
        await window.fwDb.client.rpc('recall_own_chat_message', {target_message_id:id});
        toast('已撤回。');
        await loadMessages(currentRoom, true);
        return;
      }
      if(act === 'admin-delete'){
        await window.fwDb.client.rpc('admin_delete_chat_message', {target_message_id:id});
        toast('已删除。');
        await loadMessages(currentRoom, true);
        return;
      }
      if(act === 'admin-mute'){
        await window.fwDb.client.rpc('admin_set_user_muted', {target_user_id:userId, mute_minutes:1440});
        toast('已禁言 24 小时。');
        return;
      }
      if(act === 'admin-ban'){
        await window.fwDb.client.rpc('admin_set_user_banned', {target_user_id:userId, banned:true});
        toast('已封号。');
        return;
      }
    }catch(err){
      toast(err.message || '操作失败。');
    }
  }

  async function sendMessage(e){
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();

    const user = await getUser();
    if(!user){ toast('登录后才能发言。'); openLogin(); return; }
    currentUser = user;

    const f = form();
    const input = f?.querySelector('input');
    const content = cleanText(input?.value);
    const err = validateText(content);
    if(err){ toast(err); return; }

    const btn = f?.querySelector('button');
    const old = btn?.textContent || '发送';
    if(btn){ btn.disabled = true; btn.textContent = '发送中...'; }

    try{
      const payload = {room_key:currentRoom, user_id:user.id, content};
      if(quoteTarget?.id) payload.reply_to_id = quoteTarget.id;
      const result = await window.fwDb.client.from('chat_messages').insert(payload).select('id').single();
      if(result.error) throw result.error;
      if(input) input.value = '';
      clearQuote();
      await loadMessages(currentRoom, true);
    }catch(err){
      toast(err.message || '发送失败。');
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = old; }
    }
  }

  function renameStaticText(){
    document.title = document.title.replaceAll('摸鱼房间', '学术研讨');
    $$('a[href="rooms.html"]').forEach(a => {
      if(a.textContent.includes('摸鱼房间')) a.textContent = a.textContent.replaceAll('摸鱼房间', '学术研讨');
    });
    const title = $('.hero-title');
    if(title && title.textContent.includes('摸鱼房间')) title.textContent = title.textContent.replaceAll('摸鱼房间', '学术研讨');
    $$('.footer span').forEach(s => {
      if(s.textContent.includes('摸鱼房间')) s.textContent = s.textContent.replaceAll('摸鱼房间', '学术研讨');
    });
    const dialog = $('.fw-chat-window');
    if(dialog) dialog.setAttribute('aria-label', '学术研讨聊天窗口');
    $$('.room-card small').forEach(s => {
      if(s.textContent.includes('摸鱼')) s.textContent = s.textContent.replaceAll('摸鱼', '研讨');
    });
  }

  function bind(){
    const box = msgBox();
    if(box){
      box.addEventListener('scroll', () => {
        box.dataset.userScrolled = '1';
        clearTimeout(window.__fwRoomsScrollFlag);
        window.__fwRoomsScrollFlag = setTimeout(() => { delete box.dataset.userScrolled; }, 1600);
      }, {passive:true});
    }

    document.addEventListener('click', e => {
      const roomCard = e.target.closest('[data-room]');
      if(roomCard){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        enterRoom(roomCard.dataset.room);
        return;
      }

      const action = e.target.closest('[data-msg-action]');
      if(action){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        handleMsgAction(action);
        return;
      }

      if(e.target.closest('[data-clear-quote]')){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        clearQuote();
        return;
      }

      if(e.target.closest('[data-room-close]') || e.target === modal()){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        closeRoom();
      }
    }, true);

    form()?.addEventListener('submit', sendMessage, true);

    document.addEventListener('keydown', e => {
      if(e.key === 'Escape' && modal()?.classList.contains('show')) closeRoom();
    });
  }

  function boot(){
    renameStaticText();
    bind();
    checkPendingRoom();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
