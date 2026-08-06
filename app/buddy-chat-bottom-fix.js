// F.w 研究所：手机端搭子私聊底部输入栏修正
(function(){
  if(window.__FW_MOBILE_BUDDY_CHAT_BOTTOM_FIX__) return;
  window.__FW_MOBILE_BUDDY_CHAT_BOTTOM_FIX__ = true;

  var pending = false;

  function $(selector, root){ return (root || document).querySelector(selector); }

  function injectStyle(){
    if($('#fwMobileBuddyChatBottomFixStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileBuddyChatBottomFixStyle';
    style.textContent = [
      'body.fw-buddy-chatting .app-main{bottom:0!important}',
      'body.fw-buddy-chatting [data-app-view="buddy"] > .buddy-chat-panel{bottom:0!important}',
      'body.fw-buddy-chatting .buddy-chat-messages{padding-bottom:64px!important}',
      'body.fw-buddy-chatting .buddy-chat-form{height:50px!important;min-height:50px!important;max-height:50px!important;grid-template-columns:34px 34px minmax(0,1fr) 56px!important;gap:7px!important;align-items:center!important;padding:6px 12px!important;background:#fffdf7!important;border-top:1px solid rgba(16,23,15,.12)!important;border-radius:0!important;box-shadow:0 -1px 0 rgba(16,23,15,.05)!important;bottom:0!important}',
      'body.fw-buddy-chatting .buddy-chat-form .fw-emoji-trigger,body.fw-buddy-chatting .buddy-chat-image-btn{width:34px!important;min-width:34px!important;height:34px!important;color:#10170f!important;background:transparent!important;font-size:23px!important;border:0!important;box-shadow:none!important}',
      'body.fw-buddy-chatting .buddy-chat-form input[name="message"]{height:36px!important;border-radius:10px!important;background:#fff!important;color:#111!important;border:1px solid rgba(16,23,15,.13)!important;padding:0 10px!important;font-size:16px!important}',
      'body.fw-buddy-chatting .buddy-chat-form button[type="submit"]{height:36px!important;border-radius:18px!important;background:#10170f!important;color:#fffdf7!important;font-size:15px!important;border:0!important}',
      'body.fw-buddy-chatting .fw-emoji-panel{bottom:58px!important}',
      'body.fw-buddy-chatting:after{display:none!important;content:none!important}',
      'body.fw-buddy-chatting{background:#fffdf7!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function fix(){
    if(!document.body.classList.contains('fw-buddy-chatting')) return;
    var form = $('[data-buddy-chat-form]');
    if(form){
      form.style.height = '50px';
      form.style.minHeight = '50px';
      form.style.maxHeight = '50px';
      form.style.paddingBottom = '6px';
      form.style.background = '#fffdf7';
      form.style.bottom = '0px';
    }
    var messages = $('[data-buddy-chat-messages]');
    if(messages) messages.style.paddingBottom = '64px';
  }

  function scheduleFix(){
    if(pending) return;
    pending = true;
    requestAnimationFrame(function(){
      pending = false;
      fix();
    });
  }

  function boot(){
    injectStyle();
    var observer = new MutationObserver(scheduleFix);
    observer.observe(document.body, {attributes:true, attributeFilter:['class']});
    fix();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
