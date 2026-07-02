// F.w 研究所：电脑端回声中心增强
// 只增强已有 [data-fw-open-echo] 按钮和现有回声面板；不新增入口，不影响 /app/ 手机端。
(function(){
  if(window.__FW_DESKTOP_ECHO_CENTER__) return;
  window.__FW_DESKTOP_ECHO_CENTER__ = true;

  if(/\/app\//.test(window.location.pathname || '')) return;

  const POST_TYPES = ['like', 'same', 'tissue', 'comment', 'comment_reply'];
  const FRIEND_TYPES = ['friend_request', 'friend_accept'];
  let lastEchoPromise = null;

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[c]));
  }

  function ini(value){
    return String(value || 'FW').trim().slice(0, 2).toUpperCase();
  }

  function waitDb(){
    return new Promise(resolve => {
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
        resolve(true);
        return;
      }

      let count = 0;
      const timer = setInterval(() => {
        count += 1;

        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
          clearInterval(timer);
          resolve(true);
        }

        if(count > 120){
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  async function currentUser(){
    if(!(await waitDb())) return null;

    try{
      return await window.fwDb.getCurrentUser();
    }catch(e){
      return null;
    }
  }

  function toast(message){
    let t = $('.fw-toast');

    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }

    t.textContent = message;
    t.classList.add('show');

    clearTimeout(window.__fwDesktopEchoToast);
    window.__fwDesktopEchoToast = setTimeout(() => t.classList.remove('show'), 2600);
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

  function typeText(type){
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

  function kindOf(notice){
    const type = String(notice && notice.type || '');

    if(type === 'private_message') return 'message';
    if(FRIEND_TYPES.includes(type)) return 'friend';
    if(POST_TYPES.includes(type)) return 'post';

    return 'system';
  }

  function avatarHtml(profile){
    const name = profile && profile.nickname || '研究员';
    const url = profile && profile.avatar_url || '';

    if(url){
      return `<span class="fw-echo-avatar" data-fw-profile-user="${esc(profile.id || '')}"><img src="${esc(url)}" alt="${esc(name)}"></span>`;
    }

    return `<span class="fw-echo-avatar" data-fw-profile-user="${esc(profile && profile.id || '')}">${esc(ini(name))}</span>`;
  }

  function previewText(value){
    return String(value || '对你的低功耗发言产生了回应。')
      .replace(/\[\[FW_USER_STICKER:[A-Za-z0-9+/=]+\]\]/g, '动画表情')
      .replace(/\[\[FW_MEDIA_IMAGE:[A-Za-z0-9+/=]+\]\]/g, '图片')
      .replace(/\[\[FW_MEDIA_VIDEO:[A-Za-z0-9+/=]+\]\]/g, '视频')
      .replace(/\s+/g, ' ')
      .trim() || '对你的低功耗发言产生了回应。';
  }

  function injectStyle(){
    if($('#fwDesktopEchoCenterStyle')) return;

    const style = document.createElement('style');
    style.id = 'fwDesktopEchoCenterStyle';
    style.textContent = `
      .fw-social-panel.fw-echo-center-panel{width:min(760px,calc(100vw - 72px));max-height:min(760px,calc(100dvh - 84px));}
      .fw-echo-center-wrap{display:grid;gap:14px;}
      .fw-echo-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:2px 2px 0;}
      .fw-echo-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:rgba(23,23,21,.72);font-size:13px;font-weight:900;}
      .fw-echo-pill{display:inline-flex;align-items:center;justify-content:center;min-height:28px;border-radius:999px;padding:0 11px;background:#f7f3eb;border:1px solid rgba(28,28,24,.1);font-weight:1000;color:#171715;}
      .fw-echo-pill.danger{background:#fff0ec;border-color:rgba(217,121,121,.38);color:#9d4a4a;}
      .fw-echo-toolbar-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
      .fw-echo-filter,.fw-echo-refresh{min-height:32px;border:1px solid rgba(28,28,24,.13);border-radius:999px;background:#fffdf7;color:#171715;padding:0 12px;font-size:12px;font-weight:1000;cursor:pointer;}
      .fw-echo-filter.active,.fw-echo-refresh:hover{background:#171715;border-color:#171715;color:#fff;}
      .fw-echo-list{display:grid;gap:10px;max-height:min(560px,calc(100dvh - 245px));overflow:auto;padding-right:4px;}
      .fw-echo-item{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:flex-start;padding:14px;border:1px solid rgba(28,28,24,.1);background:#fffdf7;position:relative;}
      .fw-echo-item.unread{background:linear-gradient(135deg,#fffdf7,#fff3ef);border-color:rgba(217,121,121,.48);}
      .fw-echo-item.unread:before{content:"";position:absolute;left:8px;top:8px;width:9px;height:9px;border-radius:999px;background:#d95353;border:2px solid #fffdf7;box-shadow:0 3px 10px rgba(217,83,83,.3);}
      .fw-echo-avatar{width:44px;height:44px;border-radius:999px;background:#171715;color:#fff;display:grid;place-items:center;overflow:hidden;font-size:13px;font-weight:1000;cursor:pointer;}
      .fw-echo-avatar img{width:100%;height:100%;object-fit:cover;display:block;}
      .fw-echo-main{min-width:0;display:grid;gap:4px;}
      .fw-echo-main b{font-size:15px;line-height:1.25;font-weight:1000;color:#171715;}
      .fw-echo-main p{margin:0;color:rgba(23,23,21,.74);font-size:13px;line-height:1.55;font-weight:820;word-break:break-word;}
      .fw-echo-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;color:rgba(23,23,21,.52);font-size:12px;font-weight:900;}
      .fw-echo-kind{color:#9d4a4a;}
      .fw-echo-actions{display:flex;gap:7px;align-items:center;justify-content:flex-end;flex-wrap:wrap;min-width:108px;}
      .fw-echo-mini{min-height:31px;border:1px solid rgba(28,28,24,.14);border-radius:999px;background:#fffdf7;color:#171715;padding:0 10px;font-size:12px;font-weight:1000;cursor:pointer;white-space:nowrap;}
      .fw-echo-mini.dark{background:#171715;border-color:#171715;color:#fff;}
      .fw-echo-mini:hover{border-color:rgba(217,121,121,.7);color:#9d4a4a;}
      .fw-echo-mini.dark:hover{background:#9d4a4a;border-color:#9d4a4a;color:#fff;}
      .fw-echo-empty{padding:24px;border:1px dashed rgba(28,28,24,.16);background:#fffdf7;color:rgba(23,23,21,.62);font-weight:900;line-height:1.7;}
      .fw-echo-hidden{display:none!important;}
      .fw-social-btn[data-fw-open-echo]{position:relative;}
      .fw-social-btn[data-fw-open-echo] .fw-social-badge.show{box-shadow:0 0 0 2px #fffdf7;}
      @media(max-width:760px){.fw-social-panel.fw-echo-center-panel{width:min(100%,calc(100vw - 28px));}.fw-echo-item{grid-template-columns:40px minmax(0,1fr);}.fw-echo-actions{grid-column:2;justify-content:flex-start;}}
    `;

    document.head.appendChild(style);
  }

  function setExistingEchoBadge(count){
    $$('[data-fw-echo-count]').forEach(el => {
      el.textContent = count > 99 ? '99+' : String(count || 0);
      el.classList.toggle('show', Number(count || 0) > 0);
    });
  }

  async function fetchProfiles(ids){
    ids = Array.from(new Set((ids || []).filter(Boolean)));
    if(!ids.length) return {};

    try{
      const result = await window.fwDb.client
        .from('profiles')
        .select('id,nickname,avatar_url,lab_code')
        .in('id', ids);

      if(result.error) throw result.error;

      const map = {};
      (result.data || []).forEach(row => { map[row.id] = row; });
      return map;
    }catch(e){
      return {};
    }
  }

  async function resolveReplyTargets(rows){
    const replyCommentIds = Array.from(new Set((rows || [])
      .filter(row => row && row.type === 'comment_reply' && row.target_id)
      .map(row => row.target_id)));

    if(!replyCommentIds.length) return rows || [];

    try{
      const result = await window.fwDb.client
        .from('comments')
        .select('id,post_id')
        .in('id', replyCommentIds);

      if(result.error) throw result.error;

      const map = {};
      (result.data || []).forEach(row => { if(row.id && row.post_id) map[row.id] = row.post_id; });
      (rows || []).forEach(row => {
        if(row.type === 'comment_reply' && row.target_id && map[row.target_id]) row.__post_id = map[row.target_id];
      });
    }catch(e){}

    return rows || [];
  }

  async function loadEchoData(){
    const ok = await waitDb();
    if(!ok) throw new Error('数据连接失败，请刷新页面后重试。');

    const user = await currentUser();
    if(!user || !user.id) throw new Error('请先注册 / 登录。');

    const result = await window.fwDb.client
      .from('notifications')
      .select('id,actor_id,type,target_type,target_id,content,is_read,created_at')
      .eq('user_id', user.id)
      .order('created_at', {ascending:false})
      .limit(120);

    if(result.error) throw result.error;

    const rows = await resolveReplyTargets(result.data || []);
    const profiles = await fetchProfiles(rows.map(row => row.actor_id));

    return {
      user,
      rows,
      profiles,
      unread:rows.filter(row => !row.is_read).length
    };
  }

  function postIdOf(notice){
    if(!notice) return '';
    if(notice.__post_id) return String(notice.__post_id);
    if(POST_TYPES.includes(String(notice.type || '')) && notice.target_id) return String(notice.target_id);
    if(notice.target_type === 'post' && notice.target_id) return String(notice.target_id);
    return '';
  }

  function itemHtml(notice, profiles){
    const actor = profiles[notice.actor_id] || {id:notice.actor_id, nickname:'某位研究员'};
    const actorName = actor.nickname || '某位研究员';
    const kind = kindOf(notice);
    const unread = !notice.is_read;
    const postId = postIdOf(notice);
    const actions = [];

    if(postId){
      actions.push(`<button class="fw-echo-mini dark" type="button" data-fw-stable-post="${esc(postId)}">查看帖子</button>`);
    }

    if(notice.type === 'private_message' && notice.actor_id){
      actions.push(`<button class="fw-echo-mini dark" type="button" data-fw-start-chat="${esc(notice.actor_id)}">私聊</button>`);
    }

    if(notice.type === 'friend_request'){
      actions.push('<button class="fw-echo-mini dark" type="button" data-fw-open-buddy>处理申请</button>');
    }

    if(notice.actor_id){
      actions.push(`<button class="fw-echo-mini" type="button" data-fw-profile-user="${esc(notice.actor_id)}">资料</button>`);
    }

    return `
      <article class="fw-echo-item ${unread ? 'unread' : ''}" data-fw-echo-item data-fw-echo-kind="${esc(kind)}" data-fw-echo-unread="${unread ? '1' : '0'}">
        ${avatarHtml(actor)}
        <div class="fw-echo-main">
          <b>${esc(actorName)} ${esc(typeText(notice.type))}</b>
          <p>${esc(previewText(notice.content))}</p>
          <div class="fw-echo-meta"><span>${esc(timeText(notice.created_at))}</span><span class="fw-echo-kind">${esc(kind === 'post' ? '帖子互动' : kind === 'friend' ? '搭子' : kind === 'message' ? '私聊' : '系统')}</span>${unread ? '<span>未读</span>' : '<span>已读</span>'}</div>
        </div>
        <div class="fw-echo-actions">${actions.join('')}</div>
      </article>
    `;
  }

  function renderEcho(data){
    injectStyle();

    const modal = $('[data-fw-social-modal]');
    const panel = $('[data-fw-social-panel]');
    const body = $('[data-fw-social-body]');

    if(!modal || !panel || !body || !modal.classList.contains('show')) return;

    panel.classList.remove('wide');
    panel.classList.add('fw-echo-center-panel');

    const kicker = $('[data-fw-social-kicker]');
    const title = $('[data-fw-social-title]');

    if(kicker) kicker.textContent = 'ECHO CENTER';
    if(title) title.textContent = '回声中心';

    const rows = data.rows || [];
    const unread = rows.filter(row => !row.is_read).length;
    const postCount = rows.filter(row => kindOf(row) === 'post').length;
    const friendCount = rows.filter(row => kindOf(row) === 'friend').length;
    const messageCount = rows.filter(row => kindOf(row) === 'message').length;

    setExistingEchoBadge(unread);

    if(!rows.length){
      body.innerHTML = '<div class="fw-echo-empty">暂时没有新的回声。安静也是一种运行状态。</div>';
      return;
    }

    body.innerHTML = `
      <div class="fw-echo-center-wrap">
        <div class="fw-echo-toolbar">
          <div class="fw-echo-summary">
            <span class="fw-echo-pill">全部 ${rows.length}</span>
            <span class="fw-echo-pill ${unread ? 'danger' : ''}">未读 ${unread}</span>
            <span class="fw-echo-pill">帖子 ${postCount}</span>
            <span class="fw-echo-pill">搭子 ${friendCount}</span>
            <span class="fw-echo-pill">私聊 ${messageCount}</span>
          </div>
          <div class="fw-echo-toolbar-actions">
            <button class="fw-echo-filter active" type="button" data-fw-echo-filter="all">全部</button>
            <button class="fw-echo-filter" type="button" data-fw-echo-filter="unread">未读</button>
            <button class="fw-echo-filter" type="button" data-fw-echo-filter="post">帖子</button>
            <button class="fw-echo-filter" type="button" data-fw-echo-filter="friend">搭子</button>
            <button class="fw-echo-filter" type="button" data-fw-echo-filter="message">私聊</button>
            <button class="fw-echo-refresh" type="button" data-fw-echo-refresh>刷新</button>
          </div>
        </div>
        <div class="fw-echo-list" data-fw-echo-list>
          ${rows.map(row => itemHtml(row, data.profiles || {})).join('')}
        </div>
      </div>
    `;
  }

  async function markEchoRead(){
    try{
      const user = await currentUser();
      if(!user || !user.id) return;

      await window.fwDb.client
        .from('notifications')
        .update({is_read:true})
        .eq('user_id', user.id)
        .eq('is_read', false);

      setExistingEchoBadge(0);
    }catch(e){}
  }

  function renderFromPromise(promise){
    if(!promise) return;

    promise
      .then(data => {
        renderEcho(data);
        markEchoRead();
      })
      .catch(err => {
        const body = $('[data-fw-social-body]');
        if(body) body.innerHTML = `<div class="fw-echo-empty">${esc(err.message || '回声读取失败，请刷新后重试。')}</div>`;
      });
  }

  function scheduleEchoRender(){
    const promise = lastEchoPromise || loadEchoData();
    lastEchoPromise = promise;

    [180, 520, 1100].forEach(delay => {
      setTimeout(() => renderFromPromise(promise), delay);
    });
  }

  function applyFilter(value){
    const list = $('[data-fw-echo-list]');
    if(!list) return;

    $$('.fw-echo-filter').forEach(btn => btn.classList.toggle('active', btn.dataset.fwEchoFilter === value));

    $$('[data-fw-echo-item]', list).forEach(item => {
      const kind = item.dataset.fwEchoKind || 'system';
      const unread = item.dataset.fwEchoUnread === '1';
      const show = value === 'all' ||
        (value === 'unread' && unread) ||
        value === kind;

      item.classList.toggle('fw-echo-hidden', !show);
    });
  }

  function bind(){
    document.addEventListener('click', event => {
      const openEcho = event.target.closest && event.target.closest('[data-fw-open-echo]');

      if(openEcho){
        lastEchoPromise = loadEchoData();
        scheduleEchoRender();
        return;
      }

      const filter = event.target.closest && event.target.closest('[data-fw-echo-filter]');

      if(filter){
        event.preventDefault();
        applyFilter(filter.dataset.fwEchoFilter || 'all');
        return;
      }

      const refresh = event.target.closest && event.target.closest('[data-fw-echo-refresh]');

      if(refresh){
        event.preventDefault();
        refresh.disabled = true;
        refresh.textContent = '刷新中...';
        lastEchoPromise = loadEchoData();
        renderFromPromise(lastEchoPromise);
        setTimeout(() => {
          refresh.disabled = false;
          refresh.textContent = '刷新';
        }, 900);
      }
    }, true);
  }

  function boot(){
    injectStyle();
    bind();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
