// F.w 研究所：回声 / 搭子面板稳定补丁（轻量版）
// 保留：回声固定右侧、搭子聊天区输入栏固定底部、消息区独立滚动。
// 移除：全站滚动监听、定时 clamp、频繁 DOM 观察，减少点击卡顿。
(function(){
  if(window.__FW_PANEL_STABILITY__) return;
  window.__FW_PANEL_STABILITY__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  let echoOpening = false;

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function ini(v){ return String(v || 'FW').trim().slice(0, 2).toUpperCase(); }

  function toast(msg){
    let t = $('.fw-toast');
    if(!t){ t = document.createElement('div'); t.className = 'fw-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwPanelStabilityToast);
    window.__fwPanelStabilityToast = setTimeout(() => t.classList.remove('show'), 2200);
  }

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

  async function getMe(){
    try{
      if(!(await waitForDb())) return null;
      return await window.fwDb.getCurrentUser();
    }catch(e){ return null; }
  }

  function injectStyle(){
    if($('#fw-panel-stability-style')) return;
    const style = document.createElement('style');
    style.id = 'fw-panel-stability-style';
    style.textContent = `
      @media (min-width:761px){
        .fw-wx-modal.show{z-index:10080!important;pointer-events:none!important;}
        .fw-wx-panel{
          display:grid!important;
          grid-template-rows:auto minmax(0,1fr)!important;
          max-height:calc(100dvh - 96px)!important;
          overflow:hidden!important;
          pointer-events:auto!important;
          will-change:auto!important;
        }
        .fw-wx-shell{min-height:0!important;height:100%!important;overflow:hidden!important;}
        .fw-wx-left,.fw-wx-right{min-height:0!important;height:100%!important;overflow:hidden!important;}
        .fw-wx-right{display:grid!important;grid-template-rows:auto minmax(0,1fr) auto!important;}
        .fw-wx-messages{
          min-height:0!important;
          height:auto!important;
          overflow-y:auto!important;
          overscroll-behavior:contain;
          padding-bottom:22px!important;
          scroll-behavior:auto!important;
        }
        .fw-wx-compose{
          position:relative!important;
          z-index:5!important;
          flex-shrink:0!important;
          background:#fffdf7!important;
          box-shadow:0 -8px 18px rgba(0,0,0,.035)!important;
        }
        .fw-wx-list{min-height:0!important;overflow-y:auto!important;}

        .fw-stable-echo-modal{position:fixed;inset:0;z-index:10160;display:none;pointer-events:none;background:transparent;}
        .fw-stable-echo-modal.show{display:block;}
        .fw-stable-echo-panel{
          position:fixed;right:28px;top:88px;width:min(460px,calc(100vw - 56px));height:min(620px,calc(100dvh - 112px));
          min-height:420px;display:grid;grid-template-rows:auto minmax(0,1fr);background:#f5f1e8;color:#171715;
          border:1px solid rgba(217,121,121,.55);box-shadow:0 24px 90px rgba(0,0,0,.26);pointer-events:auto;overflow:hidden;
        }
        .fw-stable-echo-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:22px 24px;border-bottom:1px solid rgba(28,28,24,.12);background:rgba(255,255,255,.45);}
        .fw-stable-echo-head small{display:block;color:#d97979;font-weight:1000;letter-spacing:.14em;margin-bottom:8px;}
        .fw-stable-echo-head h2{margin:0;font-size:32px;line-height:1;letter-spacing:-.06em;font-weight:1000;}
        .fw-stable-echo-close{width:42px;height:42px;border:0;background:transparent;font-size:31px;line-height:1;cursor:pointer;}
        .fw-stable-echo-body{min-height:0;overflow:auto;padding:18px;display:grid;align-content:start;gap:12px;}
        .fw-stable-echo-item{display:grid;grid-template-columns:38px 1fr auto;align-items:center;gap:12px;padding:13px;border:1px solid rgba(28,28,24,.12);background:rgba(255,253,247,.76);}
        .fw-stable-echo-item.unread{border-color:rgba(217,121,121,.55);background:#fffdf7;}
        .fw-stable-echo-avatar{width:38px;height:38px;border-radius:999px;display:grid;place-items:center;overflow:hidden;background:#171715;color:#fff;font-size:12px;font-weight:1000;border:1px solid rgba(217,121,121,.55);}
        .fw-stable-echo-avatar img{width:100%;height:100%;object-fit:cover;}
        .fw-stable-echo-main{min-width:0;}
        .fw-stable-echo-main b{display:block;font-size:14px;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .fw-stable-echo-main span{display:block;margin-top:4px;color:#6f6a5f;font-size:12px;font-weight:850;line-height:1.45;}
        .fw-stable-echo-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;}
        .fw-stable-echo-actions button{min-height:30px;border:1px solid rgba(28,28,24,.16);border-radius:999px;background:#171715;color:#fff;font-size:12px;font-weight:1000;padding:0 10px;cursor:pointer;}
        .fw-stable-echo-empty{padding:18px;border:1px dashed rgba(28,28,24,.18);background:rgba(255,255,255,.45);color:#746b5d;font-weight:900;}
      }
      @media(max-width:760px){
        .fw-stable-echo-modal.show{display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,8,6,.72);pointer-events:auto;}
        .fw-stable-echo-panel{position:relative;width:100%;height:86dvh;right:auto;top:auto;}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureStableEcho(){
    let modal = $('[data-fw-stable-echo-modal]');
    if(modal) return modal;
    modal = document.createElement('div');
    modal.className = 'fw-stable-echo-modal';
    modal.dataset.fwStableEchoModal = '1';
    modal.innerHTML = `
      <section class="fw-stable-echo-panel" role="dialog" aria-modal="false" aria-label="回声">
        <header class="fw-stable-echo-head">
          <div><small>ECHO CENTER</small><h2>回声</h2></div>
          <button class="fw-stable-echo-close" type="button" data-fw-stable-echo-close>×</button>
        </header>
        <div class="fw-stable-echo-body" data-fw-stable-echo-body><div class="fw-stable-echo-empty">正在读取回声...</div></div>
      </section>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function avatarHtml(p){
    const name = p?.nickname || '研究员';
    const url = p?.avatar_url || '';
    if(url) return `<span class="fw-stable-echo-avatar"><img src="${esc(url)}" alt="${esc(name)}"></span>`;
    return `<span class="fw-stable-echo-avatar">${esc(ini(name))}</span>`;
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

  function focusPost(id, comments){
    const path = window.location.pathname.split('/').pop() || 'index.html';
    if(path !== 'square.html'){
      window.location.href = `square.html?post=${encodeURIComponent(id)}${comments ? '&comments=1' : ''}`;
      return;
    }
    const safeId = window.CSS && CSS.escape ? CSS.escape(String(id)) : String(id).replace(/"/g,'\\"');
    const card = document.querySelector(`.post-card[data-id="${safeId}"]`);
    if(card){
      card.scrollIntoView({behavior:'smooth', block:'center'});
      card.classList.add('fw-dual-post-focus');
      if(comments) card.querySelector('.comment-box')?.classList.add('show');
      setTimeout(() => card.classList.remove('fw-dual-post-focus'), 2600);
    }else toast('这条帖子可能还没加载出来，稍后再试。');
  }

  async function openStableEcho(){
    if(echoOpening) return;
    echoOpening = true;
    setTimeout(() => echoOpening = false, 450);

    const me = await getMe();
    if(!me || !me.id){
      const btn = $('[data-fw-open], [data-login-cta], [data-sb-open]');
      if(btn) btn.click(); else toast('请先注册 / 登录。');
      return;
    }

    $$('[data-fw-social-modal].show').forEach(m => m.classList.remove('show'));
    const modal = ensureStableEcho();
    const body = modal.querySelector('[data-fw-stable-echo-body]');
    modal.classList.add('show');
    body.innerHTML = '<div class="fw-stable-echo-empty">正在读取回声...</div>';

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
      if(!rows.length){ body.innerHTML = '<div class="fw-stable-echo-empty">暂时没有新的回声。私聊消息已经移到“搭子”里了。</div>'; return; }
      body.innerHTML = rows.map(n => {
        const p = profiles[n.actor_id] || {};
        const name = p.nickname || '某位研究员';
        const isPost = (n.target_type === 'post' || ['like','same','tissue','comment'].includes(n.type)) && n.target_id;
        return `<article class="fw-stable-echo-item ${n.is_read ? '' : 'unread'}" data-fw-stable-echo-notice="${esc(n.id)}">
          ${avatarHtml(p)}
          <div class="fw-stable-echo-main"><b>${esc(name)} ${esc(typeText(n.type))}</b><span>${esc(n.content || '对你的低功耗发言产生了回应。')}</span></div>
          <div class="fw-stable-echo-actions">
            ${isPost ? `<button type="button" data-fw-stable-post="${esc(n.target_id)}" data-open-comments="${n.type === 'comment' ? '1' : '0'}">查看帖子</button>` : ''}
            ${n.type === 'friend_request' || n.type === 'friend_accept' ? `<button type="button" data-fw-stable-buddy>去搭子</button>` : ''}
          </div>
        </article>`;
      }).join('');
      await window.fwDb.client.from('notifications').update({is_read:true}).eq('user_id', me.id).eq('is_read', false).neq('type', 'private_message');
    }catch(e){ body.innerHTML = '<div class="fw-stable-echo-empty">回声读取失败，请稍后重试。</div>'; }
  }

  window.fwOpenStableEcho = openStableEcho;

  function clampBuddyPanelOnce(){
    const panel = $('[data-fw-wx-panel]');
    const modal = $('[data-fw-wx-buddy-modal].show, .fw-wx-modal.show');
    if(!panel || !modal || window.innerWidth <= 760) return;
    panel.style.right = '28px';
    panel.style.left = 'auto';
    panel.style.top = '88px';
    panel.style.bottom = 'auto';
    panel.style.height = 'min(720px, calc(100dvh - 96px))';
    const msg = panel.querySelector('[data-fw-wx-messages]');
    if(msg && msg.dataset.fwUserScrolled !== '1') requestAnimationFrame(() => { msg.scrollTop = msg.scrollHeight; });
  }

  function bind(){
    document.addEventListener('pointerup', e => {
      if(e.target.closest('[data-fw-open-echo]')){ setTimeout(openStableEcho, 60); return; }
      if(e.target.closest('[data-fw-open-buddy]')){ setTimeout(clampBuddyPanelOnce, 220); }
    }, true);

    document.addEventListener('click', e => {
      if(e.target.closest('[data-fw-stable-echo-close]')){ $('[data-fw-stable-echo-modal]')?.classList.remove('show'); return; }
      const post = e.target.closest('[data-fw-stable-post]');
      if(post){ focusPost(post.dataset.fwStablePost, post.dataset.openComments === '1'); return; }
      if(e.target.closest('[data-fw-stable-buddy]')){ $('[data-fw-stable-echo-modal]')?.classList.remove('show'); $('[data-fw-open-buddy]')?.click(); return; }
      if(e.target.matches('[data-fw-stable-echo-modal]')) e.target.classList.remove('show');
    }, true);

    window.addEventListener('resize', () => setTimeout(clampBuddyPanelOnce, 120));
    document.addEventListener('scroll', e => {
      const msg = e.target.closest && e.target.closest('[data-fw-wx-messages]');
      if(!msg) return;
      msg.dataset.fwUserScrolled = (msg.scrollHeight - msg.scrollTop - msg.clientHeight < 80) ? '0' : '1';
    }, true);
  }

  function boot(){ injectStyle(); bind(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
