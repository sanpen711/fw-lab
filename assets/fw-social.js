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
    const n = Math.max(0, Number(count || 0));
    el.textContent = n > 99 ? '99+' : String(n);
    el.classList.toggle('show', n > 0);
  }

  async function refreshBadges(){
    if(!window.fwDb?.enabled || !window.fwDb?.client) return;
    if(!me) await refreshMe();
    if(!me?.id){
      setBadge($('[data-fw-echo-count]'), 0);
      setBadge($('[data-fw-buddy-count]'), 0);
      return;
    }
    try{
      const [echo,buddy,requests] = await Promise.all([
        window.fwDb.client.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',me.id).eq('is_read',false).neq('type','private_message'),
        window.fwDb.client.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',me.id).eq('is_read',false).eq('type','private_message'),
        window.fwDb.client.from('friendships').select('id',{count:'exact',head:true}).eq('receiver_id',me.id).eq('status','pending')
      ]);
      setBadge($('[data-fw-echo-count]'), echo.count || 0);
      setBadge($('[data-fw-buddy-count]'), (buddy.count || 0) + (requests.count || 0));
    }catch(e){}
  }

  function closeAll(){
    $$('[data-fw-social-modal],[data-fw-private-modal]').forEach(m => m.classList.remove('show'));
    document.body.classList.remove('fw-social-open');
  }

  function boot(){
    ensureShell();
    installHeaderButtons();
    waitForDb().then(async ok => {
      if(!ok) return;
      await refreshMe();
      await refreshBadges();
      subscribeBadgeChanges();
      clearInterval(badgeTimer);
      badgeTimer = setInterval(() => { if(!document.hidden) refreshBadges(); }, 20000);
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  document.addEventListener('visibilitychange', () => {
    if(!document.hidden) scheduleBadgeRefresh(100);
  });

  document.addEventListener('click', e => {
    if(e.target.closest('[data-fw-social-close],[data-fw-chat-close]')){ closeAll(); return; }
  });
})();