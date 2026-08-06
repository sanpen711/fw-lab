(function(){
  if(window.__FW_SQUARE_UI_FIX_V12__) return;
  window.__FW_SQUARE_UI_FIX_V12__ = true;

  var KEY = 'fw_lab_posts_v1';
  var PAGE_SIZE = 12;
  var visibleCount = PAGE_SIZE;
  var open = {};
  var replying = {};
  var pending = {};
  var syncRunning = null;
  var syncQueued = false;
  var realtimeChannel = null;
  var realtimeTimer = 0;
  var readyTimer = 0;

  var $ = function(selector, root){ return (root || document).querySelector(selector); };
  var $$ = function(selector, root){ return Array.from((root || document).querySelectorAll(selector)); };

  function page(){ return !!$('[data-feed]'); }
  function ready(){ return !!(window.fwDb && window.fwDb.enabled && window.fwDb.client); }
  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function msg(text){
    var toast = $('.fw-toast');
    if(!toast){
      toast = document.createElement('div');
      toast.className = 'fw-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(window.__fwSqMsg);
    window.__fwSqMsg = setTimeout(function(){ toast.classList.remove('show'); }, 2200);
  }
  function pad(n){ return n < 10 ? '0' + n : String(n); }
  function exact(value){
    var date = new Date(value || '');
    if(isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }
  function rel(value){
    var date = new Date(value || '');
    if(isNaN(date.getTime())) return '刚刚';
    var minutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60000);
    if(minutes < 1) return '刚刚';
    if(minutes < 60) return minutes + '分钟前';
    var hours = Math.floor(minutes / 60);
    if(hours < 24) return hours + '小时前';
    return Math.floor(hours / 24) + '天前';
  }
  function time(post){
    var created = post.createdAt || post.created_at;
    var exactText = exact(created);
    return exactText ? rel(created) + ' · ' + exactText : (post.time || '刚刚');
  }
  function profileAttrs(id, name){
    return id ? ' data-fw-profile-open="1" data-user-id="' + esc(id) + '" data-user-name="' + esc(name || '') + '"' : '';
  }
  function avatar(name, url, attrs){
    attrs = attrs || '';
    return url
      ? '<span class="fw-avatar mini"' + attrs + '><img src="' + esc(url) + '" alt=""></span>'
      : '<span class="fw-avatar mini"' + attrs + '>' + esc(String(name || '研').slice(0, 2)) + '</span>';
  }
  function decode(value){ try{ return atob(value); }catch(e){ return ''; } }
  function contentBody(text){
    text = String(text || '');
    var media = '';
    var plain = text.replace(/\[\[FW_(USER_STICKER|MEDIA_IMAGE|MEDIA_VIDEO):([^\]]+)\]\]/g, function(_, kind, encoded){
      var url = decode(encoded);
      if(/^https?:/i.test(url)){
        if(kind === 'MEDIA_VIDEO') media += '<video class="fw-square-video" src="' + esc(url) + '" controls playsinline preload="metadata"></video>';
        else media += '<img class="fw-square-img" src="' + esc(url) + '" alt="">';
      }
      return '';
    });
    return '<p class="post-content">' + esc(plain.trim() || ' ') + '</p>' + (media ? '<div class="fw-square-imgs">' + media + '</div>' : '');
  }

  function readRaw(){
    try{ return localStorage.getItem(KEY) || '[]'; }catch(e){ return '[]'; }
  }
  function posts(){
    try{ return JSON.parse(readRaw()) || []; }catch(e){ return []; }
  }
  function put(list){
    var next = JSON.stringify(list || []);
    if(next === readRaw()) return false;
    try{ localStorage.setItem(KEY, next); }catch(e){}
    return true;
  }
  function mergePending(list){
    list = list || [];
    var ids = {};
    list.forEach(function(post){ ids[String(post.id)] = true; });
    Object.keys(pending).forEach(function(id){
      if(ids[id]) delete pending[id];
      else list.unshift(pending[id]);
    });
    return list;
  }
  function upsertLocal(post){
    var list = posts().filter(function(item){ return String(item.id) !== String(post.id); });
    list.unshift(post);
    put(list);
    render();
  }
  function updateLocalPost(id, updater){
    var found = false;
    var list = posts().map(function(post){
      if(String(post.id) !== String(id)) return post;
      found = true;
      var next = Object.assign({}, post);
      updater(next);
      return next;
    });
    if(found){ put(list); render(); }
  }
  function removeLocalPost(id){
    var key = String(id);
    put(posts().filter(function(post){ return String(post.id) !== key; }));
    delete pending[key];
    delete open[key];
    render();
  }
  function removeLocalComment(postId, commentId){
    delete replying[String(commentId)];
    updateLocalPost(postId, function(post){
      post.comments = (post.comments || []).filter(function(comment){ return String(comment.id) !== String(commentId); });
    });
  }
  function hasOpenComment(){
    return Object.keys(open).some(function(id){ return open[id]; }) || !!$('.comment-box.show');
  }
  function hasPendingToolState(){
    return !!$('[data-fw-post-media-preview].show') ||
      !!$('#fw-post-emoji-panel.show') ||
      !!$('.comment-box[data-fw-pending-media], .fw-square-reply-box[data-fw-pending-media], [data-post-form][data-fw-pending-media]');
  }
  function appendPendingMedia(host, input){
    if(!host || !host.dataset || !host.dataset.fwPendingMedia || !input) return;
    var marker = host.dataset.fwPendingMedia;
    if(String(input.value || '').indexOf(marker) >= 0) return;
    input.value = String(input.value || '').trim()
      ? String(input.value || '').replace(/\s*$/, '') + '\n' + marker
      : marker;
    try{ input.dispatchEvent(new Event('input', {bubbles:true})); }catch(e){}
  }
  function clearPendingMedia(host){
    if(!host || !host.dataset) return;
    delete host.dataset.fwPendingMedia;
    delete host.dataset.fwPendingKind;
    delete host.dataset.fwPendingUrl;
    var preview = host.querySelector('[data-fw-post-media-preview]');
    if(preview){
      preview.classList.remove('show');
      preview.innerHTML = '';
    }
  }

  function reactionClass(post, kind){
    return post.myReactions && post.myReactions[kind] ? ' class="active" aria-pressed="true"' : '';
  }
  function normComment(comment){ return typeof comment === 'string' ? {content:comment} : (comment || {}); }
  function flattenComments(list){
    var flattened = [];
    (list || []).forEach(function(item){
      var comment = normComment(item);
      var replies = comment.replies || [];
      var root = Object.assign({}, comment);
      delete root.replies;
      flattened.push(root);
      replies.forEach(function(reply){
        var next = Object.assign({}, normComment(reply));
        if(!next.parentCommentId) next.parentCommentId = root.id || null;
        flattened.push(next);
      });
    });
    return flattened;
  }
  function groupComments(list){
    var roots = [];
    var rootMap = {};
    var replies = {};
    var normalized = flattenComments(list);
    normalized.forEach(function(comment){
      if(comment.parentCommentId) return;
      roots.push(comment);
      if(comment.id) rootMap[String(comment.id)] = comment;
    });
    normalized.forEach(function(comment){
      if(!comment.parentCommentId) return;
      var key = String(comment.parentCommentId);
      if(!rootMap[key]) return;
      (replies[key] = replies[key] || []).push(comment);
    });
    var count = roots.length;
    Object.keys(replies).forEach(function(key){ count += replies[key].length; });
    return {roots:roots, replies:replies, count:count};
  }
  function replyBox(comment){
    if(!comment.id || !replying[String(comment.id)]) return '';
    return '<div class="fw-square-reply-box show" data-fw-post-tools="1" data-parent-comment-id="' + esc(comment.id) + '">' +
      '<div class="fw-post-media-preview fw-comment-media-preview" data-fw-post-media-preview="1"></div>' +
      '<div class="fw-comment-tools fw-reply-tools"><button type="button" class="fw-post-tool-btn" data-fw-post-emoji title="表情">😊</button><button type="button" class="fw-post-tool-btn" data-fw-post-media title="图片/视频">+</button></div>' +
      '<textarea rows="1" placeholder="回复 @' + esc(comment.authorName || '匿名回声') + '"></textarea>' +
      '<button class="btn dark full" type="button" data-sq="reply-submit">发送回复</button></div>';
  }
  function reply(comment, parent){
    var remove = comment.canDelete && comment.id ? '<button type="button" class="fw-square-delete" data-sq="delete-comment">删除</button>' : '';
    return '<li class="fw-square-comment fw-square-reply" data-comment-id="' + esc(comment.id || '') + '">' +
      avatar(comment.authorName, comment.authorAvatar, profileAttrs(comment.userId, comment.authorName)) +
      '<div><b' + profileAttrs(comment.userId, comment.authorName) + '>' + esc(comment.authorName || '匿名回声') + '</b><span>' + esc(comment.time || '') + '</span>' + remove +
      contentBody('回复 @' + (parent.authorName || '匿名回声') + '：' + (comment.content || '')) + '</div></li>';
  }
  function comment(commentItem, replies){
    var remove = commentItem.canDelete && commentItem.id ? '<button type="button" class="fw-square-delete" data-sq="delete-comment">删除</button>' : '';
    var replyButton = commentItem.id ? '<button type="button" class="fw-square-reply-action" data-sq="reply-toggle">回复</button>' : '';
    var children = (replies || []).map(function(item){ return reply(item, commentItem); }).join('');
    return '<li class="fw-square-comment" data-comment-id="' + esc(commentItem.id || '') + '">' +
      avatar(commentItem.authorName, commentItem.authorAvatar, profileAttrs(commentItem.userId, commentItem.authorName)) +
      '<div><b' + profileAttrs(commentItem.userId, commentItem.authorName) + '>' + esc(commentItem.authorName || '匿名回声') + '</b><span>' + esc(commentItem.time || '') + '</span>' + remove + replyButton +
      contentBody(commentItem.content || '') + replyBox(commentItem) +
      (children ? '<ul class="fw-square-replies">' + children + '</ul>' : '') + '</div></li>';
  }
  function renderKey(post){
    var id = String(post.id);
    var postReplies = {};
    flattenComments(post.comments || []).forEach(function(commentItem){
      if(commentItem.id && replying[String(commentItem.id)]) postReplies[String(commentItem.id)] = true;
    });
    return JSON.stringify({post:post, open:!!open[id], replying:postReplies});
  }
  function card(post, key){
    var id = String(post.id);
    var authorId = post.userId || post.authorId;
    var grouped = groupComments(post.comments || []);
    var isOpen = !!open[id];
    var comments = isOpen ? grouped.roots.map(function(item){
      return comment(item, grouped.replies[String(item.id)] || []);
    }).join('') : '';
    var remove = post.canDelete ? '<button type="button" class="fw-square-delete fw-square-post-delete" data-sq="delete-post">删除</button>' : '';
    var commentBox = isOpen
      ? '<div class="comment-box show"><ul class="comment-list">' + (comments || '<li>还没有回声，可以先留一句。</li>') + '</ul><input placeholder="留一句回声，评论不限量"><button class="btn dark full" type="button" data-sq="comment-submit" style="margin-top:10px">发送回声</button></div>'
      : '<div class="comment-box"></div>';
    return '<article class="post-card" data-id="' + esc(id) + '" data-fw-render-key="' + esc(key) + '">' +
      '<div class="post-top"><span class="status">' + esc(post.status || '今日无效') + '</span><span class="time">' + esc(time(post)) + '</span></div>' +
      '<p class="fw-author">' + avatar(post.authorName, post.authorAvatar, profileAttrs(authorId, post.authorName)) + '<span' + profileAttrs(authorId, post.authorName) + '>' + esc(post.authorName || '匿名研究员') + '</span></p>' +
      contentBody(post.content) +
      '<div class="interactions"><button type="button" data-sq="resonance"' + reactionClass(post, 'resonance') + '>点赞 ' + (post.resonance || 0) + '</button><button type="button" data-sq="comment-toggle">评论 ' + grouped.count + '</button><button type="button" data-sq="same"' + reactionClass(post, 'same') + '>俺也一样 ' + (post.same || 0) + '</button><button type="button" data-sq="tissue"' + reactionClass(post, 'tissue') + '>递纸巾 ' + (post.tissue || 0) + '</button>' + remove + '</div>' +
      commentBox + '</article>';
  }
  function nodeFromHtml(html){
    var template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }
  function patchFeed(feed, list){
    var existing = {};
    var stale = [];
    $$('.post-card[data-id]', feed).forEach(function(node){ existing[String(node.dataset.id)] = node; });
    var desired = list.slice(0, visibleCount);
    var nodes = desired.map(function(post){
      var id = String(post.id);
      var key = renderKey(post);
      var node = existing[id];
      if(!node || node.dataset.fwRenderKey !== key){
        var next = nodeFromHtml(card(post, key));
        if(node && node.parentNode === feed) stale.push(node);
        node = next;
      }
      delete existing[id];
      return node;
    });
    Object.keys(existing).forEach(function(id){ existing[id].remove(); });

    var auxiliary = [];
    if(!list.length){
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = ready() ? '暂时还没有牢骚。可以先投递一条。' : '<span data-desktop-loading>正在读取精神广场...</span>';
      auxiliary.push(empty);
    }else{
      var left = Math.max(0, list.length - desired.length);
      if(left){
        var more = nodeFromHtml('<div class="fw-square-load-more-wrap"><button type="button" class="btn dark" data-square-load-more>加载更多（剩余 ' + left + ' 条）</button></div>');
        auxiliary.push(more);
      }
    }

    var ordered = nodes.concat(auxiliary);
    var anchor = feed.firstChild;
    ordered.forEach(function(node){
      if(node !== anchor) feed.insertBefore(node, anchor);
      anchor = node.nextSibling;
    });
    while(anchor){
      var next = anchor.nextSibling;
      anchor.remove();
      anchor = next;
    }
    feed.dispatchEvent(new CustomEvent('fw:square-rendered', {bubbles:true, detail:{count:desired.length}}));
  }
  function render(){
    if(!page()) return;
    var list = posts();
    var filter = $('.chip.filter.active');
    var active = filter && filter.dataset.filter || '全部';
    if(active !== '全部'){
      list = list.filter(function(post){ return post.status === active || String(post.content || '').indexOf(active) >= 0; });
    }
    $$('[data-feed]').forEach(function(feed){ patchFeed(feed, list); });
  }
  window.__FW_SQUARE_RENDER__ = render;

  async function sync(force){
    if(!ready() || !window.fwDb.loadPosts) return false;
    if(!force && (hasOpenComment() || hasPendingToolState())){
      syncQueued = true;
      return false;
    }
    if(syncRunning){
      syncQueued = syncQueued || !!force;
      return syncRunning;
    }
    syncRunning = (async function(){
      try{
        var list = mergePending(await window.fwDb.loadPosts() || []);
        if(put(list)) render();
        else if(!$('[data-feed] .post-card, [data-feed] .empty')) render();
        return true;
      }catch(e){
        console.warn('[FW square] sync failed', e);
        return false;
      }finally{
        syncRunning = null;
        if(syncQueued){
          syncQueued = false;
          setTimeout(function(){ sync(false); }, 120);
        }
      }
    })();
    return syncRunning;
  }
  function scheduleSync(force, delay){
    clearTimeout(realtimeTimer);
    realtimeTimer = setTimeout(function(){ sync(!!force); }, delay == null ? 180 : delay);
  }
  function startRealtime(){
    if(realtimeChannel || !ready() || !window.fwDb.client.channel) return;
    try{
      realtimeChannel = window.fwDb.client
        .channel('fw-square-desktop-feed')
        .on('postgres_changes', {event:'*', schema:'public', table:'posts'}, function(){ scheduleSync(false); })
        .on('postgres_changes', {event:'*', schema:'public', table:'comments'}, function(){ scheduleSync(false); })
        .on('postgres_changes', {event:'*', schema:'public', table:'reactions'}, function(){ scheduleSync(false); })
        .subscribe();
    }catch(e){
      realtimeChannel = null;
      console.warn('[FW square] realtime unavailable', e);
    }
  }
  function waitForReady(attempt){
    clearTimeout(readyTimer);
    if(ready() && window.fwDb.loadPosts){
      startRealtime();
      sync(true);
      return;
    }
    if(attempt >= 22) return;
    var delay = Math.min(1200, 80 * Math.pow(1.35, attempt));
    readyTimer = setTimeout(function(){ waitForReady(attempt + 1); }, delay);
  }

  async function user(){
    try{ return ready() ? await window.fwDb.getCurrentUser() : null; }catch(e){ return null; }
  }
  function login(){
    var button = $('[data-fw-open], [data-login-cta]');
    if(button) button.click();
  }
  function findPost(id){
    return posts().find(function(post){ return String(post.id) === String(id); }) || null;
  }
  function findComment(post, id){
    var all = flattenComments(post && post.comments || []);
    return all.find(function(comment){ return String(comment.id) === String(id); }) || null;
  }
  function notify(targetUserId, actorId, type, targetType, targetId, content){
    if(!targetUserId || !actorId || String(targetUserId) === String(actorId) || !ready()) return;
    window.fwDb.client.from('notifications').insert({
      user_id:targetUserId,
      actor_id:actorId,
      type:type,
      target_type:targetType,
      target_id:targetId,
      content:String(content || '').replace(/\s+/g, ' ').slice(0, 100),
      is_read:false
    }).then(function(result){
      if(result && result.error) console.warn('[FW square] notification skipped', result.error);
    }).catch(function(){});
  }

  async function doPost(form){
    if(form.dataset.sqSubmitting === '1') return;
    form.dataset.sqSubmitting = '1';
    var button = form.querySelector('button[type="submit"],button.btn.dark.full');
    if(button){
      button.disabled = true;
      button.dataset.old = button.textContent;
      button.textContent = '发布中...';
    }
    try{
      var current = await user();
      if(!current){ msg('请先登录再发布。'); login(); return; }
      var textarea = form.querySelector('textarea');
      appendPendingMedia(form, textarea);
      var value = String(textarea && textarea.value || '').trim();
      if(!value){ if(textarea) textarea.focus(); return; }
      var statusChip = form.querySelector('.chip.active[data-status]');
      var status = statusChip && statusChip.dataset.status || '今日无效';
      var result = await window.fwDb.createPost({content:value, status:status});
      var now = new Date().toISOString();
      var id = result && result.id ? result.id : 'local-' + Date.now();
      var localPost = {
        id:id,
        userId:current.id,
        authorId:current.id,
        authorName:current.nickname || '匿名研究员',
        authorAvatar:current.avatar_url || '',
        status:status,
        content:value,
        time:'刚刚',
        createdAt:now,
        resonance:0,
        same:0,
        tissue:0,
        comments:[],
        canDelete:true,
        myReactions:{resonance:false, same:false, tissue:false}
      };
      pending[String(id)] = localPost;
      if(textarea) textarea.value = '';
      clearPendingMedia(form);
      upsertLocal(localPost);
      msg('已投递到研究所。');
      scheduleSync(true, 500);
      setTimeout(function(){ sync(true); }, 2500);
    }finally{
      delete form.dataset.sqSubmitting;
      if(button){
        button.disabled = false;
        button.textContent = button.dataset.old || '发布 →';
      }
    }
  }

  window.addEventListener('submit', function(event){
    var form = event.target.closest && event.target.closest('[data-post-form]');
    if(!form || !page()) return;
    event.preventDefault();
    event.stopPropagation();
    if(event.stopImmediatePropagation) event.stopImmediatePropagation();
    doPost(form).catch(function(error){ msg(error.message || String(error)); });
  }, true);

  window.addEventListener('click', function(event){
    var publish = event.target.closest && event.target.closest('[data-post-form] button[type="submit"], [data-post-form] .btn.dark.full');
    if(publish && page() && !publish.dataset.sq){
      var form = publish.closest('[data-post-form]');
      if(form){
        event.preventDefault();
        event.stopPropagation();
        if(event.stopImmediatePropagation) event.stopImmediatePropagation();
        doPost(form).catch(function(error){ msg(error.message || String(error)); });
        return;
      }
    }

    var more = event.target.closest && event.target.closest('[data-square-load-more]');
    if(more && page()){
      event.preventDefault();
      visibleCount += PAGE_SIZE;
      render();
      return;
    }

    var button = event.target.closest && event.target.closest('button[data-sq]');
    if(!button || !page()) return;
    var postCard = button.closest('.post-card');
    if(!postCard) return;
    var action = button.dataset.sq;
    if(!/^(resonance|same|tissue|comment-toggle|comment-submit|delete-post|delete-comment|reply-toggle|reply-submit)$/.test(action || '')) return;

    event.preventDefault();
    event.stopPropagation();
    if(event.stopImmediatePropagation) event.stopImmediatePropagation();
    var postId = String(postCard.dataset.id);

    if(action === 'comment-toggle'){
      open[postId] = !open[postId];
      render();
      if(!open[postId]) scheduleSync(false, 80);
      return;
    }
    if(action === 'reply-toggle'){
      var root = button.closest('[data-comment-id]');
      var replyId = root && root.dataset.commentId;
      if(!replyId) return;
      replying[replyId] = !replying[replyId];
      render();
      return;
    }
    if(action === 'delete-post'){
      if(!window.confirm('确定删除这条牢骚吗？')) return;
      button.disabled = true;
      (async function(){
        var current = await user();
        if(!current){ msg('请先登录再删除。'); login(); return; }
        await window.fwDb.deleteOwnPost({postId:postId});
        removeLocalPost(postId);
        msg('牢骚已删除。');
        scheduleSync(true, 500);
      })().catch(function(error){ msg(error.message || String(error)); }).finally(function(){ button.disabled = false; });
      return;
    }
    if(action === 'delete-comment'){
      var row = button.closest('[data-comment-id]');
      var commentId = row && row.dataset.commentId;
      if(!commentId || !window.confirm('确定删除这条回声吗？')) return;
      button.disabled = true;
      (async function(){
        var current = await user();
        if(!current){ msg('请先登录再删除。'); login(); return; }
        await window.fwDb.deleteOwnComment({commentId:commentId});
        removeLocalComment(postId, commentId);
        msg('回声已删除。');
        scheduleSync(true, 500);
      })().catch(function(error){ msg(error.message || String(error)); }).finally(function(){ button.disabled = false; });
      return;
    }

    if((action === 'comment-submit' || action === 'reply-submit') && button.dataset.sqSubmitting === '1') return;
    if(action === 'comment-submit' || action === 'reply-submit'){
      button.dataset.sqSubmitting = '1';
      button.disabled = true;
    }

    (async function(){
      var current = await user();
      if(!current){ msg('请先登录再互动。'); login(); return; }
      if(action !== 'comment-submit' && action !== 'reply-submit') button.disabled = true;
      var localPost = findPost(postId);

      if(action === 'comment-submit'){
        var commentBox = postCard.querySelector('.comment-box');
        var input = commentBox && commentBox.querySelector(':scope > input');
        appendPendingMedia(commentBox, input);
        var value = String(input && input.value || '').trim();
        if(!value) return;
        var created = await window.fwDb.createComment({postId:postId, content:value});
        open[postId] = true;
        clearPendingMedia(commentBox);
        updateLocalPost(postId, function(post){
          post.comments = flattenComments(post.comments || []);
          post.comments.push({id:created && created.id, userId:current.id, parentCommentId:null, authorName:current.nickname || '匿名回声', authorAvatar:current.avatar_url || '', content:value, time:'刚刚', canDelete:true});
        });
        if(localPost) notify(localPost.userId || localPost.authorId, current.id, 'comment', 'post', postId, '评论了你的帖子：' + value);
        msg('回声已发送。');
      }else if(action === 'reply-submit'){
        var replyEditor = button.closest('[data-parent-comment-id]');
        var parentId = replyEditor && replyEditor.dataset.parentCommentId;
        var textarea = replyEditor && replyEditor.querySelector('textarea');
        appendPendingMedia(replyEditor, textarea);
        var text = String(textarea && textarea.value || '').trim();
        if(!parentId || !text) return;
        var targetComment = findComment(localPost, parentId);
        var createdReply = await window.fwDb.createComment({postId:postId, content:text, parentCommentId:parentId});
        clearPendingMedia(replyEditor);
        if(textarea) textarea.value = '';
        replying[parentId] = false;
        updateLocalPost(postId, function(post){
          post.comments = flattenComments(post.comments || []);
          post.comments.push({id:createdReply && createdReply.id, userId:current.id, parentCommentId:parentId, authorName:current.nickname || '匿名回声', authorAvatar:current.avatar_url || '', content:text, time:'刚刚', canDelete:true});
        });
        if(targetComment) notify(targetComment.userId, current.id, 'comment_reply', 'comment', createdReply && createdReply.id, '回复了你的评论：' + text);
        msg('回复已发送。');
      }else{
        var reaction = await window.fwDb.react({postId:postId, type:action});
        updateLocalPost(postId, function(post){
          post.myReactions = post.myReactions || {resonance:false, same:false, tissue:false};
          post.myReactions[action] = true;
          if(!reaction || !reaction.already){
            if(action === 'resonance') post.resonance = (post.resonance || 0) + 1;
            if(action === 'same') post.same = (post.same || 0) + 1;
            if(action === 'tissue') post.tissue = (post.tissue || 0) + 1;
          }
        });
        msg(reaction && reaction.already ? '你已经表达过了。' : '已收到。');
      }
      scheduleSync(true, 800);
    })().catch(function(error){
      msg(error.message || String(error));
    }).finally(function(){
      if(action === 'comment-submit' || action === 'reply-submit') delete button.dataset.sqSubmitting;
      button.disabled = false;
    });
  }, true);

  var style = document.createElement('style');
  style.textContent = '.comment-box.show{display:block!important}.comment-box.show[data-fw-post-tools="1"]{display:grid!important;grid-template-columns:auto minmax(0,1fr);column-gap:8px;align-items:center}.comment-box.show[data-fw-post-tools="1"] .comment-list,.comment-box.show[data-fw-post-tools="1"] .fw-comment-media-preview,.comment-box.show[data-fw-post-tools="1"] button[data-sq="comment-submit"]{grid-column:1 / -1}.comment-box.show[data-fw-post-tools="1"] .fw-comment-tools{grid-column:1;margin:10px 0 0}.comment-box.show[data-fw-post-tools="1"]>input{grid-column:2;min-width:0;margin-top:10px}.post-top .time{font-size:12px;opacity:.9}.fw-square-imgs{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}.fw-square-img{max-width:280px;max-height:340px;object-fit:contain;border-radius:12px}.fw-square-video{max-width:300px;max-height:360px;border-radius:12px;background:#111}.fw-square-comment{list-style:none;display:grid;grid-template-columns:28px 1fr;gap:8px;margin:8px 0}.fw-square-comment p{margin:2px 0 0}.fw-square-comment span{margin-left:6px;color:#777;font-size:12px}.fw-square-comment .fw-square-imgs{margin-top:6px}.fw-square-comment .fw-square-img{max-width:180px;max-height:220px}.fw-square-replies{margin:8px 0 0;padding:0}.fw-square-reply{margin-top:8px}.fw-square-reply-action{margin-left:8px;border:0;background:transparent;color:#5f5a67;font-size:12px;font-weight:900;cursor:pointer}.fw-square-reply-box{display:none;gap:8px;align-items:center;margin-top:8px}.fw-square-reply-box.show{display:flex}.fw-square-reply-box textarea{flex:1;min-height:38px;resize:vertical}.fw-square-reply-box button{white-space:nowrap}.fw-square-reply-box.show[data-fw-post-tools="1"]{display:grid!important;grid-template-columns:auto minmax(0,1fr);column-gap:8px;align-items:center}.fw-square-reply-box.show[data-fw-post-tools="1"] .fw-comment-media-preview,.fw-square-reply-box.show[data-fw-post-tools="1"] button[data-sq="reply-submit"]{grid-column:1 / -1}.fw-square-reply-box.show[data-fw-post-tools="1"] .fw-comment-tools{grid-column:1;margin:8px 0 0}.fw-square-reply-box.show[data-fw-post-tools="1"] textarea{grid-column:2;min-width:0;margin-top:8px}.fw-square-reply-box.show[data-fw-post-tools="1"] button[data-sq="reply-submit"]{margin-top:10px}.interactions button.active{background:#1b1b18;color:#fffdf7;border-color:#1b1b18}.fw-square-delete{margin-left:8px;border:0;background:transparent;color:#9d4a4a;font-size:12px;font-weight:900;cursor:pointer}.interactions .fw-square-post-delete{margin-left:auto;border:0;background:transparent;color:#9d4a4a;padding-left:4px;padding-right:4px}.interactions .fw-square-post-delete:hover{background:transparent;color:#9d4a4a}.fw-square-delete[disabled]{opacity:.55;cursor:not-allowed}@media(max-width:560px){.comment-box.show[data-fw-post-tools="1"],.fw-square-reply-box.show[data-fw-post-tools="1"]{grid-template-columns:1fr}.comment-box.show[data-fw-post-tools="1"] .fw-comment-tools,.comment-box.show[data-fw-post-tools="1"]>input,.fw-square-reply-box.show[data-fw-post-tools="1"] .fw-comment-tools,.fw-square-reply-box.show[data-fw-post-tools="1"] textarea{grid-column:1}.comment-box.show[data-fw-post-tools="1"]>input,.fw-square-reply-box.show[data-fw-post-tools="1"] textarea{margin-top:8px}}';
  document.head.appendChild(style);

  function boot(){
    render();
    waitForReady(0);
    window.addEventListener('online', function(){ scheduleSync(true, 80); });
    window.addEventListener('focus', function(){ if(!document.hidden) scheduleSync(false, 120); });
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) scheduleSync(false, 120); });
    window.addEventListener('beforeunload', function(){
      if(realtimeChannel && ready() && window.fwDb.client.removeChannel){
        try{ window.fwDb.client.removeChannel(realtimeChannel); }catch(e){}
      }
    }, {once:true});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
