(function(){
  if(window.FWAppFeed) return;

  var bound = false;
  var loading = false;
  var swipeTracking = false;
  var swipeStartX = 0;
  var swipeStartY = 0;
  var commentDrafts = {};
  var stickerCache = null;
  var loadingStickers = false;
  var detailPostId = null;
  var squareScrollTop = 0;
  var openCommentMenuId = null;

  var MAX_IMAGE_SIZE = 800 * 1024;
  var MAX_GIF_SIZE = 3 * 1024 * 1024;
  var MAX_IMAGE_EDGE = 1280;
  var MAX_SELECTED_STICKERS = 6;

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function $$(selector, root){ return app().$$(selector, root); }
  function esc(value){ return app().esc(value); }

  function injectStyle(){ return; }

  function avatar(profile){
    var name = profile.authorName || profile.nickname || '研究员';
    var url = profile.authorAvatar || profile.avatar_url || '';
    if(url) return '<span class="post-avatar"><img src="' + esc(url) + '" alt="' + esc(name) + '"></span>';
    return '<span class="post-avatar">' + esc(app().initials(name)) + '</span>';
  }

  function timeText(value){
    if(!value) return '刚刚';
    var minutes = Math.floor(Math.max(0, Date.now() - new Date(value).getTime()) / 60000);
    if(minutes < 1) return '刚刚';
    if(minutes < 60) return minutes + '分钟前';
    var hours = Math.floor(minutes / 60);
    if(hours < 24) return hours + '小时前';
    var days = Math.floor(hours / 24);
    return days < 7 ? days + '天前' : new Date(value).toLocaleDateString('zh-CN');
  }

  function fail(result, message){
    if(result && result.error) throw new Error(message || '读取失败');
    return result ? result.data : null;
  }

  function dbType(type){
    return type === 'resonance' ? 'like' : type;
  }

  function encodeMarker(prefix, url){
    return '[[' + prefix + ':' + btoa(String(url || '')) + ']]';
  }

  function encodeImage(url){ return encodeMarker('FW_MEDIA_IMAGE', url); }
  function encodeSticker(url){ return encodeMarker('FW_USER_STICKER', url); }

  function getMarkerInfo(text, index){
    var specs = [
      {prefix:'[[FW_USER_STICKER:', end:']]', kind:'sticker'},
      {prefix:'[[FW_MEDIA_IMAGE:', end:']]', kind:'image'}
    ];
    for(var i = 0; i < specs.length; i += 1){
      var spec = specs[i];
      if(String(text || '').indexOf(spec.prefix, index) === index){
        var end = String(text || '').indexOf(spec.end, index + spec.prefix.length);
        if(end > index){
          try{
            var url = atob(String(text || '').slice(index + spec.prefix.length, end));
            if(/^https?:\/\//i.test(url)) return {kind:spec.kind, url:url, end:end + spec.end.length};
          }catch(e){}
        }
      }
    }
    return null;
  }

  function richHtml(text){
    text = String(text || '');
    var out = '';
    var i = 0;
    while(i < text.length){
      var next = text.indexOf('[[FW_', i);
      if(next < 0){
        out += esc(text.slice(i));
        break;
      }
      out += esc(text.slice(i, next));
      var marker = getMarkerInfo(text, next);
      if(!marker){
        out += esc(text.slice(next, next + 5));
        i = next + 5;
        continue;
      }
      if(marker.kind === 'sticker'){
        out += '<span class="fw-inline-sticker"><img src="' + esc(marker.url) + '" alt="表情"></span>';
      }else{
        out += '<a class="fw-inline-media" href="' + esc(marker.url) + '" target="_blank" rel="noopener"><img src="' + esc(marker.url) + '" alt="图片"></a>';
      }
      i = marker.end;
    }
    return out;
  }

  function richCommentHtml(text){
    text = String(text || '');
    var match = text.match(/^回复\s+([^：\n]{1,40})：/);
    if(!match) return richHtml(text);
    var prefix = match[0];
    var rest = text.slice(prefix.length);
    return '<span class="comment-reply-prefix">' + esc(prefix) + '</span>' + richHtml(rest);
  }

  function getScroller(){ return $('#appMain') || $('.app-main'); }

  function saveScroll(){
    var scroller = getScroller();
    return scroller ? scroller.scrollTop : 0;
  }

  function restoreScroll(value){
    var scroller = getScroller();
    if(!scroller) return;
    requestAnimationFrame(function(){
      scroller.scrollTop = value || 0;
      requestAnimationFrame(function(){ scroller.scrollTop = value || 0; });
    });
  }

  function findPost(postId){
    return (app().state.posts || []).find(function(post){ return String(post.id) === String(postId); }) || null;
  }

  function isAdminUser(user){
    return !!(user && (user.isAdmin || user.is_admin || user.role === 'admin'));
  }

  function findComment(commentId){
    var posts = app().state.posts || [];
    for(var i = 0; i < posts.length; i += 1){
      var comments = posts[i].comments || [];
      for(var j = 0; j < comments.length; j += 1){
        if(String(comments[j].id) === String(commentId)){
          return {post:posts[i], comment:comments[j]};
        }
      }
    }
    return null;
  }

  function canDeleteComment(comment, user){
    if(!comment || !user) return false;
    return isAdminUser(user) || String(comment.userId) === String(user.id);
  }

  function draftKey(postId, kind){
    return String(postId || '') + '::' + (kind || 'main');
  }

  function newDraft(){
    return {
      pendingImage:null,
      uploadingImage:false,
      selectedStickers:[],
      stickersOpen:false,
      stickerMessage:'',
      stickerRows:null,
      reply:null,
      addingSticker:false
    };
  }

  function ensureDraft(postId, kind){
    var key = draftKey(postId, kind || 'main');
    if(!commentDrafts[key]) commentDrafts[key] = newDraft();
    return commentDrafts[key];
  }

  function getFormDraft(form){
    return ensureDraft(form && form.dataset.postId, form && form.dataset.commentKind || 'main');
  }

  function clearReplyExcept(postId){
    Object.keys(commentDrafts).forEach(function(key){
      if(key.indexOf('::reply') < 0) return;
      if(key !== draftKey(postId, 'reply')) clearDraftByKey(key);
    });
  }

  function revokeDraftImage(draft){
    if(draft && draft.pendingImage && draft.pendingImage.localUrl){
      try{ URL.revokeObjectURL(draft.pendingImage.localUrl); }catch(e){}
    }
  }

  function clearDraftByKey(key){
    var draft = commentDrafts[key];
    revokeDraftImage(draft);
    delete commentDrafts[key];
  }

  function clearDraft(postId, kind){
    if(kind){
      clearDraftByKey(draftKey(postId, kind));
      return;
    }
    clearDraftByKey(draftKey(postId, 'main'));
    clearDraftByKey(draftKey(postId, 'reply'));
  }

  function resetDraftAfterSend(postId, kind){
    clearDraft(postId, kind || 'main');
  }

  function hasDraftContent(draft){
    return !!(draft && ((draft.pendingImage && draft.pendingImage.marker) || (draft.selectedStickers && draft.selectedStickers.length)));
  }

  function composeCommentContent(input, draft){
    var parts = [];
    var text = String(input && input.value || '').trim();
    var hasMedia = hasDraftContent(draft);
    if(draft && draft.reply && draft.reply.name && (text || hasMedia)){
      parts.push('回复 ' + draft.reply.name + '：' + text);
    }else if(text){
      parts.push(text);
    }
    (draft.selectedStickers || []).forEach(function(sticker){
      if(sticker.marker) parts.push(sticker.marker);
    });
    if(draft.pendingImage && draft.pendingImage.marker) parts.push(draft.pendingImage.marker);
    return parts.join('\n').trim();
  }

  function renderStickerPanelInner(draft){
    var head = '<div class="comment-sticker-head"><span>我的表情</span><button class="comment-sticker-add" type="button" data-comment-sticker-add>添加表情</button></div>';
    if(draft.stickerMessage){
      return head + '<p class="comment-panel-note">' + esc(draft.stickerMessage) + '</p>';
    }
    if(draft.stickerRows && draft.stickerRows.length){
      return head + '<div class="comment-sticker-grid">' + draft.stickerRows.map(function(row){
        var url = row.image_url || row.url || '';
        return '<button type="button" data-comment-sticker-url="' + esc(url) + '" aria-label="选择表情"><img src="' + esc(url) + '" alt="表情"></button>';
      }).join('') + '</div>';
    }
    return head + '<p class="comment-panel-note">暂时没有可用表情。</p>';
  }

  function renderDraftAreas(form){
    if(!form) return;
    var draft = getFormDraft(form);
    var input = form.querySelector('input[name="content"]');
    var replyState = $('[data-comment-reply-state]', form);
    var preview = $('[data-comment-media-preview]', form);
    var selected = $('[data-comment-selected-stickers]', form);
    var panel = $('[data-comment-sticker-panel]', form);
    var isReply = (form.dataset.commentKind || 'main') === 'reply';

    if(replyState){
      replyState.hidden = true;
      replyState.innerHTML = '';
      if(input) input.placeholder = isReply && draft.reply && draft.reply.name ? '回复 ' + draft.reply.name : '留一句回声';
    }

    if(preview){
      if(draft.pendingImage){
        var src = draft.pendingImage.localUrl || draft.pendingImage.url || '';
        var note = draft.pendingImage.uploading ? '正在上传图片...' : '图片已准备好';
        if(draft.pendingImage.error) note = draft.pendingImage.error;
        preview.innerHTML = '<div class="comment-image-card">' +
          (src ? '<img src="' + esc(src) + '" alt="已选择的图片">' : '') +
          '<span>' + esc(note) + '</span><button class="comment-media-remove" type="button" data-comment-image-remove>删除</button>' +
        '</div>';
      }else{
        preview.innerHTML = '';
      }
    }

    if(selected){
      selected.innerHTML = (draft.selectedStickers || []).map(function(sticker, index){
        return '<span class="comment-sticker-chip"><img src="' + esc(sticker.url) + '" alt="已选表情"><button type="button" aria-label="移除表情" data-comment-sticker-remove="' + index + '">×</button></span>';
      }).join('');
    }

    if(panel){
      panel.hidden = !draft.stickersOpen;
      panel.innerHTML = draft.stickersOpen ? renderStickerPanelInner(draft) : '';
    }

    updateCommentSubmitState(form);
  }

  async function currentUserId(client){
    try{
      var res = await client.auth.getSession();
      return res && res.data && res.data.session && res.data.session.user ? res.data.session.user.id : null;
    }catch(e){
      return null;
    }
  }

  async function fetchProfileMap(client, ids){
    var unique = Array.from(new Set((ids || []).filter(Boolean)));
    if(!unique.length) return {};
    try{
      var rows = fail(
        await client.from('profiles').select('id,nickname,avatar_url,lab_code').in('id', unique),
        '资料读取失败'
      ) || [];
      var map = {};
      rows.forEach(function(profile){ map[profile.id] = profile; });
      return map;
    }catch(e){
      console.warn('[FW mobile app] profile load failed', e);
      return {};
    }
  }

  async function loadPostsFromSupabase(){
    var db = app().db();
    var client = db && db.client;
    if(!client) throw new Error('暂时无法连接数据服务。');

    var meId = await currentUserId(client);
    var isAdmin = isAdminUser(app().state.user);
    var posts = fail(
      await client
        .from('posts')
        .select('id,user_id,content,status_tag,created_at')
        .or('is_deleted.eq.false,is_deleted.is.null')
        .order('created_at', {ascending:false})
        .limit(100),
      '帖子读取失败'
    ) || [];

    var postIds = posts.map(function(post){ return post.id; }).filter(Boolean);
    if(!postIds.length) return [];

    var comments = fail(
      await client
        .from('comments')
        .select('id,post_id,user_id,parent_comment_id,content,created_at')
        .in('post_id', postIds)
        .or('is_deleted.eq.false,is_deleted.is.null')
        .order('created_at', {ascending:true}),
      '评论读取失败'
    ) || [];

    var reactions = fail(
      await client
        .from('reactions')
        .select('post_id,user_id,type')
        .in('post_id', postIds),
      '互动读取失败'
    ) || [];

    var profileIds = [];
    posts.forEach(function(post){ profileIds.push(post.user_id); });
    comments.forEach(function(comment){ profileIds.push(comment.user_id); });
    var profiles = await fetchProfileMap(client, profileIds);

    var commentsByPost = {};
    comments.forEach(function(comment){
      var profile = profiles[comment.user_id] || {};
      (commentsByPost[comment.post_id] = commentsByPost[comment.post_id] || []).push({
        id:comment.id,
        userId:comment.user_id,
        parentCommentId:comment.parent_comment_id || null,
        authorName:profile.nickname || '匿名回声',
        authorAvatar:profile.avatar_url || '',
        content:comment.content || '',
        time:timeText(comment.created_at),
        createdAt:comment.created_at,
        canDelete:!!meId && (comment.user_id === meId || isAdmin)
      });
    });

    var counts = {};
    var mine = {};
    reactions.forEach(function(reaction){
      var type = reaction.type === 'like' ? 'resonance' : reaction.type;
      counts[reaction.post_id] = counts[reaction.post_id] || {resonance:0, same:0, tissue:0};
      mine[reaction.post_id] = mine[reaction.post_id] || {resonance:false, same:false, tissue:false};
      if(type === 'resonance') counts[reaction.post_id].resonance += 1;
      if(type === 'same') counts[reaction.post_id].same += 1;
      if(type === 'tissue') counts[reaction.post_id].tissue += 1;
      if(meId && reaction.user_id === meId && mine[reaction.post_id][type] !== undefined){
        mine[reaction.post_id][type] = true;
      }
    });

    return posts.map(function(post){
      var profile = profiles[post.user_id] || {};
      var count = counts[post.id] || {resonance:0, same:0, tissue:0};
      return {
        id:post.id,
        userId:post.user_id,
        authorId:post.user_id,
        authorName:profile.nickname || '匿名研究员',
        authorAvatar:profile.avatar_url || '',
        status:post.status_tag || '今日无效',
        content:post.content || '',
        time:timeText(post.created_at),
        createdAt:post.created_at,
        resonance:count.resonance,
        same:count.same,
        tissue:count.tissue,
        comments:commentsByPost[post.id] || [],
        canDelete:!!meId && post.user_id === meId,
        myReactions:mine[post.id] || {resonance:false, same:false, tissue:false}
      };
    });
  }

  function renderCommentBox(post, options){
    options = options || {};
    var kind = options.kind || 'main';
    if(!app().state.user){
      return kind === 'reply' ? '' : '<div class="empty">登录后才能评论。</div>';
    }
    var draft = ensureDraft(post.id, kind);
    if(kind === 'reply' && options.reply) draft.reply = options.reply;
    var disabled = !hasDraftContent(draft) ? ' disabled' : '';
    var extraClass = kind === 'reply' ? ' comment-reply-form' : ' comment-main-form';
    return '<form class="comment-form' + extraClass + '" data-comment-form data-comment-kind="' + esc(kind) + '" data-post-id="' + esc(post.id) + '">' +
      '<div class="comment-reply-state" data-comment-reply-state hidden></div>' +
      '<input name="content" maxlength="180" placeholder="留一句回声">' +
      '<button class="comment-tool" type="button" data-comment-sticker-toggle aria-label="选择表情">' + stickerButtonIcon() + '</button>' +
      '<button class="comment-tool" type="button" data-comment-image-pick aria-label="添加图片">' + imageButtonIcon() + '</button>' +
      '<button type="submit"' + disabled + '>发送</button>' +
      '<input type="file" accept="image/*" data-comment-image-file hidden>' +
      '<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-comment-sticker-file hidden>' +
      '<div class="comment-media-preview" data-comment-media-preview></div>' +
      '<div class="comment-selected-stickers" data-comment-selected-stickers></div>' +
      '<div class="comment-sticker-panel" data-comment-sticker-panel hidden></div>' +
    '</form>';
  }

  function renderComments(post){
    var rows = post.comments || [];
    if(!rows.length) return '';
    var replyDraft = ensureDraft(post.id, 'reply');
    var activeReplyId = replyDraft.reply && replyDraft.reply.id ? String(replyDraft.reply.id) : '';
    return rows.map(function(c){
      var isAuthor = c.userId && post.userId && String(c.userId) === String(post.userId);
      var isReplying = activeReplyId === String(c.id);
      var menuOpen = openCommentMenuId === String(c.id);
      var reply = '<button class="comment-action-icon comment-reply-toggle' + (isReplying ? ' active' : '') + '" type="button" data-comment-reply data-comment-id="' + esc(c.id) + '" data-comment-author="' + esc(c.authorName || '匿名回声') + '" aria-label="回复评论" aria-pressed="' + (isReplying ? 'true' : 'false') + '">' + chatIcon() + '</button>';
      var menu = '<button class="comment-action-icon comment-more-toggle' + (menuOpen ? ' active' : '') + '" type="button" data-comment-menu-toggle data-comment-id="' + esc(c.id) + '" aria-label="更多操作" aria-expanded="' + (menuOpen ? 'true' : 'false') + '">' + moreIcon() + '</button>';
      var del = c.canDelete ? '<button class="comment-menu-item danger" type="button" data-comment-delete data-comment-id="' + esc(c.id) + '">删除</button>' : '';
      var menuPanel = menuOpen ? '<div class="comment-action-menu" data-comment-menu><button class="comment-menu-item" type="button" data-comment-report data-comment-id="' + esc(c.id) + '">举报</button>' + del + '</div>' : '';
      var actions = '<div class="comment-actions">' + reply + '<span class="comment-menu-wrap">' + menu + menuPanel + '</span></div>';
      var replyForm = isReplying ? '<div class="comment-inline-reply">' + renderCommentBox(post, {kind:'reply', reply:replyDraft.reply}) + '</div>' : '';
      return '<div class="comment comment-flow-item" data-comment-id="' + esc(c.id) + '">' +
        '<div class="comment-avatar-col">' + avatar(c) + '</div>' +
        '<div class="comment-body">' +
          '<div class="comment-info-line"><b class="comment-author-name">' + esc(c.authorName || '匿名回声') + '</b>' + (isAuthor ? '<span class="comment-author-badge">作者</span>' : '') + '<span class="comment-time">' + esc(c.time || '') + '</span>' + actions + '</div>' +
          '<p class="fw-rich-content">' + richCommentHtml(c.content || '') + '</p>' +
          replyForm +
        '</div>' +
      '</div>';
    }).join('');
  }

  function chatIcon(){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5.5 6.4A7.4 7.4 0 0 1 12 3.5c4.1 0 7.4 2.8 7.4 6.3s-3.3 6.3-7.4 6.3c-.8 0-1.6-.1-2.3-.3L5 18.5l1.2-4.2a5.7 5.7 0 0 1-1.7-4.5z"></path></svg>';
  }

  function moreIcon(){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6.5 12h.01"></path><path d="M12 12h.01"></path><path d="M17.5 12h.01"></path></svg>';
  }

  function stickerButtonIcon(){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="7.4"></circle><path d="M9.2 10.4h.01"></path><path d="M14.8 10.4h.01"></path><path d="M8.8 14.4c1.5 1.4 4.9 1.4 6.4 0"></path></svg>';
  }

  function imageButtonIcon(){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="5" width="16" height="14" rx="2.6"></rect><path d="M7.2 15.5l3.3-3.3 2.4 2.4 1.6-1.8 3.2 3.7"></path><path d="M8.7 8.8h.01"></path></svg>';
  }

  function updateCommentSubmitState(form){
    if(!form) return;
    var input = form.querySelector('input[name="content"]');
    var submit = form.querySelector('button[type="submit"]');
    var draft = getFormDraft(form);
    var hasText = !!(input && (input.value || '').trim());
    var blocked = !!(draft && (draft.uploadingImage || draft.addingSticker));
    if(input && submit) submit.disabled = blocked || !(hasText || hasDraftContent(draft));
  }

  function renderPost(post, mode){
    mode = mode || 'list';
    var mine = post.myReactions || {};
    var deleteButton = post.canDelete ? '<button class="post-delete" type="button" data-post-delete data-post-id="' + esc(post.id) + '">删除</button>' : '';
    var commentControl = mode === 'detail'
      ? '<button class="post-action-count" type="button" disabled>评论 ' + (post.comments || []).length + '</button>'
      : '<button type="button" data-app-comments data-post-id="' + esc(post.id) + '">评论 ' + (post.comments || []).length + '</button>';
    return '<article class="post-card' + (mode === 'detail' ? ' detail-post-card' : '') + '" data-post-id="' + esc(post.id) + '">' +
      '<div class="post-top"><div class="post-author">' + avatar(post) + '<div class="post-name"><b>' + esc(post.authorName || '匿名研究员') + '</b><span>' + esc(post.time || '刚刚') + '</span></div></div><div class="post-tools"><span class="status-tag">' + esc(post.status || '今日无效') + '</span>' + deleteButton + '</div></div>' +
      '<div class="post-content fw-rich-content">' + richHtml(post.content || '') + '</div>' +
      '<div class="post-actions">' +
        '<button class="' + (mine.resonance ? 'active' : '') + '" type="button" data-app-react="resonance" aria-pressed="' + (mine.resonance ? 'true' : 'false') + '">点赞 ' + Number(post.resonance || 0) + '</button>' +
        commentControl +
        '<button class="' + (mine.same ? 'active' : '') + '" type="button" data-app-react="same" aria-pressed="' + (mine.same ? 'true' : 'false') + '">俺也一样 ' + Number(post.same || 0) + '</button>' +
        '<button class="' + (mine.tissue ? 'active' : '') + '" type="button" data-app-react="tissue" aria-pressed="' + (mine.tissue ? 'true' : 'false') + '">递纸巾 ' + Number(post.tissue || 0) + '</button>' +
      '</div>' +
    '</article>';
  }

  function ensureDetailView(){
    var main = getScroller();
    var view = $('[data-app-view="square-detail"]');
    if(view) return view;
    view = document.createElement('section');
    view.className = 'app-view square-detail-view';
    view.dataset.appView = 'square-detail';
    view.setAttribute('aria-label', '帖子评论详情');
    view.innerHTML = '<div class="view-head compact square-detail-head"><button class="back-btn" type="button" data-square-detail-back>‹ 精神广场</button><p>精神广场</p><h1>评论</h1></div><div class="square-detail-body" data-square-detail-body></div>';
    if(main) main.appendChild(view);
    return view;
  }

  function renderDetail(postId){
    var view = ensureDetailView();
    var body = $('[data-square-detail-body]', view);
    var post = findPost(postId);
    if(!body) return;
    if(!post){
      body.innerHTML = '<div class="error">这条牢骚暂时读取失败，请返回后再试。</div>';
      return;
    }
    detailPostId = String(post.id);
    body.innerHTML = renderPost(post, 'detail') +
      '<section class="module-card detail-comments-card" data-post-id="' + esc(post.id) + '">' +
        '<div class="detail-comments-head"><b>全部评论</b><span>' + (post.comments || []).length + '</span></div>' +
        renderCommentBox(post, {kind:'main'}) +
        '<div class="comment-list detail-comment-list">' + renderComments(post) + '</div>' +
      '</section>';
    $$('[data-comment-form]', body).forEach(renderDraftAreas);
  }

  function renderDetailPreservingScroll(postId){
    var scroll = saveScroll();
    renderDetail(postId || detailPostId);
    restoreScroll(scroll);
  }

  function renderList(){
    var node = $('[data-feed-list="square"]');
    if(!node) return;
    var posts = app().state.posts || [];
    var filter = app().state.filterStatus || '全部';
    var rows = filter === '全部' ? posts : posts.filter(function(post){ return post.status === filter; });
    if(!rows.length){
      node.innerHTML = '<div class="empty">今天这里还很安静。</div>';
      return;
    }
    node.innerHTML = rows.map(function(post){ return renderPost(post, 'list'); }).join('');
  }

  function renderCurrentPreservingScroll(extraPostId){
    if(app().state.view === 'square-detail'){
      renderDetailPreservingScroll(extraPostId || detailPostId);
      return;
    }
    var scroll = saveScroll();
    renderList();
    restoreScroll(scroll);
  }

  function openDetail(postId){
    if(!postId) return;
    var nextId = String(postId);
    if(detailPostId && detailPostId !== nextId) clearDraft(detailPostId);
    squareScrollTop = saveScroll();
    detailPostId = nextId;
    clearReplyExcept(nextId);
    renderDetail(nextId);
    app().setView('square-detail');
  }

  function backToSquare(){
    if(detailPostId) clearDraft(detailPostId, 'reply');
    detailPostId = null;
    app().setView('square');
    renderList();
    restoreScroll(squareScrollTop);
  }

  function setLoading(){
    var node = $('[data-feed-list="square"]');
    if(node) node.innerHTML = '<div class="loading">正在读取精神广场...</div>';
  }

  async function load(force, options){
    options = options || {};
    if(loading) return;
    if(app().state.postsLoaded && !force){
      if(app().state.view === 'square-detail' && detailPostId) renderDetail(detailPostId);
      else renderList();
      return;
    }

    loading = true;
    var scroll = options.preserveScroll ? saveScroll() : 0;
    if(options.detailPostId) detailPostId = String(options.detailPostId);
    if(!options.silent && app().state.view !== 'square-detail') setLoading();

    try{
      if(!(await app().waitForDb())) throw new Error('暂时无法连接数据服务。');
      app().state.posts = await loadPostsFromSupabase();
      app().state.postsLoaded = true;
      if(app().state.view === 'square-detail' && detailPostId) renderDetail(detailPostId);
      else renderList();
      if(options.preserveScroll) restoreScroll(scroll);
    }catch(e){
      console.warn('[FW mobile app] feed load failed', e);
      if(app().state.view === 'square-detail'){
        var view = ensureDetailView();
        var body = $('[data-square-detail-body]', view);
        if(body) body.innerHTML = '<div class="error">帖子暂时读取失败，请稍后刷新。</div>';
      }else{
        var node = $('[data-feed-list="square"]');
        if(node) node.innerHTML = '<div class="error">帖子暂时读取失败，请稍后刷新。</div>';
      }
    }finally{
      loading = false;
    }
  }

  function ensureLoaded(){ load(false); }

  async function requireUser(message){
    if(app().state.user) return app().state.user;
    await app().refreshUser();
    if(app().state.user) return app().state.user;
    app().toast(message || '登录后才能互动。');
    return null;
  }

  async function toggleReaction(post, type, user){
    var db = app().db();
    var client = db && db.client;
    if(!client) throw new Error('db');
    post.myReactions = post.myReactions || {resonance:false, same:false, tissue:false};
    var active = !!post.myReactions[type];
    var targetType = dbType(type);

    if(active){
      var del = await client.from('reactions').delete().eq('post_id', post.id).eq('user_id', user.id).eq('type', targetType);
      if(del.error) throw new Error('cancel');
      post.myReactions[type] = false;
      post[type] = Math.max(0, Number(post[type] || 0) - 1);
      return {removed:true};
    }

    var add = await client.from('reactions').insert({post_id:post.id, user_id:user.id, type:targetType});
    if(add.error){
      var duplicate = add.error.code === '23505' || String(add.error.message || '').toLowerCase().indexOf('duplicate') >= 0;
      if(duplicate){
        post.myReactions[type] = true;
        return {already:true};
      }
      throw new Error('add');
    }
    post.myReactions[type] = true;
    post[type] = Number(post[type] || 0) + 1;
    return {added:true};
  }

  async function deleteOwnComment(commentId, user){
    if(isAdminUser(user)){
      if(window.fwDb && window.fwDb.deleteComment){
        try{
          await window.fwDb.deleteComment(commentId);
          return;
        }catch(e){
          console.warn('[FW mobile app] admin delete comment failed', e);
        }
      }
      var adminDb = app().db();
      var adminClient = adminDb && adminDb.client;
      if(!adminClient) throw new Error('db');
      var adminResult = await adminClient.from('comments').update({is_deleted:true}).eq('id', commentId);
      if(adminResult.error) throw new Error('delete');
      return;
    }

    if(window.fwDb && window.fwDb.deleteOwnComment){
      try{
        await window.fwDb.deleteOwnComment({commentId:commentId});
        return;
      }catch(e){
        console.warn('[FW mobile app] delete comment rpc failed', e);
      }
    }
    var db = app().db();
    var client = db && db.client;
    if(!client) throw new Error('db');
    var result = await client.from('comments').update({is_deleted:true}).eq('id', commentId).eq('user_id', user.id);
    if(result.error) throw new Error('delete');
  }

  async function deleteOwnPost(postId, user){
    if(window.fwDb && window.fwDb.deleteOwnPost){
      try{
        await window.fwDb.deleteOwnPost({postId:postId});
        return;
      }catch(e){
        console.warn('[FW mobile app] delete post rpc failed', e);
      }
    }
    var db = app().db();
    var client = db && db.client;
    if(!client) throw new Error('db');
    var result = await client.from('posts').update({is_deleted:true}).eq('id', postId).eq('user_id', user.id);
    if(result.error) throw new Error('delete');
  }

  function removeCommentFromState(commentId){
    var posts = app().state.posts || [];
    for(var i = 0; i < posts.length; i++){
      var before = (posts[i].comments || []).length;
      posts[i].comments = (posts[i].comments || []).filter(function(comment){ return String(comment.id) !== String(commentId); });
      if(posts[i].comments.length !== before) return posts[i].id;
    }
    return null;
  }

  function setOpenCommentMenu(commentId){
    openCommentMenuId = commentId ? String(commentId) : null;
    if(app().state.view === 'square-detail') renderDetailPreservingScroll(detailPostId);
  }

  function removePostFromState(postId){
    clearDraft(postId);
    app().state.posts = (app().state.posts || []).filter(function(post){ return String(post.id) !== String(postId); });
  }

  function fileExt(file, fallback){
    var name = file && file.name || '';
    var match = name.match(/\.([a-z0-9]+)$/i);
    if(match) return match[1].toLowerCase();
    var type = file && file.type || '';
    if(type.indexOf('png') >= 0) return 'png';
    if(type.indexOf('webp') >= 0) return 'webp';
    if(type.indexOf('gif') >= 0) return 'gif';
    return fallback || 'jpg';
  }

  function makeImagePath(userId, ext){
    var random = Math.random().toString(36).slice(2, 8);
    return String(userId || 'anonymous') + '/comment/image/' + Date.now().toString(36) + '_' + random + '.' + (ext || 'jpg');
  }

  function makeStickerPath(userId, ext){
    var random = Math.random().toString(36).slice(2, 8);
    return String(userId || 'anonymous') + '/' + Date.now().toString(36) + '_' + random + '.' + (ext || 'webp');
  }

  function withTimeout(promise, ms, message){
    return new Promise(function(resolve, reject){
      var timer = setTimeout(function(){ reject(new Error(message || 'timeout')); }, ms);
      promise.then(function(value){ clearTimeout(timer); resolve(value); }).catch(function(error){ clearTimeout(timer); reject(error); });
    });
  }

  function loadImage(file){
    return new Promise(function(resolve, reject){
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function(){ URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('image-load')); };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality){
    return new Promise(function(resolve){ canvas.toBlob(function(blob){ resolve(blob); }, type, quality); });
  }

  function makeFile(blob, name, type){
    try{ return new File([blob], name, {type:type || blob.type || 'image/jpeg'}); }
    catch(e){ blob.name = name; return blob; }
  }

  async function compressImage(file){
    if(!file || !/^image\//i.test(file.type || '')) throw new Error('not-image');
    var isGif = /gif/i.test(file.type || '') || /\.gif$/i.test(file.name || '');
    if(isGif){
      if(file.size > MAX_GIF_SIZE) throw new Error('image-too-large');
      return file;
    }
    if(file.size <= MAX_IMAGE_SIZE) return file;
    var img = await loadImage(file);
    var scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    var width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    var height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    var blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
    if(!blob) return file;
    return makeFile(blob, (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg', 'image/jpeg');
  }

  async function prepareStickerImage(file){
    if(!file || !/^image\//i.test(file.type || '')) throw new Error('not-image');
    var isGif = /gif/i.test(file.type || '') || /\.gif$/i.test(file.name || '');
    if(isGif){
      if(file.size > 1024 * 1024) throw new Error('gif-too-large');
      return {file:file, mime:file.type || 'image/gif', ext:'gif'};
    }
    var img = await loadImage(file);
    var width = img.naturalWidth || img.width;
    var height = img.naturalHeight || img.height;
    var side = Math.min(width, height);
    var canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    var ctx = canvas.getContext('2d', {alpha:true});
    var sx = Math.max(0, Math.floor((width - side) / 2));
    var sy = Math.max(0, Math.floor((height - side) / 2));
    ctx.drawImage(img, sx, sy, side, side, 0, 0, 300, 300);
    var quality = 0.82;
    var blob = await canvasToBlob(canvas, 'image/webp', quality);
    while(blob && blob.size > 200 * 1024 && quality > 0.42){
      quality -= 0.08;
      blob = await canvasToBlob(canvas, 'image/webp', quality);
    }
    if(!blob || blob.size > 200 * 1024) throw new Error('sticker-too-large');
    return {file:makeFile(blob, 'fw_sticker_' + Date.now().toString(36) + '.webp', 'image/webp'), mime:'image/webp', ext:'webp'};
  }

  async function uploadCommentImage(file, user){
    var db = app().db();
    var client = db && db.client;
    if(!client || !client.storage) throw new Error('storage-missing');
    var uploadFile = await compressImage(file);
    var ext = fileExt(uploadFile, 'jpg');
    var path = makeImagePath(user.id, ext);
    var result = await withTimeout(
      client.storage.from('chat-media').upload(path, uploadFile, {cacheControl:'31536000', upsert:false, contentType:uploadFile.type || 'image/jpeg'}),
      35000,
      'upload-timeout'
    );
    if(result.error) throw result.error;
    var publicData = client.storage.from('chat-media').getPublicUrl(path);
    var publicUrl = publicData && publicData.data && publicData.data.publicUrl;
    if(!publicUrl) throw new Error('public-url-missing');
    return {url:publicUrl, marker:encodeImage(publicUrl)};
  }

  async function uploadUserSticker(file, user){
    var db = app().db();
    var client = db && db.client;
    if(!client || !client.storage) throw new Error('storage-missing');
    var prepared = await prepareStickerImage(file);
    var path = makeStickerPath(user.id, prepared.ext);
    var uploaded = await withTimeout(
      client.storage.from('stickers').upload(path, prepared.file, {cacheControl:'3600', upsert:false, contentType:prepared.mime}),
      22000,
      'sticker-upload-timeout'
    );
    if(uploaded.error) throw uploaded.error;
    var publicData = client.storage.from('stickers').getPublicUrl(path);
    var publicUrl = publicData && publicData.data && publicData.data.publicUrl;
    if(!publicUrl) throw new Error('public-url-missing');
    var saved = await withTimeout(
      client.from('user_stickers').insert({
        user_id:user.id,
        image_url:publicUrl,
        storage_path:path,
        file_name:file.name || 'sticker',
        file_size:prepared.file.size || file.size || 0,
        mime_type:prepared.mime
      }).select('id,image_url,file_name,file_size,mime_type,storage_path,created_at').single(),
      12000,
      'sticker-save-timeout'
    );
    if(saved.error) throw saved.error;
    return saved.data;
  }

  async function fetchStickers(force){
    if(stickerCache && !force) return stickerCache;
    if(loadingStickers) return stickerCache || [];
    var user = await requireUser('登录后才能使用我的表情。');
    if(!user) return [];
    var db = app().db();
    var client = db && db.client;
    if(!client) throw new Error('db');
    loadingStickers = true;
    try{
      var res = await client
        .from('user_stickers')
        .select('id,image_url,file_name,file_size,mime_type,storage_path,created_at')
        .eq('user_id', user.id)
        .or('is_deleted.eq.false,is_deleted.is.null')
        .order('created_at', {ascending:false})
        .limit(30);
      if(res.error) throw res.error;
      stickerCache = (res.data || []).filter(function(row){ return row && row.image_url; });
      return stickerCache;
    }finally{
      loadingStickers = false;
    }
  }

  function isSquareRelatedView(){
    return !!(app() && app().state && (app().state.view === 'square' || app().state.view === 'square-detail'));
  }

  function isEditableTarget(target){
    return !!(target && target.closest && target.closest('input,textarea,select,[contenteditable="true"]'));
  }

  function resetSwipe(){
    swipeTracking = false;
    swipeStartX = 0;
    swipeStartY = 0;
  }

  function handleSwipeStart(e){
    if(!isSquareRelatedView() || !e.touches || e.touches.length !== 1) return;
    var target = e.target;
    if(isEditableTarget(target)) return;
    if(target && target.closest && target.closest('[data-filter-status],.status-filter,.status-picks')) return;
    var touch = e.touches[0];
    if(!touch || touch.clientX > 32) return;
    swipeTracking = true;
    swipeStartX = touch.clientX;
    swipeStartY = touch.clientY;
  }

  function handleSwipeEnd(e){
    if(!swipeTracking) return;
    var startX = swipeStartX;
    var startY = swipeStartY;
    resetSwipe();
    if(!isSquareRelatedView()) return;
    var touch = e.changedTouches && e.changedTouches[0];
    if(!touch) return;
    var dx = touch.clientX - startX;
    var dy = touch.clientY - startY;
    if(dx >= 70 && Math.abs(dy) <= 40){
      if(app().state.view === 'square-detail') backToSquare();
      else app().setView('nav');
    }
  }

  function bind(){
    if(bound) return;
    bound = true;
    document.addEventListener('touchstart', handleSwipeStart, {passive:true});
    document.addEventListener('touchend', handleSwipeEnd, {passive:true});
    document.addEventListener('touchcancel', resetSwipe, {passive:true});

    document.addEventListener('click', async function(e){
      var detailBack = e.target.closest && e.target.closest('[data-square-detail-back]');
      if(detailBack){
        e.preventDefault();
        e.stopPropagation();
        backToSquare();
        return;
      }

      var postDelete = e.target.closest && e.target.closest('[data-post-delete]');
      if(postDelete){
        e.preventDefault();
        e.stopPropagation();
        var userForPostDelete = await requireUser('登录后才能删除牢骚。');
        if(!userForPostDelete || postDelete.disabled) return;
        var deletePostId = postDelete.dataset.postId || (postDelete.closest('[data-post-id]') || {}).dataset.postId;
        var post = findPost(deletePostId);
        if(!post || String(post.userId) !== String(userForPostDelete.id)){
          app().toast('只能删除自己发布的牢骚。');
          return;
        }
        if(!window.confirm('确定删除这条牢骚吗？')) return;
        try{
          postDelete.disabled = true;
          await deleteOwnPost(deletePostId, userForPostDelete);
          removePostFromState(deletePostId);
          app().toast('已删除');
          if(app().state.view === 'square-detail') backToSquare();
          else renderCurrentPreservingScroll();
        }catch(err){
          console.warn('[FW mobile app] delete post failed', err);
          app().toast('删除失败，请稍后再试。');
        }finally{
          postDelete.disabled = false;
        }
        return;
      }

      var menuToggle = e.target.closest && e.target.closest('[data-comment-menu-toggle]');
      if(menuToggle){
        e.preventDefault();
        e.stopPropagation();
        var menuId = menuToggle.dataset.commentId || '';
        setOpenCommentMenu(openCommentMenuId === String(menuId) ? null : menuId);
        return;
      }

      var reportBtn = e.target.closest && e.target.closest('[data-comment-report]');
      if(reportBtn){
        e.preventDefault();
        e.stopPropagation();
        openCommentMenuId = null;
        renderDetailPreservingScroll(detailPostId);
        app().toast('举报入口暂未接入。');
        return;
      }

      var deleteBtn = e.target.closest && e.target.closest('[data-comment-delete]');
      if(deleteBtn){
        e.preventDefault();
        e.stopPropagation();
        var userForDelete = await requireUser('登录后才能删除评论。');
        if(!userForDelete || deleteBtn.disabled) return;
        var commentRecord = findComment(deleteBtn.dataset.commentId);
        if(!commentRecord || !canDeleteComment(commentRecord.comment, userForDelete)){
          openCommentMenuId = null;
          renderDetailPreservingScroll(detailPostId);
          app().toast('没有权限删除这条评论。');
          return;
        }
        if(!window.confirm('确定删除这条评论吗？')) return;
        var commentId = deleteBtn.dataset.commentId;
        try{
          deleteBtn.disabled = true;
          await deleteOwnComment(commentId, userForDelete);
          var postId = removeCommentFromState(commentId);
          openCommentMenuId = null;
          app().toast('评论已删除');
          renderCurrentPreservingScroll(postId);
        }catch(err){
          console.warn('[FW mobile app] delete comment failed', err);
          app().toast('删除失败，请稍后再试。');
        }finally{
          deleteBtn.disabled = false;
        }
        return;
      }

      var replyBtn = e.target.closest && e.target.closest('[data-comment-reply]');
      if(replyBtn){
        e.preventDefault();
        e.stopPropagation();
        var replyUser = await requireUser('登录后才能回复。');
        if(!replyUser) return;
        var replyCard = replyBtn.closest('[data-post-id]');
        if(!replyCard) return;
        var replyPostId = String(replyCard.dataset.postId || '');
        var oldDraft = ensureDraft(replyPostId, 'reply');
        openCommentMenuId = null;
        if(oldDraft.reply && String(oldDraft.reply.id || '') === String(replyBtn.dataset.commentId || '')){
          clearDraft(replyPostId, 'reply');
          renderDetailPreservingScroll(replyPostId);
          return;
        }
        if(oldDraft.reply && String(oldDraft.reply.id || '') !== String(replyBtn.dataset.commentId || '')){
          clearDraft(replyPostId, 'reply');
        }
        var replyDraft = ensureDraft(replyPostId, 'reply');
        replyDraft.reply = {id:replyBtn.dataset.commentId || '', name:replyBtn.dataset.commentAuthor || '匿名回声'};
        clearReplyExcept(replyPostId);
        renderDetailPreservingScroll(replyPostId);
        var replyInput = $('[data-comment-form][data-comment-kind="reply"] input[name="content"]');
        if(replyInput) replyInput.focus();
        return;
      }

      var replyCancel = e.target.closest && e.target.closest('[data-comment-reply-cancel]');
      if(replyCancel){
        e.preventDefault();
        e.stopPropagation();
        var cancelForm = replyCancel.closest('[data-comment-form]');
        clearDraft(cancelForm && cancelForm.dataset.postId, cancelForm && cancelForm.dataset.commentKind || 'reply');
        renderDetailPreservingScroll(cancelForm && cancelForm.dataset.postId);
        return;
      }

      var imagePick = e.target.closest && e.target.closest('[data-comment-image-pick]');
      if(imagePick){
        e.preventDefault();
        var imageForm = imagePick.closest('[data-comment-form]');
        var imageDraft = getFormDraft(imageForm);
        if(imageDraft.uploadingImage){
          app().toast('图片还在上传，请稍后。');
          return;
        }
        var fileInput = imageForm && imageForm.querySelector('[data-comment-image-file]');
        if(fileInput) fileInput.click();
        return;
      }

      var imageRemove = e.target.closest && e.target.closest('[data-comment-image-remove]');
      if(imageRemove){
        e.preventDefault();
        var imageRemoveForm = imageRemove.closest('[data-comment-form]');
        var removeDraft = getFormDraft(imageRemoveForm);
        revokeDraftImage(removeDraft);
        removeDraft.pendingImage = null;
        removeDraft.uploadingImage = false;
        renderDraftAreas(imageRemoveForm);
        return;
      }

      var stickerToggle = e.target.closest && e.target.closest('[data-comment-sticker-toggle]');
      if(stickerToggle){
        e.preventDefault();
        var stickerForm = stickerToggle.closest('[data-comment-form]');
        var stickerDraft = getFormDraft(stickerForm);
        stickerDraft.stickersOpen = !stickerDraft.stickersOpen;
        if(!stickerDraft.stickersOpen){
          renderDraftAreas(stickerForm);
          return;
        }
        stickerDraft.stickerMessage = '正在读取我的表情...';
        stickerDraft.stickerRows = null;
        renderDraftAreas(stickerForm);
        try{
          var rows = await fetchStickers(false);
          stickerDraft.stickerRows = rows;
          stickerDraft.stickerMessage = '';
        }catch(err){
          console.warn('[FW mobile app] comment sticker load failed', err);
          stickerDraft.stickerRows = [];
          stickerDraft.stickerMessage = '表情暂时读取失败，请稍后再试。';
        }
        renderDraftAreas(stickerForm);
        return;
      }

      var stickerAdd = e.target.closest && e.target.closest('[data-comment-sticker-add]');
      if(stickerAdd){
        e.preventDefault();
        e.stopPropagation();
        var addUser = await requireUser('登录后才能添加表情。');
        if(!addUser) return;
        var addForm = stickerAdd.closest('[data-comment-form]');
        var addInput = addForm && addForm.querySelector('[data-comment-sticker-file]');
        if(addInput) addInput.click();
        return;
      }

      var stickerPick = e.target.closest && e.target.closest('[data-comment-sticker-url]');
      if(stickerPick){
        e.preventDefault();
        var stickerPickForm = stickerPick.closest('[data-comment-form]');
        var pickDraft = getFormDraft(stickerPickForm);
        var url = stickerPick.dataset.commentStickerUrl || '';
        if(!url) return;
        if(pickDraft.selectedStickers.length >= MAX_SELECTED_STICKERS){
          app().toast('这次先放这么多表情吧。');
          return;
        }
        pickDraft.selectedStickers.push({url:url, marker:encodeSticker(url)});
        renderDraftAreas(stickerPickForm);
        return;
      }

      var stickerRemove = e.target.closest && e.target.closest('[data-comment-sticker-remove]');
      if(stickerRemove){
        e.preventDefault();
        var stickerRemoveForm = stickerRemove.closest('[data-comment-form]');
        var removeStickerDraft = getFormDraft(stickerRemoveForm);
        var index = Number(stickerRemove.dataset.commentStickerRemove);
        if(index >= 0) removeStickerDraft.selectedStickers.splice(index, 1);
        renderDraftAreas(stickerRemoveForm);
        return;
      }

      var filter = e.target.closest && e.target.closest('[data-filter-status]');
      if(filter){
        app().state.filterStatus = filter.dataset.filterStatus || '全部';
        $$('[data-filter-status]').forEach(function(btn){ btn.classList.toggle('active', btn === filter); });
        renderList();
        return;
      }

      var commentOpen = e.target.closest && e.target.closest('[data-app-comments]');
      if(commentOpen){
        e.preventDefault();
        var targetPostId = commentOpen.dataset.postId || (commentOpen.closest('[data-post-id]') || {}).dataset.postId;
        openDetail(targetPostId);
        return;
      }

      var react = e.target.closest && e.target.closest('[data-app-react]');
      if(react){
        var user = await requireUser('登录后才能互动。');
        if(!user) return;
        if(user.disabled){
          app().toast('这个账号暂时不能互动。');
          return;
        }
        var postCard = react.closest('[data-post-id]');
        var post = postCard && findPost(postCard.dataset.postId);
        if(!post || react.disabled) return;
        var type = react.dataset.appReact;
        var wasActive = !!(post.myReactions && post.myReactions[type]);
        try{
          react.disabled = true;
          var result = await toggleReaction(post, type, user);
          app().toast(result.removed ? '已取消' : (result.already ? '已经记录过了。' : '已记录'));
          renderCurrentPreservingScroll();
        }catch(err){
          console.warn('[FW mobile app] reaction failed', err);
          app().toast(wasActive ? '取消失败，请稍后再试。' : '操作失败，请稍后再试。');
        }finally{
          react.disabled = false;
        }
        return;
      }

      if(openCommentMenuId && !(e.target.closest && e.target.closest('[data-comment-menu]'))){
        setOpenCommentMenu(null);
      }
    });

    document.addEventListener('input', function(e){
      var form = e.target.closest && e.target.closest('[data-comment-form]');
      if(form) updateCommentSubmitState(form);
    });

    document.addEventListener('change', async function(e){
      var stickerFileInput = e.target.closest && e.target.closest('[data-comment-sticker-file]');
      if(stickerFileInput){
        var stickerForm = stickerFileInput.closest('[data-comment-form]');
        var stickerDraft = getFormDraft(stickerForm);
        var stickerFile = stickerFileInput.files && stickerFileInput.files[0];
        stickerFileInput.value = '';
        if(!stickerFile) return;
        var stickerUser = await requireUser('登录后才能添加表情。');
        if(!stickerUser) return;
        if(stickerDraft.addingSticker){
          app().toast('正在添加表情，请稍后。');
          return;
        }
        try{
          stickerDraft.addingSticker = true;
          stickerDraft.stickersOpen = true;
          stickerDraft.stickerMessage = '正在添加表情...';
          renderDraftAreas(stickerForm);
          var row = await uploadUserSticker(stickerFile, stickerUser);
          stickerCache = [row].concat((stickerCache || []).filter(function(item){ return item && item.id !== row.id; }));
          stickerDraft.stickerRows = stickerCache;
          stickerDraft.stickerMessage = '';
          app().toast('已添加');
        }catch(err){
          console.warn('[FW mobile app] add comment sticker failed', err);
          stickerDraft.stickerMessage = '添加失败，请稍后再试。';
          app().toast('添加失败，请稍后再试。');
        }finally{
          stickerDraft.addingSticker = false;
          renderDraftAreas(stickerForm);
        }
        return;
      }

      var fileInput = e.target.closest && e.target.closest('[data-comment-image-file]');
      if(!fileInput) return;
      var form = fileInput.closest('[data-comment-form]');
      var postId = form && form.dataset.postId;
      var draft = getFormDraft(form);
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if(!file) return;
      if(!/^image\//i.test(file.type || '')){
        app().toast('请选择图片文件。');
        return;
      }
      var user = await requireUser('登录后才能评论。');
      if(!user) return;
      revokeDraftImage(draft);
      draft.pendingImage = {name:file.name || 'image', localUrl:URL.createObjectURL(file), url:'', marker:'', uploading:true, error:''};
      draft.uploadingImage = true;
      renderDraftAreas(form);
      try{
        var uploaded = await uploadCommentImage(file, user);
        if(!draft.pendingImage) return;
        draft.pendingImage.url = uploaded.url;
        draft.pendingImage.marker = uploaded.marker;
        draft.pendingImage.uploading = false;
        app().toast('图片已准备好');
      }catch(err){
        console.warn('[FW mobile app] comment image upload failed', err);
        if(draft.pendingImage) draft.pendingImage.error = '图片上传失败';
        app().toast('图片上传失败，请稍后再试。');
      }finally{
        draft.uploadingImage = false;
        if(draft.pendingImage) draft.pendingImage.uploading = false;
        renderDraftAreas(form);
      }
    });

    document.addEventListener('submit', async function(e){
      var form = e.target.closest && e.target.closest('[data-comment-form]');
      if(!form) return;
      e.preventDefault();
      var user = await requireUser('登录后才能评论。');
      if(!user) return;
      var card = form.closest('[data-post-id]');
      var input = form.querySelector('input[name="content"]');
      var kind = form.dataset.commentKind || 'main';
      var draft = getFormDraft(form);
      if(draft.uploadingImage || (draft.pendingImage && draft.pendingImage.uploading)){
        app().toast('图片还在上传，请稍后再发送。');
        return;
      }
      if(draft.addingSticker){
        app().toast('表情还在添加，请稍后再发送。');
        return;
      }
      var content = composeCommentContent(input, draft);
      if(!content){
        input.focus();
        updateCommentSubmitState(form);
        app().toast('先写点评论内容。');
        return;
      }
      var submit = form.querySelector('button[type="submit"]');
      try{
        submit.disabled = true;
        await window.fwDb.createComment({postId:card.dataset.postId, content:content});
        input.value = '';
        resetDraftAfterSend(card.dataset.postId, kind);
        app().toast(kind === 'reply' ? '回复已发送' : '评论已发送');
        await load(true, {preserveScroll:true, detailPostId:card.dataset.postId, silent:true});
      }catch(err){
        console.warn('[FW mobile app] comment failed', err);
        app().toast('评论失败，请稍后再试。');
        renderDraftAreas(form);
      }finally{
        updateCommentSubmitState(form);
      }
    });
  }

  function init(){
    injectStyle();
    bind();
  }

  window.FWAppFeed = {init:init, load:load, ensureLoaded:ensureLoaded, renderAll:renderList, openDetail:openDetail};
})();
