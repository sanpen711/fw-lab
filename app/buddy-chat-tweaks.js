// F.w 研究所：手机端搭子私聊 UI、表情与图片发送补丁
(function(){
  if(window.__FW_MOBILE_BUDDY_CHAT_TWEAKS__) return;
  window.__FW_MOBILE_BUDDY_CHAT_TWEAKS__ = true;

  var imageUploading = false;
  var lastChatState = false;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function app(){ return window.FWApp || null; }
  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function toast(message){
    var fw = app();
    if(fw && fw.toast) fw.toast(message);
    else console.warn(message);
  }

  function injectStyle(){
    if($('#fwMobileBuddyChatTweaksStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileBuddyChatTweaksStyle';
    style.textContent = [
      'body.fw-buddy-chatting .app-header,body.fw-buddy-chatting .app-tabbar{display:none!important}',
      'body.fw-buddy-chatting .app-main{top:0!important;bottom:0!important;padding:0!important;background:#ededed!important;overflow:hidden!important}',
      'body.fw-buddy-chatting [data-app-view="buddy"]{padding:0!important;min-height:100dvh!important;background:#ededed!important}',
      'body.fw-buddy-chatting [data-app-view="buddy"] > .buddy-chat-panel{display:grid!important;position:fixed!important;left:0!important;right:0!important;top:0!important;bottom:0!important;z-index:300!important;grid-template-rows:auto minmax(0,1fr) auto!important;gap:0!important;background:#ededed!important;padding:0!important;min-height:100dvh!important;color:#111!important}',
      'body.fw-buddy-chatting .buddy-chat-title-wrap{position:relative!important;min-height:calc(env(safe-area-inset-top,0px) + 58px)!important;padding:calc(env(safe-area-inset-top,0px) + 8px) 54px 8px!important;background:#11190f!important;color:#fff!important;border:0!important;text-align:center!important;display:grid!important;align-content:center!important}',
      'body.fw-buddy-chatting .buddy-chat-title-wrap .back-btn{position:absolute!important;left:10px!important;bottom:9px!important;width:40px!important;height:40px!important;min-height:40px!important;margin:0!important;border:0!important;background:transparent!important;color:#fff!important;font-size:0!important;padding:0!important;box-shadow:none!important}',
      'body.fw-buddy-chatting .buddy-chat-title-wrap .back-btn:before{content:"‹";font-size:36px;line-height:36px;font-weight:500}',
      'body.fw-buddy-chatting .buddy-chat-title-wrap p,body.fw-buddy-chatting .buddy-chat-title-wrap span{display:none!important}',
      'body.fw-buddy-chatting .buddy-chat-title-wrap h1{margin:0!important;color:#fff!important;font-size:18px!important;line-height:1.2!important;font-weight:1000!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;letter-spacing:0!important}',
      'body.fw-buddy-chatting .buddy-chat-messages{min-height:0!important;max-height:none!important;height:auto!important;overflow-y:auto!important;overflow-x:hidden!important;border:0!important;border-radius:0!important;background:#ededed!important;padding:16px 14px 92px!important;display:flex!important;flex-direction:column!important;gap:14px!important;align-content:unset!important;-webkit-overflow-scrolling:touch!important}',
      'body.fw-buddy-chatting .buddy-empty-tip{border:0!important;border-radius:0!important;background:transparent!important;color:#999!important;text-align:center!important;padding:30px 12px!important}',
      'body.fw-buddy-chatting .buddy-message{position:relative!important;max-width:78%!important;display:grid!important;gap:4px!important;justify-self:auto!important;align-self:flex-start!important;margin-left:46px!important;text-align:left!important}',
      'body.fw-buddy-chatting .buddy-message.mine{align-self:flex-end!important;margin-left:0!important;margin-right:46px!important;text-align:right!important}',
      'body.fw-buddy-chatting .buddy-message-name{font-size:12px!important;line-height:1.2!important;color:#9a9a9a!important;font-weight:700!important}',
      'body.fw-buddy-chatting .buddy-message-avatar{position:absolute!important;top:18px!important;width:36px!important;height:36px!important;border-radius:8px!important;background:#fff!important;color:#111!important;overflow:hidden!important;display:grid!important;place-items:center!important;font-size:12px!important;font-weight:1000!important}',
      'body.fw-buddy-chatting .buddy-message:not(.mine) .buddy-message-avatar{left:-46px!important}',
      'body.fw-buddy-chatting .buddy-message.mine .buddy-message-avatar{right:-46px!important}',
      'body.fw-buddy-chatting .buddy-message-avatar img{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}',
      'body.fw-buddy-chatting .buddy-message-bubble{position:relative!important;display:inline-block!important;width:max-content!important;max-width:100%!important;border:0!important;border-radius:7px!important;background:#fff!important;color:#111!important;padding:10px 12px!important;font-size:16px!important;line-height:1.45!important;font-weight:500!important;text-align:left!important;word-break:break-word!important;white-space:pre-wrap!important;box-shadow:none!important}',
      'body.fw-buddy-chatting .buddy-message:not(.mine) .buddy-message-bubble:before{content:"";position:absolute;left:-6px;top:12px;border-top:6px solid transparent;border-bottom:6px solid transparent;border-right:7px solid #fff}',
      'body.fw-buddy-chatting .buddy-message.mine .buddy-message-bubble{background:#95ec69!important;color:#111!important}',
      'body.fw-buddy-chatting .buddy-message.mine .buddy-message-bubble:after{content:"";position:absolute;right:-6px;top:12px;border-top:6px solid transparent;border-bottom:6px solid transparent;border-left:7px solid #95ec69}',
      'body.fw-buddy-chatting .buddy-sticker-message img,body.fw-buddy-chatting .buddy-image-message img{display:block!important;max-width:min(58vw,230px)!important;max-height:260px!important;border-radius:8px!important;object-fit:cover!important}',
      'body.fw-buddy-chatting .buddy-message-bubble.is-media{padding:0!important;background:transparent!important;box-shadow:none!important;border-radius:8px!important;overflow:hidden!important}',
      'body.fw-buddy-chatting .buddy-message-bubble.is-media:before,body.fw-buddy-chatting .buddy-message-bubble.is-media:after{display:none!important}',
      'body.fw-buddy-chatting .buddy-chat-form{position:fixed!important;left:0!important;right:0!important;bottom:0!important;z-index:330!important;display:grid!important;grid-template-columns:40px 40px minmax(0,1fr) 58px!important;align-items:center!important;gap:7px!important;padding:8px 12px calc(env(safe-area-inset-bottom,0px) + 8px)!important;border:0!important;border-top:1px solid rgba(0,0,0,.08)!important;border-radius:0!important;background:#f7f7f7!important;box-shadow:none!important;margin:0!important}',
      'body.fw-buddy-chatting .buddy-chat-form.fw-emoji-enhanced{grid-template-columns:40px 40px minmax(0,1fr) 58px!important}',
      'body.fw-buddy-chatting .buddy-chat-form .fw-emoji-trigger{grid-column:1!important;grid-row:1!important;width:40px!important;min-width:40px!important;height:40px!important;border:0!important;background:transparent!important;font-size:25px!important;color:#222!important;box-shadow:none!important}',
      'body.fw-buddy-chatting .buddy-chat-image-btn{grid-column:2!important;grid-row:1!important;width:40px!important;height:40px!important;border:0!important;border-radius:999px!important;background:transparent!important;color:#222!important;font-size:25px!important;font-weight:600!important;display:grid!important;place-items:center!important;padding:0!important}',
      'body.fw-buddy-chatting .buddy-chat-form input[name="message"]{grid-column:3!important;grid-row:1!important;height:40px!important;border:0!important;border-radius:5px!important;background:#fff!important;color:#111!important;padding:0 10px!important;font-size:16px!important;font-weight:500!important;min-width:0!important;box-shadow:none!important}',
      'body.fw-buddy-chatting .buddy-chat-form button[type="submit"]{grid-column:4!important;grid-row:1!important;height:40px!important;border:0!important;border-radius:18px!important;background:#10170f!important;color:#fff!important;font-size:15px!important;font-weight:900!important;padding:0!important}',
      'body.fw-buddy-chatting .fw-emoji-panel{bottom:calc(env(safe-area-inset-bottom,0px) + 58px)!important;top:auto!important;left:8px!important;right:8px!important;width:auto!important;max-height:300px!important;border-radius:14px!important}',
      'body.fw-buddy-chatting .fw-sticker-message img{max-width:min(52vw,180px)!important;max-height:180px!important}',
      'body.fw-buddy-chatting .app-toast{z-index:500!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function cleanTitle(){
    var title = $('[data-buddy-chat-title]');
    if(!title) return;
    var text = title.textContent || '';
    var match = text.match(/^和\s*(.*?)\s*私聊$/);
    if(match && match[1]) title.textContent = match[1];
  }

  function getMyAvatarHtml(){
    var pillAvatar = $('.user-pill .user-avatar');
    if(pillAvatar) return pillAvatar.innerHTML;
    var fw = app();
    var name = fw && fw.state && fw.state.profile && fw.state.profile.nickname || '我';
    return esc(String(name).slice(0, 2));
  }

  function addMessageAvatars(){
    $$('.buddy-message').forEach(function(row){
      if($('.buddy-message-avatar', row)) return;
      var avatar = document.createElement('span');
      avatar.className = 'buddy-message-avatar';
      if(row.classList.contains('mine')){
        avatar.innerHTML = getMyAvatarHtml();
      }else{
        var name = $('.buddy-message-name', row);
        avatar.textContent = name && name.textContent ? name.textContent.trim().slice(0, 2) : '搭子';
      }
      row.appendChild(avatar);
    });
  }

  function decodeStickerText(text){
    var raw = String(text || '').replace(/\s+/g, '');
    var prefix = '[[FW_USER_STICKER:';
    var start = raw.indexOf(prefix);
    if(start < 0) return '';
    start += prefix.length;
    var end = raw.indexOf(']]', start);
    if(end < 0) return '';
    try{ return atob(raw.slice(start, end)); }catch(e){ return ''; }
  }

  function encodeStickerUrl(url){
    return '[[FW_USER_STICKER:' + btoa(String(url || '')) + ']]';
  }

  function renderMediaMessages(){
    $$('.buddy-message-bubble').forEach(function(el){
      if(el.dataset.fwBuddyMediaRendered === '1') return;
      var url = decodeStickerText(el.textContent);
      if(!url) return;
      el.dataset.fwBuddyMediaRendered = '1';
      el.classList.add('is-media');
      el.innerHTML = '<span class="buddy-image-message"><img src="' + esc(url) + '" alt="图片"></span>';
    });
  }

  function prepareChatForm(){
    var form = $('[data-buddy-chat-form]');
    if(!form) return;
    form.setAttribute('data-fw-wx-compose', '');
    var input = form.querySelector('input[name="message"]');
    if(input){
      input.placeholder = '';
      input.autocomplete = 'off';
    }
    if(!form.querySelector('[data-buddy-chat-image]')){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'buddy-chat-image-btn';
      btn.dataset.buddyChatImage = 'true';
      btn.setAttribute('aria-label', '发送图片');
      btn.textContent = '+';
      form.insertBefore(btn, input || form.firstChild);
    }
    if(!form.querySelector('[data-buddy-chat-file]')){
      var file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/jpeg,image/png,image/webp,image/gif';
      file.hidden = true;
      file.dataset.buddyChatFile = 'true';
      form.appendChild(file);
    }
  }

  async function getCurrentUser(){
    if(window.fwDb && window.fwDb.getCurrentUser) return await window.fwDb.getCurrentUser();
    var fw = app();
    return fw && fw.state && fw.state.user || null;
  }

  function canvasToBlob(canvas, type, quality){
    return new Promise(function(resolve, reject){
      canvas.toBlob(function(blob){ blob ? resolve(blob) : reject(new Error('图片压缩失败。')); }, type, quality);
    });
  }

  function loadImage(file){
    return new Promise(function(resolve, reject){
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function(){ try{ URL.revokeObjectURL(url); }catch(e){} resolve(img); };
      img.onerror = function(){ try{ URL.revokeObjectURL(url); }catch(e){} reject(new Error('图片读取失败，请换一张图片。')); };
      img.src = url;
    });
  }

  async function compressChatImage(file){
    var type = String(file.type || '').toLowerCase();
    if(type === 'image/gif'){
      if(file.size > 2 * 1024 * 1024) throw new Error('GIF 图片不能超过 2MB。');
      return {file:file, type:file.type || 'image/gif', ext:'gif'};
    }
    var img = await loadImage(file);
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var maxSide = 1280;
    var scale = Math.min(1, maxSide / Math.max(w, h));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    var ctx = canvas.getContext('2d');
    if(!ctx) throw new Error('当前浏览器无法处理这张图片。');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    var outType = 'image/jpeg';
    var quality = 0.84;
    var blob = await canvasToBlob(canvas, outType, quality);
    while(blob.size > 900 * 1024 && quality > 0.5){
      quality -= 0.08;
      blob = await canvasToBlob(canvas, outType, quality);
    }
    if(blob.size > 900 * 1024) throw new Error('图片太大，请换一张小一点的图片。');
    var outFile;
    try{ outFile = new File([blob], 'chat_' + Date.now() + '.jpg', {type:outType}); }
    catch(e){ blob.name = 'chat_' + Date.now() + '.jpg'; outFile = blob; }
    return {file:outFile, type:outType, ext:'jpg'};
  }

  async function uploadAndSendImage(file){
    if(imageUploading) return;
    if(!file) return;
    if(!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type || '')){ toast('只支持 JPG、PNG、WebP、GIF 图片。'); return; }
    imageUploading = true;
    toast('正在处理图片...');
    try{
      var user = await getCurrentUser();
      if(!user || !user.id) throw new Error('请先登录。');
      if(!window.fwDb || !window.fwDb.client) throw new Error('数据服务未连接。');
      var prepared = await compressChatImage(file);
      var path = user.id + '/chat_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8) + '.' + prepared.ext;
      toast('正在上传图片...');
      var up = await window.fwDb.client.storage.from('stickers').upload(path, prepared.file, {upsert:false, cacheControl:'3600', contentType:prepared.type || prepared.file.type || file.type || 'image/jpeg'});
      if(up.error) throw up.error;
      var publicData = window.fwDb.client.storage.from('stickers').getPublicUrl(path).data || {};
      var url = publicData.publicUrl || '';
      if(!url) throw new Error('图片地址生成失败。');
      var form = $('[data-buddy-chat-form]');
      var input = form && form.querySelector('input[name="message"]');
      if(!form || !input) throw new Error('聊天输入框未加载。');
      input.value = encodeStickerUrl(url);
      input.dispatchEvent(new Event('input', {bubbles:true}));
      form.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}));
    }catch(e){
      console.warn('[FW mobile app] chat image upload failed', e);
      toast(e.message || '图片发送失败。');
    }finally{
      imageUploading = false;
    }
  }

  function syncChatMode(){
    var view = $('[data-app-view="buddy"]');
    var chatting = !!(view && view.classList.contains('is-chatting'));
    document.body.classList.toggle('fw-buddy-chatting', chatting);
    if(chatting){
      cleanTitle();
      prepareChatForm();
      addMessageAvatars();
      renderMediaMessages();
      var messages = $('[data-buddy-chat-messages]');
      if(messages && !lastChatState) messages.scrollTop = messages.scrollHeight;
    }
    lastChatState = chatting;
  }

  function bind(){
    document.addEventListener('click', function(e){
      var imageBtn = e.target.closest && e.target.closest('[data-buddy-chat-image]');
      if(imageBtn){
        e.preventDefault();
        var input = $('[data-buddy-chat-file]');
        if(input) input.click();
      }
    }, true);
    document.addEventListener('change', function(e){
      var input = e.target.closest && e.target.closest('[data-buddy-chat-file]');
      if(!input) return;
      var file = input.files && input.files[0];
      input.value = '';
      uploadAndSendImage(file);
    }, true);
    document.addEventListener('focusin', function(e){
      if(e.target && e.target.matches && e.target.matches('[data-buddy-chat-form] input[name="message"]')){
        setTimeout(function(){
          var messages = $('[data-buddy-chat-messages]');
          if(messages) messages.scrollTop = messages.scrollHeight;
        }, 250);
      }
    });
  }

  function boot(){
    injectStyle();
    bind();
    var observer = new MutationObserver(function(){ requestAnimationFrame(syncChatMode); });
    observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
    setInterval(syncChatMode, 500);
    syncChatMode();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
