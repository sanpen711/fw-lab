// F.w 研究所：前台稳定核心（合并版）
// 合并范围：弹窗层级、回声固定面板、搭子未读红点、退出登录兜底、右上角资料卡遮挡修复。
// 目的：替代多个临时补丁脚本，减少重复监听和重复数据库查询，让点击更顺滑。
(function(){
  if(window.__FW_STABLE_CORE__) return;
  window.__FW_STABLE_CORE__ = true;

  // 阻止旧补丁在缓存情况下重复启动。
  window.__FW_FRONTEND_POLISH__ = true;
  window.__FW_PRIVATE_ROUTING__ = true;
  window.__FW_PRIVATE_ROUTING_LITE__ = true;
  window.__FW_PANEL_STABILITY__ = true;
  window.__FW_AUTH_BADGE_FINALIZE__ = true;
  window.__FW_PROFILE_POPOVER_FIX__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const state = { user:null, badgeTimer:0, buddyTimer:0, echoOpening:false, logoutBusy:false, buddyEnhancing:false };

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function ini(v){ return String(v || 'FW').trim().slice(0, 2).toUpperCase(); }

  function toast(msg){
    let t = $('.fw-toast');
    if(!t){ t = document.createElement('div'); t.className = 'fw-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwStableCoreToast);
    window.__fwStableCoreToast = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function waitForDb(){
    return new Promise(resolve => {
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      let count = 0;
      const timer = setInterval(() => {
        count += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(timer); resolve(true); }
        if(count > 70){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  async function getMe(){
    try{
      if(!(await waitForDb())) return null;
      state.user = await window.fwDb.getCurrentUser();
      return state.user;
    }catch(e){ state.user = null; return null; }
  }

  function injectStyle(){
    if($('#fw-stable-core-style')) return;
    const style = document.createElement('style');
    style.id = 'fw-stable-core-style';
    style.textContent = `
      :root{--fw-z-buddy:10080;--fw-z-social:10160;--fw-z-auth:10200;--fw-z-toast:10300;}
      button,a.btn,.chip,.fw-social-mini-btn,.fw-wx-mini{transition:transform .12s ease,opacity .12s ease,background-color .12s ease,border-color .12s ease,color .12s ease;}
      button:active,a.btn:active,.chip:active,.fw-social-mini-btn:active,.fw-wx-mini:active{transform:translateY(1px) scale(.99);}
      button:disabled{opacity:.58!important;cursor:not-allowed!important;transform:none!important;}

      .fw-profile-popover,.fw-userbar:hover .fw-profile-popover,.fw-userbar:focus-within .fw-profile-popover{display:none!important;opacity:0!important;pointer-events:none!important;}
      .fw-has-badge{position:relative!important;overflow:visible!important;}
      .fw-top-badge{position:absolute;right:-7px;top:-8px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#df7676;color:#fff;border:2px solid #161611;display:none;place-items:center;font-size:10px;line-height:14px;font-weight:1000;box-shadow:0 4px 12px rgba(0,0,0,.25);}
      .fw-has-badge.show .fw-top-badge{display:grid;}
      .fw-toast{z-index:var(--fw-z-toast)!important;}

      [data-sb-auth].show,.sb-auth.show,.auth-modal.show{z-index:var(--fw-z-auth)!important;}
      .fw-wx-modal.show{z-index:var(--fw-z-buddy)!important;}
      .fw-wx-panel{z-index:calc(var(--fw-z-buddy) + 1)!important;}
      .fw-social-modal.show,[data-fw-social-modal].show,[data-fw-private-modal].show{z-index:var(--fw-z-social)!important;}

      .square-main .post-card{padding:14px 18px!important;min-height:0!important;}
      .square-main .post-content{margin:8px 0 0!important;font-size:18px!important;line-height:1.34!important;}
      .square-main .interactions{margin-top:12px!important;gap:8px!important;}
      .square-main .interactions button{min-height:30px!important;padding:5px 11px!important;font-size:12px!important;}
      [data-post-form] .form-tip:empty{display:none!important;}

      .fw-wx-avatar-wrap{position:relative;overflow:visible!important;}
      .fw-wx-unread-badge{position:absolute;left:-5px;top:-6px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#df7676;color:#fff;border:2px solid #fffdf7;display:none;place-items:center;font-size:10px;line-height:14px;font-weight:1000;box-shadow:0 4px 12px rgba(0,0,0,.2);z-index:5;}
      .fw-wx-item.fw-wx-unread{background:rgba(255,253,247,.78);border-color:rgba(217,121,121,.32);}
      .fw-wx-item.fw-wx-unread .fw-wx-name{font-weight:1000;color:#171715;}
      .fw-wx-item .fw-wx-sub{max-width:190px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

      @media (min-width:761px){
        .fw-wx-modal.show{pointer-events:none!important;}
        .fw-wx-panel{display:grid!important;grid-template-rows:auto minmax(0,1fr)!important;max-height:calc(100dvh - 96px)!important;overflow:hidden!important;pointer-events:auto!important;}
        .fw-wx-shell{min-height:0!important;height:100%!important;overflow:hidden!important;}
        .fw-wx-left,.fw-wx-right{min-height:0!important;height:100%!important;overflow:hidden!important;}
        .fw-wx-right{display:grid!important;grid-template-rows:auto minmax(0,1fr) auto!important;}
        .fw-wx-messages{min-height:0!important;height:auto!important;overflow-y:auto!important;overscroll-behavior:contain;padding-bottom:22px!important;scroll-behavior:auto!important;}
        .fw-wx-compose{position:relative!important;z-index:5!important;flex-shrink:0!important;background:#fffdf7!important;box-shadow:0 -8px 18px rgba(0,0,0,.035)!important;}
        .fw-wx-list{min-height:0!important;overflow-y:auto!important;}

        .fw-stable-echo-modal{position:fixed;inset:0;z-index:var(--fw-z-social);display:none;pointer-events:none;background:transparent;}
        .fw-stable-echo-modal.show{display:block;}
        .fw-stable-echo-panel{position:fixed;right:28px;top:88px;width:min(460px,calc(100vw - 56px));height:min(620px,calc(100dvh - 112px));min-height:420px;display:grid;grid-template-rows:auto minmax(0,1fr);background:#f5f1e8;color:#171715;border:1px solid rgba(217,121,121,.55);box-shadow:0 24px 90px rgba(0,0,0,.26);pointer-events:auto;overflow:hidden;}
      }
      @media(max-width:760px){.fw-stable-echo-modal.show{display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,8,6,.72);pointer-events:auto;}.fw-stable-echo-panel{position:relative;width:100%;height:86dvh;right:auto;top:auto;}}
      .fw-stable-echo-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:22px 24px;border-bottom:1px solid rgba(28,28,24,.12);background:rgba(255,255,255,.45);}
      .fw-stable-echo-head small{display:block;color:#d97979;font-weight:1000;letter-spacing:.14em;margin-bottom:8px;}
      .fw-stable-echo-head h2{margin:0;font-size:32px;line-height:1;letter-spacing:-.06em;font-weight:1000;}
      .fw-stable-echo-close{width:42px;height:42px;border:0;background:transparent;font-size:31px;line-height:1;cursor:pointer;}
      .fw-stable-echo-body{min-height:0;overflow:auto;padding:18px;display:grid;align-content:start;gap:12px;}
      .fw-stable-echo-item{display:grid;grid-template-columns:38px 1fr auto;align-items:center;gap:12px;padding:13px;border:1px solid rgba(28,28,24,.12);background:rgba(255,253,247,.76);}
      .fw-stable-echo-item.unread{border-color:rgba(217,121,121,.55);background:#fffdf7;}
      .fw-stable-echo-avatar{width:38px;height:38px;border-radius:999px;display:grid;place-items:center;overflow:hidden;background:#171715;color:#fff;font-size:12px;font-weight:1000;border:1px solid rgba(217,121,121,.55);}
      .fw-stable-echo-avatar img{width:100%;height:100%;object-fit:cover;}
      .fw-stable-echo-main{min-width:0;}.fw-stable-echo-main b{display:block;font-size:14px;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.fw-stable-echo-main span{display:block;margin-top:4px;color:#6f6a5f;font-size:12px;font-weight:850;line-height:1.45;}
      .fw-stable-echo-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;}.fw-stable-echo-actions button{min-height:30px;border:1px solid rgba(28,28,24,.16);border-radius:999px;background:#171715;color:#fff;font-size:12px;font-weight:1000;padding:0 10px;cursor:pointer;}
      .fw-stable-echo-empty{padding:18px;border:1px dashed rgba(28,28,24,.18);background:rgba(255,255,255,.45);color:#746b5d;font-weight:900;}
    `;
    document.head.appendChild(style);
  }

  function setTopBadge(btn, count){
    if(!btn) return;
    btn.classList.add('fw-has-badge');
    let badge = btn.querySelector('.fw-top-badge');
    if(!badge){ badge = document.createElement('span'); badge.className = 'fw-top-badge'; btn.appendChild(badge); }
    const n = Number(count || 0);
    if(n > 0){ badge.textContent = n > 99 ? '99+' : String(n); btn.classList.add('show'); }
    else{ badge.textContent = ''; btn.classList.remove('show'); }
  }

  async function currentUserId(){
    const me = await getMe();
    return me?.id || '';
  }

  async function refreshBadges(){
    const uid = await currentUserId();
    if(!uid){ setTopBadge($('[data-fw-open-echo]'), 0); setTopBadge($('[data-fw-open-buddy]'), 0); return; }
    try{
      const [echo, priv, req] = await Promise.all([
        window.fwDb.client.from('notifications').select('id', {count:'exact', head:true}).eq('user_id', uid).eq('is_read', false).neq('type', 'private_message'),
        window.fwDb.client.from('notifications').select('id', {count:'exact', head:true}).eq('user_id', uid).eq('is_read', false).eq('type', 'private_message'),
        window.fwDb.client.from('friendships').select('id', {count:'exact', head:true}).eq('receiver_id', uid).eq('status', 'pending')
      ]);
      setTopBadge($('[data-fw-open-echo]'), echo.count || 0);
      setTopBadge($('[data-fw-open-buddy]'), (priv.count || 0) + (req.count || 0));
    }catch(e){}
  }

  function ensureEchoPanel(){
    let modal = $('[data-fw-stable-echo-modal]');
    if(modal) return modal;
    modal = document.createElement('div');
    modal.className = 'fw-stable-echo-modal';
    modal.dataset.fwStableEchoModal = '1';
    modal.innerHTML = `<section class="fw-stable-echo-panel" role="dialog" aria-modal="false" aria-label="回声"><header class="fw-stable-echo-head"><div><small>ECHO CENTER</small><h2>回声</h2></div><button class="fw-stable-echo-close" type="button" data-fw-stable-echo-close>×</button></header><div class="fw-stable-echo-body" data-fw-stable-echo-body><div class="fw-stable-echo-empty">正在读取回声...</div></div></section>`;
    document.body.appendChild(modal);
    return modal;
  }

  function avatarHtml(p){
    const name = p?.nickname || '研究员';
    const url = p?.avatar_url || '';
    return url ? `<span class="fw-stable-echo-avatar"><img src="${esc(url)}" alt="${esc(name)}"></span>` : `<span class="fw-stable-echo-avatar">${esc(ini(name))}</span>`;
  }

  async function fetchProfiles(ids){
    const unique = Array.from(new Set((ids || []).filter(Boolean)));
    if(!unique.length) return {};
    const {data, error} = await window.fwDb.client.from('profiles').select('id,nickname,avatar_url,lab_code').in('id', unique);
    if(error) return {};
    const map = {};
    (data || []).forEach(p => map[p.id] = p);
    return map;
  }

  function typeText(type){
    return ({like:'点赞了你的帖子',same:'对你说：俺也一样',tissue:'给你递了纸巾',comment:'评论了你的帖子',friend_request:'想加你为搭子',friend_accept:'通过了你的搭子申请',chat_agree:'赞同了你的房间消息',system:'系统通知'})[type] || '给你发来一条回声';
  }

  async function openEcho(){
    if(state.echoOpening) return;
    state.echoOpening = true;
    setTimeout(() => state.echoOpening = false, 450);
    const me = await getMe();
    if(!me?.id){ $('[data-fw-open], [data-login-cta], [data-sb-open]')?.click(); return; }

    $$('[data-fw-social-modal].show').forEach(m => m.classList.remove('show'));
    const modal = ensureEchoPanel();
    const body = modal.querySelector('[data-fw-stable-echo-body]');
    modal.classList.add('show');
    body.innerHTML = '<div class="fw-stable-echo-empty">正在读取回声...</div>';
    try{
      const {data, error} = await window.fwDb.client.from('notifications').select('id,actor_id,type,target_type,target_id,content,is_read,created_at').eq('user_id', me.id).neq('type', 'private_message').order('created_at', {ascending:false}).limit(80);
      if(error) throw error;
      const rows = data || [];
      const profiles = await fetchProfiles(rows.map(x => x.actor_id));
      if(!rows.length){ body.innerHTML = '<div class="fw-stable-echo-empty">暂时没有新的回声。私聊消息已经移到“搭子”里了。</div>'; return; }
      body.innerHTML = rows.map(n => {
        const p = profiles[n.actor_id] || {};
        const name = p.nickname || '某位研究员';
        const isPost = (n.target_type === 'post' || ['like','same','tissue','comment'].includes(n.type)) && n.target_id;
        return `<article class="fw-stable-echo-item ${n.is_read ? '' : 'unread'}"><span data-fw-profile-user="${esc(n.actor_id || '')}">${avatarHtml(p)}</span><div class="fw-stable-echo-main"><b>${esc(name)} ${esc(typeText(n.type))}</b><span>${esc(n.content || '对你的低功耗发言产生了回应。')}</span></div><div class="fw-stable-echo-actions">${isPost ? `<button type="button" data-fw-stable-post="${esc(n.target_id)}" data-open-comments="${n.type === 'comment' ? '1' : '0'}">查看帖子</button>` : ''}${n.type === 'friend_request' || n.type === 'friend_accept' ? `<button type="button" data-fw-stable-buddy>去搭子</button>` : ''}</div></article>`;
      }).join('');
      await window.fwDb.client.from('notifications').update({is_read:true}).eq('user_id', me.id).eq('is_read', false).neq('type', 'private_message');
      setTimeout(refreshBadges, 300);
    }catch(e){ body.innerHTML = '<div class="fw-stable-echo-empty">回声读取失败，请稍后重试。</div>'; }
  }
  window.fwOpenStableEcho = openEcho;

  function focusPost(id, comments){
    const path = window.location.pathname.split('/').pop() || 'index.html';
    if(path !== 'square.html'){
      window.location.href = `square.html?post=${encodeURIComponent(id)}${comments ? '&comments=1' : ''}`;
      return;
    }
    const safeId = window.CSS && CSS.escape ? CSS.escape(String(id)) : String(id).replace(/"/g,'\\"');
    const card = document.querySelector(`.post-card[data-id="${safeId}"]`);
    if(card){ card.scrollIntoView({behavior:'smooth', block:'center'}); card.classList.add('fw-dual-post-focus'); if(comments) card.querySelector('.comment-box')?.classList.add('show'); setTimeout(() => card.classList.remove('fw-dual-post-focus'), 2600); }
    else toast('这条帖子可能还没加载出来，稍后再试。');
  }

  function cleanBuddyPreview(){
    $$('.fw-wx-item[data-fw-wx-chat-user] .fw-wx-sub').forEach(sub => {
      const txt = sub.textContent || '';
      if(txt.includes(' · ')) sub.textContent = txt.split(' · ')[0];
    });
  }

  async function getPrivateMeta(){
    const meta = {};
    const uid = await currentUserId();
    if(!uid) return meta;
    try{
      const conv = await window.fwDb.client.from('conversations').select('id,user_one_id,user_two_id,updated_at').or(`user_one_id.eq.${uid},user_two_id.eq.${uid}`).order('updated_at', {ascending:false}).limit(120);
      const conversations = conv.data || [];
      const convIds = conversations.map(c => c.id);
      const otherByConv = {};
      conversations.forEach(c => {
        const other = c.user_one_id === uid ? c.user_two_id : c.user_one_id;
        if(!other) return;
        otherByConv[c.id] = other;
        meta[other] = meta[other] || {latestTime:c.updated_at || '', unread:0};
      });
      if(convIds.length){
        const msgs = await window.fwDb.client.from('private_messages').select('id,conversation_id,sender_id,is_deleted,created_at').in('conversation_id', convIds).eq('is_deleted', false).order('created_at', {ascending:false}).limit(300);
        (msgs.data || []).forEach(m => {
          const other = otherByConv[m.conversation_id]; if(!other) return;
          if(!meta[other].latestMessageId){ meta[other].latestMessageId = m.id; meta[other].latestTime = m.created_at || meta[other].latestTime || ''; }
        });
      }
      const unread = await window.fwDb.client.from('notifications').select('id,actor_id,created_at').eq('user_id', uid).eq('is_read', false).eq('type', 'private_message').order('created_at', {ascending:false});
      (unread.data || []).forEach(n => {
        if(!n.actor_id) return;
        const cur = meta[n.actor_id] || {latestTime:'', unread:0};
        cur.unread = Number(cur.unread || 0) + 1;
        const oldTime = cur.latestTime ? new Date(cur.latestTime).getTime() : 0;
        const newTime = n.created_at ? new Date(n.created_at).getTime() : 0;
        if(newTime >= oldTime) cur.latestTime = n.created_at || cur.latestTime;
        meta[n.actor_id] = cur;
      });
    }catch(e){}
    return meta;
  }

  function normalizeBuddyRows(){
    const list = $('[data-fw-wx-list]');
    if(!list) return [];
    const rows = $$('.fw-wx-item[data-fw-wx-chat-user]').filter(x => list.contains(x));
    const seen = new Set();
    const unique = [];
    rows.forEach(row => {
      const id = row.dataset.fwWxChatUser || '';
      if(!id) return;
      if(seen.has(id)){ row.remove(); return; }
      seen.add(id); unique.push(row);
    });
    return unique;
  }

  async function enhanceBuddyList(){
    if(state.buddyEnhancing) return;
    const modal = $('[data-fw-wx-buddy-modal].show, .fw-wx-modal.show');
    const list = $('[data-fw-wx-list]');
    if(!modal || !list) return;
    state.buddyEnhancing = true;
    try{
      const rows = normalizeBuddyRows();
      if(!rows.length) return;
      const meta = await getPrivateMeta();
      rows.forEach((row, index) => {
        const id = row.dataset.fwWxChatUser;
        const info = meta[id] || {};
        row.dataset.fwOriginalIndex = row.dataset.fwOriginalIndex || String(index);
        row.dataset.fwLatestTime = info.latestTime || '';
        row.dataset.fwUnread = String(info.unread || 0);
        row.classList.toggle('fw-wx-unread', Number(info.unread || 0) > 0);
        const av = row.querySelector('.fw-wx-avatar');
        if(av){
          av.classList.add('fw-wx-avatar-wrap');
          let badge = av.querySelector('.fw-wx-unread-badge');
          if(!badge){ badge = document.createElement('span'); badge.className = 'fw-wx-unread-badge'; av.appendChild(badge); }
          const unread = Number(info.unread || 0);
          badge.textContent = unread > 99 ? '99+' : String(unread || '');
          badge.style.display = unread > 0 ? 'grid' : 'none';
        }
      });
      cleanBuddyPreview();
      const sorted = rows.slice().sort((a,b) => {
        const ua = Number(a.dataset.fwUnread || 0), ub = Number(b.dataset.fwUnread || 0);
        if(ua !== ub) return ub - ua;
        const ta = a.dataset.fwLatestTime ? new Date(a.dataset.fwLatestTime).getTime() : 0;
        const tb = b.dataset.fwLatestTime ? new Date(b.dataset.fwLatestTime).getTime() : 0;
        if(ta !== tb) return tb - ta;
        return Number(a.dataset.fwOriginalIndex || 0) - Number(b.dataset.fwOriginalIndex || 0);
      });
      const current = rows.map(x => x.dataset.fwWxChatUser).join('|');
      const next = sorted.map(x => x.dataset.fwWxChatUser).join('|');
      if(current !== next){ const frag = document.createDocumentFragment(); sorted.forEach(row => frag.appendChild(row)); list.appendChild(frag); }
    }finally{ state.buddyEnhancing = false; }
  }

  async function markPrivateReadFrom(userId){
    const uid = await currentUserId();
    if(!uid || !userId) return;
    try{
      await window.fwDb.client.from('notifications').update({is_read:true}).eq('user_id', uid).eq('is_read', false).eq('type', 'private_message').eq('actor_id', userId);
      setTimeout(() => { refreshBadges(); enhanceBuddyList(); }, 250);
    }catch(e){}
  }

  function clampBuddyOnce(){
    const panel = $('[data-fw-wx-panel]');
    const modal = $('[data-fw-wx-buddy-modal].show, .fw-wx-modal.show');
    if(!panel || !modal || window.innerWidth <= 760) return;
    panel.style.right = '28px'; panel.style.left = 'auto'; panel.style.top = '88px'; panel.style.bottom = 'auto'; panel.style.height = 'min(720px, calc(100dvh - 96px))';
    const msg = panel.querySelector('[data-fw-wx-messages]');
    if(msg && msg.dataset.fwUserScrolled !== '1') requestAnimationFrame(() => { msg.scrollTop = msg.scrollHeight; });
  }

  function withTimeout(p, ms){ return Promise.race([p, new Promise(resolve => setTimeout(resolve, ms || 2600))]); }
  function localClean(){
    try{ Object.keys(localStorage).forEach(k => { if(/^sb-|supabase|fw_register_state/i.test(k)) localStorage.removeItem(k); }); Object.keys(sessionStorage).forEach(k => { if(/^sb-|supabase|fw_register_state/i.test(k)) sessionStorage.removeItem(k); }); }catch(e){}
  }
  async function hardLogout(){
    if(state.logoutBusy) return;
    state.logoutBusy = true;
    toast('正在退出...');
    $$('[data-sb-logout]').forEach(btn => { btn.disabled = true; btn.dataset.oldText = btn.dataset.oldText || btn.textContent || '退出'; btn.textContent = '正在退出...'; });
    try{
      await waitForDb();
      if(window.fwDb?.client?.auth?.signOut){ await withTimeout(window.fwDb.client.auth.signOut({scope:'local'}), 2200); await withTimeout(window.fwDb.client.auth.signOut(), 2200); }
    }catch(e){}
    localClean();
    setTimeout(() => { window.location.href = window.location.href.split('#')[0].split('?')[0] + '?logout=' + Date.now(); }, 120);
  }

  function patchSubmitButtons(){
    document.addEventListener('submit', e => {
      const form = e.target.closest('[data-post-form]');
      if(!form) return;
      const btn = form.querySelector('button[type="submit"]');
      if(!btn || btn.dataset.fwSubmitting === '1') return;
      const old = btn.dataset.oldText || btn.textContent;
      btn.dataset.oldText = old; btn.dataset.fwSubmitting = '1'; btn.disabled = true; btn.textContent = '发布中...';
      setTimeout(() => { btn.disabled = false; btn.textContent = old; btn.dataset.fwSubmitting = '0'; }, 800);
    }, true);
  }

  function bind(){
    patchSubmitButtons();
    document.addEventListener('click', e => {
      const logout = e.target.closest('[data-sb-logout]');
      if(logout){ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); hardLogout(); return; }
      const echo = e.target.closest('[data-fw-open-echo]');
      if(echo){ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); openEcho(); return; }
      if(e.target.closest('[data-fw-stable-echo-close]')){ $('[data-fw-stable-echo-modal]')?.classList.remove('show'); return; }
      const post = e.target.closest('[data-fw-stable-post]');
      if(post){ focusPost(post.dataset.fwStablePost, post.dataset.openComments === '1'); return; }
      if(e.target.closest('[data-fw-stable-buddy]')){ $('[data-fw-stable-echo-modal]')?.classList.remove('show'); $('[data-fw-open-buddy]')?.click(); return; }
      if(e.target.matches('[data-fw-stable-echo-modal]')) e.target.classList.remove('show');

      const chat = e.target.closest('[data-fw-wx-chat-user], [data-fw-wx-chat-direct], [data-fw-start-chat]');
      if(chat){ const id = chat.dataset.fwWxChatUser || chat.dataset.fwWxChatDirect || chat.dataset.fwStartChat || ''; if(id) markPrivateReadFrom(id); }
      if(e.target.closest('[data-fw-open-buddy], [data-fw-wx-tab], [data-fw-wx-chat-user], [data-fw-wx-chat-direct], [data-fw-wx-reset]')){
        setTimeout(() => { clampBuddyOnce(); cleanBuddyPreview(); enhanceBuddyList(); refreshBadges(); }, 380);
      }
    }, true);

    document.addEventListener('keydown', e => {
      if(e.key !== 'Escape') return;
      $$('.fw-wx-more-wrap.open').forEach(x => x.classList.remove('open'));
      const echo = $('[data-fw-stable-echo-modal].show');
      if(echo){ echo.classList.remove('show'); return; }
      const top = $$('.fw-social-modal.show, .fw-wx-modal.show').pop();
      top?.querySelector('.fw-social-close, .fw-wx-close, [data-fw-dual-close]')?.click();
    });

    document.addEventListener('scroll', e => {
      const msg = e.target.closest && e.target.closest('[data-fw-wx-messages]');
      if(!msg) return;
      msg.dataset.fwUserScrolled = (msg.scrollHeight - msg.scrollTop - msg.clientHeight < 80) ? '0' : '1';
    }, true);
    window.addEventListener('resize', () => setTimeout(clampBuddyOnce, 100));
    document.addEventListener('visibilitychange', () => { if(!document.hidden){ refreshBadges(); enhanceBuddyList(); } });
  }

  function boot(){
    injectStyle();
    bind();
    refreshBadges();
    clearInterval(state.badgeTimer);
    clearInterval(state.buddyTimer);
    state.badgeTimer = setInterval(refreshBadges, 25000);
    state.buddyTimer = setInterval(() => { if($('.fw-wx-modal.show')) enhanceBuddyList(); }, 14000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
