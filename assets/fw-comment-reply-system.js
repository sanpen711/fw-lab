// F.w 研究所：评论回复 / 精确时间 / 回声通知补丁
// 说明：只增强精神广场帖子与评论，不接管私聊、不改电脑端顶部按钮。
(function(){
  if(window.__FW_COMMENT_REPLY_SYSTEM__) return;
  window.__FW_COMMENT_REPLY_SYSTEM__ = true;

  var replyCtx = {};
  var dbPatched = false;
  var renderInstalled = false;

  function $(s, root){ return (root || document).querySelector(s); }
  function $$(s, root){ return Array.from((root || document).querySelectorAll(s)); }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function initials(v){ return String(v || 'FW').trim().slice(0, 2).toUpperCase(); }
  function avatar(name, url, cls){
    cls = cls || '';
    if(url) return '<span class="fw-avatar ' + esc(cls) + '"><img src="' + esc(url) + '" alt="' + esc(name || '研究员') + '"></span>';
    return '<span class="fw-avatar ' + esc(cls) + '">' + esc(initials(name)) + '</span>';
  }
  function toast(msg){
    var t = $('.fw-toast');
    if(!t){ t = document.createElement('div'); t.className = 'fw-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwCommentReplyToast);
    window.__fwCommentReplyToast = setTimeout(function(){ t.classList.remove('show'); }, 2600);
  }
  function fail(r, msg){ if(r && r.error) throw new Error((msg || '操作失败') + '：' + r.error.message); return r ? r.data : null; }
  function profileOf(r){ return Array.isArray(r && r.profiles) ? (r.profiles[0] || {}) : ((r && r.profiles) || {}); }

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
    var m = Math.floor(Math.max(0, Date.now() - d.getTime()) / 60000);
    if(m < 1) return '刚刚';
    if(m < 60) return m + '分钟前';
    var h = Math.floor(m / 60);
    if(h < 24) return h + '小时前';
    var days = Math.floor(h / 24);
    return days < 7 ? days + '天前' : exactTime(v).slice(5);
  }
  function dualTime(v, fallback){
    var ex = exactTime(v);
    var rel = fallback || relativeTime(v);
    return ex ? rel + ' · ' + ex : rel;
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
      if(m.kind === 'sticker') media.push('<span class="fw-post-stable-sticker"><img src="' + esc(m.url) + '" alt="表情"></span>');
      else if(m.kind === 'video') media.push('<span class="fw-post-stable-media"><video src="' + esc(m.url) + '" controls playsinline preload="metadata"></video></span>');
      else media.push('<a class="fw-post-stable-media" href="' + esc(m.url) + '" target="_blank" rel="noopener"><img src="' + esc(m.url) + '" alt="图片"></a>');
      i = m.end;
    }
    html = html.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return {textHtml:html, mediaHtml:media.join('')};
  }

  async function getCurrentUser(){
    if(!window.fwDb || !window.fwDb.getCurrentUser) return null;
    try{ return await window.fwDb.getCurrentUser(); }catch(e){ return null; }
  }

  async function insertNotification(row){
    try{
      if(!window.fwDb || !window.fwDb.client || !row || !row.user_id || !row.actor_id) return;
      if(String(row.user_id) === String(row.actor_id)) return;
      await window.fwDb.client.from('notifications').insert(row);
    }catch(e){
      console.warn('[FW comment reply] notification skipped', e);
    }
  }

  async function loadPostsPatched(){
    var client = window.fwDb.client;
    var posts = fail(
      await client.from('posts').select('id,user_id,content,status_tag,created_at,profiles(nickname,avatar_url)').eq('is_deleted', false).order('created_at', {ascending:false}).limit(100),
      '读取帖子失败'
    ) || [];

    var ids = posts.map(function(p){ return p.id; });
    if(!ids.length) return [];

    var commentsRes = await client
      .from('comments')
      .select('id,post_id,user_id,content,created_at,parent_comment_id,reply_to_user_id,profiles(nickname,avatar_url)')
      .in('post_id', ids)
      .eq('is_deleted', false)
      .order('created_at', {ascending:true});

    var comments;
    if(commentsRes.error && /parent_comment_id|reply_to_user_id|schema cache|column/i.test(String(commentsRes.error.message || ''))){
      comments = fail(
        await client.from('comments').select('id,post_id,user_id,content,created_at,profiles(nickname,avatar_url)').in('post_id', ids).eq('is_deleted', false).order('created_at', {ascending:true}),
        '读取评论失败'
      ) || [];
    }else{
      comments = fail(commentsRes, '读取评论失败') || [];
    }

    var reactions = fail(
      await client.from('reactions').select('post_id,user_id,type').in('post_id', ids),
      '读取互动失败'
    ) || [];

    var cb = {};
    var commentMap = {};
    comments.forEach(function(c){
      var p = profileOf(c);
      commentMap[c.id] = {
        id:c.id,
        postId:c.post_id,
        userId:c.user_id,
        authorId:c.user_id,
        authorName:p.nickname || '匿名回声',
        authorAvatar:p.avatar_url || '',
        content:c.content,
        parentCommentId:c.parent_comment_id || null,
        replyToUserId:c.reply_to_user_id || null,
        time:relativeTime(c.created_at),
        exactTime:exactTime(c.created_at),
        createdAt:c.created_at,
        replies:[]
      };
    });

    Object.keys(commentMap).forEach(function(id){
      var c = commentMap[id];
      if(c.parentCommentId && commentMap[c.parentCommentId]){
        c.replyToName = commentMap[c.parentCommentId].authorName;
        commentMap[c.parentCommentId].replies.push(c);
      }else{
        (cb[c.postId] = cb[c.postId] || []).push(c);
      }
    });

    var counts = {};
    reactions.forEach(function(r){
      counts[r.post_id] = counts[r.post_id] || {resonance:0, same:0, tissue:0};
      if(r.type === 'like') counts[r.post_id].resonance += 1;
      if(r.type === 'same') counts[r.post_id].same += 1;
      if(r.type === 'tissue') counts[r.post_id].tissue += 1;
    });

    return posts.map(function(p){
      var prof = profileOf(p);
      var c = counts[p.id] || {resonance:0, same:0, tissue:0};
      var top = cb[p.id] || [];
      var total = 0;
      top.forEach(function(x){ total += 1 + (x.replies ? x.replies.length : 0); });
      return {
        id:p.id,
        userId:p.user_id,
        authorId:p.user_id,
        authorName:prof.nickname || '匿名研究员',
        authorAvatar:prof.avatar_url || '',
        status:p.status_tag || '今日无效',
        content:p.content,
        time:relativeTime(p.created_at),
        exactTime:exactTime(p.created_at),
        createdAt:p.created_at,
        resonance:c.resonance,
        same:c.same,
        tissue:c.tissue,
        commentCount:total,
        comments:top
      };
    });
  }

  async function createCommentPatched(opts){
    opts = opts || {};
    var client = window.fwDb.client;
    var u = await getCurrentUser();
    if(!u) throw new Error('请先登录。');
    if(u.disabled) throw new Error('这个账号已被停用。');
    if(u.muted_until && new Date(u.muted_until).getTime() > Date.now()) throw new Error('这个账号正在禁言中。');

    var postId = opts.postId;
    var content = String(opts.content || '').trim();
    var ctx = replyCtx[postId] || {};
    var parentCommentId = opts.parentCommentId || ctx.parentCommentId || null;
    var replyToUserId = opts.replyToUserId || ctx.replyToUserId || null;

    var post = null;
    try{
      post = fail(await client.from('posts').select('id,user_id,content').eq('id', postId).maybeSingle(), '读取帖子失败') || null;
    }catch(e){}

    var parent = null;
    if(parentCommentId){
      try{
        parent = fail(await client.from('comments').select('id,user_id,content').eq('id', parentCommentId).maybeSingle(), '读取评论失败') || null;
        replyToUserId = replyToUserId || (parent && parent.user_id) || null;
      }catch(e){}
    }

    var insertRow = {post_id:postId, user_id:u.id, content:content};
    if(parentCommentId) insertRow.parent_comment_id = parentCommentId;
    if(replyToUserId) insertRow.reply_to_user_id = replyToUserId;

    var r = await client.from('comments').insert(insertRow).select('id').single();
    if(r.error && /parent_comment_id|reply_to_user_id|schema cache|column/i.test(String(r.error.message || ''))){
      throw new Error('评论回复字段还没初始化，请先运行 comment-reply-system.sql。');
    }
    var saved = fail(r, '评论失败');

    var excerpt = content.replace(/\s+/g, ' ').slice(0, 80);
    if(parentCommentId && replyToUserId){
      await insertNotification({
        user_id:replyToUserId,
        actor_id:u.id,
        type:'comment_reply',
        target_type:'comment',
        target_id:saved.id,
        content:'回复了你的评论：' + excerpt,
        is_read:false
      });
    }else if(post && post.user_id){
      await insertNotification({
        user_id:post.user_id,
        actor_id:u.id,
        type:'comment',
        target_type:'post',
        target_id:postId,
        content:'评论了你的帖子：' + excerpt,
        is_read:false
      });
    }

    delete replyCtx[postId];
    return saved;
  }

  function patchDb(){
    if(dbPatched || !window.fwDb || !window.fwDb.client) return;
    window.fwDb.loadPosts = loadPostsPatched;
    window.fwDb.createComment = createCommentPatched;
    dbPatched = true;
  }

  function commentActionsHtml(c, me){
    var canDelete = me && (me.isAdmin || String(me.id) === String(c.userId));
    return '<div class="fw-comment-actions"><button type="button" data-fw-reply-comment="' + esc(c.id) + '" data-fw-reply-user="' + esc(c.userId || '') + '" data-fw-reply-name="' + esc(c.authorName || '匿名回声') + '">回复</button>' + (canDelete ? '<button type="button" data-fw-delete-comment="' + esc(c.id) + '">删除</button>' : '') + '</div>';
  }
  function commentHtml(c, me, isReply){
    var parsed = splitContent(c.content || '');
    var meta = (c.authorName || '匿名回声') + ' · ' + dualTime(c.createdAt, c.time);
    if(isReply && c.replyToName) meta = (c.authorName || '匿名回声') + ' 回复 ' + c.replyToName + ' · ' + dualTime(c.createdAt, c.time);
    return '<li class="fw-comment-item ' + (isReply ? 'is-reply' : '') + '" data-comment-id="' + esc(c.id) + '" data-comment-user="' + esc(c.userId || '') + '">'
      + avatar(c.authorName, c.authorAvatar, 'mini')
      + '<div class="fw-comment-main"><div class="fw-comment-meta">' + esc(meta) + '</div>'
      + '<div class="fw-comment-text">' + (parsed.textHtml || ' ') + '</div>'
      + (parsed.mediaHtml ? '<div class="fw-comment-media-list">' + parsed.mediaHtml + '</div>' : '')
      + commentActionsHtml(c, me)
      + '</div></li>';
  }
  function commentsHtml(comments, me){
    if(!comments || !comments.length) return '<li class="fw-comment-empty"><span>还没有回声，可以先留一句。</span></li>';
    return comments.map(function(c){
      var replies = (c.replies || []).map(function(r){ return commentHtml(r, me, true); }).join('');
      return commentHtml(c, me, false) + (replies ? '<ul class="fw-comment-replies">' + replies + '</ul>' : '');
    }).join('');
  }
  function stableRenderPost(p){
    p = p || {};
    var me = window.__fwLastUser || null;
    var parsed = splitContent(p.content || '');
    var count = typeof p.commentCount === 'number' ? p.commentCount : (p.comments || []).reduce(function(n, c){ return n + 1 + ((c.replies || []).length); }, 0);
    return '<article class="post-card" data-id="' + esc(p.id) + '" data-status="' + esc(p.status || '') + '">'
      + '<div class="post-top"><span class="status">' + esc(p.status || '今日无效') + '</span><span class="time">' + esc(dualTime(p.createdAt, p.time || '刚刚')) + '</span></div>'
      + '<p class="fw-author">' + avatar(p.authorName || '匿名研究员', p.authorAvatar || '', 'mini') + '<span>' + esc(p.authorName || '匿名研究员') + '</span></p>'
      + '<p class="post-content fw-post-content-stable">' + (parsed.textHtml || '&nbsp;') + '</p>'
      + (parsed.mediaHtml ? '<div class="fw-post-media-list">' + parsed.mediaHtml + '</div>' : '')
      + '<div class="interactions"><button data-sb-action="resonance">点赞 ' + esc(p.resonance || 0) + '</button><button data-sb-action="comment-toggle">评论 ' + esc(count) + '</button><button data-sb-action="same">俺也一样 ' + esc(p.same || 0) + '</button><button data-sb-action="tissue">递纸巾 ' + esc(p.tissue || 0) + '</button></div>'
      + '<div class="comment-box" data-fw-comment-box><ul class="comment-list">' + commentsHtml(p.comments || [], me) + '</ul><div class="fw-replying-bar" data-fw-replying-bar style="display:none"></div><input placeholder="留一句回声，评论不限量" /><button class="btn dark full" data-sb-action="comment-submit" style="margin-top:10px">发送回声</button></div>'
      + '</article>';
  }

  function injectStyle(){
    if($('#fw-comment-reply-system-style')) return;
    var s = document.createElement('style');
    s.id = 'fw-comment-reply-system-style';
    s.textContent = `
      .post-top .time{font-size:12px;opacity:.86;text-align:right;}
      .comment-list{padding:0;margin:10px 0 0;}
      .fw-comment-item{list-style:none;display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;margin:10px 0;align-items:start;}
      .fw-comment-item.is-reply{margin-left:36px;grid-template-columns:24px minmax(0,1fr);}
      .fw-comment-item.is-reply .fw-avatar{width:24px!important;height:24px!important;font-size:10px!important;}
      .fw-comment-main{min-width:0;}
      .fw-comment-meta{font-size:12px;color:var(--accent-dark,#9d4a4a);font-weight:950;line-height:1.35;}
      .fw-comment-text{font-size:14px;font-weight:850;line-height:1.55;white-space:pre-wrap;margin-top:3px;word-break:break-word;}
      .fw-comment-actions{display:flex;gap:10px;margin-top:5px;}
      .fw-comment-actions button{border:0;background:transparent;color:#8b514f;font-size:12px;font-weight:950;text-decoration:underline;cursor:pointer;padding:0;}
      .fw-comment-replies{padding:0;margin:0 0 0 0;}
      .fw-comment-empty{list-style:none;color:#77736b;font-weight:850;font-size:13px;}
      .fw-replying-bar{margin:10px 0 6px;padding:8px 10px;border:1px dashed rgba(157,74,74,.32);background:#fff7ef;color:#8b514f;font-size:13px;font-weight:950;}
      .fw-replying-bar button{float:right;border:0;background:transparent;color:#8b514f;text-decoration:underline;font-weight:1000;cursor:pointer;}
      @media(max-width:760px){.post-top .time{font-size:11px}.fw-comment-item.is-reply{margin-left:22px}.fw-comment-text{font-size:13px}.fw-comment-meta{font-size:11px}}
    `;
    document.head.appendChild(s);
  }

  async function installRender(){
    if(!window.renderPost) return;
    window.renderPost = stableRenderPost;
    renderInstalled = true;
  }

  function setReply(card, commentId, userId, name){
    if(!card) return;
    var postId = card.dataset.id;
    var box = card.querySelector('[data-fw-comment-box], .comment-box');
    if(!box) return;
    box.dataset.fwReplyParentId = commentId;
    box.dataset.fwReplyUserId = userId || '';
    box.dataset.fwReplyName = name || '匿名回声';
    replyCtx[postId] = {parentCommentId:commentId, replyToUserId:userId || '', replyToName:name || '匿名回声'};
    var bar = box.querySelector('[data-fw-replying-bar]');
    if(bar){
      bar.style.display = 'block';
      bar.innerHTML = '正在回复：' + esc(name || '匿名回声') + '<button type="button" data-fw-cancel-reply>取消</button>';
    }
    var input = box.querySelector('input');
    if(input){ input.placeholder = '回复 ' + (name || '匿名回声') + '……'; input.focus(); }
  }
  function clearReply(box){
    if(!box) return;
    var card = box.closest('.post-card');
    if(card) delete replyCtx[card.dataset.id];
    delete box.dataset.fwReplyParentId;
    delete box.dataset.fwReplyUserId;
    delete box.dataset.fwReplyName;
    var bar = box.querySelector('[data-fw-replying-bar]');
    if(bar){ bar.style.display = 'none'; bar.innerHTML = ''; }
    var input = box.querySelector('input');
    if(input) input.placeholder = '留一句回声，评论不限量';
  }

  async function reloadPosts(){
    try{
      if(window.fwDb && window.fwDb.loadPosts){
        var posts = await window.fwDb.loadPosts();
        if(typeof window.savePosts === 'function') window.savePosts(posts);
        if(typeof window.renderFeeds === 'function') window.renderFeeds();
      }
    }catch(e){ toast(e.message || '刷新失败'); }
  }

  function bind(){
    document.addEventListener('click', async function(e){
      var reply = e.target.closest && e.target.closest('[data-fw-reply-comment]');
      if(reply){
        e.preventDefault(); e.stopPropagation();
        setReply(reply.closest('.post-card'), reply.dataset.fwReplyComment, reply.dataset.fwReplyUser, reply.dataset.fwReplyName);
        return;
      }
      var cancel = e.target.closest && e.target.closest('[data-fw-cancel-reply]');
      if(cancel){ e.preventDefault(); e.stopPropagation(); clearReply(cancel.closest('.comment-box')); return; }
      var del = e.target.closest && e.target.closest('[data-fw-delete-comment]');
      if(del){
        e.preventDefault(); e.stopPropagation();
        if(!window.fwDb || !window.fwDb.deleteComment) return;
        try{
          await window.fwDb.deleteComment(del.dataset.fwDeleteComment);
          toast('评论已删除。');
          await reloadPosts();
        }catch(err){ toast(err.message || '删除失败'); }
        return;
      }
      var submit = e.target.closest && e.target.closest('button[data-sb-action="comment-submit"]');
      if(submit){
        var box = submit.closest('.comment-box');
        var card = submit.closest('.post-card');
        if(box && card && box.dataset.fwReplyParentId){
          replyCtx[card.dataset.id] = {parentCommentId:box.dataset.fwReplyParentId, replyToUserId:box.dataset.fwReplyUserId || '', replyToName:box.dataset.fwReplyName || '匿名回声'};
          setTimeout(function(){ clearReply(box); }, 900);
        }
      }
    }, true);
  }

  function boot(){
    injectStyle();
    bind();
    setInterval(async function(){
      patchDb();
      installRender();
      if(window.fwDb && window.fwDb.getCurrentUser){
        window.__fwLastUser = await getCurrentUser();
      }
    }, 650);
    setTimeout(function(){ if(typeof window.renderFeeds === 'function') window.renderFeeds(); }, 1000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
