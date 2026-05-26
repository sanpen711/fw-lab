(function(){
  if(window.FWAppFeed) return;

  var bound = false;
  var loading = false;
  var swipeTracking = false;
  var swipeStartX = 0;
  var swipeStartY = 0;
  var EMOJIS = ['😭','😵','😡','🫠','😮‍💨','🤡','🐟','🧻','👍','🫂'];

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function $$(selector, root){ return app().$$(selector, root); }
  function esc(value){ return app().esc(value); }

  function injectStyle(){
    if(document.getElementById('fwAppSquareFeedStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwAppSquareFeedStyle';
    style.textContent = [
      '.post-actions button{display:flex;align-items:center;justify-content:center;gap:3px;white-space:nowrap;padding:0 4px;font-size:11.5px;line-height:1.1;overflow:hidden;text-overflow:clip}',
      '.comment{position:relative;padding-right:42px}',
      '.comment p{margin:7px 0 0;color:var(--text);font-size:14px;line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}',
      '.comment-delete{position:absolute;right:0;top:7px;min-width:34px;min-height:30px;border:1px solid rgba(217,121,121,.28);border-radius:999px;background:#fff7f4;color:var(--accent-dark);font-size:11px;font-weight:1000}',
      '.comment-form{grid-template-columns:minmax(0,1fr) 38px 58px;align-items:center;gap:6px;padding-top:8px}',
      '.comment-form input{height:38px;border-radius:999px;font-size:16px;padding:0 13px}',
      '.comment-form .comment-emoji-toggle{width:38px;height:38px;min-height:38px;border:1px solid rgba(30,30,28,.13);border-radius:999px;background:var(--panel-2);color:var(--green);font-size:18px;font-weight:1000;line-height:1}',
      '.comment-form button[type="submit"]{height:38px;min-height:38px;border-radius:999px;padding:0 12px;font-size:12px;font-weight:1000}',
      '.comment-form button[type="submit"]:disabled{background:rgba(30,30,28,.08);color:var(--muted);box-shadow:none;opacity:.72}',
      '.comment-emoji-panel{grid-column:1/-1;display:none;gap:6px;flex-wrap:wrap;margin-top:2px;padding:8px;border:1px solid rgba(30,30,28,.1);border-radius:12px;background:rgba(255,250,241,.96)}',
      '.comment-form.emoji-open .comment-emoji-panel{display:flex}',
      '.comment-emoji-panel button{width:36px;height:36px;min-height:36px;border:1px solid rgba(30,30,28,.1);border-radius:10px;background:#fffdf7;color:var(--text);font-size:19px;line-height:1}',
      '.post-actions button:disabled,.comment-form button:disabled,.comment-delete:disabled{opacity:.56}'
    ].join('\n');
    document.head.appendChild(style);
  }

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

  function getScroller(){
    return $('#appMain') || $('.app-main');
  }

  function saveScroll(){
    var scroller = getScroller();
    return scroller ? scroller.scrollTop : 0;
  }

  function restoreScroll(value){
    var scroller = getScroller();
    if(!scroller) return;
    requestAnimationFrame(function(){
      scroller.scrollTop = value;
      requestAnimationFrame(function(){ scroller.scrollTop = value; });
    });
  }

  function captureOpenCommentIds(extraId){
    var ids = [];
    $$('[data-post-id] .comments.show').forEach(function(node){
      var card = node.closest('[data-post-id]');
      if(card && card.dataset.postId) ids.push(card.dataset.postId);
    });
    if(extraId) ids.push(extraId);
    return Array.from(new Set(ids));
  }

  function cardById(postId){
    return $$('[data-post-id]').find(function(card){ return card.dataset.postId === postId; }) || null;
  }

  function reopenComments(ids){
    (ids || []).forEach(function(id){
      var card = cardById(id);
      var comments = card && $('.comments', card);
      if(comments) comments.classList.add('show');
    });
  }

  function renderPreservingScroll(extraOpenId){
    var scroll = saveScroll();
    var openIds = captureOpenCommentIds(extraOpenId);
    renderList({openIds:openIds});
    restoreScroll(scroll);
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
        canDelete:!!meId && comment.user_id === meId
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

  function renderCommentAuthor(comment){
    return '<div class="post-author">' + avatar(comment) + '<div class="post-name"><b>' + esc(comment.authorName || '匿名回声') + '</b><span>' + esc(comment.time || '') + '</span></div></div>';
  }

  function renderComments(post){
    var rows = post.comments || [];
    if(!rows.length){
      return '<div class="empty">还没有评论，可以轻轻放下一句。</div>';
    }
    return rows.slice(-8).map(function(c){
      var del = c.canDelete ? '<button class="comment-delete" type="button" data-comment-delete data-comment-id="' + esc(c.id) + '">删除</button>' : '';
      return '<div class="comment" data-comment-id="' + esc(c.id) + '">' + renderCommentAuthor(c) + del + '<p>' + esc(c.content || '') + '</p></div>';
    }).join('');
  }

  function renderEmojiPanel(){
    return '<div class="comment-emoji-panel" data-comment-emoji-panel>' + EMOJIS.map(function(emoji){
      return '<button type="button" data-comment-emoji="' + esc(emoji) + '">' + esc(emoji) + '</button>';
    }).join('') + '</div>';
  }

  function renderCommentBox(){
    if(!app().state.user){
      return '<div class="empty">登录后才能评论。</div>';
    }
    return '<form class="comment-form" data-comment-form>' +
      '<input name="content" maxlength="180" placeholder="留一句回声">' +
      '<button class="comment-emoji-toggle" type="button" data-comment-emoji-toggle aria-label="表情">☺</button>' +
      '<button type="submit" disabled>发送</button>' +
      renderEmojiPanel() +
    '</form>';
  }

  function updateCommentSubmitState(form){
    if(!form) return;
    var input = form.querySelector('input[name="content"]');
    var submit = form.querySelector('button[type="submit"]');
    if(input && submit) submit.disabled = !(input.value || '').trim();
  }

  function renderPost(post){
    var mine = post.myReactions || {};
    return '<article class="post-card" data-post-id="' + esc(post.id) + '">' +
      '<div class="post-top"><div class="post-author">' + avatar(post) + '<div class="post-name"><b>' + esc(post.authorName || '匿名研究员') + '</b><span>' + esc(post.time || '刚刚') + '</span></div></div><span class="status-tag">' + esc(post.status || '今日无效') + '</span></div>' +
      '<div class="post-content">' + esc(post.content || '') + '</div>' +
      '<div class="post-actions">' +
        '<button class="' + (mine.resonance ? 'active' : '') + '" type="button" data-app-react="resonance" aria-pressed="' + (mine.resonance ? 'true' : 'false') + '">点赞 ' + Number(post.resonance || 0) + '</button>' +
        '<button type="button" data-app-comments>评论 ' + (post.comments || []).length + '</button>' +
        '<button class="' + (mine.same ? 'active' : '') + '" type="button" data-app-react="same" aria-pressed="' + (mine.same ? 'true' : 'false') + '">俺也一样 ' + Number(post.same || 0) + '</button>' +
        '<button class="' + (mine.tissue ? 'active' : '') + '" type="button" data-app-react="tissue" aria-pressed="' + (mine.tissue ? 'true' : 'false') + '">递纸巾 ' + Number(post.tissue || 0) + '</button>' +
      '</div>' +
      '<div class="comments"><div>' + renderComments(post) + '</div>' + renderCommentBox() + '</div>' +
    '</article>';
  }

  function visiblePosts(){
    var posts = app().state.posts || [];
    var filter = app().state.filterStatus || '全部';
    if(filter !== '全部') posts = posts.filter(function(p){ return p.status === filter; });
    return posts;
  }

  function renderList(options){
    options = options || {};
    var node = $('[data-feed-list="square"]');
    if(!node) return;
    var posts = visiblePosts();
    if(!posts.length){
      node.innerHTML = '<div class="empty">今天这里还很安静。</div>';
      return;
    }
    node.innerHTML = posts.map(renderPost).join('');
    reopenComments(options.openIds);
  }

  function setLoading(){
    var node = $('[data-feed-list="square"]');
    if(node) node.innerHTML = '<div class="loading">正在读取精神广场...</div>';
  }

  async function load(force, options){
    options = options || {};
    if(loading) return;
    if(app().state.postsLoaded && !force){
      renderList({openIds:captureOpenCommentIds(options.reopenPostId)});
      return;
    }

    loading = true;
    var scroll = options.preserveScroll ? saveScroll() : 0;
    var openIds = options.preserveScroll ? captureOpenCommentIds(options.reopenPostId) : [];
    if(!options.silent) setLoading();

    try{
      if(!(await app().waitForDb())) throw new Error('暂时无法连接数据服务。');
      app().state.posts = await loadPostsFromSupabase();
      app().state.postsLoaded = true;
      renderList({openIds:openIds});
      if(options.preserveScroll) restoreScroll(scroll);
    }catch(e){
      console.warn('[FW mobile app] feed load failed', e);
      var node = $('[data-feed-list="square"]');
      if(node) node.innerHTML = '<div class="error">帖子暂时读取失败，请稍后刷新。</div>';
    }finally{
      loading = false;
    }
  }

  function ensureLoaded(){
    load(false);
  }

  async function requireUser(message){
    if(app().state.user) return app().state.user;
    await app().refreshUser();
    if(app().state.user) return app().state.user;
    app().toast(message || '登录后才能互动。');
    return null;
  }

  function findPost(postId){
    return (app().state.posts || []).find(function(post){ return String(post.id) === String(postId); }) || null;
  }

  async function toggleReaction(post, type, user){
    var db = app().db();
    var client = db && db.client;
    if(!client) throw new Error('db');

    post.myReactions = post.myReactions || {resonance:false, same:false, tissue:false};
    var active = !!post.myReactions[type];
    var targetType = dbType(type);

    if(active){
      var del = await client
        .from('reactions')
        .delete()
        .eq('post_id', post.id)
        .eq('user_id', user.id)
        .eq('type', targetType);
      if(del.error) throw new Error('cancel');
      post.myReactions[type] = false;
      post[type] = Math.max(0, Number(post[type] || 0) - 1);
      return {removed:true};
    }

    var add = await client
      .from('reactions')
      .insert({post_id:post.id, user_id:user.id, type:targetType});
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
    var result = await client
      .from('comments')
      .update({is_deleted:true})
      .eq('id', commentId)
      .eq('user_id', user.id);
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

  function insertAtCursor(input, text){
    var value = input.value || '';
    var start = typeof input.selectionStart === 'number' ? input.selectionStart : value.length;
    var end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
    input.value = value.slice(0, start) + text + value.slice(end);
    var next = start + text.length;
    input.focus();
    if(input.setSelectionRange) input.setSelectionRange(next, next);
    input.dispatchEvent(new Event('input', {bubbles:true}));
    if(input.closest) updateCommentSubmitState(input.closest('[data-comment-form]'));
  }

  function isSquareView(){
    return !!(app() && app().state && app().state.view === 'square');
  }

  function isEditableTarget(target){
    return !!(target && target.closest && target.closest('input,textarea,select,[contenteditable="true"]'));
  }

  function isPublishOpen(){
    var form = $('[data-publish-form]');
    return !!(form && form.classList.contains('is-open'));
  }

  function isEmojiOpen(){
    return !!$('.comment-form.emoji-open');
  }

  function resetSwipe(){
    swipeTracking = false;
    swipeStartX = 0;
    swipeStartY = 0;
  }

  function handleSwipeStart(e){
    if(!isSquareView() || !e.touches || e.touches.length !== 1) return;
    var target = e.target;
    if(isEditableTarget(target) || isPublishOpen() || isEmojiOpen()) return;
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
    if(!isSquareView() || isPublishOpen() || isEmojiOpen()) return;
    var touch = e.changedTouches && e.changedTouches[0];
    if(!touch) return;
    var dx = touch.clientX - startX;
    var dy = touch.clientY - startY;
    if(dx >= 70 && Math.abs(dy) <= 40){
      app().setView('nav');
    }
  }

  function bind(){
    if(bound) return;
    bound = true;

    document.addEventListener('touchstart', handleSwipeStart, {passive:true});
    document.addEventListener('touchend', handleSwipeEnd, {passive:true});
    document.addEventListener('touchcancel', resetSwipe, {passive:true});

    document.addEventListener('click', async function(e){
      var deleteBtn = e.target.closest && e.target.closest('[data-comment-delete]');
      if(deleteBtn){
        e.preventDefault();
        e.stopPropagation();
        var userForDelete = await requireUser('登录后才能删除评论。');
        if(!userForDelete) return;
        if(deleteBtn.disabled) return;
        if(!window.confirm('确定删除这条评论吗？')) return;
        var commentId = deleteBtn.dataset.commentId;
        try{
          deleteBtn.disabled = true;
          await deleteOwnComment(commentId, userForDelete);
          var postId = removeCommentFromState(commentId);
          app().toast('评论已删除');
          renderPreservingScroll(postId);
        }catch(err){
          console.warn('[FW mobile app] delete comment failed', err);
          app().toast('删除失败，请稍后再试。');
        }finally{
          deleteBtn.disabled = false;
        }
        return;
      }

      var emojiToggle = e.target.closest && e.target.closest('[data-comment-emoji-toggle]');
      if(emojiToggle){
        e.preventDefault();
        var emojiForm = emojiToggle.closest('[data-comment-form]');
        if(emojiForm) emojiForm.classList.toggle('emoji-open');
        return;
      }

      var emoji = e.target.closest && e.target.closest('[data-comment-emoji]');
      if(emoji){
        e.preventDefault();
        var form = emoji.closest('[data-comment-form]');
        var input = form && form.querySelector('input[name="content"]');
        if(input) insertAtCursor(input, emoji.dataset.commentEmoji || emoji.textContent || '');
        return;
      }

      var filter = e.target.closest && e.target.closest('[data-filter-status]');
      if(filter){
        app().state.filterStatus = filter.dataset.filterStatus || '全部';
        $$('[data-filter-status]').forEach(function(btn){ btn.classList.toggle('active', btn === filter); });
        renderList();
        return;
      }

      var toggle = e.target.closest && e.target.closest('[data-app-comments]');
      if(toggle){
        var card = toggle.closest('[data-post-id]');
        var comments = $('.comments', card);
        if(comments) comments.classList.toggle('show');
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
          renderPreservingScroll();
        }catch(err){
          console.warn('[FW mobile app] reaction failed', err);
          app().toast(wasActive ? '取消失败，请稍后再试。' : '操作失败，请稍后再试。');
        }finally{
          react.disabled = false;
        }
      }
    });

    document.addEventListener('input', function(e){
      var form = e.target.closest && e.target.closest('[data-comment-form]');
      if(form) updateCommentSubmitState(form);
    });

    document.addEventListener('submit', async function(e){
      var form = e.target.closest && e.target.closest('[data-comment-form]');
      if(!form) return;
      e.preventDefault();
      var user = await requireUser('登录后才能评论。');
      if(!user) return;
      var card = form.closest('[data-post-id]');
      var input = form.querySelector('input[name="content"]');
      var content = (input.value || '').trim();
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
        updateCommentSubmitState(form);
        form.classList.remove('emoji-open');
        app().toast('评论已发送');
        await load(true, {preserveScroll:true, reopenPostId:card.dataset.postId, silent:true});
      }catch(err){
        console.warn('[FW mobile app] comment failed', err);
        app().toast('评论失败，请稍后再试。');
      }finally{
        updateCommentSubmitState(form);
      }
    });
  }

  function init(){
    injectStyle();
    bind();
  }

  window.FWAppFeed = {init:init, load:load, ensureLoaded:ensureLoaded, renderAll:renderList};
})();
