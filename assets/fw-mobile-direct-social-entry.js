// F.w 研究所：PWA 手机底部搭子/回声直达兜底
// 目的：在 PWA 缓存或旧入口监听仍存在时，优先从 window 捕获底部 tab 点击，直接调用稳定打开函数。
(function(){
  if(window.__FW_MOBILE_DIRECT_SOCIAL_ENTRY__) return;
  window.__FW_MOBILE_DIRECT_SOCIAL_ENTRY__ = true;

  var delays = [0, 180, 520, 1100, 2200, 4200];

  function $(selector, root){ return (root || document).querySelector(selector); }
  function isMobile(){
    return (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) || /Android|iPhone|iPad|iPod|Mobile|MicroMessenger|MQQBrowser|baiduboxapp|baidubrowser/i.test(navigator.userAgent || '');
  }

  function debug(){
    if(!window.console || typeof window.console.debug !== 'function') return;
    try{
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[FWMobileDirectEntry]');
      window.console.debug.apply(window.console, args);
    }catch(e){}
  }

  function toast(message){
    var t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(window.__fwMobileDirectEntryToast);
    window.__fwMobileDirectEntryToast = setTimeout(function(){ t.classList.remove('show'); }, 1800);
  }

  function setActive(kind){
    Array.prototype.slice.call(document.querySelectorAll('[data-fw-mobile-tab]')).forEach(function(btn){
      btn.classList.toggle('is-active', btn.dataset.fwMobileTab === kind);
    });
  }

  function dispatchClick(el){
    if(!el) return false;
    el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
    return true;
  }

  function openEcho(){
    if(typeof window.fwOpenStableEcho === 'function'){
      debug('open echo by fwOpenStableEcho');
      window.fwOpenStableEcho();
      return true;
    }

    var api = window.FWMobileActions || {};
    if(typeof api.openEcho === 'function' && !api.openEcho.__fwMobileNavFallback){
      debug('open echo by FWMobileActions.openEcho');
      api.openEcho();
      return true;
    }

    var btn = $('[data-fw-open-echo]');
    if(btn){
      debug('open echo by original button');
      return dispatchClick(btn);
    }

    return false;
  }

  function openBuddy(){
    var api = window.FWMobileActions || {};
    if(typeof api.openBuddy === 'function' && !api.openBuddy.__fwMobileNavFallback){
      debug('open buddy by FWMobileActions.openBuddy');
      api.openBuddy();
      return true;
    }

    var btn = $('[data-fw-open-buddy]');
    if(btn){
      debug('open buddy by original button');
      return dispatchClick(btn);
    }

    return false;
  }

  function openWithRetry(kind){
    var i = 0;
    setActive(kind);
    toast(kind === 'buddy' ? '正在打开搭子...' : '正在打开回声...');

    function run(){
      var ok = kind === 'buddy' ? openBuddy() : openEcho();
      if(ok){
        setTimeout(function(){ setActive(kind); }, 500);
        return;
      }
      if(i >= delays.length){
        setActive('');
        toast(kind === 'buddy' ? '搭子功能还没加载完成，请刷新后再试。' : '回声功能还没加载完成，请刷新后再试。');
        return;
      }
      setTimeout(run, delays[i]);
      i += 1;
    }

    run();
  }

  window.addEventListener('click', function(e){
    if(!isMobile()) return;
    var tab = e.target.closest && e.target.closest('[data-fw-mobile-tab="buddy"], [data-fw-mobile-tab="echo"]');
    if(!tab) return;

    var kind = tab.dataset.fwMobileTab;
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();

    openWithRetry(kind);
  }, true);
})();
