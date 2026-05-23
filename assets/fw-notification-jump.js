// F.w 研究所：通知中心跳转增强
// 作用：让“回声”里的通知可以跳到对应私聊、搭子处理或帖子位置。
(function(){
  if(window.__FW_NOTIFICATION_JUMP_ENHANCE__) return;
  window.__FW_NOTIFICATION_JUMP_ENHANCE__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  let noticeCache = [];
  let cacheTime = 0;
  let hydrating = false;

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[c]));
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
    clearTimeout(window.__fwNoticeJumpToast);
    window.__fwNoticeJumpToast = setTimeout(() => t.classList.remove('show'), 3000);
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

  async function getMe(){
    try{
      if(!window.fwDb || !window.fwDb.enabled) return null;
      return await window.fwDb.getCurrentUser();
    }catch(e){
      return null;
    }
  }

  async function fetchNotices(force){
    if(!force && noticeCache.length && Date.now() - cacheTime < 6000) return noticeCache;
    const ok = await waitForDb();
    if(!ok) return [];
    const me = await getMe();
    if(!me || !me.id) return [];

    const {data, error} = await window.fwDb.client
      .from('notifications')
      .select('id,actor_id,type,target_type,target_id,content,is_read,created_at')
      .eq('user_id', me.id)
      .order('created_at', {ascending:false})
      .limit(80);

    if(error) throw error;
    noticeCache = data || [];
    cacheTime = Date.now();
    return noticeCache;
  }

  function isEchoOpen(){
    const modal = $('[data-fw-social-modal].show');
    if(!modal) return false;
    const kicker = $('[data-fw-social-kicker]');
    const title = $('[data-fw-social-title]');
    return (kicker && /ECHO/i.test(kicker.textContent || '')) || (title && /回声/.test(title.textContent || ''));
  }

  async function hydrateEchoItems(force){
    if(hydrating) return;
    if(!isEchoOpen()) return;
    const list = $('[data-fw-social-body] .fw-social-list');
    if(!list) return;

    hydrating = true;
    try{
      const notices = await fetchNotices(force);
      const items = $$('[data-fw-social-body] .fw-social-item');
      items.forEach((item, index) => {
        const n = notices[index];
        if(!n) return;
        item.dataset.fwNoticeId = String(n.id || '');
        item.dataset.fwNoticeType = String(n.type || '');
        item.dataset.fwNoticeTargetType = String(n.target_type || '');
        item.dataset.fwNoticeTargetId = String(n.target_id || '');
        item.dataset.fwNoticeActorId = String(n.actor_id || '');
        item.classList.add('fw-notice-jumpable');

        if(!item.querySelector('[data-fw-notification-jump]')){
          const actions = item.querySelector('.fw-social-item-actions') || item;
          const btn = document.createElement('button');
          btn.className = 'fw-social-mini-btn';
          btn.type = 'button';
          btn.dataset.fwNotificationJump = String(n.id || '');
          btn.textContent = jumpLabel(n);
          actions.appendChild(btn);
        }
      });
    }catch(e){
      console.warn('[FW notice jump] hydrate failed', e);
    }finally{
      hydrating = false;
    }
  }

  function jumpLabel(n){
    if(n.type === 'private_message') return '打开私聊';
    if(n.type === 'friend_request') return '处理申请';
    if(n.type === 'friend_accept') return '查看搭子';
    if(n.target_type === 'post' || ['like','same','tissue','comment'].includes(n.type)) return '查看帖子';
    return '查看';
  }

  function clickTempButton(attr, value){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.display = 'none';
    btn.setAttribute(attr, value);
    document.body.appendChild(btn);
    btn.click();
    setTimeout(() => btn.remove(), 200);
  }

  function openBuddy(tab){
    const btn = $('[data-fw-open-buddy]');
    if(btn) btn.click();
    if(tab){
      setTimeout(() => {
        const tabBtn = $(`[data-fw-buddy-tab="${tab}"]`);
        if(tabBtn) tabBtn.click();
      }, 450);
    }
  }

  function findPostCard(postId){
    if(!postId) return null;
    return document.querySelector(`.post-card[data-id="${CSS.escape(String(postId))}"]`);
  }

  function scrollToPost(postId, openComments){
    const card = findPostCard(postId);
    if(!card) return false;
    card.classList.add('fw-target-post');
    card.scrollIntoView({behavior:'smooth', block:'center'});
    if(openComments){
      const comment = card.querySelector('.comment-box');
      if(comment) comment.classList.add('show');
    }
    setTimeout(() => card.classList.remove('fw-target-post'), 3600);
    return true;
  }

  function goToPost(postId, openComments){
    if(!postId){
      window.location.href = 'square.html';
      return;
    }
    if(scrollToPost(postId, openComments)) return;
    const url = `square.html?post=${encodeURIComponent(postId)}${openComments ? '&comments=1' : ''}`;
    window.location.href = url;
  }

  function jumpNotice(n){
    if(!n) return;

    if(n.type === 'private_message'){
      if(n.actor_id){
        clickTempButton('data-fw-start-chat', n.actor_id);
      }else{
        openBuddy('friends');
      }
      return;
    }

    if(n.type === 'friend_request'){
      openBuddy('incoming');
      return;
    }

    if(n.type === 'friend_accept'){
      openBuddy('friends');
      return;
    }

    if(n.type === 'chat_agree'){
      window.location.href = 'rooms.html';
      return;
    }

    if(n.target_type === 'post' || ['like','same','tissue','comment'].includes(n.type)){
      goToPost(n.target_id, n.type === 'comment');
      return;
    }

    if(n.actor_id){
      clickTempButton('data-fw-profile-user', n.actor_id);
      return;
    }

    toast('这条回声暂时没有可跳转的位置。');
  }

  async function handleNoticeClick(e){
    const btn = e.target.closest('[data-fw-notification-jump]');
    const item = e.target.closest('.fw-social-item[data-fw-notice-id]');
    if(!btn && !item) return;
    if(item && !btn && e.target.closest('button,[data-fw-profile-user],a,input,textarea')) return;
    e.preventDefault();
    e.stopPropagation();

    const id = btn?.dataset.fwNotificationJump || item?.dataset.fwNoticeId;
    let notices = noticeCache;
    if(!notices.length) notices = await fetchNotices(false);
    let n = notices.find(x => String(x.id) === String(id));

    if(!n && item){
      n = {
        id: item.dataset.fwNoticeId,
        type: item.dataset.fwNoticeType,
        target_type: item.dataset.fwNoticeTargetType,
        target_id: item.dataset.fwNoticeTargetId,
        actor_id: item.dataset.fwNoticeActorId
      };
    }

    jumpNotice(n);
  }

  function hydrateOnEchoOpen(){
    setTimeout(() => hydrateEchoItems(true), 450);
    setTimeout(() => hydrateEchoItems(false), 1000);
  }

  function installStyle(){
    if($('#fw-notification-jump-style')) return;
    const style = document.createElement('style');
    style.id = 'fw-notification-jump-style';
    style.textContent = `
      .fw-notice-jumpable{cursor:pointer;}
      .fw-notice-jumpable:hover{outline:1px solid rgba(217,121,121,.38);outline-offset:-1px;}
      .fw-target-post{animation:fwTargetPulse 2.6s ease both;}
      @keyframes fwTargetPulse{0%{box-shadow:0 0 0 0 rgba(217,121,121,.75);transform:translateY(-2px)}35%{box-shadow:0 0 0 8px rgba(217,121,121,.18)}100%{box-shadow:0 0 0 0 rgba(217,121,121,0);transform:none}}
    `;
    document.head.appendChild(style);
  }

  function handlePostQuery(){
    const params = new URLSearchParams(window.location.search);
    const postId = params.get('post');
    if(!postId) return;
    const openComments = params.get('comments') === '1';
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if(scrollToPost(postId, openComments) || tries > 40){
        clearInterval(timer);
      }
    }, 250);
  }

  function touchesEchoList(mutations){
    return mutations.some(m => Array.from(m.addedNodes || []).some(node => {
      if(!node || node.nodeType !== 1) return false;
      if(node.matches && node.matches('[data-fw-social-body],.fw-social-list,.fw-social-item')) return true;
      return !!(node.querySelector && node.querySelector('[data-fw-social-body],.fw-social-list,.fw-social-item'));
    }));
  }

  function boot(){
    installStyle();
    handlePostQuery();

    document.addEventListener('click', e => {
      if(e.target.closest('[data-fw-open-echo]')) hydrateOnEchoOpen();
      handleNoticeClick(e);
    }, true);

    const observer = new MutationObserver(mutations => {
      if(isEchoOpen() && touchesEchoList(mutations)) hydrateEchoItems(false);
    });
    observer.observe(document.body, {childList:true, subtree:true});
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }else{
    boot();
  }
})();
