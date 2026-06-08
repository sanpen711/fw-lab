// F.w 研究所：手机端评论父级回复桥接 + 父子评论展示
// 作用：回复评论时写入 parent_comment_id / reply_to_comment_id / reply_to_user_id，并把详情页评论按父子结构展示。
(function(){
  if(window.__FW_MOBILE_COMMENT_REPLY_FIX__) return;
  window.__FW_MOBILE_COMMENT_REPLY_FIX__ = true;

  var observerBound = false;
  var renderTimer = null;
  var threading = false;

  function app(){ return window.FWApp || null; }
  function toast(message){ var fw = app(); if(fw && fw.toast) fw.toast(message); else alert(message); }
  function db(){ return window.fwDb || null; }
  function client(){ return db() && db().client; }

  function injectStyle(){
    if(document.getElementById('fwMobileCommentThreadStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileCommentThreadStyle';
    style.textContent = [
      '.detail-comment-list.is-threaded{display:grid;gap:12px}',
      '.comment-thread{display:grid;gap:8px}',
      '.comment-thread>.comment{margin:0}',
      '.comment-replies{display:grid;gap:8px;margin-left:38px;padding-left:10px;border-left:2px solid rgba(16,23,15,.08)}',
      '.comment-replies .comment{margin:0;padding-top:6px}',
      '.comment-replies .post-avatar{width:28px;height:28px;font-size:11px}',
      '.comment-replies .comment-info-line{font-size:12px}',
      '.comment-replies .fw-rich-content{font-size:13px;line-height:1.55}',
      '.comment-root-item>.comment-body{min-width:0}',
      '.comment-reply-item>.comment-body{min-width:0}',
      '@media (max-width:380px){.comment-replies{margin-left:28px;padding-left:8px}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function getDraftReply(postId){
    var form = document.querySelector('[data-comment-form][data-comment-kind="reply"][data-post-id="' + String(postId).replace(/"/g, '\\"') + '"]');
    if(!form) return null;
    var replyBox = form.closest('.comment-inline-reply');
    var host = replyBox && replyBox.closest('[data-comment-id]');
    if(!host) return null;
    var targetCommentId = host.dataset.commentId || '';
    if(!targetCommentId) return null;
    var author = host.querySelector('.comment-author-name');
    return {
      form:form,
      targetCommentId:targetCommentId,
      name:(author && author.textContent || '匿名回声').trim()
    };
  }

  function normalizeText(content){
    return String(content || '').trim();
  }

  async function waitUser(){
    var fw = app();
    if(fw && fw.state && fw.state.user) return fw.state.user;
    if(fw && fw.refreshUser){
      try{ return await fw.refreshUser(); }catch(e){}
    }
    if(db() && db().getCurrentUser){
      try{ return await db().getCurrentUser(); }catch(e){}
    }
    return null;
  }

  function findPost(postId){
    var fw = app();
    var posts = fw && fw.state && fw.state.posts || [];
    for(var i = 0; i < posts.length; i += 1){
      if(String(posts[i].id) === String(postId)) return posts[i];
    }
    return null;
  }

  function commentParentId(comment){
    return comment && (comment.parentCommentId || comment.parent_comment_id) || null;
  }

  function findCommentInPost(post, commentId){
    var comments = post && post.comments || [];
    for(var i = 0; i < comments.length; i += 1){
      var c = comments[i];
      if(String(c.id) === String(commentId)) return c;
      var replies = c.replies || [];
      for(var j = 0; j < replies.length; j += 1){
        if(String(replies[j].id) === String(commentId)) return replies[j];
      }
    }
    return null;
  }

  function findRootCommentId(post, targetComment){
    if(!targetComment) return null;
    if(!commentParentId(targetComment)) return targetComment.id;
    return commentParentId(targetComment) || targetComment.id;
  }

  function buildCommentTree(comments){
    comments = comments || [];
    var byId = {};
    comments.forEach(function(comment){
      if(comment && comment.id != null) byId[String(comment.id)] = comment;
    });

    function rootIdOf(comment){
      var parentId = commentParentId(comment);
      if(!parentId || !byId[String(parentId)]) return String(comment.id);
      var guard = 0;
      var current = byId[String(parentId)];
      while(current && commentParentId(current) && byId[String(commentParentId(current))] && guard < 20){
        current = byId[String(commentParentId(current))];
        guard += 1;
      }
      return current && current.id != null ? String(current.id) : String(comment.id);
    }

    var rootIds = [];
    var repliesByRoot = {};
    comments.forEach(function(comment){
      if(!comment || comment.id == null) return;
      var id = String(comment.id);
      var parentId = commentParentId(comment);
      if(parentId && byId[String(parentId)]){
        var rootId = rootIdOf(comment);
        if(rootId === id){
          rootIds.push(id);
        }else{
          (repliesByRoot[rootId] = repliesByRoot[rootId] || []).push(comment);
        }
      }else{
        rootIds.push(id);
      }
    });
    return {rootIds:rootIds, repliesByRoot:repliesByRoot};
  }

  function commentSignature(comments){
    return (comments || []).map(function(comment){
      return [comment.id, commentParentId(comment) || '', comment.replyToCommentId || comment.reply_to_comment_id || ''].join(':');
    }).join('|');
  }

  function applyThreadedComments(postId){
    if(threading) return;
    var post = findPost(postId || currentDetailPostId());
    var list = document.querySelector('.detail-comment-list');
    if(!post || !list) return;
    var comments = post.comments || [];
    if(!comments.length) return;

    var signature = commentSignature(comments);
    if(list.dataset.threadSignature === signature && list.classList.contains('is-threaded')) return;

    var nodes = Array.from(list.querySelectorAll('.comment[data-comment-id]'));
    if(!nodes.length) return;
    var nodeById = {};
    nodes.forEach(function(node){
      nodeById[String(node.dataset.commentId || '')] = node;
    });

    var tree = buildCommentTree(comments);
    var used = {};
    var frag = document.createDocumentFragment();

    threading = true;
    try{
      tree.rootIds.forEach(function(rootId){
        var rootNode = nodeById[String(rootId)];
        if(!rootNode) return;
        used[String(rootId)] = true;
        rootNode.classList.add('comment-root-item');
        rootNode.classList.remove('comment-reply-item');

        var thread = document.createElement('div');
        thread.className = 'comment-thread';
        thread.dataset.rootCommentId = String(rootId);
        thread.appendChild(rootNode);

        var replies = tree.repliesByRoot[String(rootId)] || [];
        if(replies.length){
          var replyBox = document.createElement('div');
          replyBox.className = 'comment-replies';
          replyBox.dataset.repliesFor = String(rootId);
          replies.forEach(function(reply){
            var replyNode = nodeById[String(reply.id)];
            if(!replyNode) return;
            used[String(reply.id)] = true;
            replyNode.classList.add('comment-reply-item');
            replyNode.classList.remove('comment-root-item');
            replyBox.appendChild(replyNode);
          });
          if(replyBox.children.length) thread.appendChild(replyBox);
        }

        frag.appendChild(thread);
      });

      nodes.forEach(function(node){
        var id = String(node.dataset.commentId || '');
        if(used[id]) return;
        var orphan = document.createElement('div');
        orphan.className = 'comment-thread comment-thread-orphan';
        node.classList.add('comment-root-item');
        node.classList.remove('comment-reply-item');
        orphan.appendChild(node);
        frag.appendChild(orphan);
      });

      list.innerHTML = '';
      list.appendChild(frag);
      list.classList.add('is-threaded');
      list.dataset.threadSignature = signature;
    }finally{
      threading = false;
    }
  }

  function currentDetailPostId(){
    var card = document.querySelector('.detail-comments-card[data-post-id]');
    return card && card.dataset.postId || '';
  }

  function scheduleThreadRender(postId){
    clearTimeout(renderTimer);
    renderTimer = setTimeout(function(){
      applyThreadedComments(postId || currentDetailPostId());
    }, 30);
  }

  function bindThreadObserver(){
    if(observerBound) return;
    observerBound = true;
    var target = document.getElementById('appMain') || document.body;
    if(window.MutationObserver && target){
      var observer = new MutationObserver(function(mutations){
        if(threading) return;
        for(var i = 0; i < mutations.length; i += 1){
          var node = mutations[i].target;
          if(node && node.closest && (node.closest('.square-detail-body') || node.closest('.detail-comment-list'))){
            scheduleThreadRender();
            return;
          }
        }
      });
      observer.observe(target, {childList:true, subtree:true});
    }
    document.addEventListener('click', function(){ setTimeout(function(){ scheduleThreadRender(); }, 80); }, true);
  }

  function renderPost(postId){
    var fw = app();
    if(!fw || !window.FWAppFeed) return;
    if(fw.state && fw.state.view === 'square-detail' && window.FWAppFeed.openDetail){
      window.FWAppFeed.openDetail(postId);
      scheduleThreadRender(postId);
      return;
    }
    if(window.FWAppFeed.renderAll) window.FWAppFeed.renderAll();
  }

  async function reloadPost(postId){
    if(window.FWAppFeed && window.FWAppFeed.load){
      try{
        await window.FWAppFeed.load(true, {preserveScroll:true, detailPostId:postId, silent:true});
        scheduleThreadRender(postId);
        return;
      }catch(e){ console.warn('[FW mobile comment reply] reload failed', e); }
    }
    renderPost(postId);
    scheduleThreadRender(postId);
  }

  async function insertReply(form, replyInfo){
    var c = client();
    if(!c) throw new Error('暂时无法连接数据服务。');
    var user = await waitUser();
    if(!user) throw new Error('请先登录后再回复。');
    if(user.disabled) throw new Error('这个账号暂时不能回复。');
    if(user.muted_until && new Date(user.muted_until).getTime() > Date.now()) throw new Error('这个账号正在禁言中。');

    var postId = form.dataset.postId;
    var input = form.querySelector('input[name="content"]');
    var rawText = normalizeText(input ? input.value : '');
    if(!rawText) throw new Error('先写点回复内容。');

    var post = findPost(postId);
    var target = findCommentInPost(post, replyInfo.targetCommentId) || {};
    var rootCommentId = findRootCommentId(post, target) || replyInfo.targetCommentId;
    var targetUserId = target.userId || target.user_id || null;
    var displayContent = '回复 ' + (replyInfo.name || '匿名回声') + '：' + rawText;

    var row = {
      post_id:postId,
      user_id:user.id,
      parent_comment_id:rootCommentId,
      reply_to_comment_id:replyInfo.targetCommentId,
      reply_to_user_id:targetUserId,
      content:displayContent,
      is_deleted:false
    };

    var result = await c.from('comments').insert(row).select('id').single();
    if(result.error && /reply_to_comment_id|schema cache|column/i.test(String(result.error.message || ''))){
      throw new Error('回复回复字段还没初始化，请先运行 patch-20260602-comment-reply-to-reply.sql。');
    }
    if(result.error) throw result.error;

    if(targetUserId && String(targetUserId) !== String(user.id)){
      try{
        await c.from('notifications').insert({
          user_id:targetUserId,
          actor_id:user.id,
          type:'comment_reply',
          target_type:'comment',
          target_id:result.data && result.data.id,
          content:'回复了你的评论：' + rawText.replace(/\s+/g, ' ').slice(0, 80),
          is_read:false
        });
      }catch(e){ console.warn('[FW mobile comment reply] notification skipped', e); }
    }

    if(input) input.value = '';
    return result.data;
  }

  function bind(){
    injectStyle();
    bindThreadObserver();
    scheduleThreadRender();

    document.addEventListener('submit', async function(e){
      var form = e.target && e.target.closest && e.target.closest('[data-comment-form][data-comment-kind="reply"]');
      if(!form) return;
      var postId = form.dataset.postId || '';
      var replyInfo = getDraftReply(postId);
      if(!replyInfo || replyInfo.form !== form) return;

      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();

      var submit = form.querySelector('button[type="submit"]');
      try{
        if(submit) submit.disabled = true;
        await insertReply(form, replyInfo);
        toast('回复已发送');
        await reloadPost(postId);
      }catch(err){
        console.warn('[FW mobile comment reply] failed', err);
        toast(err.message || '回复失败，请稍后再试。');
      }finally{
        if(submit) submit.disabled = false;
      }
    }, true);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
