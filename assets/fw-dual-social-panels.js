// F.w 研究所：回声 / 搭子双浮窗
// 作用：回声和搭子可以同时打开；每次关闭再打开都回到页面右侧默认位置。
(function(){
  if(window.__FW_DUAL_SOCIAL_PANELS__) return;
  window.__FW_DUAL_SOCIAL_PANELS__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  let me = null;
  let buddyTab = 'friends';
  let drag = null;

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function ini(v){
    return String(v || 'FW').trim().slice(0, 2).toUpperCase();
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
    clearTimeout(window.__fwDualPanelToast);
    window.__fwDualPanelToast = setTimeout(() => t.classList.remove('show'), 3000);
  }

  function waitForDb(){
    return new Promise(resolve => {
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      let count = 0;
      const timer = setInterval(() => {
        count += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(timer); resolve(true); }
        if(count > 120){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  async function refreshMe(){
    try{
      if(!window.fwDb || !window.fwDb.enabled) return null;
      me = await window.fwDb.getCurrentUser();
      return me;
    }catch(e){
      me = null;
      return null;
    }
  }

  async function needLogin(){
    await refreshMe();
    if(me && !me.disabled) return true;
    const btn = $('[data-fw-open], [data-login-cta], [data-sb-open]');
    if(btn) btn.click(); else toast('请先注册 / 登录。');
    return false;
  }

  function avatar(name, url, attrs){
    if(url){
      return `<span class="fw-social-avatar" ${attrs || ''}><img src="${esc(url)}" alt="${esc(name)}"></span>`;
    }
    return `<span class="fw-social-avatar" ${attrs || ''}>${esc(ini(name))}</span>`;
  }

  async function fetchProfiles(ids){
    const unique = Array.from(new Set((ids || []).filter(Boolean)));
    if(!unique.length) return {};
    const {data, error} = await window.fwDb.client
      .from('profiles')
      .select('id,nickname,avatar_url,lab_code')
      .in('id', unique);
    if(error) return {};
    const map = {};
    (data || []).forEach(p => map[p.id] = p);
    return map;
  }

  function formatNoticeType(type){
    return ({
      like: '点赞了你的帖子',
      same: '对你说：俺也一样',
      tissue: '给你递了纸巾',
      comment: '评论了你的帖子',
      friend_request: '想加你为搭子',
      friend_accept: '通过了你的搭子申请',
      private_message: '给你发来一条私聊',
      chat_agree: '赞同了你的房间消息',
      system: '系统通知'
    })[type] || '给你发来一条回声';
  }

  function injectStyle(){
    if($('#fw-dual-social-style')) return;
    const style = document.createElement('style');
    style.id = 'fw-dual-social-style';
    style.textContent = `
      @media (min-width:761px){
        .fw-dual-modal{
          position:fixed;
          inset:0;
          z-index:10020;
          display:none;
          pointer-events:none;
          background:transparent!important;
          backdrop-filter:none!important;
          -webkit-backdrop-filter:none!important;
        }
        .fw-dual-modal.show{display:block;}
        .fw-dual-modal .fw-social-panel{
          position:fixed!important;
          pointer-events:auto;
          max-width:none!important;
          max-height:none!important;
          display:grid!important;
          grid-template-rows:auto 1fr;
          resize:both;
          overflow:hidden!important;
          box-shadow:0 20px 72px rgba(0,0,0,.28),0 0 0 1px rgba(217,121,121,.28);
        }
        .fw-dual-modal .fw-social-head{cursor:move;user-select:none;}
        .fw-dual-modal .fw-social-body{min-height:0;overflow:auto;}
        .fw-dual-modal.echo .fw-social-item{grid-template-columns:auto 1fr;}
        .fw-dual-modal.echo .fw-social-item-actions{grid-column:1/-1;justify-content:flex-start;padding-left:50px;}
        .fw-dual-panel-tools{display:flex;align-items:center;gap:8px;margin-left:auto;margin-right:4px;}
        .fw-dual-tool-btn{height:30px;min-width:30px;padding:0 10px;border:1px solid rgba(28,28,24,.16);border-radius:999px;background:rgba(255,253,247,.8);color:#171715;font-size:12px;font-weight:950;cursor:pointer;}
        .fw-dual-tool-btn:hover{border-color:rgba(217,121,121,.6);color:#9d4a4a;}
        .fw-dual-post-focus{animation:fwDualPostPulse 2.8s ease both;}
        @keyframes fwDualPostPulse{0%{box-shadow:0 0 0 0 rgba(217,121,121,.75);transform:translateY(-2px)}35%{box-shadow:0 0 0 8px rgba(217,121,121,.18)}100%{box-shadow:0 0 0 0 rgba(217,121,121,0);transform:none}}
      }
      @media (max-width:760px){.fw-dual-modal{display:none!important;}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel(kind){
    const attr = kind === 'echo' ? 'data-fw-dual-echo-modal' : 'data-fw-dual-buddy-modal';
    let modal = document.querySelector('[' + attr + ']');
    if(modal) return modal;

    modal = document.createElement('div');
    modal.className = 'fw-dual-modal ' + kind;
    modal.setAttribute(attr, '1');
    modal.innerHTML = `
      <div class="fw-social-panel" data-fw-dual-panel="${kind}">
        <header class="fw-social-head">
          <div>
            <small>${kind === 'echo' ? 'ECHO CENTER' : 'BUDDY CENTER'}</small>
            <h2>${kind === 'echo' ? '回声' : '搭子'}</h2>
          </div>
          <div class="fw-dual-panel-tools">
            <button class="fw-dual-tool-btn" type="button" data-fw-dual-reset>复位</button>
          </div>
          <button class="fw-social-close" type="button" data-fw-dual-close>×</button>
        </header>
        <div class="fw-social-body" data-fw-dual-body="${kind}"></div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function vp(){
    return {w: window.innerWidth || document.documentElement.clientWidth, h: window.innerHeight || document.documentElement.clientHeight};
  }

  function clamp(n,min,max){ return Math.min(Math.max(n,min),max); }

  function defaultRect(kind){
    const v = vp();
    const echoOpen = !!document.querySelector('[data-fw-dual-echo-modal].show');
    const buddyOpen = !!document.querySelector('[data-fw-dual-buddy-modal].show');
    let w = kind === 'echo' ? 420 : 620;
    let h = kind === 'echo' ? 560 : 660;
    let right = 28;
    let top = 92;
    if(kind === 'buddy' && echoOpen) right = 470;
    if(kind === 'echo' && buddyOpen) right = 28;
    w = Math.min(w, Math.max(kind === 'echo' ? 340 : 420, v.w - 24));
    h = Math.min(h, Math.max(kind === 'echo' ? 360 : 430, v.h - 24));
    return {left:Math.max(8, v.w - w - right), top:Math.max(8, top), width:w, height:Math.min(h, v.h - top - 12)};
  }

  function applyRect(panel, rect){
    const v = vp();
    const minW = panel.dataset.fwDualPanel === 'echo' ? 340 : 420;
    const minH = panel.dataset.fwDualPanel === 'echo' ? 360 : 430;
    const width = clamp(rect.width, Math.min(minW, v.w - 24), Math.max(320, v.w - 24));
    const height = clamp(rect.height, Math.min(minH, v.h - 24), Math.max(320, v.h - 24));
    const left = clamp(rect.left, 8, Math.max(8, v.w - width - 8));
    const top = clamp(rect.top, 8, Math.max(8, v.h - height - 8));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.width = width + 'px';
    panel.style.height = height + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function openPanel(kind){
    const modal = ensurePanel(kind);
    const panel = modal.querySelector('.fw-social-panel');
    modal.classList.add('show');
    applyRect(panel, defaultRect(kind));
    return modal;
  }

  function closePanel(modal){
    modal.classList.remove('show');
  }

  async function openEcho(){
    if(!(await waitForDb()) || !(await needLogin())) return;
    const modal = openPanel('echo');
    const body = modal.querySelector('[data-fw-dual-body="echo"]');
    body.innerHTML = '<div class="fw-social-empty">正在读取回声...</div>';

    try{
      const {data, error} = await window.fwDb.client
        .from('notifications')
        .select('id,actor_id,type,target_type,target_id,content,is_read,created_at')
        .eq('user_id', me.id)
        .order('created_at', {ascending:false})
        .limit(80);
      if(error) throw error;

      const profiles = await fetchProfiles((data || []).map(n => n.actor_id));
      if(!data || !data.length){
        body.innerHTML = '<div class="fw-social-empty">暂时没有新的回声。安静也是一种运行状态。</div>';
        return;
      }

      body.innerHTML = `<div class="fw-social-list">${data.map(n => {
        const p = profiles[n.actor_id] || {};
        const name = p.nickname || '某位研究员';
        return `<article class="fw-social-item ${n.is_read ? '' : 'unread'}">
          ${avatar(name, p.avatar_url, `data-fw-profile-user="${esc(n.actor_id || '')}"`)}
          <div class="fw-social-item-main"><b>${esc(name)} ${esc(formatNoticeType(n.type))}</b><span>${esc(n.content || '对你的低功耗发言产生了回应。')}</span></div>
          <div class="fw-social-item-actions">${noticeActions(n)}</div>
        </article>`;
      }).join('')}</div>`;

      await window.fwDb.client.from('notifications').update({is_read:true}).eq('user_id', me.id).eq('is_read', false);
    }catch(e){
      body.innerHTML = `<div class="fw-social-empty">回声读取失败：${esc(e.message || '请稍后重试。')}</div>`;
    }
  }

  function noticeActions(n){
    if(n.type === 'private_message' && n.actor_id){
      return `<button class="fw-social-mini-btn dark" data-fw-dual-chat="${esc(n.actor_id)}">打开私聊</button>`;
    }
    if(n.type === 'friend_request'){
      return '<button class="fw-social-mini-btn dark" data-fw-dual-open-buddy="incoming">处理申请</button>';
    }
    if(n.type === 'friend_accept'){
      return '<button class="fw-social-mini-btn dark" data-fw-dual-open-buddy="friends">查看搭子</button>';
    }
    if((n.target_type === 'post' || ['like','same','tissue','comment'].includes(n.type)) && n.target_id){
      return `<button class="fw-social-mini-btn dark" data-fw-dual-jump-post="${esc(n.target_id)}" data-open-comments="${n.type === 'comment' ? '1' : '0'}">查看帖子</button>`;
    }
    if(n.actor_id){
      return `<button class="fw-social-mini-btn" data-fw-dual-profile="${esc(n.actor_id)}">查看资料</button>`;
    }
    return '';
  }

  async function getFriendships(){
    const {data, error} = await window.fwDb.client
      .from('friendships')
      .select('id,requester_id,receiver_id,status,created_at,updated_at')
      .or(`requester_id.eq.${me.id},receiver_id.eq.${me.id}`)
      .order('updated_at', {ascending:false});
    if(error) throw error;
    const ids = [];
    (data || []).forEach(f => ids.push(f.requester_id, f.receiver_id));
    return {rows:data || [], profiles:await fetchProfiles(ids)};
  }

  function otherId(f){ return f.requester_id === me.id ? f.receiver_id : f.requester_id; }

  function friendItem(f, profiles){
    const oid = otherId(f);
    const p = profiles[oid] || {};
    const name = p.nickname || '低功耗研究员';
    const code = p.lab_code ? '实验品编号：' + p.lab_code : '实验品编号：未设置';
    const incoming = f.receiver_id === me.id && f.status === 'pending';
    const outgoing = f.requester_id === me.id && f.status === 'pending';
    const accepted = f.status === 'accepted';
    const blocked = f.status === 'blocked';
    const statusText = accepted ? '已成为摸鱼搭子' : incoming ? '想加你为搭子' : outgoing ? '等待对方低功耗处理' : blocked ? '已拉黑' : '已拒绝 / 已失效';
    let actions = '';
    if(incoming){
      actions = `<button class="fw-social-mini-btn dark" data-fw-dual-accept="${f.id}">同意</button><button class="fw-social-mini-btn danger" data-fw-dual-reject="${f.id}">拒绝</button>`;
    }else if(accepted){
      actions = `<button class="fw-social-mini-btn dark" data-fw-dual-chat="${esc(oid)}">私聊</button><button class="fw-social-mini-btn danger" data-fw-dual-remove="${f.id}">解除</button>`;
    }else if(outgoing){
      actions = `<button class="fw-social-mini-btn danger" data-fw-dual-remove="${f.id}">撤回</button>`;
    }
    return `<article class="fw-social-item">
      ${avatar(name, p.avatar_url, `data-fw-dual-profile="${esc(oid)}"`)}
      <div class="fw-social-item-main"><b>${esc(name)}</b><span>${esc(code)} · ${esc(statusText)}</span></div>
      <div class="fw-social-item-actions">${actions}</div>
    </article>`;
  }

  async function openBuddy(tab){
    if(!(await waitForDb()) || !(await needLogin())) return;
    buddyTab = tab || buddyTab || 'friends';
    const modal = openPanel('buddy');
    const body = modal.querySelector('[data-fw-dual-body="buddy"]');
    body.innerHTML = '<div class="fw-social-empty">正在读取搭子状态...</div>';

    try{
      const {rows, profiles} = await getFriendships();
      const accepted = rows.filter(f => f.status === 'accepted');
      const incoming = rows.filter(f => f.status === 'pending' && f.receiver_id === me.id);
      const outgoing = rows.filter(f => f.status === 'pending' && f.requester_id === me.id);
      let list = accepted;
      if(buddyTab === 'incoming') list = incoming;
      if(buddyTab === 'outgoing') list = outgoing;
      const empty = buddyTab === 'friends' ? '暂时还没有搭子。可以点击别人头像，加为摸鱼搭子。' : buddyTab === 'incoming' ? '暂无新的搭子申请。' : '暂无发出的申请。';
      body.innerHTML = `
        <form class="fw-social-search" data-fw-dual-search>
          <input name="q" autocomplete="off" placeholder="搜索实验品编号 / 昵称 / 完整邮箱" />
          <button type="submit">搜索搭子</button>
          <p>邮箱只支持完整邮箱精准搜索；搜索结果不会显示邮箱。</p>
        </form>
        <div class="fw-search-results" data-fw-dual-search-results></div>
        <div class="fw-social-tabs">
          <button class="fw-social-tab ${buddyTab === 'friends' ? 'active' : ''}" data-fw-dual-buddy-tab="friends">我的搭子</button>
          <button class="fw-social-tab ${buddyTab === 'incoming' ? 'active' : ''}" data-fw-dual-buddy-tab="incoming">收到申请 ${incoming.length ? `(${incoming.length})` : ''}</button>
          <button class="fw-social-tab ${buddyTab === 'outgoing' ? 'active' : ''}" data-fw-dual-buddy-tab="outgoing">发出申请</button>
        </div>
        <div class="fw-social-list">${list.length ? list.map(f => friendItem(f, profiles)).join('') : `<div class="fw-social-empty">${esc(empty)}</div>`}</div>`;
    }catch(e){
      body.innerHTML = `<div class="fw-social-empty">搭子读取失败：${esc(e.message || '请稍后重试。')}</div>`;
    }
  }

  async function searchResearchers(keyword){
    const q = String(keyword || '').trim();
    if(q.length < 2){ toast('至少输入 2 个字符；邮箱需要输入完整邮箱。'); return []; }
    const {data, error} = await window.fwDb.client.rpc('fw_search_profiles', {search_text:q});
    if(error) throw error;
    return data || [];
  }

  async function getFriendshipWith(targetId){
    const {data, error} = await window.fwDb.client
      .from('friendships')
      .select('id,requester_id,receiver_id,status')
      .or(`and(requester_id.eq.${me.id},receiver_id.eq.${targetId}),and(requester_id.eq.${targetId},receiver_id.eq.${me.id})`)
      .limit(1);
    if(error) return null;
    return (data || [])[0] || null;
  }

  async function renderSearchResults(q){
    const box = $('[data-fw-dual-search-results]');
    if(!box) return;
    box.innerHTML = '<div class="fw-social-empty">正在搜索实验品...</div>';
    try{
      const rows = await searchResearchers(q);
      if(!rows.length){ box.innerHTML = '<div class="fw-social-empty">没有找到对应实验品。</div>'; return; }
      const html = [];
      for(const p of rows){
        const f = await getFriendshipWith(p.id);
        let action = `<button class="fw-social-mini-btn dark" data-fw-dual-add="${esc(p.id)}">加为搭子</button>`;
        let relation = '可以发送搭子申请';
        if(f && f.status === 'accepted'){
          action = `<button class="fw-social-mini-btn dark" data-fw-dual-chat="${esc(p.id)}">私聊</button>`;
          relation = '已是搭子';
        }else if(f && f.status === 'pending' && f.requester_id === me.id){
          action = '<button class="fw-social-mini-btn" disabled>等待处理</button>';
          relation = '申请已发出';
        }else if(f && f.status === 'pending' && f.receiver_id === me.id){
          action = `<button class="fw-social-mini-btn dark" data-fw-dual-accept="${f.id}">同意</button><button class="fw-social-mini-btn danger" data-fw-dual-reject="${f.id}">拒绝</button>`;
          relation = '对方想加你为搭子';
        }
        html.push(`<article class="fw-social-item">${avatar(p.nickname, p.avatar_url, `data-fw-dual-profile="${esc(p.id)}"`)}<div class="fw-social-item-main"><b>${esc(p.nickname || '低功耗研究员')}</b><span>实验品编号：${esc(p.lab_code || '未设置')} · ${esc(relation)}</span></div><div class="fw-social-item-actions">${action}<button class="fw-social-mini-btn" data-fw-dual-profile="${esc(p.id)}">资料</button></div></article>`);
      }
      box.innerHTML = '<div class="fw-social-list">' + html.join('') + '</div>';
    }catch(e){
      box.innerHTML = '<div class="fw-social-empty">搜索失败，请确认已经运行实验品编号 SQL。</div>';
    }
  }

  async function rpc(name, args){
    const {error} = await window.fwDb.client.rpc(name, args);
    if(error) throw error;
  }

  function clickTemp(attr, value){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.display = 'none';
    btn.setAttribute(attr, value);
    document.body.appendChild(btn);
    btn.click();
    setTimeout(() => btn.remove(), 200);
  }

  function postSelector(id){
    if(window.CSS && CSS.escape) return `.post-card[data-id="${CSS.escape(String(id))}"]`;
    return `.post-card[data-id="${String(id).replace(/"/g,'\\"')}"]`;
  }

  function focusPost(id, openComments, retry){
    const card = document.querySelector(postSelector(id));
    if(card){
      card.scrollIntoView({behavior:'smooth', block:'center'});
      card.classList.add('fw-dual-post-focus');
      if(openComments){ card.querySelector('.comment-box')?.classList.add('show'); }
      setTimeout(() => card.classList.remove('fw-dual-post-focus'), 3600);
      return true;
    }
    if(retry){
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if(focusPost(id, openComments, false) || tries > 24) clearInterval(timer);
      }, 250);
    }
    return false;
  }

  function jumpPost(id, openComments){
    const path = window.location.pathname.split('/').pop() || 'index.html';
    if(path !== 'square.html'){
      window.location.href = `square.html?post=${encodeURIComponent(id)}${openComments ? '&comments=1' : ''}`;
      return;
    }
    focusPost(id, openComments, true);
  }

  function startDrag(e){
    const panel = e.target.closest('.fw-dual-modal .fw-social-panel');
    if(!panel) return;
    if(e.target.closest('button,input,textarea,a,select,[data-fw-dual-profile],[data-fw-dual-chat]')) return;
    const head = e.target.closest('.fw-social-head');
    if(!head) return;
    const rect = panel.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    drag = {panel,startX:p.clientX,startY:p.clientY,left:rect.left,top:rect.top,width:rect.width,height:rect.height};
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  function moveDrag(e){
    if(!drag) return;
    const p = e.touches ? e.touches[0] : e;
    applyRect(drag.panel, {left:drag.left + p.clientX - drag.startX, top:drag.top + p.clientY - drag.startY, width:drag.width, height:drag.height});
  }

  function endDrag(){
    drag = null;
    document.body.style.userSelect = '';
  }

  function interceptHeaderClicks(e){
    const echo = e.target.closest('[data-fw-open-echo]');
    const buddy = e.target.closest('[data-fw-open-buddy]');
    if(!echo && !buddy) return;
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    if(echo) openEcho();
    if(buddy) openBuddy('friends');
  }

  function bind(){
    window.addEventListener('click', interceptHeaderClicks, true);

    window.addEventListener('submit', e => {
      const search = e.target.closest('[data-fw-dual-search]');
      if(!search) return;
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      renderSearchResults(search.querySelector('input[name="q"]')?.value || '');
    }, true);

    window.addEventListener('click', async e => {
      const close = e.target.closest('[data-fw-dual-close]');
      if(close){ closePanel(close.closest('.fw-dual-modal')); return; }

      const reset = e.target.closest('[data-fw-dual-reset]');
      if(reset){
        const panel = reset.closest('.fw-social-panel');
        if(panel) applyRect(panel, defaultRect(panel.dataset.fwDualPanel));
        return;
      }

      const openBuddyBtn = e.target.closest('[data-fw-dual-open-buddy]');
      if(openBuddyBtn){ openBuddy(openBuddyBtn.dataset.fwDualOpenBuddy || 'friends'); return; }

      const tab = e.target.closest('[data-fw-dual-buddy-tab]');
      if(tab){ openBuddy(tab.dataset.fwDualBuddyTab || 'friends'); return; }

      const chat = e.target.closest('[data-fw-dual-chat]');
      if(chat){ clickTemp('data-fw-start-chat', chat.dataset.fwDualChat); return; }

      const profile = e.target.closest('[data-fw-dual-profile]');
      if(profile){ clickTemp('data-fw-profile-user', profile.dataset.fwDualProfile); return; }

      const jump = e.target.closest('[data-fw-dual-jump-post]');
      if(jump){ jumpPost(jump.dataset.fwDualJumpPost, jump.dataset.openComments === '1'); return; }

      const add = e.target.closest('[data-fw-dual-add]');
      if(add){
        try{ const {error} = await window.fwDb.client.rpc('fw_send_friend_request', {target_user_id:add.dataset.fwDualAdd}); if(error) throw error; toast('搭子申请已发出。'); openBuddy(buddyTab); }catch(err){ toast(err.message || '发送申请失败。'); }
        return;
      }

      const accept = e.target.closest('[data-fw-dual-accept]');
      if(accept){
        try{ await rpc('fw_respond_friendship', {target_friendship_id:Number(accept.dataset.fwDualAccept), accept_request:true}); toast('已同意搭子申请。'); openBuddy('friends'); }catch(err){ toast(err.message || '处理失败。'); }
        return;
      }

      const reject = e.target.closest('[data-fw-dual-reject]');
      if(reject){
        try{ await rpc('fw_respond_friendship', {target_friendship_id:Number(reject.dataset.fwDualReject), accept_request:false}); toast('已拒绝搭子申请。'); openBuddy('incoming'); }catch(err){ toast(err.message || '处理失败。'); }
        return;
      }

      const remove = e.target.closest('[data-fw-dual-remove]');
      if(remove){
        try{ await rpc('fw_remove_friendship', {target_friendship_id:Number(remove.dataset.fwDualRemove)}); toast('已处理搭子关系。'); openBuddy(buddyTab); }catch(err){ toast(err.message || '操作失败。'); }
        return;
      }
    }, true);

    document.addEventListener('mousedown', startDrag, true);
    document.addEventListener('touchstart', startDrag, {capture:true, passive:false});
    document.addEventListener('mousemove', moveDrag, true);
    document.addEventListener('touchmove', moveDrag, {capture:true, passive:false});
    document.addEventListener('mouseup', endDrag, true);
    document.addEventListener('touchend', endDrag, true);
  }

  function handlePostQuery(){
    const params = new URLSearchParams(window.location.search);
    const id = params.get('post') || params.get('fw_focus_post');
    if(id){ setTimeout(() => focusPost(id, params.get('comments') === '1', true), 900); }
  }

  function boot(){
    injectStyle();
    bind();
    handlePostQuery();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
