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
    if(!unique.length) return {};
    const {data, error} = await window.fwDb.client
      .from('profiles')
      .select('id,nickname,avatar_url,lab_code')
      .in('id', unique);
    if(error) return {};
    const map = {};
    (data || []).forEach(p => { map[p.id] = p; });
    return map;
  }

  function setBadge(selector, count){
    $$(selector).forEach(el => {
      const n = Number(count || 0);
      el.textContent = n > 99 ? '99+' : String(n);
      el.classList.toggle('show', n > 0);
    });
  }

  async function refreshBadges(){
    if(!me || !window.fwDb || !window.fwDb.client) return;
    try{
      const n = await window.fwDb.client
        .from('notifications')
        .select('id,type', {count:'exact', head:true})
        .eq('user_id', me.id)
        .eq('is_read', false)
        .in('type', ECHO_TYPES);

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
    }catch(e){}
  }

  function formatNoticeType(type){
    return ({
      like:'点赞了你的帖子',
      same:'对你说：俺也一样',
      tissue:'给你递了纸巾',
      comment:'评论了你的帖子',
      comment_reply:'回复了你的评论',
      friend_request:'想加你为搭子',
      friend_accept:'通过了你的搭子申请',
      private_message:'给你发来一条私聊',
      chat_agree:'赞同了你的房间消息',
      system:'系统通知'
    })[type] || '给你发来一条回声';
  }

  function noticePreview(value){
    return String(value || '对你的低功耗发言产生了回应。')
      .replace(/\[\[FW_USER_STICKER:[A-Za-z0-9+/=]+\]\]/g, '动画表情')
      .replace(/\[\[FW_MEDIA_IMAGE:[A-Za-z0-9+/=]+\]\]/g, '图片')
      .replace(/\[\[FW_MEDIA_VIDEO:[A-Za-z0-9+/=]+\]\]/g, '视频')
      .replace(/\s+/g, ' ')
      .trim() || '对你的低功耗发言产生了回应。';
  }

  function timeText(value){
    if(!value) return '刚刚';
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return '刚刚';
    const minutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60000);
    if(minutes < 1) return '刚刚';
    if(minutes < 60) return minutes + '分钟前';
    const hours = Math.floor(minutes / 60);
    if(hours < 24) return hours + '小时前';
    const days = Math.floor(hours / 24);
    return days < 7 ? days + '天前' : date.toLocaleDateString('zh-CN');
  }

  function isEchoType(type){
    return ECHO_TYPES.includes(String(type || ''));
  }

  function isPostNotice(n){
    if(!n) return false;
    if(n.type === 'comment_reply') return !!n.__post_id;
    return !!(n.target_id && (n.target_type === 'post' || ['like','same','tissue','comment'].includes(n.type)));
  }

  function postTargetId(n){
    return String((n && (n.__post_id || n.target_id)) || '');
  }

  async function resolveReplyPostIds(rows){
    const commentIds = Array.from(new Set((rows || [])
      .filter(row => row && row.type === 'comment_reply' && row.target_id)
      .map(row => row.target_id)));

    if(!commentIds.length) return rows || [];

    try{
      const {data, error} = await window.fwDb.client
        .from('comments')
        .select('id,post_id')
        .in('id', commentIds);
      if(error) throw error;
      const map = {};
      (data || []).forEach(row => { if(row.id && row.post_id) map[row.id] = row.post_id; });
      (rows || []).forEach(row => {
        if(row.type === 'comment_reply' && row.target_id && map[row.target_id]) row.__post_id = map[row.target_id];
      });
    }catch(e){}

    return rows || [];
  }

  async function markEchoRead(ids){
    ids = Array.from(new Set((ids || []).map(id => String(id || '').trim()).filter(Boolean)));
    if(!ids.length) return;
    ids.forEach(id => {
      const item = document.querySelector(`[data-fw-echo-item="${CSS && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '')}"]`);
      if(item) item.classList.remove('unread');
    });
    try{
      await window.fwDb.client.from('notifications').update({is_read:true}).in('id', ids);
      refreshBadges();
    }catch(e){ refreshBadges(); }
  }

  async function openEcho(){
    await refreshMe();
    if(!needLogin()) return;
    ensureShell();

    const modal = $('[data-fw-social-modal]');
    const panel = $('[data-fw-social-panel]');
    const body = $('[data-fw-social-body]');

    panel.classList.remove('wide');
    $('[data-fw-social-kicker]').textContent = 'ECHO CENTER';
    $('[data-fw-social-title]').textContent = '回声通知';
    body.innerHTML = '<div class="fw-social-empty">正在读取回声...</div>';
    modal.classList.add('show');

    try{
      let {data, error} = await window.fwDb.client
        .from('notifications')
        .select('id,actor_id,type,target_type,target_id,content,is_read,created_at')
        .eq('user_id', me.id)
        .in('type', ECHO_TYPES)
        .order('created_at', {ascending:false})
        .limit(100);

      if(error) throw error;
      data = (data || []).filter(n => isEchoType(n.type));
      data = await resolveReplyPostIds(data);
      const unreadIds = data.filter(n => !n.is_read).map(n => n.id);
      const profiles = await fetchProfiles(data.map(n => n.actor_id));

      const toolbar = `
        <div class="fw-echo-toolbar">
          <div><b>回声通知</b><small>${unreadIds.length ? `还有 ${unreadIds.length} 条未读` : '没有未读回声'}</small></div>
          <div class="fw-echo-actions">
            ${unreadIds.length ? '<button class="fw-echo-mark-all" type="button" data-fw-echo-mark-all>全部已读</button>' : ''}
            <button class="fw-echo-refresh" type="button" data-fw-echo-refresh>刷新</button>
          </div>
        </div>
      `;

      if(!data.length){
        body.innerHTML = toolbar + '<div class="fw-social-empty">暂时没有新的回声。安静也是一种运行状态。</div>';
        setBadge('[data-fw-echo-count]', 0);
        return;
      }

      body.innerHTML = toolbar + `
        <div class="fw-social-list">
          ${data.map(n => {
            const p = profiles[n.actor_id] || {};
            const name = p.nickname || '某位研究员';
            const targetPost = postTargetId(n);
            const actions = [];
            if(isPostNotice(n)){
              actions.push(`<button class="fw-social-mini-btn dark" type="button" data-fw-stable-post="${esc(targetPost)}" data-fw-echo-notice="${esc(n.id)}">查看帖子</button>`);
            }
            if(n.type === 'chat_agree'){
              actions.push(`<button class="fw-social-mini-btn dark" type="button" data-fw-echo-rooms data-fw-echo-notice="${esc(n.id)}">去学术研讨</button>`);
            }
            if(n.type === 'private_message' && n.actor_id){
              actions.push(`<button class="fw-social-mini-btn dark" type="button" data-fw-start-chat="${esc(n.actor_id)}" data-fw-echo-notice="${esc(n.id)}">私聊</button>`);
            }
            if(n.type === 'friend_request'){
              actions.push(`<button class="fw-social-mini-btn dark" type="button" data-fw-open-buddy data-fw-echo-notice="${esc(n.id)}">处理申请</button>`);
            }
            if(n.actor_id){
              actions.push(`<button class="fw-social-mini-btn" type="button" data-fw-profile-user="${esc(n.actor_id)}">资料</button>`);
            }

            return `
              <article class="fw-social-item fw-echo-item ${n.is_read ? '' : 'unread'}" data-fw-echo-item="${esc(n.id)}">
                ${avatar(name, p.avatar_url, `data-fw-profile-user="${esc(n.actor_id || '')}"`)}
                <div class="fw-social-item-main">
                  <b>${esc(name)} ${esc(formatNoticeType(n.type))}</b>
                  <span>${esc(noticePreview(n.content))}</span>
                  <small>${esc(timeText(n.created_at))}</small>
                </div>
                <div class="fw-social-item-actions">${actions.join('')}</div>
              </article>
            `;
          }).join('')}
        </div>
      `;

      setBadge('[data-fw-echo-count]', unreadIds.length);
    }catch(err){
      body.innerHTML = '<div class="fw-social-empty">回声读取失败，请刷新后重试。</div>';
    }
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
    const profiles = await fetchProfiles(ids);
    return {rows:data || [], profiles};
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
    const statusText = accepted ? '已成为摸鱼搭子' : incoming ? '想加你为搭子' : outgoing ? '等待对方低功耗处理' : blocked ? '已拉黑' : '已拒绝 / 已失效';
    let actions = '';
    if(incoming){
      actions = `<button class="fw-social-mini-btn dark" data-fw-accept="${f.id}">同意</button><button class="fw-social-mini-btn danger" data-fw-reject="${f.id}">拒绝</button>`;
    }else if(accepted){
      actions = `<button class="fw-social-mini-btn dark" data-fw-start-chat="${esc(oid)}">私聊</button><button class="fw-social-mini-btn danger" data-fw-remove-friend="${f.id}">解除</button>`;
    }else if(outgoing){
      actions = `<button class="fw-social-mini-btn danger" data-fw-remove-friend="${f.id}">撤回</button>`;
    }
    return `<article class="fw-social-item">${avatar(name, p.avatar_url, `data-fw-profile-user="${esc(oid)}"`)}<div class="fw-social-item-main"><b>${esc(name)}</b><span>${esc(code)} · ${esc(statusText)}</span></div><div class="fw-social-item-actions">${actions}</div></article>`;
  }

  async function openBuddy(tab = 'friends'){
    await refreshMe();
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
      const accepted = rows.filter(f => f.status === 'accepted');
      const incoming = rows.filter(f => f.status === 'pending' && f.receiver_id === me.id);
      const outgoing = rows.filter(f => f.status === 'pending' && f.requester_id === me.id);
      let list = accepted;
      if(activeTab === 'incoming') list = incoming;
      if(activeTab === 'outgoing') list = outgoing;
      const empty = activeTab === 'friends' ? '暂时还没有搭子。可以点击别人头像，加为摸鱼搭子。' : activeTab === 'incoming' ? '暂无新的搭子申请。' : '暂无发出的申请。';
      const searchBox = `<form class="fw-social-search" data-fw-user-search><input name="q" autocomplete="off" placeholder="搜索实验品编号 / 昵称 / 完整邮箱" /><button type="submit">搜索搭子</button><p>邮箱只支持完整邮箱精确搜索；搜索结果不会显示邮箱。</p></form><div class="fw-search-results" data-fw-search-results></div>`;
      const tabs = `<div class="fw-social-tabs"><button class="fw-social-tab ${activeTab === 'friends' ? 'active' : ''}" data-fw-buddy-tab="friends">我的搭子</button><button class="fw-social-tab ${activeTab === 'incoming' ? 'active' : ''}" data-fw-buddy-tab="incoming">收到申请 ${incoming.length ? `(${incoming.length})` : ''}</button><button class="fw-social-tab ${activeTab === 'outgoing' ? 'active' : ''}" data-fw-buddy-tab="outgoing">发出申请</button></div>`;
      $('[data-fw-social-body]').innerHTML = `${searchBox}${tabs}<div class="fw-social-list">${list.length ? list.map(f => friendItem(f, profiles)).join('') : `<div class="fw-social-empty">${empty}</div>`}</div>`;
      refreshBadges();
    }catch(err){
      $('[data-fw-social-body]').innerHTML = '<div class="fw-social-empty">搭子读取失败，请刷新后重试。</div>';
    }
  }

  async function searchResearchers(keyword){
    const q = String(keyword || '').trim();
    if(q.length < 2){
      toast('至少输入 2 个字符；邮箱需要输入完整邮箱。');
      return [];
    }
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
        if(f && f.status === 'accepted'){
          action = `<button class="fw-social-mini-btn dark" data-fw-start-chat="${esc(p.id)}">私聊</button>`;
          relation = '已是搭子';
        }else if(f && f.status === 'pending' && f.requester_id === me.id){
          action = '<button class="fw-social-mini-btn" disabled>等待处理</button>';
          relation = '申请已发出';
        }else if(f && f.status === 'pending' && f.receiver_id === me.id){
          action = `<button class="fw-social-mini-btn dark" data-fw-accept="${f.id}">同意</button><button class="fw-social-mini-btn danger" data-fw-reject="${f.id}">拒绝</button>`;
          relation = '对方想加你为搭子';
        }else if(f && f.status === 'blocked'){
          action = '<button class="fw-social-mini-btn" disabled>已拉黑</button>';
          relation = '当前不可添加';
        }
        items.push(`<article class="fw-social-item">${avatar(p.nickname, p.avatar_url, `data-fw-profile-user="${esc(p.id)}"`)}<div class="fw-social-item-main"><b>${esc(p.nickname || '低功耗研究员')}</b><span>实验品编号：${esc(p.lab_code || '未设置')} · ${esc(relation)}</span></div><div class="fw-social-item-actions">${action}<button class="fw-social-mini-btn" data-fw-profile-user="${esc(p.id)}">资料</button></div></article>`);
      }
      box.innerHTML = '<div class="fw-social-list">' + items.join('') + '</div>';
    }catch(err){
      box.innerHTML = '<div class="fw-social-empty">搜索失败，请稍后再试。</div>';
    }
  }

  async function openProfile(userId){
    await refreshMe();
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
      const {data:p, error} = await window.fwDb.client
        .from('profiles')
        .select('id,nickname,avatar_url,lab_code,created_at')
        .eq('id', userId)
        .maybeSingle();
      if(error) throw error;
      if(!p) throw new Error('用户不存在');
      const isSelf = p.id === me.id;
      const f = isSelf ? null : await getFriendshipWith(p.id);
      const accepted = f && f.status === 'accepted';
      const pendingOut = f && f.status === 'pending' && f.requester_id === me.id;
      const pendingIn = f && f.status === 'pending' && f.receiver_id === me.id;
      const blocked = f && f.status === 'blocked';
      let actions = '';
      if(isSelf){
        actions = '<button class="fw-social-mini-btn dark" data-fw-open-profile-editor>编辑资料</button>';
      }else if(accepted){
        actions = `<button class="fw-social-mini-btn dark" data-fw-start-chat="${esc(p.id)}">私聊</button><button class="fw-social-mini-btn danger" data-fw-remove-friend="${f.id}">解除搭子关系</button><button class="fw-social-mini-btn danger" data-fw-block-user="${esc(p.id)}">拉黑</button>`;
      }else if(pendingIn){
        actions = `<button class="fw-social-mini-btn dark" data-fw-accept="${f.id}">同意搭子申请</button><button class="fw-social-mini-btn danger" data-fw-reject="${f.id}">拒绝</button>`;
      }else if(pendingOut){
        actions = `<button class="fw-social-mini-btn" disabled>等待对方处理</button><button class="fw-social-mini-btn danger" data-fw-remove-friend="${f.id}">撤回申请</button>`;
      }else if(blocked){
        actions = '<button class="fw-social-mini-btn" disabled>已拉黑</button>';
      }else{
        actions = `<button class="fw-social-mini-btn dark" data-fw-add-friend="${esc(p.id)}">加为搭子</button><button class="fw-social-mini-btn danger" data-fw-block-user="${esc(p.id)}">拉黑</button>`;
      }
      $('[data-fw-social-body]').innerHTML = `<div class="fw-profile-card">${avatar(p.nickname, p.avatar_url)}<div class="fw-profile-info"><h3>${esc(p.nickname || '低功耗研究员')}</h3><p class="fw-lab-code-line">实验品编号：${esc(p.lab_code || '未设置')}</p><p>${isSelf ? '这是你自己。' : accepted ? '你们已经是摸鱼搭子。' : pendingOut ? '搭子申请已发出。' : pendingIn ? '对方想加你为搭子。' : '一位正在低功耗运行的研究员。'}</p></div><div class="fw-profile-actions">${actions}</div></div>`;
    }catch(err){
      $('[data-fw-social-body]').innerHTML = '<div class="fw-social-empty">资料读取失败。</div>';
    }
  }

  async function addFriend(userId){
    try{
      const {data, error} = await window.fwDb.client.rpc('fw_send_friend_request', {target_user_id:userId});
      if(error) throw error;
      if(data === 'already_accepted') toast('你们已经是搭子了。');
      else if(data === 'already_pending') toast('搭子申请已经发出，等待对方处理。');
      else if(data === 'blocked') toast('当前不能发送搭子申请。');
      else toast('搭子申请已发出。');
      await openProfile(userId);
      refreshBadges();
    }catch(err){ toast(err.message || '发送申请失败。'); }
  }

  async function acceptFriendship(id, yes){
    try{
      const {error} = await window.fwDb.client.rpc('fw_respond_friendship', {target_friendship_id:Number(id), accept_request:!!yes});
      if(error) throw error;
      toast(yes ? '已同意搭子申请。' : '已拒绝搭子申请。');
      await openBuddy(yes ? 'friends' : 'incoming');
      refreshBadges();
    }catch(err){ toast(err.message || '处理失败。'); }
  }

  async function removeFriendship(id){
    try{
      const {error} = await window.fwDb.client.rpc('fw_remove_friendship', {target_friendship_id:Number(id)});
      if(error) throw error;
      toast('已处理搭子关系。');
      await openBuddy(activeTab);
      refreshBadges();
    }catch(err){ toast(err.message || '操作失败。'); }
  }

  async function blockUser(id){
    try{
      const {error} = await window.fwDb.client.rpc('fw_block_user', {target_user_id:id});
      if(error) throw error;
      toast('已拉黑。');
      closeSocial();
      refreshBadges();
    }catch(err){ toast(err.message || '拉黑失败。'); }
  }

  async function startChat(targetId){
    await refreshMe();
    if(!needLogin()) return;
    try{
      const {data, error} = await window.fwDb.client.rpc('fw_get_or_create_conversation', {target_user_id:targetId});
      if(error) throw error;
      const convId = Number(data);
      if(!Number.isFinite(convId) || convId <= 0) throw new Error('私聊会话创建失败，请刷新后重试。');
      currentChat = {conversationId:convId, targetId};
      const profiles = await fetchProfiles([targetId]);
      const p = profiles[targetId] || {};
      closeSocial();
      openChatWindow(p.nickname || '摸鱼搭子');
      await loadChatMessages();
      clearInterval(chatTimer);
      chatTimer = setInterval(loadChatMessages, 5000);
    }catch(err){ toast(err.message || '只有成为搭子后才能私聊。'); }
  }

  function openChatWindow(name){
    ensureShell();
    $('[data-fw-chat-title]').textContent = '和 ' + name + ' 私聊';
    $('[data-fw-private-messages]').innerHTML = '<div class="fw-social-empty">正在读取私聊...</div>';
    $('[data-fw-private-modal]').classList.add('show');
    setTimeout(() => $('[data-fw-private-form] input')?.focus(), 80);
  }

  async function loadChatMessages(){
    if(!currentChat || !currentChat.conversationId) return;
    const box = $('[data-fw-private-messages]');
    if(!box) return;
    try{
      const {data, error} = await window.fwDb.client
        .from('private_messages')
        .select('id,conversation_id,sender_id,content,is_deleted,created_at')
        .eq('conversation_id', currentChat.conversationId)
        .eq('is_deleted', false)
        .order('created_at', {ascending:true})
        .limit(200);
      if(error) throw error;
      const profiles = await fetchProfiles((data || []).map(m => m.sender_id));
      if(!data || !data.length){
        box.innerHTML = '<div class="fw-social-empty">还没有私聊消息。可以先低功耗地打个招呼。</div>';
      }else{
        box.innerHTML = data.map(m => {
          const mine = me && m.sender_id === me.id;
          const p = profiles[m.sender_id] || {};
          return `<div class="fw-pm ${mine ? 'me' : ''}"><div class="fw-pm-name">${mine ? '你' : esc(p.nickname || '搭子')}</div><div class="fw-pm-bubble">${esc(m.content)}</div></div>`;
        }).join('');
      }
      box.scrollTop = box.scrollHeight;
    }catch(err){
      box.innerHTML = '<div class="fw-social-empty">私聊读取失败。</div>';
    }
  }

  async function sendPrivateMessage(form){
    if(!currentChat || !currentChat.targetId){ toast('私聊对象丢失，请关闭窗口重新打开私聊。'); return; }
    const input = form.querySelector('input[name="message"]');
    const text = (input.value || '').trim();
    if(!text){ input.focus(); return; }
    if(text.length > 300){ toast('私聊最多 300 字。'); return; }
    if(hasLink(text)){ toast('私聊第一版暂不支持链接。'); return; }
    const btn = form.querySelector('button');
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '发送中...';
    try{
      const {data, error} = await window.fwDb.client.rpc('fw_send_private_message_to_user', {target_user_id:currentChat.targetId, message_text:text});
      if(error) throw error;
      const convId = Number(data);
      if(Number.isFinite(convId) && convId > 0) currentChat.conversationId = convId;
      input.value = '';
      await loadChatMessages();
      refreshBadges();
    }catch(err){ toast(err.message || '发送失败。'); }
    finally{ btn.disabled = false; btn.textContent = old; }
  }

  function closeSocial(){ $('[data-fw-social-modal]')?.classList.remove('show'); }

  function closeChat(){
    $('[data-fw-private-modal]')?.classList.remove('show');
    clearInterval(chatTimer);
    chatTimer = null;
    currentChat = null;
  }

  function findUserIdFromClick(target){
    if(!target) return '';
    const squareFeed = target.closest('.feed-list[data-feed]');
    if(squareFeed){
      if(target.closest('textarea,input,button,a,select,.fw-square-reply-box,.comment-box,.fw-post-tools,.fw-comment-tools,.fw-square-delete,.fw-square-reply-action,[data-sq],[data-sb-action]')) return '';
      const squareProfile = target.closest('[data-fw-profile-open][data-user-id]');
      if(squareProfile && squareProfile.dataset.userId) return squareProfile.dataset.userId;
      return '';
    }
    const profile = target.closest('[data-fw-profile-user]');
    if(profile && profile.dataset.fwProfileUser) return profile.dataset.fwProfileUser;
    const roomMsg = target.closest('.fw-msg[data-user-id]');
    if(roomMsg && roomMsg.dataset.userId) return roomMsg.dataset.userId;
    const author = target.closest('.fw-author');
    if(author){
      const card = author.closest('.post-card[data-id]');
      const id = Number(card && card.dataset.id);
      if(typeof getPosts === 'function'){
        const p = getPosts().find(x => Number(x.id) === id);
        if(p && (p.userId || p.authorId)) return p.userId || p.authorId;
      }
    }
    const comment = target.closest('.comment-list li[data-comment-id]');
    if(comment && typeof getPosts === 'function'){
      const cid = String(comment.dataset.commentId);
      for(const p of getPosts()){
        const c = (p.comments || []).find(x => String(x.id) === cid);
        if(c && c.userId) return c.userId;
      }
    }
    return '';
  }

  function bindEvents(){
    document.addEventListener('click', async e => {
      const echo = e.target.closest('[data-fw-open-echo]');
      const buddy = e.target.closest('[data-fw-open-buddy]');
      const close = e.target.closest('[data-fw-social-close]');
      const chatClose = e.target.closest('[data-fw-chat-close]');
      const tab = e.target.closest('[data-fw-buddy-tab]');
      const add = e.target.closest('[data-fw-add-friend]');
      const accept = e.target.closest('[data-fw-accept]');
      const reject = e.target.closest('[data-fw-reject]');
      const remove = e.target.closest('[data-fw-remove-friend]');
      const block = e.target.closest('[data-fw-block-user]');
      const chat = e.target.closest('[data-fw-start-chat]');
      const profileEditor = e.target.closest('[data-fw-open-profile-editor]');
      const echoRefresh = e.target.closest('[data-fw-echo-refresh]');
      const echoMarkAll = e.target.closest('[data-fw-echo-mark-all]');
      const echoNotice = e.target.closest('[data-fw-echo-notice]');
      const echoItem = e.target.closest('[data-fw-echo-item]');
      const echoRooms = e.target.closest('[data-fw-echo-rooms]');

      if(echo){ e.preventDefault(); openEcho(); return; }
      if(echoRefresh){ e.preventDefault(); openEcho(); return; }
      if(echoMarkAll){
        e.preventDefault();
        const ids = $$('[data-fw-echo-item].unread').map(item => item.dataset.fwEchoItem);
        await markEchoRead(ids);
        openEcho();
        return;
      }
      if(echoRooms){
        e.preventDefault();
        if(echoRooms.dataset.fwEchoNotice) markEchoRead([echoRooms.dataset.fwEchoNotice]);
        window.location.href = 'rooms.html';
        return;
      }
      if(echoNotice && echoNotice.dataset.fwEchoNotice) markEchoRead([echoNotice.dataset.fwEchoNotice]);
      if(echoItem && echoItem.classList.contains('unread')) markEchoRead([echoItem.dataset.fwEchoItem]);

      if(buddy){ e.preventDefault(); openBuddy(activeTab); return; }
      if(close){ e.preventDefault(); closeSocial(); return; }
      if(chatClose){ e.preventDefault(); closeChat(); return; }
      if(tab){ e.preventDefault(); openBuddy(tab.dataset.fwBuddyTab || 'friends'); return; }
      if(add){ e.preventDefault(); addFriend(add.dataset.fwAddFriend); return; }
      if(accept){ e.preventDefault(); acceptFriendship(accept.dataset.fwAccept, true); return; }
      if(reject){ e.preventDefault(); acceptFriendship(reject.dataset.fwReject, false); return; }
      if(remove){ e.preventDefault(); removeFriendship(remove.dataset.fwRemoveFriend); return; }
      if(block){ e.preventDefault(); blockUser(block.dataset.fwBlockUser); return; }
      if(chat){ e.preventDefault(); startChat(chat.dataset.fwStartChat); return; }
      if(profileEditor){
        e.preventDefault();
        closeSocial();
        const btn = $('[data-fw-open]');
        if(btn) btn.click();
        return;
      }

      const userId = findUserIdFromClick(e.target);
      if(userId) openProfile(userId);
    }, true);

    document.addEventListener('submit', e => {
      const search = e.target.closest('[data-fw-user-search]');
      if(search){
        e.preventDefault();
        const q = search.querySelector('input[name="q"]')?.value || '';
        renderSearchResults(q);
        return;
      }
      const pm = e.target.closest('[data-fw-private-form]');
      if(pm){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        sendPrivateMessage(pm);
      }
    }, true);
  }

  async function boot(){
    ensureShell();
    installHeaderButtons();
    bindEvents();
    await waitForDb();
    await refreshMe();
    await refreshBadges();
    subscribeBadgeChanges();
    clearInterval(badgeTimer);
    badgeTimer = setInterval(() => { if(!document.hidden) refreshBadges(); }, 60000);
    window.addEventListener('focus', () => scheduleBadgeRefresh(80));
    document.addEventListener('visibilitychange', () => { if(!document.hidden) scheduleBadgeRefresh(80); });
    window.fwDb?.client?.auth?.onAuthStateChange?.(async () => { await refreshMe(); refreshBadges(); });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
