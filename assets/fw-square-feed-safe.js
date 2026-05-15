// F.w 研究所：精神广场稳定控制器
// 目的：恢复精神广场远程帖子读取、发布、点赞/评论/俺也一样/递纸巾，并安全显示完整时间与媒体。
(function(){
  if(window.__FW_SQUARE_FEED_SAFE__) return;
  window.__FW_SQUARE_FEED_SAFE__ = true;

  var STORE_KEY = window.STORE_KEY || 'fw_lab_posts_v1';
  var lastLoadedAt = 0;
  var loading = false;

  function $(s, root){ return (root || document).querySelector(s); }
  function $$(s, root){ return Array.from((root || document).querySelectorAll(s)); }
  function db(){ return window.fwDb; }
  function on(){ return !!(db() && db().enabled && db().client); }

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function toast(msg){
    var t = $('.fw-toast');
    if(!t){ t = document.createElement('div'); t.className = 'fw-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwSquareFeedSafeToast);
    window.__fwSquareFeedSafeToast = setTimeout(function(){ t.classList.remove('show'); }, 2600);
  }

  function profileOf(row){
    return Array.isArray(row && row.profiles) ? (row.profiles[0] || {}) : ((row && row.profiles) || {});
  }

  function exactTime(v){
    if(!v) return '';
    var d = new Date(v);
    if(isNaN(d.getTime())) return '';
    var pad = function(n){ return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function relativeTime(v){
    if(!v) return '刚刚';
    var d = new Date(v);
    if(isNaN(d.getTime())) return '刚刚';
    var m = Math.floor(Math.max(0, Date.now() - d.getTime()) / 60000);
    if(m < 1) return '刚刚';
    if(m < 60) return m + '分钟前';
    var h = Math.floor(m / 60);
    if(h < 24) return h + '小时前';
    var days = Math.floor(h / 24);
    return days < 7 ? days + '天前' : exactTime(v).slice(5);
  }

  function showTime(createdAt, fallback){
    var ex = exactTime(createdAt);
    var rel = fallback || relativeTime(createdAt);
    return ex ? rel + ' · ' + ex : (rel || '刚刚');
  }

  function initials(v){ return String(v || 'FW').trim().slice(0, 2).toUpperCase(); }
  function avatar(name, url, cls){
    cls = cls || '';
    if(url) return '<span class="fw-avatar ' + esc(cls) + '"><img src="' + esc(url) + '" alt="' + esc(name || '研究员') + '"></span>';
    return '<span class="fw-avatar ' + esc(cls) + '">' + esc(initials(name)) + '</span>';
  }

  function decodeMarkerText(s){
    try{ return atob(String(s || '')); }catch(e){ return ''; }
  }

  function markerAt(text, index){
    var specs = [
      ['[[FW_USER_STICKER:', 'sticker'],
      ['[[FW_MEDIA_IMAGE:', 'image'],
      ['[[FW_MEDIA_VIDEO:', 'video']]
    ];
    for(var i = 0; i < specs.length; i += 1){
      var prefix = specs[i][0];
      if(text.indexOf(prefix, index) !== index) continue;
      var start = index + prefix.length;
      var end = text.indexOf(']]', start);
      if(end < 0) return null;
      var url = decodeMarkerText(text.slice(start, end));
      if(!/^https?:\/\//i.test(url)) return null;
      return {kind:specs[i][1], url:url, end:end + 2};
    }
    return null;
  }

  function splitContent(text){
    text = String(text || '');
    var html = '';
    var media = [];
    var i = 0;
    while(i < text.length){
      var next = text.indexOf('[[FW_', i);
      if(next < 0){ html += esc(text.slice(i)); break; }
      html += esc(text.slice(i, next));
      var m = markerAt(text, next);
      if(!m){ html += esc(text.slice(next, next + 5)); i = next + 5; continue; }
      if(m.kind === 'sticker'){
        media.push('<span class="fw-post-stable-sticker"><img src="' + esc(m.url) + '" alt="表情"></span>');
      }else if(m.kind === 'video'){
        media.push('<span class="fw-post-stable-media"><video src="' + esc(m.url) + '" controls playsinline preload="metadata"></video></span>');
      }else{
        media.push('<a class="fw-post-stable-media" href="' + esc(m.url) + '" target="_blank" rel="noopener"><img src="' + esc(m.url) + '" alt="图片"></a>');
      }
      i = m.end;
    }
    html = html.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return {textHtml:html, mediaHtml:media.join('')};
  }

  function localSave(posts){
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(posts || [])); }catch(e){}
  }

  function localGet(){
    try{ return JSON.parse(localStorage.getItem(STORE_KEY) || '[]') || []; }catch(e){ return []; }
  }

  async function safeSelectPosts(){
    var base = db().client
      .from('posts')
      .select('id,user_id,content,status_tag,created_at,is_deleted,profiles(nickname,avatar_url)')
      .order('created_at', {ascending:false})
      .limit(100);

    var r = await base.or('is_deleted.eq.false,is_deleted.is.null');
    if(!r.error) return r.data || [];

    var msg = String(r.error.message || '');
    if(/is_deleted|schema cache|column/i.test(msg)){
      var r2 = await db().client
        .from('posts')
        .select('id,user_id,content,status_tag,created_at,profiles(nickname,avatar_url)')
        .order('created_at', {ascending:false})
        .limit(100);
      if(r2.error) throw r2.error;
      return r2.data || [];
    }
    throw r.error;
  }

  async function safeSelectComments(ids){
    if(!ids.length) return [];
    var r = await db().client
      .from('comments')
      .select('id,post_id,user_id,content,created_at,is_deleted,profiles(nickname,avatar_url)')
      .in('post_id', ids)
      .or('is_deleted.eq.false,is_deleted.is.null')
      .order('created_at', {ascending:true});

    if(!r.error) return r.data || [];

    var msg = String(r.error.message || '');
    if(/is_deleted|schema cache|column/i.test(msg)){
      var r2 = await db().client
        .from('comments')
        .select('id,post_id,user_id,content,created_at,profiles(nickname,avatar_url)')
        .in('post_id', ids)
        .order('created_at', {ascending:true});
      if(r2.error) throw r2.error;
      return r2.data || [];
    }
    throw r.error;
  }

  async function safeSelectReactions(ids){
    if(!ids.length) return [];
    var r = await db().client.from('reactions').select('post_id,user_id,type').in('post_id', ids);
    if(r.error) throw r.error;
    return r.data || [];
  }

  async function loadRemotePosts(){
    if(!on() || loading) return null;
    loading = true;
    try{
      var posts = await safeSelectPosts();
      posts = (posts || []).filter(function(p){ return p && p.is_deleted !== true; });
      var ids = posts.map(function(p){ return p.id; });
      var comments = await safeSelectComments(ids).catch(function(e){ console.warn('[FW square feed] comments skipped', e); return []; });
      comments = (comments || []).filter(function(c){ return c && c.is_deleted !== true; });
      var reactions = await safeSelectReactions(ids).catch(function(e){ console.warn('[FW square feed] reactions skipped', e); return []; });

      var commentMap = {};
      comments.forEach(function(c){
        var p = profileOf(c);
        (commentMap[c.post_id] = commentMap[c.post_id] || []).push({
          id:c.id,
          userId:c.user_id,
          authorId:c.user_id,
          authorName:p.nickname || '匿名回声',
          authorAvatar:p.avatar_url || '',
          content:c.content || '',
          time:relativeTime(c.created_at),
          createdAt:c.created_at
        });
      });

      var counts = {};
      reactions.forEach(function(r){
        counts[r.post_id] = counts[r.post_id] || {resonance:0, same:0, tissue:0};
        if(r.type === 'like' || r.type === 'resonance') counts[r.post_id].resonance += 1;
        if(r.type === 'same') counts[r.post_id].same += 1;
        if(r.type === 'tissue') counts[r.post_id].tissue += 1;
      });

      var mapped = posts.map(function(p){
        var prof = profileOf(p);
        var c = counts[p.id] || {resonance:0, same:0, tissue:0};
        return {
          id:p.id,
          userId:p.user_id,
          authorId:p.user_id,
          authorName:prof.nickname || '匿名研究员',
          authorAvatar:prof.avatar_url || '',
          status:p.status_tag || '今日无效',
          content:p.content || '',
          time:relativeTime(p.created_at),
          createdAt:p.created_at,
          resonance:c.resonance,
          same:c.same,
          tissue:c.tissue,
          comments:commentMap[p.id] || []
        };
      });

      localSave(mapped);
      lastLoadedAt = Date.now();
      renderFeedsSafe();
      return mapped;
    }finally{
      loading = false;
    }
  }

  function commentHtml(c){
    var parsed = splitContent(c && c.content || '');
    return '<li class="fw-square-comment" data-comment-id="' + esc(c.id || '') + '">'
      + avatar(c.authorName || '匿名回声', c.authorAvatar || '', 'mini')
      + '<div class="fw-square-comment-main"><div class="fw-square-comment-meta">' + esc(c.authorName || '匿名回声') + ' · ' + esc(showTime(c.createdAt, c.time)) + '</div>'
      + '<div class="fw-square-comment-text">' + (parsed.textHtml || ' ') + '</div>'
      + (parsed.mediaHtml ? '<div class="fw-comment-media-list">' + parsed.mediaHtml + '</div>' : '')
      + '</div></li>';
  }

  function renderPostSafe(p){
    p = p || {};
    var parsed = splitContent(p.content || '');
    var comments = (p.comments || []).map(commentHtml).join('');
    return '<article class="post-card" data-id="' + esc(p.id) + '" data-status="' + esc(p.status || '') + '">'
      + '<div class="post-top"><span class="status">' + esc(p.status || '今日无效') + '</span><span class="time">' + esc(showTime(p.createdAt, p.time || '刚刚')) + '</span></div>'
      + '<p class="fw-author">' + avatar(p.authorName || '匿名研究员', p.authorAvatar || '', 'mini') + '<span>' + esc(p.authorName || '匿名研究员') + '</span></p>'
      + '<p class="post-content fw-post-content-stable">' + (parsed.textHtml || '&nbsp;') + '</p>'
      + (parsed.mediaHtml ? '<div class="fw-post-media-list">' + parsed.mediaHtml + '</div>' : '')
      + '<div class="interactions"><button type="button" data-sb-action="resonance">点赞 ' + esc(p.resonance || 0) + '</button><button type="button" data-sb-action="comment-toggle">评论 ' + esc((p.comments || []).length) + '</button><button type="button" data-sb-action="same">俺也一样 ' + esc(p.same || 0) + '</button><button type="button" data-sb-action="tissue">递纸巾 ' + esc(p.tissue || 0) + '</button></div>'
      + '<div class="comment-box"><ul class="comment-list">' + (comments || '<li class="fw-comment-empty"><span>还没有回声，可以先留一句。</span></li>') + '</ul><input placeholder="留一句回声，评论不限量" /><button class="btn dark full" type="button" data-sb-action="comment-submit" style="margin-top:10px">发送回声</button></div>'
      + '</article>';
  }

  function renderFeedsSafe(){
    var containers = $$('[data-feed]');
    if(!containers.length) return;
    var posts = localGet();
    containers.forEach(function(container){
      var limit = Number(container.dataset.limit || posts.length || 100);
      var active = $('.chip.filter.active') && $('.chip.filter.active').dataset.filter || '全部';
      var list = posts.slice();
      if(container.dataset.filterable === 'true' && active !== '全部'){
        list = list.filter(function(p){ return p.status === active || String(p.content || '').indexOf(active) >= 0; });
      }
      container.innerHTML = !list.length
        ? '<div class="empty">暂时没有这个状态的牢骚。可以先投递一条。</div>'
        : list.slice(0, limit).map(renderPostSafe).join('');
    });
  }

  async function currentUser(){
    if(!on()) return null;
    try{ return await db().getCurrentUser(); }catch(e){ return null; }
  }

  async function safeCreatePost(content, status){
    var u = await currentUser();
    if(!u || !u.id) throw new Error('请先登录。');
    if(u.disabled) throw new Error('这个账号已被停用。');
    if(u.muted_until && new Date(u.muted_until).getTime() > Date.now()) throw new Error('这个账号正在禁言中。');
    var row = {user_id:u.id, content:String(content || '').trim(), status_tag:status || '今日无效', is_deleted:false};
    var r = await db().client.from('posts').insert(row).select('id').single();
    if(r.error && /is_deleted|schema cache|column/i.test(String(r.error.message || ''))){
      delete row.is_deleted;
      r = await db().client.from('posts').insert(row).select('id').single();
    }
    if(r.error) throw r.error;
    return r.data;
  }

  async function safeCreateComment(postId, content){
    var u = await currentUser();
    if(!u || !u.id) throw new Error('请先登录。');
    if(u.disabled) throw new Error('这个账号已被停用。');
    if(u.muted_until && new Date(u.muted_until).getTime() > Date.now()) throw new Error('这个账号正在禁言中。');
    var row = {post_id:postId, user_id:u.id, content:String(content || '').trim(), is_deleted:false};
    var r = await db().client.from('comments').insert(row).select('id').single();
    if(r.error && /is_deleted|schema cache|column/i.test(String(r.error.message || ''))){
      delete row.is_deleted;
      r = await db().client.from('comments').insert(row).select('id').single();
    }
    if(r.error) throw r.error;
    return r.data;
  }

  async function safeReact(postId, type){
    var u = await currentUser();
    if(!u || !u.id) throw new Error('请先登录。');
    if(u.disabled) throw new Error('这个账号已被停用。');
    var map = {resonance:'like', like:'like', same:'same', tissue:'tissue'};
    var r = await db().client.from('reactions').insert({post_id:postId, user_id:u.id, type:map[type] || type});
    if(r.error){
      if(r.error.code === '23505' || /duplicate/i.test(String(r.error.message || ''))) return {already:true};
      throw r.error;
    }
    return {ok:true};
  }

  function appendPendingMedia(host){
    if(!host || !host.dataset.fwPendingMedia) return;
    var input = host.matches('[data-post-form]') ? host.querySelector('textarea') : host.querySelector('.comment-box input, input');
    if(!input) return;
    var marker = host.dataset.fwPendingMedia;
    if(String(input.value || '').indexOf(marker) >= 0) return;
    input.value = String(input.value || '').trim()
      ? String(input.value || '').replace(/\s*$/, '') + '\n' + marker
      : marker;
    input.dispatchEvent(new Event('input', {bubbles:true}));
  }

  function openLogin(){
    var opener = $('[data-fw-open], [data-login-cta]');
    if(opener) opener.click();
  }

  function friendlyError(e){
    var msg = String(e && e.message || e || '操作失败。');
    if(/row-level security|permission|policy|denied/i.test(msg)) return '权限配置异常，请检查 Supabase RLS/SQL。';
    if(/duplicate/i.test(msg)) return '你已经表达过了。';
    return msg;
  }

  function bind(){
    document.addEventListener('submit', async function(e){
      var form = e.target.closest && e.target.closest('[data-post-form]');
      if(!form || !on()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      try{
        appendPendingMedia(form);
        var u = await currentUser();
        if(!u){ toast('请先登录再发布。'); openLogin(); return; }
        var textarea = form.querySelector('textarea');
        var content = String(textarea && textarea.value || '').trim();
        if(!content){ if(textarea) textarea.focus(); return; }
        var active = form.querySelector('.chip.active[data-status]');
        var status = active && active.dataset.status || '今日无效';
        await safeCreatePost(content, status);
        if(textarea) textarea.value = '';
        if(form.dataset){ delete form.dataset.fwPendingMedia; delete form.dataset.fwPendingKind; delete form.dataset.fwPendingUrl; }
        var preview = form.querySelector('[data-fw-post-media-preview]');
        if(preview){ preview.classList.remove('show'); preview.innerHTML = ''; }
        toast('已投递到研究所。');
        await loadRemotePosts();
      }catch(err){ toast(friendlyError(err)); }
    }, true);

    document.addEventListener('click', async function(e){
      var btn = e.target.closest && e.target.closest('button[data-sb-action],button[data-action]');
      if(!btn || !on()) return;
      var card = btn.closest('.post-card');
      if(!card) return;
      var action = btn.dataset.sbAction || btn.dataset.action;
      if(!/^(resonance|like|same|tissue|comment-toggle|comment-submit)$/.test(action || '')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      try{
        var u = await currentUser();
        if(!u){ toast('请先登录再互动。'); openLogin(); return; }
        var postId = card.dataset.id;
        if(action === 'comment-toggle'){
          var box = card.querySelector('.comment-box');
          if(box) box.classList.toggle('show');
          return;
        }
        if(action === 'comment-submit'){
          var commentBox = btn.closest('.comment-box');
          appendPendingMedia(commentBox);
          var input = commentBox && commentBox.querySelector('input');
          var content = String(input && input.value || '').trim();
          if(!content){ if(input) input.focus(); return; }
          await safeCreateComment(postId, content);
          if(input) input.value = '';
          if(commentBox && commentBox.dataset){ delete commentBox.dataset.fwPendingMedia; delete commentBox.dataset.fwPendingKind; delete commentBox.dataset.fwPendingUrl; }
          var preview = commentBox && commentBox.querySelector('[data-fw-post-media-preview]');
          if(preview){ preview.classList.remove('show'); preview.innerHTML = ''; }
          toast('回声已发送。');
          await loadRemotePosts();
          return;
        }
        var r = await safeReact(postId, action);
        toast(r && r.already ? '你已经表达过了。' : '已收到。');
        await loadRemotePosts();
      }catch(err){ toast(friendlyError(err)); }
    }, true);

    document.addEventListener('click', function(e){
      var f = e.target.closest && e.target.closest('.chip.filter');
      if(f) setTimeout(renderFeedsSafe, 0);
    }, true);
  }

  function injectStyle(){
    if($('#fw-square-feed-safe-style')) return;
    var s = document.createElement('style');
    s.id = 'fw-square-feed-safe-style';
    s.textContent = '.fw-post-content-stable{white-space:pre-wrap}.post-top .time{font-size:12px;opacity:.86;text-align:right}.fw-post-media-list{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;margin:14px 0 0}.fw-post-stable-media{display:inline-block;max-width:300px;line-height:0}.fw-post-stable-media img{display:block;max-width:280px;max-height:340px;object-fit:contain;border-radius:12px;border:1px solid rgba(0,0,0,.08);background:#fffdf7}.fw-post-stable-media video{display:block;max-width:300px;max-height:360px;border-radius:12px;background:#111}.fw-post-stable-sticker{display:inline-grid;place-items:center;max-width:150px;max-height:150px}.fw-post-stable-sticker img{display:block;max-width:144px;max-height:144px;object-fit:contain;border-radius:10px;background:transparent}.fw-square-comment{list-style:none;display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;margin:10px 0;align-items:start}.fw-square-comment-meta{font-size:12px;color:#9d4a4a;font-weight:950}.fw-square-comment-text{font-size:14px;font-weight:850;white-space:pre-wrap;word-break:break-word}.fw-comment-media-list{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 0}.fw-comment-media-list .fw-post-stable-media img{max-width:180px;max-height:220px}.fw-comment-media-list .fw-post-stable-sticker img{max-width:100px;max-height:100px}.fw-comment-empty{list-style:none;color:#77736b;font-weight:850;font-size:13px}@media(max-width:760px){.post-top .time{font-size:11px}.fw-post-stable-media img{max-width:220px;max-height:280px}.fw-post-stable-media video{max-width:230px;max-height:300px}.fw-post-media-list{margin-top:10px}}';
    document.head.appendChild(s);
  }

  function waitForDbAndLoad(){
    var n = 0;
    var timer = setInterval(function(){
      n += 1;
      if(on()){
        clearInterval(timer);
        loadRemotePosts().catch(function(e){ console.warn('[FW square feed] initial load failed', e); });
      }
      if(n > 120) clearInterval(timer);
    }, 120);
  }

  function boot(){
    injectStyle();
    window.renderPost = renderPostSafe;
    window.renderFeeds = renderFeedsSafe;
    bind();
    renderFeedsSafe();
    waitForDbAndLoad();
    setInterval(function(){
      if(on() && Date.now() - lastLoadedAt > 12000){
        loadRemotePosts().catch(function(e){ console.warn('[FW square feed] periodic load failed', e); });
      }
    }, 6000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
