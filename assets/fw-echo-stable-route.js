// F.w 研究所：电脑端回声入口路由
// 目的：让顶部“回声”按钮统一交给 fw-stable-core.js 处理，避免旧回声逻辑误清搭子私聊未读。
(function(){
  if(window.__FW_ECHO_STABLE_ROUTE__) return;
  window.__FW_ECHO_STABLE_ROUTE__ = true;

  function toast(msg){
    var t = document.querySelector('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwEchoStableRouteToast);
    window.__fwEchoStableRouteToast = setTimeout(function(){
      t.classList.remove('show');
    }, 2200);
  }

  function openStableEcho(){
    if(typeof window.fwOpenStableEcho === 'function'){
      window.fwOpenStableEcho();
      return;
    }

    var tries = 0;
    var timer = setInterval(function(){
      tries += 1;
      if(typeof window.fwOpenStableEcho === 'function'){
        clearInterval(timer);
        window.fwOpenStableEcho();
      }else if(tries >= 10){
        clearInterval(timer);
        toast('回声入口还在加载，请稍后再点一次。');
      }
    }, 120);
  }

  document.addEventListener('click', function(e){
    var btn = e.target && e.target.closest && e.target.closest('[data-fw-open-echo]');
    if(!btn) return;

    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();

    openStableEcho();
  }, true);
})();
