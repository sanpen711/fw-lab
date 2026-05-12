// F.w 研究所：私聊归入搭子（稳定轻量版）
// 目标：私聊不再进回声；搭子按最近私聊置顶；头像左上角显示未读数；避免 DOM 反复重排造成卡顿。
(function(){
  if(window.__FW_PRIVATE_ROUTING_LITE__) return;
  window.__FW_PRIVATE_ROUTING_LITE__ = true;
  // 阻止旧版 fw-private-routing.js 再启动。
  window.__FW_PRIVATE_ROUTING__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  let me = null;
  let badgeTimer = 0;
  let buddyTimer = 0;
  let enhancing = false;

  function waitForDb(){
    return new Promise(resolve => {
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      let count = 0;
      const timer = setInterval(() => {
        count += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(timer); resolve(true); }
        if(count > 100){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  async function refreshMe(){
    try{
      if(!(await waitForDb())) return null;
      me = await window.fwDb.getCurrentUser();
      return me;
    }catch(e){
      me = null;
      return null;
    }
  }

  function setTopBadge(btn, count){
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
    if(!(await refreshMe()) || !me?.id) return;
    try{
      const echo = await window.fwDb.client
        .from('notifications')
        .select('id', {count:'exact', head:true})
        .eq('user_id', me.id)
        .eq('is_read', false)
        .neq('type', 'private_message');

      const privateMsgs = await window.fwDb.client
        .from('notifications')
        .select('id', {count:'exact', head:true})
        .eq('user_id', me.id)
        .eq('is_read', false)
        .eq('type', 'private_message');

      const requests = await window.fwDb.client
        .from('friendships')
        .select('id', {count:'exact', head:true})
        .eq('receiver_id', me.id)
        .eq('status', 'pending');

      const echoCount = echo.count || 0;
      const buddyCount = (privateMsgs.count || 0) + (requests.count || 0);
      setTopBadge($('[data-fw-open-echo]'), echoCount);
      setTopBadge($('[data-fw-open-buddy]'), buddyCount);
      setSmallBadge('[data-fw-echo-count]', echoCount);
      setSmallBadge('[data-fw-buddy-count]', buddyCount);
    }catch(e){}
  }

  async function getPrivateMeta(){
    const meta = {};
    if(!(await refreshMe()) || !me?.id) return meta;

    try{
      const conv = await window.fwDb.client
        .from('conversations')
        .select('id,user_one_id,user_two_id,updated_at')
        .or(`user_one_id.eq.${me.id},user_two_id.eq.${me.id}`)
        .order('updated_at', {ascending:false})
        .limit(120);

      const conversations = conv.data || [];
      const convIds = conversations.map(c => c.id);
      const otherByConv = {};
      conversations.forEach(c => {
        const other = c.user_one_id === me.id ? c.user_two_id : c.user_one_id;
        if(!other) return;
        otherByConv[c.id] = other;
        meta[other] = meta[other] || {latestTime:c.updated_at || '', latestText:'点击进入私聊', unread:0};
      });

      if(convIds.length){
        const msgs = await window.fwDb.client
          .from('private_messages')
          .select('id,conversation_id,sender_id,content,is_deleted,created_at')
          .in('conversation_id', convIds)
          .eq('is_deleted', false)
          .order('created_at', {ascending:false})
          .limit(300);

        (msgs.data || []).forEach(m => {
          const other = otherByConv[m.conversation_id];
          if(!other) return;
          const cur = meta[other] || {unread:0};
          if(!cur.latestMessageId){
            meta[other] = {
              ...cur,
              latestMessageId:m.id,
              latestTime:m.created_at || cur.latestTime || '',
              latestText:(m.sender_id === me.id ? '你：' : '') + (m.content || '')
            };
          }
        });
      }

      const unread = await window.fwDb.client
        .from('notifications')
        .select('id,actor_id,content,created_at')
        .eq('user_id', me.id)
        .eq('is_read', false)
        .eq('type', 'private_message')
        .order('created_at', {ascending:false});

      (unread.data || []).forEach(n => {
        if(!n.actor_id) return;
        const cur = meta[n.actor_id] || {latestTime:'', latestText:'给你发来一条私聊', unread:0};
        cur.unread = Number(cur.unread || 0) + 1;
        const oldTime = cur.latestTime ? new Date(cur.latestTime).getTime() : 0;
        const newTime = n.created_at ? new Date(n.created_at).getTime() : 0;
        if(newTime >= oldTime){
          cur.latestTime = n.created_at || cur.latestTime;
          cur.latestText = n.content || cur.latestText || '给你发来一条私聊';
        }
        meta[n.actor_id] = cur;
      });
    }catch(e){}

    return meta;
  }

  function shortText(txt){
    const s = String(txt || '点击进入私聊').replace(/\s+/g, ' ').trim();
    return s.length > 28 ? s.slice(0, 28) + '…' : s;
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
      if(seen.has(id)){
        row.remove();
        return;
      }
      seen.add(id);
      unique.push(row);
    });
    return unique;
  }

  async function enhanceBuddyList(){
    if(enhancing) return;
    const modal = $('[data-fw-wx-buddy-modal].show, .fw-wx-modal.show');
    const list = $('[data-fw-wx-list]');
    if(!modal || !list) return;

    enhancing = true;
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

        const avatar = row.querySelector('.fw-wx-avatar');
        if(avatar){
          avatar.classList.add('fw-wx-avatar-wrap');
          let badge = avatar.querySelector('.fw-wx-unread-badge');
          if(!badge){
            badge = document.createElement('span');
            badge.className = 'fw-wx-unread-badge';
            avatar.appendChild(badge);
          }
          const unread = Number(info.unread || 0);
          const next = unread > 99 ? '99+' : String(unread || '');
          if(badge.textContent !== next) badge.textContent = next;
          badge.style.display = unread > 0 ? 'grid' : 'none';
        }

        const sub = row.querySelector('.fw-wx-sub');
        if(sub && info.latestText){
          const oldText = sub.textContent || '';
          const prefix = oldText.split(' · ')[0] || '实验品编号：未设置';
          const next = `${prefix} · ${shortText(info.latestText)}`;
          if(sub.textContent !== next) sub.textContent = next;
        }
      });

      const sorted = rows.slice().sort((a,b) => {
        const ua = Number(a.dataset.fwUnread || 0);
        const ub = Number(b.dataset.fwUnread || 0);
        if(ua !== ub) return ub - ua;
        const ta = a.dataset.fwLatestTime ? new Date(a.dataset.fwLatestTime).getTime() : 0;
        const tb = b.dataset.fwLatestTime ? new Date(b.dataset.fwLatestTime).getTime() : 0;
        if(ta !== tb) return tb - ta;
        return Number(a.dataset.fwOriginalIndex || 0) - Number(b.dataset.fwOriginalIndex || 0);
      });

      const current = rows.map(x => x.dataset.fwWxChatUser).join('|');
      const next = sorted.map(x => x.dataset.fwWxChatUser).join('|');
      if(current !== next){
        const frag = document.createDocumentFragment();
        sorted.forEach(row => frag.appendChild(row));
        list.appendChild(frag);
      }
    }finally{
      enhancing = false;
    }
  }

  async function markPrivateReadFrom(userId){
    if(!userId || !(await refreshMe()) || !me?.id) return;
    try{
      await window.fwDb.client
        .from('notifications')
        .update({is_read:true})
        .eq('user_id', me.id)
        .eq('is_read', false)
        .eq('type', 'private_message')
        .eq('actor_id', userId);
      setTimeout(() => { updateBadges(); enhanceBuddyList(); }, 300);
    }catch(e){}
  }

  function injectStyle(){
    if($('#fw-private-routing-lite-style')) return;
    const style = document.createElement('style');
    style.id = 'fw-private-routing-lite-style';
    style.textContent = `
      .fw-wx-avatar-wrap{position:relative;overflow:visible!important;}
      .fw-wx-unread-badge{
        position:absolute;left:-6px;top:-7px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;
        background:#df7676;color:#fff;border:2px solid #f3efe6;display:none;place-items:center;
        font-size:10px;line-height:14px;font-weight:1000;box-shadow:0 4px 12px rgba(0,0,0,.2);z-index:5;
      }
      .fw-wx-item.fw-wx-unread .fw-wx-name{font-weight:1000;color:#171715;}
      .fw-wx-item.fw-wx-unread .fw-wx-sub{color:#9d4a4a;font-weight:1000;}
      .fw-wx-item.fw-wx-unread{background:rgba(255,253,247,.78);border-color:rgba(217,121,121,.32);}
    `;
    document.head.appendChild(style);
  }

  function bind(){
    document.addEventListener('click', e => {
      const echoBtn = e.target.closest('[data-fw-open-echo]');
      if(echoBtn){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        setTimeout(() => {
          if(typeof window.fwOpenStableEcho === 'function') window.fwOpenStableEcho();
          else echoBtn.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, cancelable:true}));
        }, 60);
        return;
      }

      const chatItem = e.target.closest('[data-fw-wx-chat-user], [data-fw-wx-chat-direct], [data-fw-start-chat]');
      if(chatItem){
        const id = chatItem.dataset.fwWxChatUser || chatItem.dataset.fwWxChatDirect || chatItem.dataset.fwStartChat || '';
        if(id) markPrivateReadFrom(id);
      }

      if(e.target.closest('[data-fw-open-buddy], [data-fw-wx-tab], [data-fw-wx-chat-user], [data-fw-wx-chat-direct], [data-fw-wx-reset]')){
        setTimeout(enhanceBuddyList, 450);
        setTimeout(enhanceBuddyList, 1200);
      }
    }, true);

    document.addEventListener('submit', e => {
      if(e.target.closest('[data-fw-wx-compose], [data-fw-wx-search]')){
        setTimeout(() => { updateBadges(); enhanceBuddyList(); }, 900);
      }
    }, true);

    document.addEventListener('visibilitychange', () => {
      if(!document.hidden){ updateBadges(); enhanceBuddyList(); }
    });
  }

  function boot(){
    injectStyle();
    bind();
    updateBadges();
    enhanceBuddyList();
    clearInterval(badgeTimer);
    clearInterval(buddyTimer);
    badgeTimer = setInterval(updateBadges, 15000);
    buddyTimer = setInterval(enhanceBuddyList, 10000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
