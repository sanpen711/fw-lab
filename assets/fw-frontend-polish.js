// F.w 研究所：全站前台收口补丁
// 目标：统一浮层、未读红点、按钮状态、评论折叠、右上角账号遮挡等细节。
(function(){
  if(window.__FW_FRONTEND_POLISH__) return;
  window.__FW_FRONTEND_POLISH__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  let badgeTimer = null;

  function waitForDb(){
    return new Promise(resolve => {
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      let count = 0;
      const timer = setInterval(() => {
        count += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(timer); resolve(true); }
        if(count > 80){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  function addBadge(btn, count){
    if(!btn) return;
    btn.classList.add('fw-has-badge');
    let badge = btn.querySelector('.fw-top-badge');
    if(!badge){
      badge = document.createElement('span');
      badge.className = 'fw-top-badge';
      btn.appendChild(badge);
    }
    const n = Number(count || 0);
    if(n > 0){
      badge.textContent = n > 99 ? '99+' : String(n);
      btn.classList.add('show');
    }else{
      badge.textContent = '';
      btn.classList.remove('show');
    }
  }

  function setSmallBadge(selector, count){
    $$(selector).forEach(el => {
      const n = Number(count || 0);
      el.textContent = n > 99 ? '99+' : String(n);
      el.classList.toggle('show', n > 0);
    });
  }

  async function updateBadges(){
    if(!(await waitForDb())) return;
    try{
      const me = await window.fwDb.getCurrentUser();
      if(!me || !me.id){
        addBadge($('[data-fw-open-echo]'), 0);
        addBadge($('[data-fw-open-buddy]'), 0);
        setSmallBadge('[data-fw-echo-count]', 0);
        setSmallBadge('[data-fw-buddy-count]', 0);
        return;
      }

      // 回声只显示非私聊通知；私聊统一归到“搭子”。
      const {count:echoCount} = await window.fwDb.client
        .from('notifications')
        .select('id', {count:'exact', head:true})
        .eq('user_id', me.id)
        .eq('is_read', false)
        .neq('type', 'private_message');

      const {count:privateCount} = await window.fwDb.client
        .from('notifications')
        .select('id', {count:'exact', head:true})
        .eq('user_id', me.id)
        .eq('is_read', false)
        .eq('type', 'private_message');

      const {count:requestCount} = await window.fwDb.client
        .from('friendships')
        .select('id', {count:'exact', head:true})
        .eq('receiver_id', me.id)
        .eq('status', 'pending');

      const buddyCount = (privateCount || 0) + (requestCount || 0);
      addBadge($('[data-fw-open-echo]'), echoCount || 0);
      addBadge($('[data-fw-open-buddy]'), buddyCount);
      setSmallBadge('[data-fw-echo-count]', echoCount || 0);
      setSmallBadge('[data-fw-buddy-count]', buddyCount);
    }catch(e){}
  }

  function scheduleBadgeUpdates(){
    clearInterval(badgeTimer);
    updateBadges();
    badgeTimer = setInterval(updateBadges, 18000);
  }

  function fixLayering(){
    const auth = $('[data-sb-auth].show, .sb-auth.show, .auth-modal.show');
    if(auth) auth.style.zIndex = '10200';

    $$('.fw-wx-modal.show').forEach(m => m.style.zIndex = '10060');
    $$('.fw-wx-panel').forEach(p => p.style.zIndex = '10061');

    $$('.fw-social-modal.show, [data-fw-social-modal].show, [data-fw-private-modal].show').forEach(m => {
      m.style.zIndex = '10120';
      const panel = m.querySelector('.fw-social-panel, .fw-private-window');
      if(panel) panel.style.zIndex = '10121';
    });
  }

  function collapseDuplicateTips(){
    $$('[data-post-form]').forEach(form => {
      const tips = $$('.form-tip').filter(t => form.contains(t));
      const seen = new Set();
      tips.forEach(t => {
        const text = (t.textContent || '').trim();
        if(!text) return;
        if(seen.has(text)){
          t.classList.add('fw-duplicate-tip');
        }else{
          seen.add(text);
          t.classList.remove('fw-duplicate-tip');
        }
      });
    });
  }

  function enhanceCommentBoxes(){
    $$('.post-card').forEach(card => {
      const box = card.querySelector('.comment-box');
      const list = card.querySelector('.comment-list');
      if(!box || !list || box.dataset.fwPolishComments === '1') return;
      box.dataset.fwPolishComments = '1';
      const count = list.querySelectorAll('li').length;
      if(count <= 3) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fw-show-more-comments';
      btn.textContent = '查看更多评论';
      btn.style.cssText = 'margin-top:8px;border:1px solid rgba(28,28,24,.14);border-radius:999px;background:#fffdf7;padding:6px 12px;font-size:12px;font-weight:950;cursor:pointer;';
      btn.addEventListener('click', () => {
        box.classList.toggle('show-all-comments');
        btn.textContent = box.classList.contains('show-all-comments') ? '收起评论' : '查看更多评论';
      });
      list.after(btn);
    });
  }

  function patchPostSubmitButtons(){
    document.addEventListener('submit', e => {
      const form = e.target.closest('[data-post-form]');
      if(!form) return;
      const btn = form.querySelector('button[type="submit"]');
      if(!btn) return;
      const old = btn.dataset.oldText || btn.textContent;
      btn.dataset.oldText = old;
      btn.disabled = true;
      btn.textContent = '发布中...';
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = old;
        collapseDuplicateTips();
        updateBadges();
      }, 1500);
    }, true);
  }

  function closeMenusOnEsc(){
    document.addEventListener('keydown', e => {
      if(e.key !== 'Escape') return;
      $$('.fw-wx-more-wrap.open').forEach(x => x.classList.remove('open'));
      const topModal = $$('.fw-social-modal.show, .fw-wx-modal.show').pop();
      const close = topModal?.querySelector('.fw-social-close, .fw-wx-close, [data-fw-dual-close]');
      if(close) close.click();
    });
  }

  function bindClickRefresh(){
    document.addEventListener('click', e => {
      if(e.target.closest('[data-fw-open-echo], [data-fw-open-buddy], .fw-social-close, .fw-wx-close, [data-fw-dual-close]')){
        setTimeout(() => { updateBadges(); fixLayering(); }, 360);
      }
      if(e.target.closest('[data-action], [data-fw-dual-jump-post], [data-fw-menu-profile], [data-fw-wx-tab], [data-fw-wx-chat-user]')){
        setTimeout(() => { fixLayering(); enhanceCommentBoxes(); }, 160);
      }
    }, true);
  }

  function observeDom(){
    let timer = 0;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fixLayering();
        collapseDuplicateTips();
        enhanceCommentBoxes();
      }, 120);
    });
    observer.observe(document.body, {childList:true, subtree:true});
  }

  function boot(){
    patchPostSubmitButtons();
    closeMenusOnEsc();
    bindClickRefresh();
    observeDom();
    scheduleBadgeUpdates();
    fixLayering();
    collapseDuplicateTips();
    enhanceCommentBoxes();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
