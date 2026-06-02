// F.w 研究所：电脑端评论“回复回复”桥接
// 作用：在已有评论回复系统上补 reply_to_comment_id；楼层仍归到根评论下，不无限缩进。
(function(){
  if(window.__FW_COMMENT_REPLY_TO_REPLY__) return;
  window.__FW_COMMENT_REPLY_TO_REPLY__ = true;

  function $(s, root){ return (root || document).querySelector(s); }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function toast(msg){
    var t = $('.fw-toast');
    if(!t){ t = document.createElement('div'); t.className = 'fw-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwReplyToReplyToast);
    window.__fwReplyToReplyToast = setTimeout(function(){ t.classList.remove('show'); }, 2600);
  }

  async function currentUser(){
    try{ return window.fwDb && window.fwDb.getCurrentUser ? await window.fwDb.getCurrentUser() : null; }
    catch(e){ return null; }
  }

  function rootCommentId(targetLi){
    if(!targetLi) return '';
    if(!targetLi.classList.contains('is-reply')) return targetLi.dataset.commentId || '';
    var prev = targetLi.parentElement;
    while(prev && prev.previousElementSibling){
      prev = prev.previousElementSibling;
      if(prev.matches && prev.matches('.fw-comment-item:not(.is-reply)[data-comment-id]')) return prev.dataset.commentId || '';
    }
    var group = targetLi.closest('.fw-comment-replies');
    var root = group && group.previousElementSibling;
    return root && root.dataset ? (root.dataset.commentId || '') : (targetLi.dataset.commentId || '');
  }

  function readReplyTarget(card){
    var bar = card && card.querySelector('[data-fw-replying-bar]');
    if(!bar || bar.style.display === 'none') return null;
    var box = card.querySelector('[data-fw-comment-box], .comment-box');
    var targetId = box && box.dataset.fwReplyParentId || '';
    if(!targetId) return null;
    var targetLi = card.querySelector('[data-comment-id="' + String(targetId).replace(/"/g,'\\"') + '"]');
    var name = box.dataset.fwReplyName || (targetLi && $('.fw-comment-meta', targetLi) ? $('.fw-comment-meta', targetLi).textContent.split(' · ')[0].replace(/.* 回复 /,'') : '匿名回声');
    return {
      targetCommentId:targetId,
      rootCommentId:rootCommentId(targetLi),
      targetUserId:box.dataset.fwReplyUserId || (targetLi && targetLi.dataset.commentUser) || '',
      name:name || '匿名回声'
    };
  }

  async function submitReply(card, input, submit){
    var client = window.fwDb && window.fwDb.client;
    if(!client) throw new Error('暂时无法连接数据服务。');
    var user = await currentUser();
    if(!user) throw new Error('请先登录后再回复。');
    if(user.disabled) throw new Error('这个账号暂时不能回复。');
    if(user.muted_until && new Date(user.muted_until).getTime() > Date.now()) throw new Error('这个账号正在禁言中。');

    var target = readReplyTarget(card);
    if(!target || !target.targetCommentId) return false;
    var postId = card.dataset.id || card.dataset.postId || '';
    var raw = String(input && input.value || '').trim();
    if(!raw) throw new Error('先写点回复内容。');
    var content = '回复 ' + (target.name || '匿名回声') + '：' + raw;

    var row = {
      post_id:postId,
      user_id:user.id,
      parent_comment_id:target.rootCommentId || target.targetCommentId,
      reply_to_comment_id:target.targetCommentId,
      reply_to_user_id:target.targetUserId || null,
      content:content,
      is_deleted:false
    };
    var result = await client.from('comments').insert(row).select('id').single();
    if(result.error && /reply_to_comment_id|schema cache|column/i.test(String(result.error.message || ''))){
      throw new Error('回复回复字段还没初始化，请先运行 patch-20260602-comment-reply-to-reply.sql。');
    }
    if(result.error) throw result.error;

    if(target.targetUserId && String(target.targetUserId) !== String(user.id)){
      try{
        await client.from('notifications').insert({
          user_id:target.targetUserId,
          actor_id:user.id,
          type:'comment_reply',
          target_type:'comment',
          target_id:result.data && result.data.id,
          content:'回复了你的评论：' + raw.replace(/\s+/g,' ').slice(0,80),
          is_read:false
        });
      }catch(e){ console.warn('[FW reply-to-reply] notification skipped', e); }
    }
    if(input) input.value = '';
    return true;
  }

  async function reload(){
    try{
      if(window.fwDb && window.fwDb.loadPosts){
        var posts = await window.fwDb.loadPosts();
        if(typeof window.savePosts === 'function') window.savePosts(posts);
        if(typeof window.renderFeeds === 'function') window.renderFeeds();
      }
    }catch(e){ console.warn('[FW reply-to-reply] reload skipped', e); }
  }

  document.addEventListener('click', async function(e){
    var btn = e.target.closest && e.target.closest('button[data-sb-action="comment-submit"]');
    if(!btn) return;
    var card = btn.closest('.post-card');
    var box = btn.closest('.comment-box');
    var input = box && box.querySelector('input');
    var target = readReplyTarget(card);
    if(!target || !target.targetCommentId) return;
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    try{
      btn.disabled = true;
      var ok = await submitReply(card, input, btn);
      if(ok){ toast('回复已发送'); await reload(); }
    }catch(err){
      console.warn('[FW reply-to-reply] failed', err);
      toast(err.message || '回复失败，请稍后再试。');
    }finally{
      btn.disabled = false;
    }
  }, true);
})();
