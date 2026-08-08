// F.w 研究所：电脑端回声入口路由
// 目的：让顶部“回声”按钮统一交给 fw-stable-core.js 处理，避免旧回声逻辑误清搭子私聊未读。
// 精神广场为减少首屏负担不预载稳定核心；首次点“回声”时再按需加载。
(function(){
  if(window.__FW_ECHO_STABLE_ROUTE__) return;
  window.__FW_ECHO_STABLE_ROUTE__ = true;

  var stableCoreSrc = 'assets/fw-stable-core.js?v=echo-auto-read-20260808-1';
  var stableCorePromise = null;

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

  function waitForStableEcho(resolve, reject, startedAt){
    if(typeof window.fwOpenStableEcho === 'function'){
      resolve(window.fwOpenStableEcho);
      return;
    }
    if(Date.now() - startedAt >= 5000){
      reject(new Error('stable echo core timed out'));
      return;
    }
    setTimeout(function(){ waitForStableEcho(resolve, reject, startedAt); }, 80);
  }

  function loadStableEcho(){
    if(typeof window.fwOpenStableEcho === 'function'){
      return Promise.resolve(window.fwOpenStableEcho);
    }
    if(stableCorePromise) return stableCorePromise;

    stableCorePromise = new Promise(function(resolve, reject){
      var existing = Array.prototype.find.call(document.scripts || [], function(script){
        return /(?:^|\/)assets\/fw-stable-core\.js(?:[?#]|$)/.test(script.src || '');
      });
      if(!existing){
        existing = document.createElement('script');
        existing.src = stableCoreSrc;
        existing.async = true;
        existing.dataset.fwEchoCoreLoader = '1';
        existing.addEventListener('error', function(){ reject(new Error('stable echo core failed to load')); }, {once:true});
        document.body.appendChild(existing);
      }
      waitForStableEcho(resolve, reject, Date.now());
    }).catch(function(error){
      stableCorePromise = null;
      throw error;
    });

    return stableCorePromise;
  }

  function openStableEcho(){
    loadStableEcho().then(function(openEcho){
      openEcho();
    }).catch(function(){
      toast('回声加载失败，请刷新页面后重试。');
    });
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
