(function(){
  if(window.__FW_MOBILE_BUDDY_USER_ACTION_PREHOOK__) return;
  window.__FW_MOBILE_BUDDY_USER_ACTION_PREHOOK__ = true;

  var targetId = '';
  var actionAttr = 'data-buddy-contact-' + 'report';

  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function app(){ return window.FWApp || null; }
  function toast(message){ var fw = app(); if(fw && fw.toast) fw.toast(message); }
  function closeMenu(){ $$('.buddy-contact-menu-mask,.buddy-contact-menu').forEach(function(node){ node.classList.remove('show'); }); }

  document.addEventListener('click', function(e){
    var more = e.target.closest && e.target.closest('[data-buddy-contact-more]');
    if(more){
      targetId = more.dataset.buddyContactMore || '';
      return;
    }

    var action = e.target.closest && e.target.closest('[' + actionAttr + ']');
    if(!action) return;
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();

    var bridge = window['FWApp' + 'Report'];
    if(bridge && bridge.submit){
      bridge.submit('user', targetId, '用户反馈').then(closeMenu).catch(function(error){
        console.warn('[FW mobile app] buddy user action failed', error);
        toast(error && error.message || '提交失败，请稍后再试。');
      });
    }else{
      toast('功能正在加载，请稍后再试。');
    }
  }, true);
})();
