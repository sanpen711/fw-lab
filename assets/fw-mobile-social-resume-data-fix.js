// F.w 研究所：手机端 PWA 后台恢复后的搭子 / 回声刷新守门
(function(){
  if(window.__FW_MOBILE_SOCIAL_RESUME_DATA_FIX__) return;
  window.__FW_MOBILE_SOCIAL_RESUME_DATA_FIX__ = true;

  var STALE_AFTER_MS = 2000;
  var PENDING_DELAYS = [300, 800, 1500, 2500];

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.from((root || document).querySelectorAll(selector)); }

  function debug(label, data){
    try{ console.debug('[FWMobileSocialResume]', label, data || ''); }catch(e){}
  }

  function isMobile(){
    try{
      return (window.matchMedia && window.matchMedia('(max-width:768px)').matches) || /Android|iPhone|iPad|iPod|Mobile|MicroMessenger|MQQBrowser|baiduboxapp|baidubrowser/i.test(navigator.userAgent || '');
    }catch(e){
      return window.innerWidth <= 768;
    }
  }

  function isStandalone(){
    try{
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    }catch(e){
      return window.navigator.standalone === true;
    }
  }

  function shouldGuard(){
    return isMobile() || (isStandalone() && window.innerWidth <= 900);
  }

  function storageGet(key){
    try{ return sessionStorage.getItem(key); }catch(e){ return null; }
  }

  function storageSet(key, value){
    try{ sessionStorage.setItem(key, value); }catch(e){}
  }

  function storageRemove(key){
    try{ sessionStorage.removeItem(key); }catch(e){}
  }

  function showHint(message){
    var t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }

    t.textContent = message;
    t.classList.add('show');
    clearTimeout(window.__fwMobileResumeToast);
    window.__fwMobileResumeToast = setTimeout(function(){ t.classList.remove('show'); }, 1800);
  }

  function closeAuthPanels(){
    $$('[data-sb-auth].show, .sb-auth.show, .fw-auth.show').forEach(function(modal){
      modal.classList.remove('show');
    });
  }

  function closeBuddyPanels(){
    $$('[data-fw-wx-buddy-modal].show, .fw-wx-modal.show').forEach(function(modal){
      modal.classList.remove('show', 'fw-wx-mobile-chatting');
    });
    if(document.body) document.body.classList.remove('fw-wx-modal-open');
  }

  function closeEchoPanels(){
    $$('[data-fw-stable-echo-modal].show, .fw-stable-echo-modal.show, [data-fw-mobile-echo-modal].show, .fw-mobile-echo-modal.show').forEach(function(modal){
      modal.classList.remove('show');
    });
  }

  function closeMobilePanels(target){
    if(target !== 'buddy') closeBuddyPanels();
    if(target !== 'echo') closeEchoPanels();
    if(target !== 'auth') closeAuthPanels();
  }

  function isPanelOpen(kind){
    if(kind === 'buddy') return !!$('[data-fw-wx-buddy-modal].show, .fw-wx-modal.show');
    return !!$('[data-fw-stable-echo-modal].show, .fw-stable-echo-modal.show, [data-fw-mobile-echo-modal].show, .fw-mobile-echo-modal.show');
  }

  function findOriginalEntry(kind){
    var selector = kind === 'buddy' ? '[data-fw-open-buddy]' : '[data-fw-open-echo]';
    var entries = $$(selector).filter(function(el){
      return el && el.isConnected && !el.closest('#fw-mobile-tabbar, #fw-mobile-compact-strip, #fw-mobile-nav-menu');
    });
    return entries[0] || $(selector);
  }

  function clickEntry(el){
    if(!el) return false;
    el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
    return true;
  }

  function openOriginal(kind){
    closeMobilePanels(kind);

    if(isPanelOpen(kind)) return true;

    if(kind === 'echo' && typeof window.fwOpenStableEcho === 'function'){
      try{
        window.fwOpenStableEcho();
        debug('pending echo via fwOpenStableEcho');
        return true;
      }catch(e){
        debug('fwOpenStableEcho failed', e && e.message ? e.message : e);
      }
    }

    var entry = findOriginalEntry(kind);
    if(clickEntry(entry)){
      debug('pending ' + kind + ' via original entry');
      return true;
    }

    var api = window.FWMobileActions || {};
    var fn = kind === 'buddy' ? api.openBuddy : api.openEcho;
    if(typeof fn === 'function'){
      try{
        debug('pending ' + kind + ' via FWMobileActions');
        return fn() !== false;
      }catch(e){
        debug('FWMobileActions ' + kind + ' failed', e && e.message ? e.message : e);
      }
    }

    return false;
  }

  function playPendingAction(){
    if(!shouldGuard()) return;

    var action = storageGet('fwPendingMobileAction');
    if(action !== 'buddy' && action !== 'echo') return;

    storageRemove('fwPendingMobileAction');
    storageRemove('fwPwaNeedsReload');
    storageRemove('fwLastHiddenAt');

    var attempt = 0;

    function run(){
      if(openOriginal(action)){
        debug('pending action opened', action);
        return;
      }

      if(attempt >= PENDING_DELAYS.length){
        showHint('功能加载中，请稍后再点。');
        debug('pending action failed', action);
        return;
      }

      setTimeout(run, PENDING_DELAYS[attempt]);
      attempt += 1;
    }

    setTimeout(run, PENDING_DELAYS[0]);
    attempt = 1;
  }

  function markHidden(){
    if(!shouldGuard()) return;
    storageSet('fwLastHiddenAt', String(Date.now()));
    debug('hidden timestamp saved');
  }

  function markVisible(reason){
    if(!shouldGuard()) return;

    var raw = Number(storageGet('fwLastHiddenAt') || 0);
    if(!raw) return;

    if(Date.now() - raw >= STALE_AFTER_MS){
      storageSet('fwPwaNeedsReload', '1');
      debug('stale reload marked', reason || 'visible');
    }
  }

  function shouldReloadBeforeSocial(){
    return shouldGuard() && storageGet('fwPwaNeedsReload') === '1';
  }

  function requestReloadFor(kind){
    storageSet('fwPendingMobileAction', kind);
    storageRemove('fwPwaNeedsReload');
    storageRemove('fwLastHiddenAt');
    showHint('正在恢复页面…');
    debug('reload for social action', kind);
    setTimeout(function(){ window.location.reload(); }, 80);
  }

  function interceptSocialClick(e){
    if(!shouldGuard()) return;

    var tab = e.target.closest && e.target.closest('[data-fw-mobile-tab]');
    var openBtn = e.target.closest && e.target.closest('[data-fw-mobile-open]');
    var kind = tab && tab.dataset ? tab.dataset.fwMobileTab : openBtn && openBtn.dataset ? openBtn.dataset.fwMobileOpen : '';

    if(kind !== 'buddy' && kind !== 'echo') return;
    if(!shouldReloadBeforeSocial()) return;

    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    requestReloadFor(kind);
  }

  function clearReloadFlagsForManualReload(e){
    var reloadLink = e.target.closest && e.target.closest('[data-fw-mobile-reload]');
    if(!reloadLink) return;
    storageRemove('fwPwaNeedsReload');
    storageRemove('fwLastHiddenAt');
    storageRemove('fwPendingMobileAction');
  }

  function expose(){
    var fw = window.FW = window.FW || {};
    fw.closeMobilePanels = closeMobilePanels;
    fw.openPendingMobileSocial = playPendingAction;
  }

  function bind(){
    if(window.__FW_MOBILE_SOCIAL_RESUME_DATA_BOUND__) return;
    window.__FW_MOBILE_SOCIAL_RESUME_DATA_BOUND__ = true;

    window.addEventListener('click', interceptSocialClick, true);
    window.addEventListener('click', clearReloadFlagsForManualReload, true);

    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'hidden') markHidden();
      if(document.visibilityState === 'visible') markVisible('visibilitychange');
    });

    window.addEventListener('pageshow', function(){ markVisible('pageshow'); });
    window.addEventListener('focus', function(){ markVisible('focus'); });
  }

  function boot(){
    expose();
    bind();
    playPendingAction();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
