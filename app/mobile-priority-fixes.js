// F.w 研究所：手机端优先修复补丁
// 回声列表和角标已合并进 echo.js；本文件只保留发布登录门槛、私聊输入提示和少量文案兜底。
(function(){
  if(window.__FW_MOBILE_PRIORITY_FIXES__) return;
  window.__FW_MOBILE_PRIORITY_FIXES__ = true;

  var publishGateBound = false;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function app(){ return window.FWApp || null; }
  function toast(message){ var fw = app(); if(fw && fw.toast) fw.toast(message); }

  async function currentUser(){
    var fw = app();
    if(fw && fw.state && fw.state.user) return fw.state.user;
    if(fw && fw.refreshUser){
      try{ return await fw.refreshUser(); }catch(e){}
    }
    if(window.fwDb && window.fwDb.getCurrentUser){
      try{ return await window.fwDb.getCurrentUser(); }catch(e){}
    }
    return null;
  }

  function openLoginProfile(){
    toast('登录后才能发布内容。');
    var fw = app();
    if(fw && fw.setView) fw.setView('profile');
  }

  function polishBuddyInput(){
    var input = $('.buddy-chat-input');
    if(input && !String(input.getAttribute('placeholder') || '').trim()) input.setAttribute('placeholder', '说点什么...');
  }

  function scheduleBuddyInputPolish(){
    [0, 180, 600].forEach(function(delay){ setTimeout(polishBuddyInput, delay); });
  }

  function injectPriorityStyle(){
    if(document.getElementById('fwMobilePriorityFixesStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobilePriorityFixesStyle';
    style.textContent = '.mobile-admin-gate{display:none!important}';
    document.head.appendChild(style);
  }

  function polishPublishCopy(){
    var back = $('[data-publish-back-square]');
    if(back) back.textContent = '‹ 返回广场';
    var cancel = $('[data-publish-cancel]');
    if(cancel) cancel.textContent = '放弃发布';
  }

  function schedulePublishCopyPolish(){
    [0, 120, 360, 900].forEach(function(delay){ setTimeout(polishPublishCopy, delay); });
  }

  function bindPublishLoginGate(){
    if(publishGateBound) return;
    publishGateBound = true;

    document.addEventListener('click', function(e){
      var open = e.target && e.target.closest && e.target.closest('[data-publish-open]');
      if(!open) return;
      var fw = app();
      if(fw && fw.state && fw.state.user) return;
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      currentUser().then(function(user){
        if(user && user.id){
          if(window.FWAppPublish && typeof window.FWAppPublish.open === 'function') window.FWAppPublish.open();
          return;
        }
        openLoginProfile();
      });
    }, true);

    document.addEventListener('submit', function(e){
      var form = e.target && e.target.closest && e.target.closest('[data-publish-form]');
      if(!form) return;
      var fw = app();
      if(fw && fw.state && fw.state.user) return;
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      currentUser().then(function(user){
        if(user && user.id){
          form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}));
          return;
        }
        openLoginProfile();
      });
    }, true);
  }

  function start(){
    injectPriorityStyle();
    bindPublishLoginGate();
    scheduleBuddyInputPolish();
    schedulePublishCopyPolish();
    document.addEventListener('click', function(){ scheduleBuddyInputPolish(); schedulePublishCopyPolish(); }, true);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();