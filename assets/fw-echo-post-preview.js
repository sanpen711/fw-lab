// F.w 研究所：回声帖子详情预览
// 点击回声里的“查看帖子”时，不再直接滚动页面，而是在回声上方弹出帖子详情卡片。
// 详情卡片包含：点赞、评论、俺也一样、递纸巾，并保留“去原帖”。
(function(){
  if(window.__FW_ECHO_POST_PREVIEW__) return;
  window.__FW_ECHO_POST_PREVIEW__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[c]));
  }

  function ini(v){
    return String(v || 'FW').trim().slice(0, 2).toUpperCase();
  }

  function timeText(v){
    if(!v) return '刚刚';
    const m = Math.floor(Math.max(0, Date.now() - new Date(v).getTime()) / 60000);
    if(m < 1) return '刚刚';
    if(m < 60) return m + '分钟前';
    const h = Math.floor(m / 60);
    if(h < 24) return h + '小时前';
    const d = Math.floor(h / 24);
    return d < 7 ? d + '天前' : new Date(v).toLocaleDateString('zh-CN');
  }

  function profileOf(row){
    return Array.isArray(row?.profiles) ? (row.profiles[0] || {}) : (row?.profiles || {});
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
    clearTimeout(window.__fwEchoPostPreviewToast);
    window.__fwEchoPostPreviewToast = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function waitForDb(){
    return new Promise(resolve => {
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      let count = 0;
      const timer = setInterval(() => {
        count += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(timer); resolve(true); }
        if(count > 60){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  async function getMe(){
    try{
      if(!(await waitForDb())) return null;
      return await window.fwDb.getCurrentUser();
    }catch(e){
      return null;
    }
  }

  function injectStyle(){
    if($('#fw-echo-post-preview-style')) return;
    const style = document.createElement('style');
    style.id = 'fw-echo-post-preview-style';
    style.textContent = `
      .fw-post-preview-modal{
        position:fixed;
        inset:0;
        display:none;
        z-index:10190;
        pointer-events:none;
      }
      .fw-post-preview-modal.show{display:block;}
      .fw-post-preview-panel{
        position:fixed;
        right:500px;
        top:118px;
        width:min(440px,calc(100vw - 56px));
        max-height:min(660px,calc(100dvh - 140px));
        display:grid;
        grid-template-rows:auto minmax(0,1fr) auto;
        background:#fffdf7;
        border:1px solid rgba(217,121,121,.58);
        box-shadow:0 26px 80px rgba(0,0,0,.28);
        color:#171715;
        pointer-events:auto;
        overflow:hidden;
      }
      .fw-post-preview-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:16px;
        padding:20px 22px 16px;
        border-bottom:1px solid rgba(28,28,24,.12);
        background:#f7f3eb;
      }
      .fw-post-preview-head small{
        display:block;
        margin-bottom:6px;
        color:#d97979;
        font-weight:1000;
        letter-spacing:.14em;
      }
      .fw-post-preview-head h2{
        margin:0;
        font-size:28px;
        line-height:1;
        letter-spacing:-.05em;
        font-weight:1000;
      }
      .fw-post-preview-close{
        width:36px;
        height:36px;
        border:0;
        background:transparent;
        font-size:28px;
        line-height:1;
        cursor:pointer;
      }
      .fw-post-preview-body{
        min-height:0;
        overflow:auto;
        padding:18px 20px;
      }
      .fw-post-preview-author{
        display:grid;
        grid-template-columns:42px 1fr auto;
        align-items:center;
        gap:12px;
        margin-bottom:14px;
      }
      .fw-post-preview-avatar{
        width:42px;
        height:42px;
        border-radius:999px;
        overflow:hidden;
        display:grid;
        place-items:center;
        background:#171715;
        color:#fff;
        font-weight:1000;
        font-size:12px;
        border:1px solid rgba(217,121,121,.55);
      }
      .fw-post-preview-avatar img{width:100%;height:100%;object-fit:cover;display:block;}
      .fw-post-preview-name{font-weight:1000;font-size:15px;line-height:1.2;}
      .fw-post-preview-time{font-size:12px;font-weight:850;color:#746b5d;margin-top:3px;}
      .fw-post-preview-status{
        display:inline-flex;
        align-items:center;
        height:28px;
        border-radius:999px;
        padding:0 10px;
        background:#e07b7b;
        color:#fff;
        font-size:12px;
        font-weight:1000;
      }
      .fw-post-preview-content{
        padding:18px;
        background:#f7f3eb;
        border:1px solid rgba(28,28,24,.12);
        font-size:20px;
        line-height:1.55;
        font-weight:900;
        white-space:pre-wrap;
        word-break:break-word;
      }
      .fw-post-preview-counts{
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        margin:14px 0 0;
      }
      .fw-post-preview-counts button,
      .fw-post-preview-counts span{
        min-height:31px;
        border:1px solid rgba(28,28,24,.16);
        border-radius:999px;
        background:#fffdf7;
        color:#171715;
        padding:0 12px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:12px;
        font-weight:1000;
        cursor:pointer;
      }
      .fw-post-preview-counts span{cursor:default;}
      .fw-post-preview-counts button:hover{border-color:rgba(217,121,121,.68);color:#9d4a4a;}
      .fw-post-preview-comments{
        margin-top:16px;
        border-top:1px solid rgba(28,28,24,.12);
        padding-top:14px;
      }
      .fw-post-preview-comments h3{
        margin:0 0 10px;
        font-size:16px;
        font-weight:1000;
      }
      .fw-post-preview-comment{
        padding:10px 0;
        border-bottom:1px dashed rgba(28,28,24,.12);
        font-size:13px;
        line-height:1.55;
      }
      .fw-post-preview-comment b{display:block;color:#9d4a4a;margin-bottom:3px;}
      .fw-post-preview-empty{color:#746b5d;font-weight:900;font-size:13px;padding:12px;border:1px dashed rgba(28,28,24,.18);}
      .fw-post-preview-foot{
        display:flex;
        justify-content:space-between;
        gap:10px;
        padding:14px 20px 18px;
        border-top:1px solid rgba(28,28,24,.12);
        background:#fffdf7;
      }
      .fw-post-preview-foot button{
        min-height:38px;
        border-radius:999px;
        padding:0 18px;
        font-size:13px;
        font-weight:1000;
        cursor:pointer;
      }
      .fw-post-preview-secondary{border:1px solid rgba(28,28,24,.18);background:#fffdf7;color:#171715;}
      .fw-post-preview-primary{border:1px solid #171715;background:#171715;color:#fff;}
      .fw-post-preview-loading{padding:18px;border:1px dashed rgba(28,28,24,.18);font-weight:900;color:#746b5d;}
      @media(max-width:1080px){
        .fw-post-preview-panel{right:28px;top:118px;}
      }
      @media(max-width:760px){
        .fw-post-preview-modal.show{display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(6,8,6,.68);pointer-events:auto;}
        .fw-post-preview-panel{position:relative;right:auto;top:auto;width:100%;max-height:86dvh;}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureModal(){
    let modal = $('[data-fw-post-preview-modal]');
    if(modal) return modal;
    modal = document.createElement('div');
    modal.className = 'fw-post-preview-modal';
    modal.dataset.fwPostPreviewModal = '1';
    modal.innerHTML = `
      <section class="fw-post-preview-panel" role="dialog" aria-modal="false" aria-label="帖子详情">
        <header class="fw-post-preview-head">
          <div><small>POST DETAIL</small><h2>帖子详情</h2></div>
          <button class="fw-post-preview-close" type="button" data-fw-post-preview-close>×</button>
        </header>
        <div class="fw-post-preview-body" data-fw-post-preview-body>
          <div class="fw-post-preview-loading">正在读取帖子...</div>
        </div>
        <footer class="fw-post-preview-foot">
          <button class="fw-post-preview-secondary" type="button" data-fw-post-preview-close>关闭</button>
          <button class="fw-post-preview-primary" type="button" data-fw-post-preview-origin>去原帖</button>
        </footer>
      </section>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function avatarHtml(name, url){
    if(url) return `<span class="fw-post-preview-avatar"><img src="${esc(url)}" alt="${esc(name)}"></span>`;
    return `<span class="fw-post-preview-avatar">${esc(ini(name))}</span>`;
  }

  async function loadPost(postId){
    if(!(await waitForDb())) throw new Error('数据库还没准备好。');
    const postRes = await window.fwDb.client
      .from('posts')
      .select('id,user_id,content,status_tag,created_at,profiles(nickname,avatar_url)')
      .eq('id', postId)
      .eq('is_deleted', false)
      .maybeSingle();
    if(postRes.error) throw postRes.error;
    if(!postRes.data) throw new Error('这条帖子不存在或已被删除。');

    const [commentRes, reactionRes] = await Promise.all([
      window.fwDb.client
        .from('comments')
        .select('id,user_id,content,created_at,profiles!comments_user_id_fkey(nickname,avatar_url)')
        .eq('post_id', postId)
        .eq('is_deleted', false)
        .order('created_at', {ascending:true}),
      window.fwDb.client
        .from('reactions')
        .select('type,user_id')
        .eq('post_id', postId)
    ]);

    if(commentRes.error) throw commentRes.error;
    if(reactionRes.error) throw reactionRes.error;

    const counts = {like:0, same:0, tissue:0};
    (reactionRes.data || []).forEach(r => {
      if(r.type === 'like') counts.like += 1;
      if(r.type === 'same') counts.same += 1;
      if(r.type === 'tissue') counts.tissue += 1;
    });

    return {
      post: postRes.data,
      comments: commentRes.data || [],
      counts
    };
  }

  function renderPostDetail(postId, payload){
    const {post, comments, counts} = payload;
    const prof = profileOf(post);
    const authorName = prof.nickname || '匿名研究员';
    const authorAvatar = prof.avatar_url || '';
    const commentHtml = comments.length
      ? comments.map(c => {
        const cp = profileOf(c);
        return `<div class="fw-post-preview-comment"><b>${esc(cp.nickname || '匿名回声')}</b><span>${esc(c.content || '')}</span></div>`;
      }).join('')
      : '<div class="fw-post-preview-empty">暂时没有评论。</div>';

    return `
      <div class="fw-post-preview-author">
        ${avatarHtml(authorName, authorAvatar)}
        <div>
          <div class="fw-post-preview-name">${esc(authorName)}</div>
          <div class="fw-post-preview-time">${esc(timeText(post.created_at))}</div>
        </div>
        <span class="fw-post-preview-status">${esc(post.status_tag || '今日无效')}</span>
      </div>

      <div class="fw-post-preview-content">${esc(post.content || '')}</div>

      <div class="fw-post-preview-counts">
        <button type="button" data-fw-post-preview-react="like">点赞 ${counts.like || 0}</button>
        <span>评论 ${comments.length || 0}</span>
        <button type="button" data-fw-post-preview-react="same">俺也一样 ${counts.same || 0}</button>
        <button type="button" data-fw-post-preview-react="tissue">递纸巾 ${counts.tissue || 0}</button>
      </div>

      <section class="fw-post-preview-comments">
        <h3>评论列表</h3>
        ${commentHtml}
      </section>
    `;
  }

  async function openPreview(postId){
    const modal = ensureModal();
    const body = modal.querySelector('[data-fw-post-preview-body]');
    modal.dataset.postId = String(postId || '');
    modal.classList.add('show');
    body.innerHTML = '<div class="fw-post-preview-loading">正在读取帖子...</div>';

    try{
      const payload = await loadPost(postId);
      body.innerHTML = renderPostDetail(postId, payload);
    }catch(e){
      body.innerHTML = `<div class="fw-post-preview-empty">${esc(e.message || '帖子读取失败。')}</div>`;
    }
  }

  function closePreview(){
    $('[data-fw-post-preview-modal]')?.classList.remove('show');
  }

  function goOrigin(postId, comments){
    const path = window.location.pathname.split('/').pop() || 'index.html';
    if(path !== 'square.html'){
      window.location.href = `square.html?post=${encodeURIComponent(postId)}${comments ? '&comments=1' : ''}`;
      return;
    }
    const safeId = window.CSS && CSS.escape ? CSS.escape(String(postId)) : String(postId).replace(/"/g,'\\"');
    const card = document.querySelector(`.post-card[data-id="${safeId}"]`);
    if(card){
      card.scrollIntoView({behavior:'smooth', block:'center'});
      card.classList.add('fw-dual-post-focus');
      if(comments) card.querySelector('.comment-box')?.classList.add('show');
      setTimeout(() => card.classList.remove('fw-dual-post-focus'), 2600);
    }else{
      window.location.href = `square.html?post=${encodeURIComponent(postId)}${comments ? '&comments=1' : ''}`;
    }
  }

  async function react(postId, type, btn){
    const me = await getMe();
    if(!me?.id){
      $('[data-fw-open], [data-login-cta], [data-sb-open]')?.click();
      return;
    }
    if(btn){ btn.disabled = true; }
    try{
      await window.fwDb.react({postId, type});
      await openPreview(postId);
      toast('已互动。');
    }catch(e){
      toast(e.message || '互动失败。');
    }finally{
      if(btn){ btn.disabled = false; }
    }
  }

  function bind(){
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-fw-stable-post]');
      if(btn){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        openPreview(btn.dataset.fwStablePost);
        return;
      }

      if(e.target.closest('[data-fw-post-preview-close]')){
        e.preventDefault();
        e.stopPropagation();
        closePreview();
        return;
      }

      const origin = e.target.closest('[data-fw-post-preview-origin]');
      if(origin){
        e.preventDefault();
        e.stopPropagation();
        const modal = $('[data-fw-post-preview-modal]');
        if(modal?.dataset.postId) goOrigin(modal.dataset.postId, true);
        return;
      }

      const reactBtn = e.target.closest('[data-fw-post-preview-react]');
      if(reactBtn){
        e.preventDefault();
        e.stopPropagation();
        const modal = $('[data-fw-post-preview-modal]');
        const postId = modal?.dataset.postId;
        if(postId) react(postId, reactBtn.dataset.fwPostPreviewReact, reactBtn);
        return;
      }

      if(e.target.matches('[data-fw-post-preview-modal]')){
        closePreview();
      }
    }, true);

    document.addEventListener('keydown', e => {
      if(e.key === 'Escape' && $('[data-fw-post-preview-modal].show')){
        closePreview();
      }
    });
  }

  function boot(){
    injectStyle();
    bind();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
