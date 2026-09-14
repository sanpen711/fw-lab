// F.w 研究所：回声 + 搭子 + 私聊模块（桌面端）
// 说明：电脑端只保留一个“回声”入口和一个弹窗；回声按手机端通知中心逻辑展示，不再额外打补丁。
(function(){
  if(window.__FW_SOCIAL_MODULE_CLEAN_PRIVATE_CHAT__) return;
  window.__FW_SOCIAL_MODULE_CLEAN_PRIVATE_CHAT__ = true;
  if(/\/app\//.test(window.location.pathname || '')) return;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  let me = null;
  let activeTab = 'friends';
  let currentChat = null;
  let chatTimer = null;
  let badgeTimer = null;
  let badgeRefreshTimer = null;
  let realtimeChannel = null;

  const ECHO_TYPES = ['like','same','tissue','comment','comment_reply','friend_request','friend_accept','private_message','chat_agree','system'];

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[c]));
  }

  function ini(v){
    return String(v || 'FW').trim().slice(0, 2).toUpperCase();
  }

  function hasLink(txt){
    return /(https?:\/\/|www\.|[a-z0-9][a-z0-9-]*\.(com|net|org|xyz|top|cn|cc|io|me|vip|club|site|info|online|shop|live|app)(\/|$|\s))/i.test(txt || '');
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
    clearTimeout(window.__fwSocialToast);
    window.__fwSocialToast = setTimeout(() => t.classList.remove('show'), 3000);
  }

  function avatar(name, url, attrs = ''){
    if(url){
      return `<span class="fw-social-avatar" ${attrs}><img src="${esc(url)}" alt="${esc(name)}"></span>`;
    }
    return `<span class="fw-social-avatar" ${attrs}>${esc(ini(name))}</span>`;
  }

  function waitForDb(){
    return new Promise(resolve => {
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
        resolve(true);
        return;
      }
      let count = 0;
      function check(){
        count += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
          resolve(true);
          return;
        }
        if(count > 24){
          resolve(false);
          return;
        }
        setTimeout(check, Math.min(1000, 80 * Math.pow(1.3, count)));
      }
      setTimeout(check, 80);
    });
  }

  function scheduleBadgeRefresh(delay = 120){
    clearTimeout(badgeRefreshTimer);
    badgeRefreshTimer = setTimeout(() => {
      if(!document.hidden) refreshBadges();
    }, delay);
  }

  function subscribeBadgeChanges(){
    if(realtimeChannel || !window.fwDb?.client?.channel) return;
    try{
      realtimeChannel = window.fwDb.client
        .channel('fw-desktop-social-badges')
        .on('postgres_changes', {event:'*', schema:'public', table:'notifications'}, () => scheduleBadgeRefresh())
        .on('postgres_changes', {event:'*', schema:'public', table:'friendships'}, () => scheduleBadgeRefresh())
        .on('postgres_changes', {event:'*', schema:'public', table:'comments'}, () => {
          window.FWCommentReplyEcho?.invalidate(me?.id);
          scheduleBadgeRefresh();
        })
        .subscribe();
    }catch(e){ realtimeChannel = null; }
  }

  async function refreshMe(){
    if(!window.fwDb || !window.fwDb.enabled) return null;
    try{
      me = await window.fwDb.getCurrentUser();
      return me;
    }catch(e){
      me = null;
      return null;
    }
  }

  function needLogin(){
    if(me && !me.disabled) return true;
    const btn = $('[data-fw-open], [data-login-cta], [data-sb-open]');
    if(btn) btn.click();
    else toast('请先注册 / 登录。');
    return false;
  }

  function injectEchoStyle(){
    if($('#fwDesktopEchoInlineStyle')) return;
    const style = document.createElement('style');
    style.id = 'fwDesktopEchoInlineStyle';
    style.textContent = `
      .fw-echo-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;flex-wrap:wrap;}
      .fw-echo-toolbar b{font-size:14px;color:#171715;font-weight:1000;}
      .fw-echo-toolbar small{display:block;margin-top:3px;color:rgba(23,23,21,.56);font-size:12px;font-weight:850;}
      .fw-echo-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
      .fw-echo-refresh,.fw-echo-mark-all{min-height:34px;border:1px solid rgba(28,28,24,.13);border-radius:999px;background:#fffdf7;color:#171715;padding:0 12px;font-size:12px;font-weight:1000;cursor:pointer;}
      .fw-echo-mark-all{background:#171715;border-color:#171715;color:#fff;}
      .fw-social-item.fw-echo-item{position:relative;cursor:pointer;align-items:flex-start;}
      .fw-social-item.fw-echo-item.unread{background:linear-gradient(135deg,#fffdf7,#fff3ef);border-color:rgba(217,121,121,.52);}
      .fw-social-item.fw-echo-item.unread:before{content:"";position:absolute;left:9px;top:9px;width:10px;height:10px;border-radius:999px;background:#d95353;border:2px solid #fffdf7;box-shadow:0 3px 10px rgba(217,83,83,.28);}
      .fw-social-item-main small{display:block;margin-top:5px;color:#9d4a4a;font-size:11px;font-weight:1000;}
    `;
    document.head.appendChild(style);
  }

  function ensureShell(){
    injectEchoStyle();

    if(!$('[data-fw-social-modal]')){
      const modal = document.createElement('div');
      modal.className = 'fw-social-modal';
      modal.dataset.fwSocialModal = '1';
      modal.innerHTML = `
        <div class="fw-social-panel" data-fw-social-panel>
          <header class="fw-social-head">
            <div>
              <small data-fw-social-kicker>FW SOCIAL</small>
              <h2 data-fw-social-title>回声</h2>
            </div>
            <button class="fw-social-close" type="button" data-fw-social-close>×</button>
          </header>
          <div class="fw-social-body" data-fw-social-body></div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    if(!$('[data-fw-private-modal]')){
      const chat = document.createElement('div');
      chat.className = 'fw-social-modal';
      chat.dataset.fwPrivateModal = '1';
      chat.innerHTML = `
        <div class="fw-private-window">
          <header class="fw-social-head">
            <div>
              <small>PRIVATE CHAT</small>
              <h2 data-fw-chat-title>搭子私聊</h2>
            </div>
            <button class="fw-social-close" type="button" data-fw-chat-close>×</button>
          </header>
          <div class="fw-private-messages" data-fw-private-messages></div>
          <form class="fw-private-form" data-fw-private-form>
            <input name="message" maxlength="300" autocomplete="off" placeholder="说一句只给搭子看的话，最多 300 字..." />
            <button type="submit">发送</button>
          </form>
        </div>
      `;
      document.body.appendChild(chat);
    }
  }

  function installHeaderButtons(){
    if(window.__FW_PC_WEB_SYNC__ && !/FWYanjiusuoDesktop\//i.test(navigator.userAgent || '')) return;
    $$('.header').forEach(header => {
      if(header.querySelector('.fw-social-actions')) return;
      const actions = document.createElement('div');
      actions.className = 'fw-social-actions';
      actions.innerHTML = `
        <button class="fw-social-btn" type="button" data-fw-open-echo>
          回声<span class="fw-social-badge" data-fw-echo-count></span>
        </button>
        <button class="fw-social-btn" type="button" data-fw-open-buddy>
          搭子<span class="fw-social-badge" data-fw-buddy-count></span>
        </button>
      `;
      const userbar = header.querySelector('.fw-userbar');
      const menu = header.querySelector('.menu-btn');
      if(userbar) header.insertBefore(actions, userbar);
      else if(menu) header.insertBefore(actions, menu);
      else header.appendChild(actions);
    });
  }

  async function fetchProfiles(ids){
    const unique = Array.from(new Set((ids || []).filter(Boolean)));
    if(!unique.length || !window.fwDb?.client) return {};
    const {data} = await window.fwDb.client.from('profiles').select('id,nickname,avatar_url').in('id', unique);
    const map = {};
    (data || []).forEach(p => { map[p.id] = p; });
    return map;
  }

  function setBadge(el, count){
    if(!el) return;
    const n = Number(count || 0);
    el.textContent = n > 99 ? '99+' : String(n);
    el.classList.toggle('show', n > 0);
  }

  function setHeaderBadges(echoCount, buddyCount){
    $$('[data-fw-echo-count]').forEach(el => setBadge(el, echoCount));
    $$('[data-fw-buddy-count]').forEach(el => setBadge(el, buddyCount));
  }

  async function refreshBadges(){
    if(!window.fwDb?.client){
      setHeaderBadges(0, 0);
      return;
    }
    if(!me) await refreshMe();
    if(!me?.id){
      setHeaderBadges(0, 0);
      return;
    }
    try{
      const [echoRes, buddyRes, friendRes] = await Promise.all([
        window.fwDb.client.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',me.id).eq('is_read',false).neq('type','private_message'),
        window.fwDb.client.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',me.id).eq('is_read',false).eq('type','private_message'),
        window.fwDb.client.from('friendships').select('id',{count:'exact',head:true}).eq('receiver_id',me.id).eq('status','pending')
      ]);
      setHeaderBadges(echoRes.count || 0, (buddyRes.count || 0) + (friendRes.count || 0));
    }catch(e){}
  }

  function openModal(modal){
    if(!modal) return;
    modal.classList.add('show');
    document.body.classList.add('fw-social-open');
  }

  function closeModal(modal){
    if(!modal) return;
    modal.classList.remove('show');
    document.body.classList.remove('fw-social-open');
  }

  function closeAll(){
    $$('[data-fw-social-modal],[data-fw-private-modal]').forEach(closeModal);
  }

  async function renderEcho(){
    if(!needLogin()) return;
    const body = $('[data-fw-social-body]');
    const title = $('[data-fw-social-title]');
    const kicker = $('[data-fw-social-kicker]');
    if(title) title.textContent = '回声';
    if(kicker) kicker.textContent = 'ECHO CENTER';
    if(body) body.innerHTML = '<div class="fw-social-loading">正在读取回声...</div>';
    openModal($('[data-fw-social-modal]'));
    try{
      const {data,error} = await window.fwDb.client.from('notifications').select('*').eq('user_id',me.id).order('created_at',{ascending:false}).limit(80);
      if(error) throw error;
      const rows = (data || []).filter(row => ECHO_TYPES.includes(row.type));
      const profileMap = await fetchProfiles(rows.map(r => r.actor_id));
      if(!body) return;
      body.innerHTML = `<div class="fw-echo-toolbar"><div><b>回声</b><small>${rows.length ? '新的回应和通知都在这里' : '暂时没有新的回声'}</small></div><div class="fw-echo-actions"><button class="fw-echo-refresh" type="button" data-fw-echo-refresh>刷新</button><button class="fw-echo-mark-all" type="button" data-fw-echo-mark-all>全部已读</button></div></div>` + rows.map(row => {
        const actor = profileMap[row.actor_id] || {};
        const name = actor.nickname || '研究员';
        const unread = row.is_read ? '' : ' unread';
        return `<button class="fw-social-item fw-echo-item${unread}" type="button" data-fw-echo-item="${esc(row.id)}"><span>${avatar(name,actor.avatar_url)}</span><span class="fw-social-item-main"><b>${esc(name)}</b><p>${esc(row.content || '给你留下了一条回声')}</p><small>${new Date(row.created_at).toLocaleString('zh-CN')}</small></span></button>`;
      }).join('') || '<div class="fw-social-empty">暂时没有新的回声。</div>';
    }catch(e){
      if(body) body.innerHTML = '<div class="fw-social-empty">回声读取失败，请稍后重试。</div>';
    }
  }

  async function renderBuddy(){
    if(!needLogin()) return;
    const body = $('[data-fw-social-body]');
    const title = $('[data-fw-social-title]');
    const kicker = $('[data-fw-social-kicker]');
    if(title) title.textContent = '搭子';
    if(kicker) kicker.textContent = 'BUDDY CENTER';
    if(body) body.innerHTML = '<div class="fw-social-loading">正在读取搭子...</div>';
    openModal($('[data-fw-social-modal]'));
    try{
      const {data,error} = await window.fwDb.client.from('friendships').select('*').or(`sender_id.eq.${me.id},receiver_id.eq.${me.id}`).order('created_at',{ascending:false});
      if(error) throw error;
      const ids = [];
      (data || []).forEach(row => ids.push(row.sender_id === me.id ? row.receiver_id : row.sender_id));
      const profiles = await fetchProfiles(ids);
      if(body) body.innerHTML = (data || []).map(row => {
        const otherId = row.sender_id === me.id ? row.receiver_id : row.sender_id;
        const p = profiles[otherId] || {};
        return `<button class="fw-social-item" type="button" data-fw-start-chat="${esc(otherId)}"><span>${avatar(p.nickname || '研究员',p.avatar_url)}</span><span class="fw-social-item-main"><b>${esc(p.nickname || '研究员')}</b><p>${row.status === 'accepted' ? '已是搭子，点击私聊' : '搭子申请处理中'}</p></span></button>`;
      }).join('') || '<div class="fw-social-empty">暂时还没有搭子。</div>';
    }catch(e){
      if(body) body.innerHTML = '<div class="fw-social-empty">搭子读取失败，请稍后重试。</div>';
    }
  }

  async function openChat(userId){
    if(!needLogin() || !userId) return;
    currentChat = String(userId);
    const modal = $('[data-fw-private-modal]');
    const messages = $('[data-fw-private-messages]');
    const title = $('[data-fw-chat-title]');
    const profiles = await fetchProfiles([currentChat]);
    if(title) title.textContent = profiles[currentChat]?.nickname || '搭子私聊';
    if(messages) messages.innerHTML = '<div class="fw-social-loading">正在读取聊天...</div>';
    openModal(modal);
    await loadChat();
  }

  async function loadChat(){
    if(!currentChat || !me?.id || !window.fwDb?.client) return;
    const messages = $('[data-fw-private-messages]');
    try{
      const {data,error} = await window.fwDb.client.from('private_messages').select('*').or(`and(sender_id.eq.${me.id},receiver_id.eq.${currentChat}),and(sender_id.eq.${currentChat},receiver_id.eq.${me.id})`).order('created_at',{ascending:true}).limit(200);
      if(error) throw error;
      if(messages){
        messages.innerHTML = (data || []).map(row => `<div class="fw-private-message ${row.sender_id === me.id ? 'mine' : ''}"><p>${esc(row.content || '')}</p><small>${new Date(row.created_at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</small></div>`).join('') || '<div class="fw-social-empty">还没有聊天记录。</div>';
        messages.scrollTop = messages.scrollHeight;
      }
    }catch(e){ if(messages) messages.innerHTML = '<div class="fw-social-empty">聊天记录读取失败。</div>'; }
  }

  function bind(){
    document.addEventListener('click', async e => {
      if(e.target.closest('[data-fw-open-echo]')){ e.preventDefault(); await refreshMe(); renderEcho(); return; }
      if(e.target.closest('[data-fw-open-buddy]')){ e.preventDefault(); await refreshMe(); renderBuddy(); return; }
      if(e.target.closest('[data-fw-social-close],[data-fw-chat-close]')){ closeAll(); return; }
      const chat = e.target.closest('[data-fw-start-chat]');
      if(chat){ e.preventDefault(); openChat(chat.dataset.fwStartChat); return; }
      if(e.target.closest('[data-fw-echo-refresh]')){ renderEcho(); return; }
      if(e.target.closest('[data-fw-echo-mark-all]') && me?.id){
        await window.fwDb.client.from('notifications').update({is_read:true}).eq('user_id',me.id).eq('is_read',false);
        renderEcho();refreshBadges();return;
      }
    });
    const form = $('[data-fw-private-form]');
    if(form){
      form.addEventListener('submit', async e => {
        e.preventDefault();
        if(!currentChat || !me?.id) return;
        const input = form.elements.message;
        const content = String(input?.value || '').trim();
        if(!content || hasLink(content)){ if(hasLink(content)) toast('私聊暂不支持发送链接。'); return; }
        input.disabled = true;
        try{
          const {error} = await window.fwDb.client.from('private_messages').insert({sender_id:me.id,receiver_id:currentChat,content});
          if(error) throw error;
          input.value = '';
          await loadChat();
        }catch(err){ toast('消息发送失败，请稍后再试。'); }
        finally{ input.disabled = false; input.focus(); }
      });
    }
  }

  async function boot(){
    ensureShell();
    installHeaderButtons();
    bind();
    const ok = await waitForDb();
    if(ok){
      await refreshMe();
      refreshBadges();
      subscribeBadgeChanges();
      clearInterval(badgeTimer);
      badgeTimer = setInterval(() => { if(!document.hidden) refreshBadges(); }, 20000);
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  document.addEventListener('visibilitychange', () => {
    if(!document.hidden) scheduleBadgeRefresh(100);
  });
})();