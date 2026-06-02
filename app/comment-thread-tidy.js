// F.w 研究所：手机端评论楼层整理
// 作用：只整理显示顺序，不改发帖/点赞/举报/搭子等功能。
(function(){
  if(window.__FW_MOBILE_COMMENT_THREAD_TIDY__) return;
  window.__FW_MOBILE_COMMENT_THREAD_TIDY__ = true;

  var busy = false;
  var lastRun = 0;

  function client(){ return window.fwDb && window.fwDb.client; }
  function escId(value){ return String(value || '').replace(/"/g, '\\"'); }

  function injectStyle(){
    if(document.getElementById('fwMobileCommentThreadTidyStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileCommentThreadTidyStyle';
    style.textContent = [
      '.mobile-thread-replies{margin:6px 0 8px 38px;padding-left:10px;border-left:2px solid rgba(157,74,74,.16);display:grid;gap:8px}',
      '.mobile-thread-replies .comment-flow-item{margin:0!important}',
      '.mobile-thread-replies .mobile-thread-replies{margin-left:0!important;padding-left:0!important;border-left:0!important}',
      '.comment-flow-item.mobile-thread-reply{background:rgba(255,255,255,.42);border-radius:16px;padding:8px 8px 8px 0}',
      '.comment-flow-item.mobile-thread-root{margin-bottom:2px}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function visibleCards(){
    return Array.prototype.slice.call(document.querySelectorAll('.detail-comments-card[data-post-id]'));
  }

  async function fetchCommentMap(postIds){
    var c = client();
    if(!c || !postIds.length) return {};
    var result = await c
      .from('comments')
      .select('id,post_id,parent_comment_id,reply_to_comment_id,created_at')
      .in('post_id', postIds)
      .or('is_deleted.eq.false,is_deleted.is.null')
      .order('created_at', {ascending:true});
    if(result.error){
      console.warn('[FW mobile comment tidy] load failed', result.error);
      return {};
    }
    var map = {};
    (result.data || []).forEach(function(row){ map[String(row.id)] = row; });
    return map;
  }

  function rootIdFor(row, map){
    if(!row) return '';
    var current = row;
    var guard = 0;
    while(current && current.parent_comment_id && map[String(current.parent_comment_id)] && guard < 30){
      current = map[String(current.parent_comment_id)];
      guard += 1;
    }
    return current && current.id ? String(current.id) : String(row.id || '');
  }

  function ensureRepliesBox(rootNode){
    if(!rootNode) return null;
    var next = rootNode.nextElementSibling;
    if(next && next.classList && next.classList.contains('mobile-thread-replies')) return next;
    var box = document.createElement('div');
    box.className = 'mobile-thread-replies';
    box.dataset.mobileThreadRepliesFor = rootNode.dataset.commentId || '';
    rootNode.insertAdjacentElement('afterend', box);
    return box;
  }

  function tidyCard(card, map){
    var list = card.querySelector('.detail-comment-list');
    if(!list) return;

    Array.prototype.slice.call(list.querySelectorAll('.mobile-thread-replies .mobile-thread-replies')).forEach(function(nested){
      var outer = nested.closest('.mobile-thread-replies');
      if(!outer || outer === nested) return;
      Array.prototype.slice.call(nested.children).forEach(function(child){ outer.appendChild(child); });
      nested.remove();
    });

    var nodes = Array.prototype.slice.call(list.querySelectorAll('.comment-flow-item[data-comment-id]'));
    nodes.forEach(function(node){
      node.classList.remove('mobile-thread-root','mobile-thread-reply');
    });

    nodes.forEach(function(node){
      var id = String(node.dataset.commentId || '');
      var row = map[id];
      if(!row) return;
      if(!row.parent_comment_id){
        node.classList.add('mobile-thread-root');
        if(node.parentElement && node.parentElement.classList.contains('mobile-thread-replies')){
          list.insertBefore(node, node.parentElement);
        }
        return;
      }
      var rootId = rootIdFor(row, map);
      var rootNode = list.querySelector('.comment-flow-item[data-comment-id="' + escId(rootId) + '"]');
      if(!rootNode || rootNode === node) return;
      var box = ensureRepliesBox(rootNode);
      if(!box) return;
      node.classList.add('mobile-thread-reply');
      box.appendChild(node);
    });
  }

  async function tidy(){
    injectStyle();
    if(busy) return;
    var now = Date.now();
    if(now - lastRun < 260) return;
    lastRun = now;
    var cards = visibleCards();
    if(!cards.length) return;
    busy = true;
    try{
      var postIds = cards.map(function(card){ return card.dataset.postId; }).filter(Boolean);
      var map = await fetchCommentMap(postIds);
      cards.forEach(function(card){ tidyCard(card, map); });
    }finally{
      busy = false;
    }
  }

  function schedule(){ setTimeout(tidy, 80); }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule);
  else schedule();

  document.addEventListener('click', schedule, true);
  setInterval(tidy, 1200);
  if(window.MutationObserver){
    new MutationObserver(schedule).observe(document.body, {childList:true, subtree:true});
  }
})();
