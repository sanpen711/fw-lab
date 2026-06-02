// F.w 研究所：电脑端评论显示整理
(function(){
  if(window.__FW_COMMENT_THREAD_TIDY__) return;
  window.__FW_COMMENT_THREAD_TIDY__ = true;

  function injectStyle(){
    if(document.getElementById('fwCommentThreadTidyStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwCommentThreadTidyStyle';
    style.textContent = '.fw-comment-replies{margin-top:4px!important;padding-left:0!important}.fw-comment-replies .fw-comment-item{margin-left:34px!important;border-left:2px solid rgba(157,74,74,.18);padding-left:10px}.fw-comment-replies .fw-comment-replies{margin-left:0!important}.fw-comment-replies .fw-comment-item .fw-comment-actions{opacity:.92}';
    document.head.appendChild(style);
  }

  function tidyCard(card){
    if(!card) return;
    var list = card.querySelector('.comment-list');
    if(!list) return;
    var nestedGroups = Array.prototype.slice.call(list.querySelectorAll('.fw-comment-replies .fw-comment-replies'));
    nestedGroups.forEach(function(group){
      var outer = group.closest('.fw-comment-replies');
      if(!outer) return;
      Array.prototype.slice.call(group.children).forEach(function(child){ outer.appendChild(child); });
      group.remove();
    });
  }

  function tidy(){
    injectStyle();
    Array.prototype.slice.call(document.querySelectorAll('.post-card')).forEach(tidyCard);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tidy);
  else tidy();
  var n = 0;
  var timer = setInterval(function(){ n += 1; tidy(); if(n > 30) clearInterval(timer); }, 700);
  if(window.MutationObserver){
    new MutationObserver(function(){ setTimeout(tidy, 60); }).observe(document.body,{childList:true,subtree:true});
  }
})();
