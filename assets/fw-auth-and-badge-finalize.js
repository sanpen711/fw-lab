// F.w 研究所：退出登录 + 消息红点最终收口（轻量版）
// 解决退出登录卡住；避免持续 MutationObserver 刷新造成点击卡顿。
(function(){
  if(window.__FW_AUTH_BADGE_FINALIZE__) return;
  window.__FW_AUTH_BADGE_FINALIZE__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  let busyLogout = false;
  let badgeTimer = 0;

  function toast(msg){
    let t = $('.fw-toast');
    if(!t){ t = document.createElement('div'); t.className = 'fw-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwAuthBadgeToast);
    window.__fwAuthBadgeToast = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function waitForDb(){
    return new Promise(resolve => {
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      let count = 0;
      const timer = setInterval(() => {
        count += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(timer); resolve(true); }
        if(count > 50){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  function withTimeout(p, ms){ return Promise.race([p, new Promise(resolve => setTimeout(resolve, ms || 3200))]); }

  function localClean(){
    try{
      Object.keys(localStorage).forEach(k => { if(/^sb-|supabase|fw_register_state/i.test(k)) localStorage.removeItem(k); });
      Object.keys(sessionStorage).forEach(k => { if(/^sb-|supabase|fw_register_state/i.test(k)) sessionStorage.removeItem(k); });
    }catch(e){}
  }

  async function hardLogout(){
    if(busyLogout) return;
    busyLogout = true;
    toast('正在退出...');
    $$('[data-sb-logout]').forEach(btn => {
      btn.disabled = true;
      btn.dataset.oldText = btn.dataset.oldText || btn.textContent || '退出';
      btn.textContent = '正在退出...';
    });
    try{
      await waitForDb();
      if(window.fwDb?.client?.auth?.signOut){
        await withTimeout(window.fwDb.client.auth.signOut({scope:'local'}), 2400);
        await withTimeout(window.fwDb.client.auth.signOut(), 2400);
      }
    }catch(e){}
    localClean();
    setTimeout(() => { window.location.href = window.location.href.split('#')[0].split('?')[0] + '?logout=' + Date.now(); }, 120);
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
    try{
      if(!(await waitForDb())) return '';
      const u = await window.fwDb.getCurrentUser();
      return u?.id || '';
    }catch(e){ return ''; }
  }

  async function refreshCorrectBadges(){
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

  function cleanBuddyPreview(){
    $$('.fw-wx-item[data-fw-wx-chat-user] .fw-wx-sub').forEach(sub => {
      const txt = sub.textContent || '';
      if(txt.includes(' · ')) sub.textContent = txt.split(' · ')[0];
    });
  }

  function injectStyle(){
    if($('#fw-auth-badge-finalize-style')) return;
    const style = document.createElement('style');
    style.id = 'fw-auth-badge-finalize-style';
    style.textContent = `
      .fw-wx-unread-badge{left:-5px!important;top:-6px!important;border-color:#fffdf7!important;}
      .fw-wx-item .fw-wx-sub{max-width:190px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      [data-sb-logout]:disabled{opacity:.72!important;cursor:wait!important;}
    `;
    document.head.appendChild(style);
  }

  function bind(){
    document.addEventListener('click', e => {
      const logoutBtn = e.target.closest('[data-sb-logout]');
      if(logoutBtn){
        e.preventDefault(); e.stopPropagation(); if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        hardLogout(); return;
      }
      if(e.target.closest('[data-fw-open-echo], [data-fw-open-buddy], [data-fw-wx-tab], [data-fw-wx-chat-user], [data-fw-wx-chat-direct]')){
        setTimeout(() => { cleanBuddyPreview(); refreshCorrectBadges(); }, 420);
      }
    }, true);
  }

  function boot(){
    injectStyle(); bind(); cleanBuddyPreview(); refreshCorrectBadges();
    clearInterval(badgeTimer);
    badgeTimer = setInterval(refreshCorrectBadges, 25000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
