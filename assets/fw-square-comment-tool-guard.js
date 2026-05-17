// F.w 研究所：精神广场评论表情/图片工具防闪补丁 v2
// 作用：
// 1. 阻止旧的 1 秒轮询因为 data-sb-action 反复重绘帖子。
// 2. 等评论区 😊 / + 工具插入后，移除发送按钮上的 data-sb-action，只保留 data-sq 给新逻辑使用。
(function(){
  if(window.__FW_SQUARE_COMMENT_TOOL_GUARD_V2__) return;
  window.__FW_SQUARE_COMMENT_TOOL_GUARD_V2__ = true;

  var blockedSelectors = {
    '.post-card button[data-sb-action],.post-card button[data-action]': true,
    '.post-card button[data-sb-action], .post-card button[data-action]': true
  };

  if(!Document.prototype.__fwSquareGuardQueryPatched){
    var originalQuerySelector = Document.prototype.querySelector;
    Document.prototype.querySelector = function(selector){
      if(blockedSelectors[String(selector || '')]) return null;
      return originalQuerySelector.call(this, selector);
    };
    Document.prototype.__fwSquareGuardQueryPatched = true;
  }

  function stabilize(){
    document.querySelectorAll('.comment-box').forEach(function(box){
      var ready = box.dataset.fwPostTools === '1' || box.querySelector('.fw-comment-tools');
      if(!ready) return;

      box.querySelectorAll('button[data-sq="comment-submit"][data-sb-action="comment-submit"]').forEach(function(btn){
        btn.removeAttribute('data-sb-action');
      });
    });
  }

  function start(){
    stabilize();

    var observer = new MutationObserver(function(){
      clearTimeout(window.__fwSquareCommentToolGuardTimer);
      window.__fwSquareCommentToolGuardTimer = setTimeout(stabilize, 80);
    });

    if(document.body){
      observer.observe(document.body, {
        childList:true,
        subtree:true,
        attributes:true,
        attributeFilter:['data-fw-post-tools', 'class', 'data-sb-action']
      });
    }

    setInterval(stabilize, 700);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();