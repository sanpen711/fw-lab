// F.w 研究所：手机端搭子私聊视觉精修
(function(){
  if(window.__FW_MOBILE_BUDDY_CHAT_POLISH__) return;
  window.__FW_MOBILE_BUDDY_CHAT_POLISH__ = true;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  var STORE_KEY = 'fw_mobile_buddy_chat_target_avatar';
  var TARGET_KEY = 'fw_mobile_buddy_chat_target_id';

  function injectStyle(){
    if($('#fwMobileBuddyChatPolishStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileBuddyChatPolishStyle';
    style.textContent = [
      'body.fw-buddy-chatting .app-main{background:radial-gradient(circle at 88% 0%,rgba(217,121,121,.14),transparent 32%),radial-gradient(circle at 10% 20%,rgba(47,74,42,.12),transparent 28%),linear-gradient(180deg,#f8f4eb 0%,#eee8dc 100%)!important}',
      'body.fw-buddy-chatting [data-app-view="buddy"]{background:transparent!important}',
      'body.fw-buddy-chatting [data-app-view="buddy"] > .buddy-chat-panel{background:radial-gradient(circle at 88% 0%,rgba(217,121,121,.12),transparent 34%),radial-gradient(circle at 10% 20%,rgba(47,74,42,.1),transparent 30%),linear-gradient(180deg,#f8f4eb 0%,#eee8dc 100%)!important}',
      'body.fw-buddy-chatting .buddy-chat-title-wrap{background:#10170f!important;color:#f8f5ec!important}',
      'body.fw-buddy-chatting .buddy-chat-messages{background:transparent!important;padding:14px 14px calc(env(safe-area-inset-bottom,0px) + 70px)!important}',
      'body.fw-buddy-chatting .buddy-message-avatar{background:#fffdf7!important;border-radius:9px!important;color:#10170f!important;box-shadow:0 1px 0 rgba(0,0,0,.04)!important}',
      'body.fw-buddy-chatting .buddy-message-avatar img{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}',
      'body.fw-buddy-chatting .buddy-message-bubble{font-size:15px!important;font-weight:650!important}',
      'body.fw-buddy-chatting .buddy-message.mine .buddy-message-bubble{background:#10170f!important;color:#fffdf7!important}',
      'body.fw-buddy-chatting .buddy-message.mine .buddy-message-bubble:after{border-left-color:#10170f!important}',
      'body.fw-buddy-chatting .buddy-message:not(.mine) .buddy-message-bubble{background:#fffdf7!important;color:#111!important}',
      'body.fw-buddy-chatting .buddy-message:not(.mine) .buddy-message-bubble:before{border-right-color:#fffdf7!important}',
      'body.fw-buddy-chatting .buddy-message-bubble.is-media{background:transparent!important;max-width:min(42vw,168px)!important}',
      'body.fw-buddy-chatting .buddy-message-bubble.is-media:before,body.fw-buddy-chatting .buddy-message-bubble.is-media:after{display:none!important}',
      'body.fw-buddy-chatting .buddy-sticker-message img,body.fw-buddy-chatting .buddy-image-message img,body.fw-buddy-chatting .fw-sticker-message img{display:block!important;width:auto!important;max-width:min(42vw,168px)!important;max-height:168px!important;border-radius:8px!important;object-fit:contain!important}',
      'body.fw-buddy-chatting .buddy-chat-form{height:calc(var(--tab-h,50px) + env(safe-area-inset-bottom,0px))!important;min-height:calc(var(--tab-h,50px) + env(safe-area-inset-bottom,0px))!important;grid-template-columns:34px 34px minmax(0,1fr) 56px!important;gap:7px!important;align-items:center!important;padding:6px 12px calc(env(safe-area-inset-bottom,0px) + 6px)!important;background:#10170f!important;border-top:1px solid rgba(248,245,236,.12)!important}',
      'body.fw-buddy-chatting .buddy-chat-form .fw-emoji-trigger,body.fw-buddy-chatting .buddy-chat-image-btn{width:34px!important;min-width:34px!important;height:34px!important;color:#f8f5ec!important;background:transparent!important;font-size:23px!important;border:0!important}',
      'body.fw-buddy-chatting .buddy-chat-form input[name="message"]{height:36px!important;border-radius:10px!important;background:#fffdf7!important;color:#111!important;border:0!important;padding:0 10px!important;font-size:16px!important}',
      'body.fw-buddy-chatting .buddy-chat-form button[type="submit"]{height:36px!important;border-radius:18px!important;background:#3a2b25!important;color:#fffdf7!important;font-size:15px!important;border:0!important}',
      'body.fw-buddy-chatting .fw-emoji-panel{bottom:calc(var(--tab-h,50px) + env(safe-area-inset-bottom,0px) + 8px)!important}',
      'body.fw-buddy-chatting:after{background:#10170f!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function storeAvatarFromElement(root, targetId){
    if(!root || !targetId) return;
    var avatar = $('.list-avatar', root) || $('.user-avatar', root) || $('.buddy-profile-top .list-avatar');
    if(!avatar) return;
    try{
      localStorage.setItem(TARGET_KEY, String(targetId));
      localStorage.setItem(STORE_KEY + ':' + String(targetId), avatar.innerHTML);
      localStorage.setItem(STORE_KEY + ':last', avatar.innerHTML);
    }catch(e){}
  }

  function bindCapture(){
    document.addEventListener('click', function(e){
      var open = e.target.closest && e.target.closest('[data-buddy-open-chat]');
      if(open){
        var targetId = open.getAttribute('data-buddy-open-chat') || '';
        var root = open.closest('.buddy-message-row,.buddy-row,.buddy-profile-card,.buddy-profile-panel') || document;
        storeAvatarFromElement(root, targetId);
      }
      var profile = e.target.closest && e.target.closest('[data-buddy-profile]');
      if(profile){
        var pid = profile.getAttribute('data-buddy-profile') || '';
        storeAvatarFromElement(profile, pid);
      }
    }, true);
  }

  function getStoredAvatar(){
    try{
      var targetId = localStorage.getItem(TARGET_KEY) || '';
      return (targetId && localStorage.getItem(STORE_KEY + ':' + targetId)) || localStorage.getItem(STORE_KEY + ':last') || '';
    }catch(e){ return ''; }
  }

  function applyOtherAvatar(){
    var html = getStoredAvatar();
    if(!html) return;
    $$('.buddy-message:not(.mine) .buddy-message-avatar').forEach(function(el){
      if(el.dataset.fwAvatarPolished === '1') return;
      el.innerHTML = html;
      el.dataset.fwAvatarPolished = '1';
    });
  }

  function resizeMedia(){
    $$('.buddy-message-bubble.is-media, .buddy-image-message img, .buddy-sticker-message img, .fw-sticker-message img').forEach(function(el){
      el.dataset.fwMediaPolished = '1';
    });
  }

  function polish(){
    if(!document.body.classList.contains('fw-buddy-chatting')) return;
    applyOtherAvatar();
    resizeMedia();
    var messages = $('[data-buddy-chat-messages]');
    if(messages && !messages.dataset.fwPolishInitialScroll){
      messages.dataset.fwPolishInitialScroll = '1';
      setTimeout(function(){ messages.scrollTop = messages.scrollHeight; }, 80);
    }
  }

  function boot(){
    injectStyle();
    bindCapture();
    var observer = new MutationObserver(function(){ requestAnimationFrame(polish); });
    observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
    setInterval(polish, 500);
    polish();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
