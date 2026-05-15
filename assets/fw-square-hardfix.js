// F.w 研究所：精神广场最终修复层 v1
// 目标：绕开 supabase-auth-clean 旧渲染/旧点击逻辑，恢复前台帖子读取、时间、评论展开和互动。
(function(){
  if(window.__FW_SQUARE_HARDFIX_V1__) return;
  window.__FW_SQUARE_HARDFIX_V1__ = true;

  var STORE_KEY = 'fw_lab_posts_v1';
  var loading = false;
  var lastSync = 0;
  var bound = false;

  function $(s, root){ return (root || document).querySelector(s); }
  function $$(s, root){ return Array.from((root || document).querySelectorAll(s)); }
  function hasSquare(){ return !!$('[data-feed]') && !!$('[data-post-form]'); }
  function db(){ return window.fwDb; }
  function dbReady(){ return !!(db() && db().enabled && db().client); }

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function toast(msg){
    var t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwSquareHardfixToast);
    window.__fwSquareHardfixToast = setTimeout(function(){ t.classList.remove('show'); }, 2800);
  }

  function waitForDb(){
    return new Promise(function(resolve){
      if(dbReady()) return resolve(true);
      var n = 0;
      var timer = setInterval(function(){
        n += 1;
        if(dbReady()){
          clearInterval(timer);
          resolve(true);
        }
        if(n > 120){
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  async function currentUser(){
    if(!(await waitForDb())) return null;
    try{ return await db().getCurrentUser(); }catch(e){ return null; }
  }

  function pad(n){ return n < 10 ? '0' + n : String(n); }
  function exactTime(v){
    if(!v) return '';
    var d = new Date(v);
    if(isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function relativeTime(v){
    if(!v) return '刚刚';
    var d = new Date(v);
    if(isNaN(d.getTime())) return '刚刚';
    var min = Math.floor(Math.max(0, Date.now() - d.getTime()) / 60000);
    if(min < 1) return '刚刚';
    if(min < 60) return min + '分钟前';
    var h = Math.floor(min / 60);
    if(h < 24) return h + '小时前';
    var day = Math.floor(h / 24);
    return day < 7 ? day + '天前' : exactTime(v).slice(5);
  }
  function timeLabel(createdAt, fallback){
    var e = exactTime(createdAt);
    return e ? (relativeTime(createdAt) + ' · ' + e) : (fallback || '刚刚');
  }

  function initials(v){ return String(v || 'FW').trim().slice(0,2).toUpperCase(); }
  function avatar(name, url, cls){
    cls = cls || '';
    if(url) return '<span class="fw-avatar ' + esc(cls) + '"><img src="' + esc(url) + '" alt="' + esc(name || '研究员') + '"></span>';
    return '<span class="fw-avatar ' + esc(cls) + '">' + esc(initials(name)) + '</span>';
  }

  function decodeB64(s){ try{ return atob(String(s || '')); }catch(e){ return ''; } }
  function markerAt(text, idx){
    var list = [
      ['[[FW_USER_STICKER:', 'sticker'],
      ['[[FW_MEDIA_IMAGE:', 'image'],
      ['[[FW_MEDIA_VIDEO:', 'video']]
    ];
    for(var i=0;i<list.length;i++){
      var prefix = list[i][0];
      if(text.indexOf(prefix, idx) !== idx) continue;
      var start = idx + prefix.length;
      var end = text.indexOf(']]', start);
      if(end < 0) return null;
      var url = decodeB64(text.slice(start, end));
      if(!/^https?:\/\//i.test(url)) return null;
      return {kind:list[i][1], url:url, end:end+2};
    }
    return null;
  }
  function splitContent(text){
    text = String(text || '');
    var plain = '';
    var media = [];
    var i = 0;
    while(i < text.length){
      var next = text.indexOf('[[FW_', i);
      if(next < 0){ plain += esc(text.slice(i)); break; }
      plain += esc(text.slice(i, next));
      var m = markerAt(text, next);
      if(!m){ plain += esc(text.slice(next, next+5)); i = next + 5; continue; }
      if(m.kind === 'sticker') media.push('<span class="fw-post-stable-sticker"><img src="' + esc(m.url) + '" alt="表情"></span>');
      else if(m.kind === 'video') media.push('<span class="fw-post-stable-media"><video src="' + esc(m.url) + '" controls playsinline preload="metadata"></video></span>');
      else media.push('<a class="fw-post-stable-media" href="' + esc(m.url) + '" target="_blank" rel="noopener"><img src="' + esc(m.url) + '" alt="图片"></a>');
      i = m.end;
    }
    plain = plain.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
    return {textHtml:plain, mediaHtml:media.join('')};
  }

  function saveLocal(posts){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(posts || [])); }catch(e){} }
  function getLocal(){ try{ return JSON.parse(localStorage.getItem(STORE_KEY) || '[]') || []; }catch(e){ return []; } }

  async function selectRows(table, columns, orderCol, limit){
    var q = db().client.from(table).select(columns);
    if(table === 'posts' || table === 'comments') q = q.or('is_deleted.eq.false,is_deleted.is.null');
    if(orderCol) q = q.order(orderCol, {ascending:false});
    if(limit) q = q.limit(limit);
    var r = await q;
    if(!r.error) return r.data || [];

    // 兼容旧表没有 is_deleted / 关系缓存未刷新等情况。
    var msg = String(r.error.message || '');
    if(/is_deleted|schema cache|column/i.test(msg)){
      var q2 = db().client.from(table).select(columns.replace(/,?is_deleted/g, ''));
      if(orderCol) q2 = q2.order(orderCol, {ascending:false});
      if(limit) q2 = q2.limit(limit);
      var r2 = await q2;
      if(r2.error) throw r2.error;
      return r2.data || [];
    }
    throw r.error;
  }

  async function fetchProfiles(userIds){
    var ids = Array.from(new Set((userIds || []).filter(Boolean)));
    if(!ids.length) return {};
    var r = await db().client.from('profiles').select('id,nickname,avatar_url').in('id', ids);
    if(r.error) return {};
    var map = {};
    (r.data || []).forEach(function(p){ map[p.id] = p; });
    return map;
  }

  async function loadPostsRemote(){
    if(!hasSquare() || loading) return;
    var ok = await waitForDb();
    if(!ok) return;
    loading = true;
    try{
      var posts = await selectRows('posts', 'id,user_id,content,status_tag,created_at,is_deleted', 'created_at', 100);
      posts = (posts || []).filter(function(p){ return p && p.is_deleted !== true; });
      var postIds = posts.map(function(p){ return p.id; });

      var comments = [];
      if(postIds.length){
        var cr = await db().client.from('comments').select('id,post_id,user_id,content,created_at,is_deleted').in('post_id', postIds).or('is_deleted.eq.false,is_deleted.is.null').order('created_at', {ascending:true});
        if(cr.error && /is_deleted|schema cache|column/i.test(String(cr.error.message || ''))){
          cr = await db().client.from('comments').select('id,post_id,user_id,content,created_at').in('post_id', postIds).order('created_at', {ascending:true});
        }
        if(!cr.error) comments = cr.data || [];
      }
      comments = comments.filter(function(c){ return c && c.is_deleted !== true; });

      var reactions = [];
      if(postIds.length){
        var rr = await db().client.from('reactions').select('post_id,user_id,type').in('post_id', postIds);
        if(!rr.error) reactions = rr.data || [];
      }

      var allUserIds = posts.map(function(p){ return p.user_id; }).concat(comments.map(function(c){ return c.user_id; }));
      var profiles = await fetchProfiles(allUserIds);

      var cMap = {};
      comments.forEach(function(c){
        var p = profiles[c.user_id] || {};
        (cMap[c.post_id] = cMap[c.post_id] || []).push({
          id:c.id,
          userId:c.user_id,
          authorName:p.nickname || '匿名回声',
          authorAvatar:p.avatar_url || '',
          content:c.content || '',
          createdAt:c.created_at,
          time:relativeTime(c.created_at)
        });
      });

      var counts = {};
      reactions.forEach(function(r){
        counts[r.post_id] = counts[r.post_id] || {resonance:0,same:0,tissue:0};
        if(r.type === 'like' || r.type === 'resonance') counts[r.post_id].resonance += 1;
        if(r.type === 'same') counts[r.post_id].same += 1;
        if(r.type === 'tissue') counts[r.post_id].tissue += 1;
      });

      var mapped = posts.map(function(p){
        var prof = profiles[p.user_id] || {};
        var cnt = counts[p.id] || {resonance:0,same:0,tissue:0};
        return {
          id:p.id,
          userId:p.user_id,
          authorName:prof.nickname || '匿名研究员',
          authorAvatar:prof.avatar_url || '',
          status:p.status_tag || '今日无效',
          content:p.content || '',
          createdAt:p.created_at,
          time:relativeTime(p.created_at),
          resonance:cnt.resonance,
          same:cnt.same,
          tissue:cnt.tissue,
          comments:cMap[p.id] || []
        };
      });

      saveLocal(mapped);
      lastSync = Date.now();
      renderFeedsHard();
    }catch(e){
      console.warn('[FW square hardfix] load failed', e);
      toast('帖子读取失败：' + (e.message || e));
    }finally{
      loading = false;
    }
  }

  function commentHtml(c){
    var parsed = splitContent(c.content || '');
    return '<li class="fw-square-comment" data-comment-id="' + esc(c.id || '') + '">' +
      avatar(c.authorName || '匿名回声', c.authorAvatar || '', 'mini') +
      '<div class="fw-square-comment-main"><div class="fw-square-comment-meta">' + esc(c.authorName || '匿名回声') + ' · ' + esc(timeLabel(c.createdAt, c.time)) + '</div>' +
      '<div class="fw-square-comment-text">' + (parsed.textHtml || ' ') + '</div>' +
      (parsed.mediaHtml ? '<div class="fw-comment-media-list">' + parsed.mediaHtml + '</div>' : '') +
      '</div></li>';
  }

  function renderPostHard(p){
    p = p || {};
    var parsed = splitContent(p.content || '');
    var comments = (p.comments || []).map(commentHtml).join('');
    return '<article class="post-card" data-id="' + esc(p.id) + '" data-status="' + esc(p.status || '') + '">' +
      '<div class="post-top"><span class="status">' + esc(p.status || '今日无效') + '</span><span class="time">' + esc(timeLabel(p.createdAt, p.time)) + '</span></div>' +
      '<p class="fw-author">' + avatar(p.authorName || '匿名研究员', p.authorAvatar || '', 'mini') + '<span>' + esc(p.authorName || '匿名研究员') + '</span></p>' +
      '<p class="post-content fw-post-content-stable">' + (parsed.textHtml || '&nbsp;') + '</p>' +
      (parsed.mediaHtml ? '<div class="fw-post-media-list">' + parsed.mediaHtml + '</div>' : '') +
      '<div class="interactions"><button type="button" data-sb-action="resonance">点赞 ' + esc(p.resonance || 0) + '</button><button type="button" data-sb-action="comment-toggle">评论 ' + esc((p.comments || []).length) + '</button><button type="button" data-sb-action="same">俺也一样 ' + esc(p.same || 0) + '</button><button type="button" data-sb-action="tissue">递纸巾 ' + esc(p.tissue || 0) + '</button></div>' +
      '<div class="comment-box"><ul class="comment-list">' + (comments || '<li class="fw-comment-empty"><span>还没有回声，可以先留一句。</span></li>') + '</ul><input placeholder="留一句回声，评论不限量" /><button class="btn dark full" type="button" data-sb-action="comment-submit" style="margin-top:10px">发送回声</button></div>' +
      '</article>';
  }

  function renderFeedsHard(){
    var boxes = $$('[data-feed]');
    if(!boxes.length) return;
    var posts = getLocal();
    boxes.forEach(function(box){
      var list = posts.slice();
      var active = $('.chip.filter.active') && $('.chip.filter.active').dataset.filter || '全部';
      if(box.dataset.filterable === 'true' && active !== '全部'){
        list = list.filter(function(p){ return p.status === active || String(p.content || '').indexOf(active) >= 0; });
      }
      var limit = Number(box.dataset.limit || list.length || 100);
      box.innerHTML = list.length ? list.slice(0, limit).map(renderPostHard).join('') : '<div class="empty">暂时没有这个状态的牢骚。可以先投递一条。</div>';
    });
  }

  function appendPendingMedia(host){
    if(!host || !host.dataset || !host.dataset.fwPendingMedia) return;
    var input = host.matches && host.matches('[data-post-form]') ? host.querySelector('textarea') : host.querySelector('input');
    if(!input) return;
    var marker = host.dataset.fwPendingMedia;
    if(String(input.value || '').indexOf(marker) >= 0) return;
    input.value = String(input.value || '').trim() ? String(input.value || '').replace(/\s*$/, '') + '\n' + marker : marker;
  }

  async function insertPost(form){
    var user = await currentUser();
    if(!user || !user.id){ toast('请先登录再发布。'); $('[data-fw-open], [data-login-cta]')?.click(); return; }
    appendPendingMedia(form);
    var textarea = form.querySelector('textarea');
    var content = String(textarea && textarea.value || '').trim();
    if(!content){ if(textarea) textarea.focus(); return; }
    var active = form.querySelector('.chip.active[data-status]');
    var row = {
      user_id:user.id,
      content:content,
      status_tag:(active && active.dataset.status) || '今日无效',
      is_deleted:false
    };
    var r = await db().client.from('posts').insert(row).select('id').single();
    if(r.error && /is_deleted|schema cache|column/i.test(String(r.error.message || ''))){
      delete row.is_deleted;
      r = await db().client.from('posts').insert(row).select('id').single();
    }
    if(r.error) throw r.error;
    if(textarea) textarea.value = '';
    if(form.dataset){ delete form.dataset.fwPendingMedia; delete form.dataset.fwPendingKind; delete form.dataset.fwPendingUrl; }
    var preview = form.querySelector('[data-fw-post-media-preview]');
    if(preview){ preview.classList.remove('show'); preview.innerHTML = ''; }
    toast('已投递到研究所。');
    await loadPostsRemote();
  }

  async function insertComment(card, box){
    var user = await currentUser();
    if(!user || !user.id){ toast('请先登录再评论。'); $('[data-fw-open], [data-login-cta]')?.click(); return; }
    appendPendingMedia(box);
    var input = box.querySelector('input');
    var content = String(input && input.value || '').trim();
    if(!content){ if(input) input.focus(); return; }
    var row = {post_id:card.dataset.id, user_id:user.id, content:content, is_deleted:false};
    var r = await db().client.from('comments').insert(row).select('id').single();
    if(r.error && /is_deleted|schema cache|column/i.test(String(r.error.message || ''))){
      delete row.is_deleted;
      r = await db().client.from('comments').insert(row).select('id').single();
    }
    if(r.error) throw r.error;
    if(input) input.value = '';
    if(box.dataset){ delete box.dataset.fwPendingMedia; delete box.dataset.fwPendingKind; delete box.dataset.fwPendingUrl; }
    var preview = box.querySelector('[data-fw-post-media-preview]');
    if(preview){ preview.classList.remove('show'); preview.innerHTML = ''; }
    toast('回声已发送。');
    await loadPostsRemote();
  }

  async function react(card, action){
    var user = await currentUser();
    if(!user || !user.id){ toast('请先登录再互动。'); $('[data-fw-open], [data-login-cta]')?.click(); return; }
    var map = {resonance:'like', same:'same', tissue:'tissue', like:'like'};
    var r = await db().client.from('reactions').insert({post_id:card.dataset.id, user_id:user.id, type:map[action] || action});
    if(r.error){
      if(r.error.code === '23505' || /duplicate/i.test(String(r.error.message || ''))){ toast('你已经表达过了。'); return; }
      throw r.error;
    }
    toast('已收到。');
    await loadPostsRemote();
  }

  function bind(){
    if(bound) return;
    bound = true;

    window.addEventListener('submit', function(e){
      var form = e.target && e.target.closest && e.target.closest('[data-post-form]');
      if(!form || !hasSquare()) return;
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      insertPost(form).catch(function(err){ toast(err.message || '发布失败。'); });
    }, true);

    window.addEventListener('click', function(e){
      var filter = e.target && e.target.closest && e.target.closest('.chip.filter');
      if(filter){ setTimeout(renderFeedsHard, 0); return; }

      var btn = e.target && e.target.closest && e.target.closest('button[data-sb-action],button[data-action]');
      if(!btn || !hasSquare()) return;
      var card = btn.closest('.post-card');
      if(!card) return;
      var action = btn.dataset.sbAction || btn.dataset.action;
      if(!/^(resonance|like|same|tissue|comment-toggle|comment-submit)$/.test(action || '')) return;
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();

      if(action === 'comment-toggle'){
        var box = card.querySelector('.comment-box');
        if(box) box.classList.toggle('show');
        return;
      }
      if(action === 'comment-submit'){
        var cbox = btn.closest('.comment-box');
        insertComment(card, cbox).catch(function(err){ toast(err.message || '评论失败。'); });
        return;
      }
      react(card, action).catch(function(err){ toast(err.message || '互动失败。'); });
    }, true);
  }

  function injectStyle(){
    if($('#fw-square-hardfix-style')) return;
    var s = document.createElement('style');
    s.id = 'fw-square-hardfix-style';
    s.textContent = '.fw-post-content-stable{white-space:pre-wrap}.post-top .time{font-size:12px;opacity:.86;text-align:right}.fw-post-media-list{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;margin:14px 0 0}.fw-post-stable-media{display:inline-block;max-width:300px;line-height:0}.fw-post-stable-media img{display:block;max-width:280px;max-height:340px;object-fit:contain;border-radius:12px;border:1px solid rgba(0,0,0,.08);background:#fffdf7}.fw-post-stable-media video{display:block;max-width:300px;max-height:360px;border-radius:12px;background:#111}.fw-post-stable-sticker img{display:block;max-width:144px;max-height:144px;object-fit:contain;border-radius:10px}.fw-square-comment{list-style:none;display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;margin:10px 0;align-items:start}.fw-square-comment-meta{font-size:12px;color:#9d4a4a;font-weight:950}.fw-square-comment-text{font-size:14px;font-weight:850;white-space:pre-wrap;word-break:break-word}.fw-comment-empty{list-style:none;color:#77736b;font-weight:850;font-size:13px}.comment-box.show{display:block!important}';
    document.head.appendChild(s);
  }

  function takeOver(){
    if(!hasSquare()) return;
    window.renderPost = renderPostHard;
    window.renderFeeds = renderFeedsHard;
  }

  function boot(){
    injectStyle();
    bind();
    takeOver();
    renderFeedsHard();
    waitForDb().then(function(ok){ if(ok) loadPostsRemote(); });
    setInterval(function(){
      takeOver();
      if(dbReady() && Date.now() - lastSync > 10000) loadPostsRemote();
    }, 1500);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
