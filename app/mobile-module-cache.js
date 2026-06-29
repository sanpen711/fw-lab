// F.w 研究所：手机端页面数据缓存
// 作用：为观鸟台、回声、搭子、学术研讨提供本地快速显示；真实状态仍以后端静默刷新为准。
(function(){
  if(window.__FW_MOBILE_MODULE_CACHE__) return;
  window.__FW_MOBILE_MODULE_CACHE__ = true;

  var PREFIX = 'fw_mobile_module_cache_v1:';
  var DAY = 24 * 60 * 60 * 1000;
  var SAVE_DELAY = 260;
  var restoreTimers = {};
  var saveTimers = {};
  var patched = {};
  var observers = {};

  var MODULES = [
    {name:'bird',api:'FWAppBird',selector:'[data-mobile-bird-feed]',loading:/正在打开观鸟镜/,ttl:90 * DAY,blockPreviewClicks:true},
    {name:'echo',api:'FWAppEcho',selector:'[data-echo-list]',loading:/正在读取回声/,ttl:7 * DAY,blockPreviewClicks:true},
    {name:'buddy',api:'FWAppBuddy',selector:'[data-buddy-list]',loading:/正在读取搭子/,ttl:30 * DAY,blockPreviewClicks:true},
    {name:'rooms',api:'FWAppRooms',selector:'[data-mobile-polls-list]',statusSelector:'[data-mobile-polls-status]',loading:/正在读取学术研讨课题/,ttl:7 * DAY,blockPreviewClicks:true,quietOptions:true}
  ];

  function app(){ return window.FWApp || null; }
  function now(){ return Date.now(); }
  function userKey(){
    var fw = app();
    var user = fw && fw.state && fw.state.user;
    return user && user.id ? String(user.id) : 'anon';
  }
  function key(module){ return PREFIX + module.name + ':' + userKey(); }
  function node(module){ return document.querySelector(module.selector); }
  function statusNode(module){ return module.statusSelector ? document.querySelector(module.statusSelector) : null; }
  function activeBuddyTab(){
    var active = document.querySelector('[data-buddy-tab].active');
    return active && active.dataset ? active.dataset.buddyTab || 'messages' : 'messages';
  }
  function canUse(module){
    if(module.canUse){
      try{ return !!module.canUse(); }catch(e){ return false; }
    }
    return true;
  }

  function read(module){
    if(!canUse(module)) return null;
    try{
      if(!window.localStorage) return null;
      var raw = localStorage.getItem(key(module));
      if(!raw) return null;
      var data = JSON.parse(raw);
      if(!data || !data.html || !data.at) return null;
      if(now() - Number(data.at || 0) > module.ttl) return null;
      return data;
    }catch(e){ return null; }
  }

  function isBadContent(module, html, text){
    html = String(html || '');
    text = String(text || '');
    if(!html || html.length < 20) return true;
    if(module.loading && module.loading.test(text)) return true;
    if(/读取失败|暂时失败|请稍后|正在读取|正在打开|正在搜索/.test(text)) return true;
    if(module.name === 'buddy' && /暂时还没有搭子消息|先去“新的搭子”/.test(text)) return false;
    return false;
  }

  function save(module){
    if(!canUse(module)) return;
    var el = node(module);
    if(!el || el.hasAttribute('data-fw-cache-preview')) return;
    var html = el.innerHTML || '';
    var text = el.textContent || '';
    if(isBadContent(module, html, text)) return;
    try{
      localStorage.setItem(key(module), JSON.stringify({
        at:now(),
        tab:module.name === 'buddy' ? activeBuddyTab() : '',
        html:html,
        text:text.slice(0, 180)
      }));
    }catch(e){}
  }

  function scheduleSave(module){
    clearTimeout(saveTimers[module.name]);
    saveTimers[module.name] = setTimeout(function(){ save(module); }, SAVE_DELAY);
  }

  function scanMedia(){
    if(window.FWMobileMediaCache && typeof window.FWMobileMediaCache.scan === 'function'){
      try{ window.FWMobileMediaCache.scan(); }catch(e){}
    }
  }

  function markPreview(module, on){
    var el = node(module);
    if(!el) return;
    if(on) el.setAttribute('data-fw-cache-preview', module.name);
    else el.removeAttribute('data-fw-cache-preview');
  }

  function isPreviewing(module){
    var el = node(module);
    return !!(el && el.hasAttribute('data-fw-cache-preview'));
  }

  function restore(module){
    var data = read(module);
    var el = node(module);
    if(!data || !el) return false;
    el.setAttribute('data-fw-cache-preview', module.name);
    el.innerHTML = data.html;
    markPreview(module, true);
    var status = statusNode(module);
    if(status) status.textContent = '';
    scanMedia();
    return true;
  }

  function restoreByName(name){
    var module = MODULES.find(function(item){ return item.name === name; });
    return module ? restore(module) : false;
  }

  function shouldRestore(module){
    var el = node(module);
    if(!el) return false;
    var text = el.textContent || '';
    return !!(module.loading && module.loading.test(text) && read(module));
  }

  function bindObserver(module){
    if(observers[module.name]) return;
    function attach(){
      var el = node(module);
      if(!el){ setTimeout(attach, 500); return; }
      var observer = new MutationObserver(function(){
        if(shouldRestore(module)){
          clearTimeout(restoreTimers[module.name]);
          restoreTimers[module.name] = setTimeout(function(){ restore(module); }, 0);
          return;
        }
        // 缓存预览期间不要因为 restore() 触发的 DOM mutation 立刻清掉预览标记。
        // 标记只在真实 load() 完成后由 patchApi() 清除。
        if(isPreviewing(module)) return;
        scheduleSave(module);
      });
      observer.observe(el, {childList:true, subtree:true, characterData:true});
      observers[module.name] = observer;
      scheduleSave(module);
    }
    attach();
  }

  function currentScrollSnapshot(){
    var main = document.querySelector('#appMain') || document.querySelector('.app-main') || document.scrollingElement || document.documentElement;
    return main ? {node:main, top:main.scrollTop || 0} : null;
  }

  function buildArgs(module, args, usedCache){
    args = Array.prototype.slice.call(args || []);
    if(module.quietOptions && usedCache){
      var options = args[1] && typeof args[1] === 'object' ? Object.assign({}, args[1]) : {};
      options.quiet = true;
      options.preserveScroll = options.preserveScroll || currentScrollSnapshot();
      args[1] = options;
    }
    return args;
  }

  function patchApi(module){
    if(patched[module.name]) return true;
    var api = window[module.api];
    if(!api || typeof api.load !== 'function') return false;
    var originalLoad = api.load;

    api.load = function(){
      var usedCache = restore(module);
      var result;
      try{
        result = originalLoad.apply(api, buildArgs(module, arguments, usedCache));
      }catch(e){ throw e; }
      Promise.resolve(result).then(function(){
        markPreview(module, false);
        scheduleSave(module);
        scanMedia();
      }).catch(function(){
        if(!usedCache) return;
        restore(module);
      });
      return result;
    };

    api.ensureLoaded = function(){
      var usedCache = restore(module);
      var result = api.load(false, module.quietOptions && usedCache ? {quiet:true, preserveScroll:currentScrollSnapshot()} : undefined);
      return result;
    };

    patched[module.name] = true;
    return true;
  }

  function patchAll(){
    MODULES.forEach(function(module){
      bindObserver(module);
      patchApi(module);
    });
  }

  function viewToModule(view){
    if(view === 'bird') return 'bird';
    if(view === 'echo') return 'echo';
    if(view === 'buddy') return 'buddy';
    if(view === 'rooms') return 'rooms';
    return '';
  }

  function bindEarlyRestore(){
    document.addEventListener('click', function(event){
      var target = event.target;
      if(!target || !target.closest) return;
      var opener = target.closest('[data-app-nav],[data-app-open]');
      if(!opener || !opener.dataset) return;
      var view = opener.dataset.appNav || opener.dataset.appOpen || '';
      var moduleName = viewToModule(view);
      if(!moduleName) return;
      setTimeout(function(){ restoreByName(moduleName); }, 0);
      setTimeout(function(){ restoreByName(moduleName); }, 80);
    }, true);

    window.addEventListener('hashchange', function(){
      var view = String(window.location.hash || '').replace(/^#/, '');
      var moduleName = viewToModule(view);
      if(moduleName) setTimeout(function(){ restoreByName(moduleName); }, 80);
    });
  }

  function bindPreviewClickGuard(){
    document.addEventListener('click', function(event){
      var target = event.target;
      if(!target || !target.closest) return;
      for(var i = 0; i < MODULES.length; i += 1){
        var module = MODULES[i];
        if(!module.blockPreviewClicks) continue;
        var el = node(module);
        if(!el || !el.hasAttribute('data-fw-cache-preview')) continue;
        if(el.contains(target)){
          event.preventDefault();
          event.stopPropagation();
          if(event.stopImmediatePropagation) event.stopImmediatePropagation();
          var fw = app();
          if(fw && fw.toast) fw.toast('正在同步最新数据，稍等一下。');
          return;
        }
      }
    }, true);
  }

  function bindLifecycle(){
    document.addEventListener('visibilitychange', function(){
      if(document.hidden) MODULES.forEach(save);
      else setTimeout(patchAll, 120);
    }, {passive:true});
    window.addEventListener('pagehide', function(){ MODULES.forEach(save); }, {passive:true});
    window.addEventListener('pageshow', function(){ setTimeout(patchAll, 120); }, {passive:true});
  }

  function start(){
    patchAll();
    [120, 500, 1500, 3000].forEach(function(delay){ setTimeout(patchAll, delay); });
    bindEarlyRestore();
    bindPreviewClickGuard();
    bindLifecycle();
    window.FWMobileModuleCache = {
      restore:restoreByName,
      save:function(name){ MODULES.filter(function(item){ return !name || item.name === name; }).forEach(save); },
      patch:patchAll
    };
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();