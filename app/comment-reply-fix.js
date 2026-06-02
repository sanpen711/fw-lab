// F.w 研究所：手机端评论父级回复桥接
// 作用：不重写 feed.js，只在回复评论提交时把 parent_comment_id / reply_to_user_id 真正写入数据库。
(function(){
  if(window.__FW_MOBILE_COMMENT_REPLY_FIX__) return;
  window.__FW_MOBILE_COMMENT_REPLY_FIX__ = true;

  function app(){ return window.FWApp || null; }
  function $(selector, root){ return (root || document).querySelector(selector); }
  function toast(message){ var fw = app(); if(fw && fw.toast) fw.toast(message); else alert(message); }
  function db(){ return window.fwDb || null; }
  function client(){ return db() && db().client; }

  function getDraftReply(postId){
    var form = document.querySelector('[data-comment-form][data-comment-kind="reply"][data-post-id="' + String(postId).replace(/"/g, '\\"') + '"]');
    if(!form) return null;
    var replyBox = form.closest('.comment-inline-reply');
    var host = replyBox && replyBox.closest('[data-comment-id]');
    if(!host) return null;
    var commentId = host.dataset.commentId || '';
    if(!commentId) return null;
    var author = host.querySelector('.comment-author-name');
    return {
      form:form,
      parentCommentId:commentId,
      name:(author && author.textContent || '匿名回声').trim()
    };
  }

  function cleanReplyPrefix(content, name){
    content = String(content || '').trim();
    name = String(name || '').trim();
    if(!content || !name) return content;
    var prefix = '回复 ' + name + '：';
    if(content.indexOf(prefix) === 0) return content.slice(prefix.length).trim();
    return content;
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

  function findCommentInPost(post, commentId){
    var comments = post && post.comments || [];
    for(var i = 0; i < comments.length; i += 1){
      if(String(comments[i].id) === String(commentId)) return comments[i];
    }
    return null;
  }

  function renderPost(postId){
    var fw = app();
    if(!fw || !window.FWAppFeed) return;
    if(fw.state && fw.state.view === 'square-detail' && window.FWAppFeed.openDetail){
      window.FWAppFeed.openDetail(postId);
      return;
    }
    if(window.FWAppFeed.renderAll) window.FWAppFeed.renderAll();
  }

  async function reloadPost(postId){
    if(window.FWAppFeed && window.FWAppFeed.load){
      try{ await window.FWAppFeed.load(true, {preserveScroll:true, detailPostId:postId, silent:true}); return; }
      catch(e){ console.warn('[FW mobile comment reply] reload failed', e); }
    }
    renderPost(postId);
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
    var rawText = input ? input.value : '';
    var content = cleanReplyPrefix(rawText, replyInfo.name);
    if(!content.trim()) throw new Error('先写点回复内容。');

    var post = findPost(postId);
    var parent = findCommentInPost(post, replyInfo.parentCommentId) || {};
    var parentUserId = parent.userId || parent.user_id || null;

    var row = {
      post_id:postId,
      user_id:user.id,
      parent_comment_id:replyInfo.parentCommentId,
      reply_to_user_id:parentUserId,
      content:content.trim(),
      is_deleted:false
    };

    var result = await c.from('comments').insert(row).select('id').single();
    if(result.error) throw result.error;

    if(parentUserId && String(parentUserId) !== String(user.id)){
      try{
        await c.from('notifications').insert({
          user_id:parentUserId,
          actor_id:user.id,
          type:'comment_reply',
          target_type:'comment',
          target_id:result.data && result.data.id,
          content:'回复了你的评论：' + content.trim().replace(/\s+/g, ' ').slice(0, 80),
          is_read:false
        });
      }catch(e){ console.warn('[FW mobile comment reply] notification skipped', e); }
    }

    if(input) input.value = '';
    return result.data;
  }

  function bind(){
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
