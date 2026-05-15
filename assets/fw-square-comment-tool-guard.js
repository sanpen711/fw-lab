// F.w 研究所：精神广场评论表情/图片工具防闪补丁
// 原因：评论发送按钮为了让媒体工具识别，带了 data-sb-action；旧轮询又会因为这个属性反复重绘帖子。
// 做法：等媒体工具把 😊 / + 插入评论框后，移除发送按钮上的 data-sb-action，只保留 data-sq 给新评论逻辑使用。
(function(){
  if(window.__FW_SQUARE_COMMENT_TOOL_GUARD__) return;
  window.__FW_SQUARE_COMMENT_TOOL_GUARD__ = true;

  function stabilize(){
    document.querySelectorAll('.comment-box').forEach(function(box){
      var ready = box.dataset.fwPostTools === '1' || box.querySelector('.fw-comment-tools');
      if(!ready) return;
      box.querySelectorAll('button[data-sq="comment-submit"][data-sb-action="comment-submit"]').forEach(function(btn){
        btn.removeAttribute('data-sb-action');
      });
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', stabilize);
  }else{
    stabilize();
  }

  var observer = new MutationObserver(function(){
    clearTimeout(window.__fwSquareCommentToolGuardTimer);
    window.__fwSquareCommentToolGuardTimer = setTimeout(stabilize, 160);
  });

  function start(){
    if(document.body) observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['data-fw-post-tools']});
  }

  if(document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  setInterval(stabilize, 900);
})();