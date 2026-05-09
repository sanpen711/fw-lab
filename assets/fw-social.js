// F.w 研究所：回声 + 搭子 + 私聊模块（实验品编号最终规则版）
// 依赖：assets/app.js 已加载 Supabase bridge，window.fwDb 可用。
(function(){
  if(window.__FW_SOCIAL_MODULE_LOADED__) return;
  window.__FW_SOCIAL_MODULE_LOADED__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ini = v => String(v || 'FW').trim().slice(0,2).toUpperCase();
  const hasLink = txt => /(https?:\/\/|www\.|[a-z0-9][a-z0-9-]*\.(com|net|org|xyz|top|cn|cc|io|me|vip|club|site|info|online|shop|live|app)(\/|$|\s))/i.test(txt || '');
  let me = null;
  let activeTab = 'friends';
  let currentChat = null;
  let chatTimer = null;

  function toast(msg){
    let t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwSocialToast);
    window.__fwSocialToast = setTimeout(()=>t.classList.remove('show'), 2800);
  }

  function avatar(name, url, attrs=''){
    if(url) return `<span class="fw-social-avatar" ${attrs}><img src="${esc(url)}" alt="${esc(name)}"></span>`;
    return `<span class="fw-social-avatar" ${attrs}>${esc(ini(name))}</span>`;
  }

  function waitForDb(){
    return new Promise(resolve=>{
      if(window.fwDb?.enabled) return resolve(true);
      let count = 0;
      const timer = setInterval(()=>{
        count++;
        if(window.fwDb?.enabled){
          clearInterval(timer);
          resolve(true);
        }
        if(count > 80){
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  async function refreshMe(){
    if(!window.fwDb?.enabled) return null;
    me = await window.fwDb.getCurrentUser().catch(()=>null);
    return me;
  }

  function needLogin(){
    if(me && !me.disabled) return true;
    const btn = document.querySelector('[data-fw-open], [data-login-cta], [data-sb-open]');
    if(btn) btn.click();
    else toast('请先注册 / 登录。');
    return false;
  }

  function ensureShell(){
    if($('[data-fw-social-modal]')) return;
    const modal = document.createElement('div');
    modal.className = 'fw-social-modal';
    modal.dataset.fwSocialModal = '1';
    modal.innerHTML = `
      <div class="fw-social-panel" data-fw-social-panel>
        <header class="fw-social-head">
          <div><small data-fw-social-kicker>FW SOCIAL</small><h2 data-fw-social-title>回声</h2></div>
          <button class="fw-social-close" type="button" data-fw-social-close>×</button>
        </header>
        <div class="fw-social-body" data-fw-social-body></div>
      </div>`;
    document.body.appendChild(modal);

    const chat = document.createElement('div');
    chat.className = 'fw-social-modal';
    chat.dataset.fwPrivateModal = '1';
    chat.innerHTML = `
      <div class="fw-private-window">
        <header class="fw-social-head">
          <div><small>PRIVATE CHAT</small><h2 data-fw-chat-title>搭子私聊</h2></div>
          <button class="fw-social-close" type="button" data-fw-chat-close>×</button>
        </header>
        <div class="fw-private-messages" data-fw-private-messages></div>
        <form class="fw-private-form" data-fw-private-form>
          <input name="message" maxlength="300" autocomplete="off" placeholder="说一句只给搭子看的话，最多 300 字..." />
          <button type="submit">发送</button>
        </form>
      </div>`;
    document.body.appendChild(chat);
  }

  function installHeaderButtons(){
    $$('.header').forEach(header=>{
      if(header.querySelector('.fw-social-actions')) return;
      const actions = document.createElement('div');
      actions.className = 'fw-social-actions';
      actions.innerHTML = `
        <button class="fw-social-btn" type="button" data-fw-open-echo>回声<span class="fw-social-badge" data-fw-echo-count></span></button>
        <button class="fw-social-btn" type="button" data-fw-open-buddy>搭子<span class="fw-social-badge" data-fw-buddy-count></span></button>`;
      const userbar = header.querySelector('.fw-userbar');
      const menu = header.querySelector('.menu-btn');
      if(userbar) header.insertBefore(actions, userbar);
      else if(menu) header.insertBefore(actions, menu);
      else header.appendChild(actions);
    });
  }

  async function fetchProfiles(ids){
    const unique = [...new Set((ids||[]).filter(Boolean))];
    if(!unique.length) return {};
    const {data,error} = await window.fwDb.client
      .from('profiles')
      .select('id,nickname,avatar_url,lab_code')
      .in('id', unique);
    if(error) return {};
    const map = {};
    (data||[]).forEach(p=>map[p.id]=p);
    return map;
  }

  async function refreshBadges(){
    if(!me || !window.fwDb?.client) return;
    try{
      const n = await window.fwDb.client
        .from('notifications')
        .select('id,type', {count:'exact', head:true})
        .eq('user_id', me.id)
        .eq('is_read', false);

      const f = await window.fwDb.client
        .from('friendships')
        .select('id', {count:'exact', head:true})
        .eq('receiver_id', me.id)
        .eq('status', 'pending');

      const msg = await window.fwDb.client
        .from('notifications')
        .select('id', {count:'exact', head:true})
        .eq('user_id', me.id)
        .eq('is_read', false)
        .eq('type', 'private_message');

      setBadge('[data-fw-echo-count]', n.count || 0);
      setBadge('[data-fw-buddy-count]', (f.count || 0) + (msg.count || 0));
    }catch(e){
      // SQL 没运行时会到这里；不打扰页面其它功能。
    }
  }

  function setBadge(selector, count){
    $$(selector).forEach(el=>{
      el.textContent = count > 99 ? '99+' : String(count);
      el.classList.toggle('show', count > 0);
    });
  }

  function formatNoticeType(type){
    return ({
      like:'点赞了你的帖子',
      same:'对你说：俺也一样',
      tissue:'给你递了纸巾',
      comment:'评论了你的帖子',
      friend_request:'想加你为搭子',
      friend_accept:'通过了你的搭子申请',
      private_message:'给你发来一条私聊',
      chat_agree:'赞同了你的房间消息',
      system:'系统通知'
    })[type] || '给你发来一条回声';
  }

  async function openEcho(){
    if(!needLogin()) return;
    ensureShell();
    const modal = $('[data-fw-social-modal]');
    const panel = $('[data-fw-social-panel]');
    panel.classList.remove('wide');
    $('[data-fw-social-kicker]').textContent = 'ECHO CENTER';
    $('[data-fw-social-title]').textContent = '回声';
    $('[data-fw-social-body]').innerHTML = '<div class="fw-social-empty">正在读取回声...</div>';
    modal.classList.add('show');

    try{
      const {data,error} = await window.fwDb.client
        .from('notifications')
        .select('id,actor_id,type,target_type,target_id,content,is_read,created_at')
        .eq('user_id', me.id)
        .order('created_at',{ascending:false})
        .limit(80);
      if(error) throw error;

      const profiles = await fetchProfiles((data||[]).map(x=>x.actor_id));
      if(!data || !data.length){
        $('[data-fw-social-body]').innerHTML = '<div class="fw-social-empty">暂时没有新的回声。安静也是一种运行状态。</div>';
        return;
      }

      $('[data-fw-social-body]').innerHTML = `<div class="fw-social-list">${data.map(n=>{
        const p = profiles[n.actor_id] || {};
        const name = p.nickname || '某位研究员';
        return `<article class="fw-social-item ${n.is_read?'':'unread'}">
          ${avatar(name, p.avatar_url, `data-fw-profile-user="${esc(n.actor_id||'')}"`)}
          <div class="fw-social-item-main">
            <b>${esc(name)} ${esc(formatNoticeType(n.type))}</b>
            <span>${esc(n.content || '对你的低功耗发言产生了回应。')}</span>
          </div>
          <div class="fw-social-item-actions">
            ${n.type === 'private_message' && n.actor_id ? `<button class="fw-social-mini-btn dark" data-fw-start-chat="${esc(n.actor_id)}">私聊</button>` : ''}
            ${n.type === 'friend_request' ? `<button class="fw-social-mini-btn dark" data-fw-open-buddy>处理</button>` : ''}
          </div>
        </article>`;
      }).join('')}</div>`;

      await window.fwDb.client.from('notifications').update({is_read:true}).eq('user_id',me.id).eq('is_read',false);
      refreshBadges();
    }catch(err){
      $('[data-fw-social-body]').innerHTML = '<div class="fw-social-empty">回声读取失败。请确认已经运行“搭子模块 SQL”。</div>';
    }
  }

  async function getFriendships(){
    const {data,error} = await window.fwDb.client
      .from('friendships')
      .select('id,requester_id,receiver_id,status,created_at,updated_at')
      .or(`requester_id.eq.${me.id},receiver_id.eq.${me.id}`)
      .order('updated_at',{ascending:false});
    if(error) throw error;
    const ids = [];
    (data||[]).forEach(f=>{ids.push(f.requester_id, f.receiver_id)});
    const profiles = await fetchProfiles(ids);
    return {rows:data||[], profiles};
  }

  function otherId(f){
    return f.requester_id === me.id ? f.receiver_id : f.requester_id;
  }

  function friendItem(f, profiles){
    const oid = otherId(f);
    const p = profiles[oid] || {};
    const name = p.nickname || '低功耗研究员';
    const code = p.lab_code ? '实验品编号：' + p.lab_code : '实验品编号：未设置';
    const incoming = f.receiver_id === me.id && f.status === 'pending';
    const outgoing = f.requester_id === me.id && f.status === 'pending';
    const accepted = f.status === 'accepted';
    const blocked = f.status === 'blocked';

    let statusText = accepted ? '已成为摸鱼搭子' : incoming ? '想加你为搭子' : outgoing ? '等待对方低功耗处理' : blocked ? '已拉黑' : '已拒绝 / 已失效';
    let actions = '';
    if(incoming){
      actions = `<button class="fw-social-mini-btn dark" data-fw-accept="${f.id}">同意</button><button class="fw-social-mini-btn danger" data-fw-reject="${f.id}">拒绝</button>`;
    }else if(accepted){
      actions = `<button class="fw-social-mini-btn dark" data-fw-start-chat="${esc(oid)}">私聊</button><button class="fw-social-mini-btn danger" data-fw-remove-friend="${f.id}">解除</button>`;
    }else if(outgoing){
      actions = `<button class="fw-social-mini-btn danger" data-fw-remove-friend="${f.id}">撤回</button>`;
    }

    return `<article class="fw-social-item">
      ${avatar(name, p.avatar_url, `data-fw-profile-user="${esc(oid)}"`)}
      <div class="fw-social-item-main"><b>${esc(name)}</b><span>${esc(code)} · ${esc(statusText)}</span></div>
      <div class="fw-social-item-actions">${actions}</div>
    </article>`;
  }

  async function openBuddy(tab='friends'){
    if(!needLogin()) return;
    ensureShell();
    activeTab = tab;
    const modal = $('[data-fw-social-modal]');
    const panel = $('[data-fw-social-panel]');
    panel.classList.add('wide');
    $('[data-fw-social-kicker]').textContent = 'BUDDY CENTER';
    $('[data-fw-social-title]').textContent = '搭子';
    $('[data-fw-social-body]').innerHTML = '<div class="fw-social-empty">正在读取搭子状态...</div>';
    modal.classList.add('show');

    try{
      const {rows, profiles} = await getFriendships();
      const accepted = rows.filter(f=>f.status==='accepted');
      const incoming = rows.filter(f=>f.status==='pending' && f.receiver_id===me.id);
      const outgoing = rows.filter(f=>f.status==='pending' && f.requester_id===me.id);

      const tabs = `<div class="fw-social-tabs">
        <button class="fw-social-tab ${activeTab==='friends'?'active':''}" data-fw-buddy-tab="friends">我的搭子</button>
        <button class="fw-social-tab ${activeTab==='incoming'?'active':''}" data-fw-buddy-tab="incoming">收到申请 ${incoming.length?`(${incoming.length})`:''}</button>
        <button class="fw-social-tab ${activeTab==='outgoing'?'active':''}" data-fw-buddy-tab="outgoing">发出申请</button>
      </div>`;

      let list = accepted;
      if(activeTab==='incoming') list = incoming;
      if(activeTab==='outgoing') list = outgoing;

      const empty = activeTab==='friends' ? '暂时还没有搭子。可以点击别人头像，加为摸鱼搭子。' :
                    activeTab==='incoming' ? '暂无新的搭子申请。' : '暂无发出的申请。';

      const searchBox = `<form class="fw-social-search" data-fw-user-search>
        <input name="q" autocomplete="off" placeholder="搜索实验品编号 / 昵称 / 完整邮箱" />
        <button type="submit">搜索搭子</button>
        <p>邮箱只支持完整邮箱精准搜索；搜索结果不会显示邮箱。</p>
      </form><div class="fw-search-results" data-fw-search-results></div>`;

      $('[data-fw-social-body]').innerHTML = searchBox + tabs + `<div class="fw-social-list">${
        list.length ? list.map(f=>friendItem(f,profiles)).join('') : `<div class="fw-social-empty">${empty}</div>`
      }</div>`;
      refreshBadges();
    }catch(err){
      $('[data-fw-social-body]').innerHTML = '<div class="fw-social-empty">搭子读取失败。请确认已经运行“搭子模块 SQL”。</div>';
    }
  }


  async function searchResearchers(keyword){
    const q = String(keyword||'').trim();
    if(q.length < 2){
      toast('至少输入 2 个字符；邮箱需要输入完整邮箱。');
      return [];
    }
    const {data,error} = await window.fwDb.client.rpc('fw_search_profiles', {search_text:q});
    if(error) throw error;
    return data || [];
  }

  async function renderSearchResults(keyword){
    const box = $('[data-fw-search-results]');
    if(!box) return;
    box.innerHTML = '<div class="fw-social-empty">正在搜索实验品...</div>';
    try{
      const rows = await searchResearchers(keyword);
      if(!rows.length){
        box.innerHTML = '<div class="fw-social-empty">没有找到对应实验品。可以换实验品编号、昵称或完整邮箱再试。</div>';
        return;
      }
      const items = [];
      for(const p of rows){
        const f = await getFriendshipWith(p.id);
        let action = `<button class="fw-social-mini-btn dark" data-fw-add-friend="${esc(p.id)}">加为搭子</button>`;
        let relation = '可以发送搭子申请';
        if(f?.status === 'accepted'){
          action = `<button class="fw-social-mini-btn dark" data-fw-start-chat="${esc(p.id)}">私聊</button>`;
          relation = '已是搭子';
        }else if(f?.status === 'pending' && f.requester_id === me.id){
          action = '<button class="fw-social-mini-btn" disabled>等待处理</button>';
          relation = '申请已发出';
        }else if(f?.status === 'pending' && f.receiver_id === me.id){
          action = `<button class="fw-social-mini-btn dark" data-fw-accept="${f.id}">同意</button><button class="fw-social-mini-btn danger" data-fw-reject="${f.id}">拒绝</button>`;
          relation = '对方想加你为搭子';
        }else if(f?.status === 'blocked'){
          action = '<button class="fw-social-mini-btn" disabled>已拉黑</button>';
          relation = '当前不可添加';
        }
        items.push(`<article class="fw-social-item">
          ${avatar(p.nickname, p.avatar_url, `data-fw-profile-user="${esc(p.id)}"`)}
          <div class="fw-social-item-main"><b>${esc(p.nickname || '低功耗研究员')}</b><span>实验品编号：${esc(p.lab_code || '未设置')} · ${esc(relation)}</span></div>
          <div class="fw-social-item-actions">${action}<button class="fw-social-mini-btn" data-fw-profile-user="${esc(p.id)}">资料</button></div>
        </article>`);
      }
      box.innerHTML = '<div class="fw-social-list">' + items.join('') + '</div>';
    }catch(err){
      box.innerHTML = '<div class="fw-social-empty">搜索失败，请确认已经运行实验品编号 SQL。</div>';
    }
  }

  async function getFriendshipWith(targetId){
    const {data,error} = await window.fwDb.client
      .from('friendships')
      .select('id,requester_id,receiver_id,status')
      .or(`and(requester_id.eq.${me.id},receiver_id.eq.${targetId}),and(requester_id.eq.${targetId},receiver_id.eq.${me.id})`)
      .limit(1);
    if(error) return null;
    return (data||[])[0] || null;
  }

  async function openProfile(userId){
    if(!needLogin()) return;
    if(!userId || userId === 'null' || userId === 'undefined') return;
    ensureShell();
    const modal = $('[data-fw-social-modal]');
    const panel = $('[data-fw-social-panel]');
    panel.classList.remove('wide');
    $('[data-fw-social-kicker]').textContent = 'RESEARCHER CARD';
    $('[data-fw-social-title]').textContent = '研究员资料';
    $('[data-fw-social-body]').innerHTML = '<div class="fw-social-empty">正在读取资料...</div>';
    modal.classList.add('show');

    try{
      const {data:p,error} = await window.fwDb.client
        .from('profiles')
        .select('id,nickname,avatar_url,lab_code,role,is_banned,created_at')
        .eq('id', userId)
        .maybeSingle();
      if(error) throw error;
      if(!p) throw new Error('用户不存在');

      const isSelf = p.id === me.id;
      const f = isSelf ? null : await getFriendshipWith(p.id);
      const accepted = f?.status === 'accepted';
      const pendingOut = f?.status === 'pending' && f.requester_id === me.id;
      const pendingIn = f?.status === 'pending' && f.receiver_id === me.id;
      const blocked = f?.status === 'blocked';

      let actions = '';
      if(isSelf){
        actions = `<button class="fw-social-mini-btn dark" data-fw-open-profile-editor>编辑资料</button>`;
      }else if(accepted){
        actions = `<button class="fw-social-mini-btn dark" data-fw-start-chat="${esc(p.id)}">私聊</button><button class="fw-social-mini-btn danger" data-fw-remove-friend="${f.id}">解除搭子关系</button><button class="fw-social-mini-btn danger" data-fw-block-user="${esc(p.id)}">拉黑</button>`;
      }else if(pendingIn){
        actions = `<button class="fw-social-mini-btn dark" data-fw-accept="${f.id}">同意搭子申请</button><button class="fw-social-mini-btn danger" data-fw-reject="${f.id}">拒绝</button>`;
      }else if(pendingOut){
        actions = `<button class="fw-social-mini-btn" disabled>等待对方处理</button><button class="fw-social-mini-btn danger" data-fw-remove-friend="${f.id}">撤回申请</button>`;
      }else if(blocked){
        actions = `<button class="fw-social-mini-btn" disabled>已拉黑</button>`;
      }else{
        actions = `<button class="fw-social-mini-btn dark" data-fw-add-friend="${esc(p.id)}">加为搭子</button><button class="fw-social-mini-btn danger" data-fw-block-user="${esc(p.id)}">拉黑</button>`;
      }

      $('[data-fw-social-body]').innerHTML = `<div class="fw-profile-card">
        ${avatar(p.nickname, p.avatar_url)}
        <div class="fw-profile-info">
          <h3>${esc(p.nickname || '低功耗研究员')}</h3>
          <p class="fw-lab-code-line">实验品编号：${esc(p.lab_code || '未设置')}</p>
          <p>${isSelf ? '这是你自己。' : accepted ? '你们已经是摸鱼搭子。' : pendingOut ? '搭子申请已发出。' : pendingIn ? '对方想加你为搭子。' : '一位正在低功耗运行的研究员。'}</p>
        </div>
        <div class="fw-profile-actions">${actions}</div>
      </div>`;
    }catch(err){
      $('[data-fw-social-body]').innerHTML = '<div class="fw-social-empty">资料读取失败。</div>';
    }
  }

  async function addFriend(userId){
    try{
      const {data,error} = await window.fwDb.client.rpc('fw_send_friend_request', {target_user_id:userId});
      if(error) throw error;
      if(data === 'already_accepted') toast('你们已经是搭子了。');
      else if(data === 'already_pending') toast('搭子申请已经发出，等待对方处理。');
      else if(data === 'blocked') toast('当前不能发送搭子申请。');
      else toast('搭子申请已发出。');
      await openProfile(userId);
      refreshBadges();
    }catch(err){toast(err.message || '发送申请失败。')}
  }

  async function acceptFriendship(id, yes){
    try{
      const {error} = await window.fwDb.client.rpc('fw_respond_friendship', {target_friendship_id:Number(id), accept_request:!!yes});
      if(error) throw error;
      toast(yes ? '已同意搭子申请。' : '已拒绝搭子申请。');
      await openBuddy(yes ? 'friends' : 'incoming');
      refreshBadges();
    }catch(err){toast(err.message || '处理失败。')}
  }

  async function removeFriendship(id){
    try{
      const {error} = await window.fwDb.client.rpc('fw_remove_friendship', {target_friendship_id:Number(id)});
      if(error) throw error;
      toast('已处理搭子关系。');
      await openBuddy(activeTab);
      refreshBadges();
    }catch(err){toast(err.message || '操作失败。')}
  }

  async function blockUser(id){
    try{
      const {error} = await window.fwDb.client.rpc('fw_block_user', {target_user_id:id});
      if(error) throw error;
      toast('已拉黑。');
      closeSocial();
      refreshBadges();
    }catch(err){toast(err.message || '拉黑失败。')}
  }

  async function startChat(targetId){
    if(!needLogin()) return;
    try{
      const {data,error} = await window.fwDb.client.rpc('fw_get_or_create_conversation', {target_user_id:targetId});
      if(error) throw error;
      currentChat = {conversationId:data, targetId};
      const profiles = await fetchProfiles([targetId]);
      const p = profiles[targetId] || {};
      closeSocial();
      openChatWindow(p.nickname || '摸鱼搭子');
      await loadChatMessages();
      clearInterval(chatTimer);
      chatTimer = setInterval(loadChatMessages, 5000);
    }catch(err){
      toast(err.message || '只有成为搭子后才能私聊。');
    }
  }

  function openChatWindow(name){
    ensureShell();
    $('[data-fw-chat-title]').textContent = '和 ' + name + ' 私聊';
    $('[data-fw-private-messages]').innerHTML = '<div class="fw-social-empty">正在读取私聊...</div>';
    $('[data-fw-private-modal]').classList.add('show');
    setTimeout(()=> $('[data-fw-private-form] input')?.focus(), 80);
  }

  async function loadChatMessages(){
    if(!currentChat) return;
    const box = $('[data-fw-private-messages]');
    try{
      const {data,error} = await window.fwDb.client
        .from('private_messages')
        .select('id,conversation_id,sender_id,content,is_deleted,created_at')
        .eq('conversation_id', currentChat.conversationId)
        .eq('is_deleted', false)
        .order('created_at',{ascending:true})
        .limit(200);
      if(error) throw error;
      const profiles = await fetchProfiles((data||[]).map(m=>m.sender_id));
      if(!data || !data.length){
        box.innerHTML = '<div class="fw-social-empty">还没有私聊消息。可以先低功耗地打个招呼。</div>';
      }else{
        box.innerHTML = data.map(m=>{
          const mine = m.sender_id === me.id;
          const p = profiles[m.sender_id] || {};
          return `<div class="fw-pm ${mine?'me':''}">
            <div class="fw-pm-name">${mine?'你':esc(p.nickname || '搭子')}</div>
            <div class="fw-pm-bubble">${esc(m.content)}</div>
          </div>`;
        }).join('');
      }
      box.scrollTop = box.scrollHeight;
    }catch(err){
      box.innerHTML = '<div class="fw-social-empty">私聊读取失败。</div>';
    }
  }

  async function sendPrivateMessage(form){
    if(!currentChat) return;
    const input = form.querySelector('input[name="message"]');
    const text = (input.value || '').trim();
    if(!text) return input.focus();
    if(text.length > 300) return toast('私聊最多 300 字。');
    if(hasLink(text)) return toast('私聊第一版暂不支持链接。');

    const btn = form.querySelector('button');
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '发送中...';
    try{
      const {error} = await window.fwDb.client.rpc('fw_send_private_message', {target_conversation_id:currentChat.conversationId, message_text:text});
      if(error) throw error;
      input.value = '';
      await loadChatMessages();
      refreshBadges();
    }catch(err){
      toast(err.message || '发送失败。');
    }finally{
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  function closeSocial(){
    $('[data-fw-social-modal]')?.classList.remove('show');
  }
  function closeChat(){
    $('[data-fw-private-modal]')?.classList.remove('show');
    clearInterval(chatTimer);
    chatTimer = null;
    currentChat = null;
  }

  function findUserIdFromClick(target){
    const profile = target.closest('[data-fw-profile-user]');
    if(profile?.dataset.fwProfileUser) return profile.dataset.fwProfileUser;

    const roomMsg = target.closest('.fw-msg[data-user-id]');
    if(roomMsg?.dataset.userId) return roomMsg.dataset.userId;

    const author = target.closest('.fw-author');
    if(author){
      const card = author.closest('.post-card[data-id]');
      const id = Number(card?.dataset.id);
      if(typeof getPosts === 'function'){
        const p = getPosts().find(x=>Number(x.id)===id);
        if(p?.userId || p?.authorId) return p.userId || p.authorId;
      }
    }

    const comment = target.closest('.comment-list li[data-comment-id]');
    if(comment && typeof getPosts === 'function'){
      const cid = String(comment.dataset.commentId);
      for(const p of getPosts()){
        const c = (p.comments||[]).find(x=>String(x.id)===cid);
        if(c?.userId) return c.userId;
      }
    }
    return '';
  }

  function bindEvents(){
    document.addEventListener('click', async e=>{
      const echo = e.target.closest('[data-fw-open-echo]');
      const buddy = e.target.closest('[data-fw-open-buddy]');
      const close = e.target.closest('[data-fw-social-close]');
      const chatClose = e.target.closest('[data-fw-chat-close]');
      const tab = e.target.closest('[data-fw-buddy-tab]');
      const add = e.target.closest('[data-fw-add-friend]');
      const accept = e.target.closest('[data-fw-accept]');
      const reject = e.target.closest('[data-fw-reject]');
      const remove = e.target.closest('[data-fw-remove-friend]');
      const chat = e.target.closest('[data-fw-start-chat]');
      const block = e.target.closest('[data-fw-block-user]');
      const edit = e.target.closest('[data-fw-open-profile-editor]');

      if(echo){e.preventDefault(); await refreshMe(); openEcho(); return;}
      if(buddy){e.preventDefault(); await refreshMe(); openBuddy(activeTab); return;}
      if(close || e.target.matches('[data-fw-social-modal]')){e.preventDefault(); closeSocial(); return;}
      if(chatClose || e.target.matches('[data-fw-private-modal]')){e.preventDefault(); closeChat(); return;}
      if(tab){e.preventDefault(); activeTab = tab.dataset.fwBuddyTab; openBuddy(activeTab); return;}
      if(add){e.preventDefault(); addFriend(add.dataset.fwAddFriend); return;}
      if(accept){e.preventDefault(); acceptFriendship(accept.dataset.fwAccept, true); return;}
      if(reject){e.preventDefault(); acceptFriendship(reject.dataset.fwReject, false); return;}
      if(remove){e.preventDefault(); removeFriendship(remove.dataset.fwRemoveFriend); return;}
      if(chat){e.preventDefault(); startChat(chat.dataset.fwStartChat); return;}
      if(block){e.preventDefault(); blockUser(block.dataset.fwBlockUser); return;}
      if(edit){e.preventDefault(); closeSocial(); document.querySelector('[data-fw-open]')?.click(); return;}

      const maybeAvatar = e.target.closest('.fw-avatar, .fw-social-avatar, .fw-author');
      if(maybeAvatar){
        const userId = findUserIdFromClick(e.target);
        if(userId){e.preventDefault(); await refreshMe(); openProfile(userId);}
      }
    });

    document.addEventListener('submit', e=>{
      const searchForm = e.target.closest('[data-fw-user-search]');
      if(searchForm){
        e.preventDefault();
        const q = searchForm.querySelector('input[name="q"]')?.value || '';
        renderSearchResults(q);
        return;
      }
      const form = e.target.closest('[data-fw-private-form]');
      if(form){e.preventDefault(); sendPrivateMessage(form);}
    });
  }

  async function boot(){
    const ok = await waitForDb();
    if(!ok) return;
    ensureShell();
    installHeaderButtons();
    await refreshMe();
    await refreshBadges();
    bindEvents();

    // auth-flow 可能会在稍后插入用户条，这里再补一次按钮位置
    setTimeout(()=>{installHeaderButtons(); refreshBadges();}, 1200);
    setInterval(async()=>{
      await refreshMe();
      installHeaderButtons();
      refreshBadges();
    }, 15000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();