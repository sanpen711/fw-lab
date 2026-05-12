// F.w 研究所：私聊消息归入“搭子”
// 目标：私聊不再进“回声”；搭子中心按最近私聊置顶，并在头像左上角显示未读数。
(function(){
  if(window.__FW_PRIVATE_ROUTING__) return;
  window.__FW_PRIVATE_ROUTING__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  let me = null;
  let routeTimer = 0;
  let enhanceTimer = 0;

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[c]));
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
    clearTimeout(window.__fwPrivateRoutingToast);
    window.__fwPrivateRoutingToast = setTimeout(() => t.classList.remove('show'), 2600);
  }

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

  function needLogin(){
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

  function setSmallBadge(selector, count){
    $$(selector).forEach(el => {
      const n = Number(count || 0);
      el.textContent = n > 99 ? '99+' : String(n);
      el.classList.toggle('show', n > 0);
    });
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

  async function refreshRouteBadges(){
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

      setSmallBadge('[data-fw-echo-count]', echoCount);
      setSmallBadge('[data-fw-buddy-count]', buddyCount);
      setTopBadge($('[data-fw-open-echo]'), echoCount);
      setTopBadge($('[data-fw-open-buddy]'), buddyCount);
    }catch(e){}
  }

  function formatNoticeType(type){
    return ({
      like:'点赞了你的帖子',
      same:'对你说：俺也一样',
      tissue:'给你递了纸巾',
      comment:'评论了你的帖子',
      friend_request:'想加你为搭子',
      friend_accept:'通过了你的搭子申请',
      chat_agree:'赞同了你的房间消息',
      system:'系统通知'
    })[type] || '给你发来一条回声';
  }

  function postUrl(id, comments){
    return `square.html?post=${encodeURIComponent(id)}${comments ? '&comments=1' : ''}`;
  }

  function focusPost(id, comments){
    const safeId = window.CSS && CSS.escape ? CSS.escape(String(id)) : String(id).replace(/"/g,'\\"');
    const card = document.querySelector(`.post-card[data-id="${safeId}"]`);
    if(card){
      card.scrollIntoView({behavior:'smooth', block:'center'});
      card.classList.add('fw-dual-post-focus');
      if(comments) card.querySelector('.comment-box')?.classList.add('show');
      setTimeout(() => card.classList.remove('fw-dual-post-focus'), 3200);
      return true;
    }
    return false;
  }

  function jumpPost(id, comments){
    const path = window.location.pathname.split('/').pop() || 'index.html';
    if(path !== 'square.html'){
      window.location.href = postUrl(id, comments);
      return;
    }
    if(!focusPost(id, comments)){
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if(focusPost(id, comments) || tries > 24) clearInterval(timer);
      }, 250);
    }
  }

  async function openEchoWithoutPrivate(){
    await refreshMe();
    if(!needLogin()) return;

    if(!document.querySelector('[data-fw-social-modal]')){
      // 让原模块先建立基础壳层，再立刻接管内容。
      const temp = document.createElement('button');
      temp.style.display = 'none';
      temp.dataset.fwProfileUser = me.id;
      document.body.appendChild(temp);
      temp.click();
      setTimeout(() => temp.remove(), 120);
    }

    const modal = $('[data-fw-social-modal]');
    const panel = $('[data-fw-social-panel]');
    const title = $('[data-fw-social-title]');
    const kicker = $('[data-fw-social-kicker]');
    const body = $('[data-fw-social-body]');

    if(!modal || !body){
      toast('回声窗口还没准备好，请刷新后重试。');
      return;
    }

    if(panel) panel.classList.remove('wide');
    if(kicker) kicker.textContent = 'ECHO CENTER';
    if(title) title.textContent = '回声';
    body.innerHTML = '<div class="fw-social-empty">正在读取回声...</div>';
    modal.classList.add('show');

    try{
      const {data, error} = await window.fwDb.client
        .from('notifications')
        .select('id,actor_id,type,target_type,target_id,content,is_read,created_at')
        .eq('user_id', me.id)
        .neq('type', 'private_message')
        .order('created_at', {ascending:false})
        .limit(80);

      if(error) throw error;

      const rows = data || [];
      const profiles = await fetchProfiles(rows.map(x => x.actor_id));

      if(!rows.length){
        body.innerHTML = '<div class="fw-social-empty">暂时没有新的回声。私聊消息已经移到“搭子”里了。</div>';
        return;
      }

      body.innerHTML = `
        <div class="fw-social-list">
          ${rows.map(n => {
            const p = profiles[n.actor_id] || {};
            const name = p.nickname || '某位研究员';
            const isPost = (n.target_type === 'post' || ['like','same','tissue','comment'].includes(n.type)) && n.target_id;
            return `
              <article class="fw-social-item ${n.is_read ? '' : 'unread'}" data-fw-route-notice="${n.id}">
                ${avatar(name, p.avatar_url, `data-fw-profile-user="${esc(n.actor_id || '')}"`)}
                <div class="fw-social-item-main">
                  <b>${esc(name)} ${esc(formatNoticeType(n.type))}</b>
                  <span>${esc(n.content || '对你的低功耗发言产生了回应。')}</span>
                </div>
                <div class="fw-social-item-actions">
                  ${isPost ? `<button class="fw-social-mini-btn dark" data-fw-route-post="${esc(n.target_id)}" data-open-comments="${n.type === 'comment' ? '1' : '0'}">查看帖子</button>` : ''}
                  ${n.type === 'friend_request' ? `<button class="fw-social-mini-btn dark" data-fw-route-buddy="incoming">处理申请</button>` : ''}
                  ${n.type === 'friend_accept' ? `<button class="fw-social-mini-btn dark" data-fw-route-buddy="friends">查看搭子</button>` : ''}
                </div>
              </article>
            `;
          }).join('')}
        </div>
      `;

      await window.fwDb.client
        .from('notifications')
        .update({is_read:true})
        .eq('user_id', me.id)
        .eq('is_read', false)
        .neq('type', 'private_message');

      refreshRouteBadges();
    }catch(e){
      body.innerHTML = '<div class="fw-social-empty">回声读取失败。请稍后重试。</div>';
    }
  }

  async function getPrivateRoutingData(){
    if(!(await refreshMe()) || !me?.id) return {byUser:{}, unreadByUser:{}};

    const byUser = {};
    const unreadByUser = {};

    try{
      const conv = await window.fwDb.client
        .from('conversations')
        .select('id,user_one_id,user_two_id,updated_at')
        .or(`user_one_id.eq.${me.id},user_two_id.eq.${me.id}`)
        .order('updated_at', {ascending:false});

      const conversations = conv.data || [];
      const convIds = conversations.map(c => c.id);
      const convOther = {};
      conversations.forEach(c => {
        convOther[c.id] = c.user_one_id === me.id ? c.user_two_id : c.user_one_id;
        const other = convOther[c.id];
        if(other){
          byUser[other] = byUser[other] || {latestTime:c.updated_at || '', latestText:'点击进入私聊', unread:0};
        }
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
          const other = convOther[m.conversation_id];
          if(!other) return;
          const current = byUser[other] || {};
          if(!current.latestMessageId){
            byUser[other] = {
              ...current,
              latestMessageId:m.id,
              latestTime:m.created_at,
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
        unreadByUser[n.actor_id] = (unreadByUser[n.actor_id] || 0) + 1;
        const current = byUser[n.actor_id] || {};
        const currentTime = current.latestTime ? new Date(current.latestTime).getTime() : 0;
        const noticeTime = n.created_at ? new Date(n.created_at).getTime() : 0;
        if(noticeTime >= currentTime){
          byUser[n.actor_id] = {
            ...current,
            latestTime:n.created_at,
            latestText:n.content || current.latestText || '给你发来一条私聊'
          };
        }
      });

      Object.keys(unreadByUser).forEach(id => {
        byUser[id] = byUser[id] || {latestTime:'', latestText:'给你发来一条私聊'};
        byUser[id].unread = unreadByUser[id];
      });
    }catch(e){}

    return {byUser, unreadByUser};
  }

  function formatPreview(txt){
    const s = String(txt || '点击进入私聊').replace(/\s+/g, ' ').trim();
    return s.length > 30 ? s.slice(0, 30) + '…' : s;
  }

  async function enhanceBuddyList(){
    const list = $('[data-fw-wx-list]');
    if(!list || !$('.fw-wx-modal.show')) return;
    const items = $$('.fw-wx-item[data-fw-wx-chat-user]').filter(item => list.contains(item));
    if(!items.length) return;

    const {byUser} = await getPrivateRoutingData();

    items.forEach((item, idx) => {
      const userId = item.dataset.fwWxChatUser;
      const info = byUser[userId] || {};
      const unread = Number(info.unread || 0);

      item.dataset.fwLatestTime = info.latestTime || '';
      item.dataset.fwOriginalIndex = item.dataset.fwOriginalIndex || String(idx);
      item.classList.toggle('fw-wx-unread', unread > 0);

      const avatarEl = item.querySelector('.fw-wx-avatar');
      if(avatarEl){
        avatarEl.classList.add('fw-wx-avatar-wrap');
        let badge = avatarEl.querySelector('.fw-wx-unread-badge');
        if(!badge){
          badge = document.createElement('span');
          badge.className = 'fw-wx-unread-badge';
          avatarEl.appendChild(badge);
        }
        if(unread > 0){
          badge.textContent = unread > 99 ? '99+' : String(unread);
          badge.style.display = 'grid';
        }else{
          badge.textContent = '';
          badge.style.display = 'none';
        }
      }

      const sub = item.querySelector('.fw-wx-sub');
      if(sub && info.latestText){
        const old = sub.textContent || '';
        const prefix = old.split(' · ')[0] || '实验品编号：未设置';
        sub.textContent = `${prefix} · ${formatPreview(info.latestText)}`;
      }
    });

    items.sort((a,b) => {
      const ua = a.classList.contains('fw-wx-unread') ? 1 : 0;
      const ub = b.classList.contains('fw-wx-unread') ? 1 : 0;
      if(ua !== ub) return ub - ua;
      const ta = a.dataset.fwLatestTime ? new Date(a.dataset.fwLatestTime).getTime() : 0;
      const tb = b.dataset.fwLatestTime ? new Date(b.dataset.fwLatestTime).getTime() : 0;
      if(ta !== tb) return tb - ta;
      return Number(a.dataset.fwOriginalIndex || 0) - Number(b.dataset.fwOriginalIndex || 0);
    }).forEach(item => list.appendChild(item));
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
      setTimeout(() => {
        refreshRouteBadges();
        enhanceBuddyList();
      }, 300);
    }catch(e){}
  }

  function injectStyle(){
    if($('#fw-private-routing-style')) return;
    const style = document.createElement('style');
    style.id = 'fw-private-routing-style';
    style.textContent = `
      .fw-wx-avatar-wrap{position:relative;overflow:visible!important;}
      .fw-wx-unread-badge{
        position:absolute;
        left:-6px;
        top:-7px;
        min-width:18px;
        height:18px;
        padding:0 5px;
        border-radius:999px;
        background:#df7676;
        color:#fff;
        border:2px solid #f3efe6;
        display:none;
        place-items:center;
        font-size:10px;
        line-height:14px;
        font-weight:1000;
        box-shadow:0 4px 12px rgba(0,0,0,.2);
        z-index:5;
      }
      .fw-wx-item.fw-wx-unread .fw-wx-name{font-weight:1000;color:#171715;}
      .fw-wx-item.fw-wx-unread .fw-wx-sub{color:#9d4a4a;font-weight:1000;}
      .fw-wx-item.fw-wx-unread{background:rgba(255,253,247,.72);border-color:rgba(217,121,121,.3);}
    `;
    document.head.appendChild(style);
  }

  function scheduleEnhance(delay){
    clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(() => {
      refreshRouteBadges();
      enhanceBuddyList();
    }, delay || 120);
  }

  function bind(){
    document.addEventListener('click', e => {
      const echo = e.target.closest('[data-fw-open-echo]');
      if(echo){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        openEchoWithoutPrivate();
        return;
      }

      const postBtn = e.target.closest('[data-fw-route-post]');
      if(postBtn){
        e.preventDefault();
        e.stopPropagation();
        jumpPost(postBtn.dataset.fwRoutePost, postBtn.dataset.openComments === '1');
        return;
      }

      const buddyBtn = e.target.closest('[data-fw-route-buddy]');
      if(buddyBtn){
        e.preventDefault();
        e.stopPropagation();
        const b = document.querySelector('[data-fw-open-buddy]');
        if(b) b.click();
        setTimeout(() => {
          const tab = document.querySelector(`[data-fw-wx-tab="${buddyBtn.dataset.fwRouteBuddy || 'friends'}"]`);
          if(tab) tab.click();
        }, 350);
        return;
      }

      const chatItem = e.target.closest('[data-fw-wx-chat-user], [data-fw-wx-chat-direct], [data-fw-start-chat]');
      if(chatItem){
        const id = chatItem.dataset.fwWxChatUser || chatItem.dataset.fwWxChatDirect || chatItem.dataset.fwStartChat || '';
        if(id) markPrivateReadFrom(id);
      }

      if(e.target.closest('[data-fw-open-buddy], [data-fw-wx-tab], [data-fw-wx-close], [data-fw-wx-reset]')){
        scheduleEnhance(500);
      }
    }, true);

    document.addEventListener('submit', e => {
      if(e.target.closest('[data-fw-wx-compose]')){
        scheduleEnhance(900);
      }
    }, true);

    const observer = new MutationObserver(() => scheduleEnhance(180));
    observer.observe(document.body, {childList:true, subtree:true});
  }

  function boot(){
    injectStyle();
    bind();
    refreshRouteBadges();
    setInterval(refreshRouteBadges, 12000);
    setInterval(enhanceBuddyList, 9000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
