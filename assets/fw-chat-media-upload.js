// F.w 研究所：聊天图片 / 视频发送补丁
// 交互：输入框左侧增加「＋」。点击后直接打开相册/文件选择，系统自动识别图片、GIF、视频。
// 规则：普通图片最长边压缩到 1280px，尽量控制 800KB 内；GIF 保留动图，≤3MB；视频不转码，≤20MB 且建议 ≤30秒。
(function(){
  if(window.__FW_CHAT_MEDIA_UPLOAD__) return;
  window.__FW_CHAT_MEDIA_UPLOAD__ = true;

  var MAX_IMAGE_SIZE = 800 * 1024;
  var MAX_GIF_SIZE = 3 * 1024 * 1024;
  var MAX_VIDEO_SIZE = 20 * 1024 * 1024;
  var MAX_VIDEO_SECONDS = 30;
  var MAX_IMAGE_EDGE = 1280;

  var activeInput = null;
  var activeForm = null;
  var uploading = false;
  var scanTimer = 0;
  var burstTimer = 0;

  function $(s, root){ return (root || document).querySelector(s); }
  function $$(s, root){ return Array.from((root || document).querySelectorAll(s)); }

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function toast(msg, ms){
    var t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwMediaToastTimer);
    window.__fwMediaToastTimer = setTimeout(function(){ t.classList.remove('show'); }, ms || 2600);
  }

  function withTimeout(promise, ms, message){
    var timer;
    return Promise.race([
      Promise.resolve(promise).finally(function(){ clearTimeout(timer); }),
      new Promise(function(_, reject){
        timer = setTimeout(function(){ reject(new Error(message || '操作超时，请稍后重试。')); }, ms);
      })
    ]);
  }

  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      var n = 0;
      var timer = setInterval(function(){
        n += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(timer); resolve(true); }
        if(n > 120){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  async function getMe(){
    if(!(await waitDb())) throw new Error('账号系统还没加载完成，请刷新后重试。');
    var u = await withTimeout(window.fwDb.getCurrentUser(), 8000, '账号状态读取超时，请刷新后重试。');
    if(!u || !u.id) throw new Error('请先登录。');
    return u;
  }

  function friendlyError(e){
    var msg = String(e && e.message || e || '发送失败。');
    if(/bucket|storage|not found/i.test(msg)) return '媒体存储桶还没初始化，请先运行媒体 SQL。';
    if(/row-level security|permission|policy|denied/i.test(msg)) return '媒体上传权限未配置好，请检查媒体 SQL 权限。';
    if(/Payload too large|exceeded|size/i.test(msg)) return '文件太大，无法上传。';
    return msg;
  }

  function typeOfFile(file){
    var name = String(file && file.name || '').toLowerCase();
    var type = String(file && file.type || '').toLowerCase();
    if(type.indexOf('image/') === 0 || /\.(jpg|jpeg|png|webp|gif)$/i.test(name)) return 'image';
    if(type.indexOf('video/') === 0 || /\.(mp4|mov|webm|m4v)$/i.test(name)) return 'video';
    return '';
  }

  function isGif(file){
    var name = String(file && file.name || '').toLowerCase();
    var type = String(file && file.type || '').toLowerCase();
    return type === 'image/gif' || /\.gif$/i.test(name);
  }

  function extFrom(file, fallback){
    var name = String(file && file.name || '').toLowerCase();
    var m = name.match(/\.([a-z0-9]+)$/i);
    if(m) return m[1] === 'jpeg' ? 'jpg' : m[1];
    var type = String(file && file.type || '').toLowerCase();
    if(type.indexOf('jpeg') >= 0) return 'jpg';
    if(type.indexOf('png') >= 0) return 'png';
    if(type.indexOf('webp') >= 0) return 'webp';
    if(type.indexOf('gif') >= 0) return 'gif';
    if(type.indexOf('mp4') >= 0) return 'mp4';
    if(type.indexOf('quicktime') >= 0) return 'mov';
    if(type.indexOf('webm') >= 0) return 'webm';
    return fallback || 'bin';
  }

  function makeFile(blob, name, type){
    try{ return new File([blob], name, {type:type || blob.type, lastModified:Date.now()}); }
    catch(e){ blob.name = name; return blob; }
  }

  function loadImage(file){
    return withTimeout(new Promise(function(resolve, reject){
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function(){ try{ URL.revokeObjectURL(url); }catch(e){} resolve(img); };
      img.onerror = function(){ try{ URL.revokeObjectURL(url); }catch(e){} reject(new Error('图片读取失败，请换一张图片。')); };
      img.src = url;
    }), 10000, '图片处理超时，请换一张图片。');
  }

  function canvasToBlob(canvas, type, quality){
    return withTimeout(new Promise(function(resolve, reject){
      if(canvas.toBlob){
        canvas.toBlob(function(blob){ blob ? resolve(blob) : reject(new Error('图片压缩失败，请换一张图片。')); }, type, quality);
        return;
      }
      try{
        var dataUrl = canvas.toDataURL(type, quality);
        var parts = dataUrl.split(',');
        var mime = (parts[0].match(/:(.*?);/) || [])[1] || type;
        var bin = atob(parts[1]);
        var bytes = new Uint8Array(bin.length);
        for(var i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        resolve(new Blob([bytes], {type:mime}));
      }catch(e){ reject(new Error('图片压缩失败，请换一张图片。')); }
    }), 10000, '图片压缩超时，请换一张图片。');
  }

  async function compressImage(file){
    if(isGif(file)){
      if(file.size > MAX_GIF_SIZE) throw new Error('GIF 不能超过 3MB。');
      return {file:file, mime:file.type || 'image/gif', ext:'gif', kind:'image'};
    }

    var img = await loadImage(file);
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if(!w || !h) throw new Error('无法读取图片尺寸。');

    var scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(w, h));
    var tw = Math.max(1, Math.round(w * scale));
    var th = Math.max(1, Math.round(h * scale));

    var canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    var ctx = canvas.getContext('2d', {alpha:true});
    if(!ctx) throw new Error('当前浏览器无法处理这张图片。');
    ctx.drawImage(img, 0, 0, tw, th);

    var type = 'image/webp';
    var quality = 0.84;
    var blob = await canvasToBlob(canvas, type, quality);

    if(!blob || String(blob.type).indexOf('webp') < 0){
      type = 'image/jpeg';
      quality = 0.84;
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#fffdf7';
      ctx.fillRect(0, 0, tw, th);
      blob = await canvasToBlob(canvas, type, quality);
    }

    while(blob.size > MAX_IMAGE_SIZE && quality > 0.42){
      quality = Math.max(0.42, quality - 0.08);
      blob = await canvasToBlob(canvas, type, quality);
    }

    if(blob.size > MAX_IMAGE_SIZE){
      throw new Error('图片压缩后仍超过 800KB，请换一张图片。');
    }

    var ext = type.indexOf('webp') >= 0 ? 'webp' : 'jpg';
    return {file:makeFile(blob, 'fw_image_' + Date.now().toString(36) + '.' + ext, type), mime:type, ext:ext, kind:'image'};
  }

  function getVideoDuration(file){
    return withTimeout(new Promise(function(resolve, reject){
      var url = URL.createObjectURL(file);
      var video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = function(){
        var d = video.duration || 0;
        try{ URL.revokeObjectURL(url); }catch(e){}
        resolve(d);
      };
      video.onerror = function(){
        try{ URL.revokeObjectURL(url); }catch(e){}
        reject(new Error('视频读取失败，请换一个视频。'));
      };
      video.src = url;
    }), 10000, '视频读取超时，请换一个视频。');
  }

  async function validateVideo(file){
    if(file.size > MAX_VIDEO_SIZE) throw new Error('视频不能超过 20MB。');
    var duration = await getVideoDuration(file).catch(function(){ return 0; });
    if(duration && duration > MAX_VIDEO_SECONDS + 1){
      throw new Error('视频建议控制在 30 秒以内。');
    }
    return {file:file, mime:file.type || 'video/mp4', ext:extFrom(file, 'mp4'), kind:'video'};
  }

  async function prepareMedia(file){
    var kind = typeOfFile(file);
    if(kind === 'image') return compressImage(file);
    if(kind === 'video') return validateVideo(file);
    throw new Error('只支持图片、GIF 或视频。');
  }

  function encodeMarker(kind, url){
    return kind === 'video'
      ? '[[FW_MEDIA_VIDEO:' + btoa(String(url || '')) + ']]'
      : '[[FW_MEDIA_IMAGE:' + btoa(String(url || '')) + ']]';
  }

  function decodeMarker(text){
    var raw = String(text || '').replace(/\s+/g, '');
    var imagePrefix = '[[FW_MEDIA_IMAGE:';
    var videoPrefix = '[[FW_MEDIA_VIDEO:';
    var kind = '';
    var prefix = '';
    var start = raw.indexOf(imagePrefix);
    if(start >= 0){ kind = 'image'; prefix = imagePrefix; }
    else{
      start = raw.indexOf(videoPrefix);
      if(start >= 0){ kind = 'video'; prefix = videoPrefix; }
    }
    if(!kind) return null;
    start += prefix.length;
    var end = raw.indexOf(']]', start);
    if(end < 0) return null;
    try{
      var url = atob(raw.slice(start, end));
      if(!/^https?:\/\//i.test(url)) return null;
      return {kind:kind, url:url};
    }catch(e){ return null; }
  }

  function injectStyle(){
    if($('#fw-chat-media-style')) return;
    var style = document.createElement('style');
    style.id = 'fw-chat-media-style';
    style.textContent = `
      .fw-media-trigger{width:44px!important;min-width:44px!important;height:44px!important;border-radius:999px!important;border:1px solid rgba(28,28,24,.18)!important;background:#fffdf7!important;color:#1b1b18!important;font-size:22px!important;font-weight:1000!important;cursor:pointer!important;display:grid!important;place-items:center!important;padding:0!important;line-height:1!important;}
      [data-room-form].fw-media-enhanced,[data-fw-wx-compose].fw-media-enhanced{grid-template-columns:auto auto 1fr auto!important;}
      .fw-media-bubble{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;color:inherit!important;word-break:normal!important;}
      .fw-media-wrap{display:inline-block!important;max-width:230px!important;background:transparent!important;padding:0!important;}
      .fw-media-wrap img{max-width:220px!important;max-height:260px!important;object-fit:contain!important;border-radius:12px!important;display:block!important;border:1px solid rgba(0,0,0,.08)!important;background:#fffdf7!important;}
      .fw-media-wrap video{max-width:240px!important;max-height:300px!important;border-radius:12px!important;display:block!important;background:#111!important;outline:0!important;}
      @media(max-width:760px){.fw-media-wrap img{max-width:190px!important;max-height:240px!important;}.fw-media-wrap video{max-width:210px!important;max-height:280px!important;}}
    `;
    document.head.appendChild(style);
  }

  function findInput(form){
    return form && form.querySelector('input[name="message"], input');
  }

  function enhanceForm(form, type){
    if(!form || form.dataset.fwMediaEnhanced === '1') return;
    var input = findInput(form);
    if(!input) return;
    form.dataset.fwMediaEnhanced = '1';
    form.classList.add('fw-media-enhanced');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fw-media-trigger';
    btn.dataset.fwMediaTrigger = type;
    btn.setAttribute('aria-label', '发送图片或视频');
    btn.textContent = '+';

    var emoji = form.querySelector('[data-fw-emoji-trigger]');
    if(emoji && emoji.parentNode === form){
      form.insertBefore(btn, emoji.nextSibling);
    }else{
      form.insertBefore(btn, input);
    }
  }

  function enhanceForms(){
    enhanceForm($('[data-room-form]'), 'room');
    enhanceForm($('[data-fw-wx-compose]'), 'buddy');
  }

  function ensureFileInput(){
    var input = $('[data-fw-chat-media-file]');
    if(input) return input;
    input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.hidden = true;
    input.dataset.fwChatMediaFile = '1';
    document.body.appendChild(input);
    return input;
  }

  function makePath(userId, kind, ext){
    return userId + '/' + kind + '/' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8) + '.' + ext;
  }

  async function uploadAndSend(file){
    if(uploading) return;
    uploading = true;
    try{
      var u = await getMe();
      toast('正在处理文件...', 6000);
      var prepared = await prepareMedia(file);
      var kind = prepared.kind;
      var path = makePath(u.id, kind, prepared.ext || extFrom(prepared.file, kind === 'video' ? 'mp4' : 'jpg'));

      toast(kind === 'video' ? '正在上传视频...' : '正在上传图片...', 12000);
      var up = await withTimeout(
        window.fwDb.client.storage.from('chat-media').upload(path, prepared.file, {
          upsert:false,
          cacheControl:'3600',
          contentType:prepared.mime || prepared.file.type || file.type || 'application/octet-stream'
        }),
        kind === 'video' ? 45000 : 22000,
        kind === 'video' ? '视频上传超时，请稍后重试。' : '图片上传超时，请稍后重试。'
      );
      if(up.error) throw up.error;

      var publicUrl = (window.fwDb.client.storage.from('chat-media').getPublicUrl(path).data || {}).publicUrl || '';
      if(!publicUrl) throw new Error('媒体地址生成失败。');

      if(!activeInput || !activeForm) throw new Error('没有找到聊天输入框。');
      activeInput.value = encodeMarker(kind, publicUrl);
      activeInput.dispatchEvent(new Event('input', {bubbles:true}));
      activeForm.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}));
      toast(kind === 'video' ? '视频已发送。' : '图片已发送。');
      burstRender();
    }finally{
      uploading = false;
    }
  }

  function renderOne(el){
    if(!el || el.nodeType !== 1) return false;
    if(el.dataset && el.dataset.fwMediaRendered === '1') return false;
    var m = decodeMarker(el.textContent || '');
    if(!m) return false;
    if(el.dataset) el.dataset.fwMediaRendered = '1';
    el.classList.add('fw-media-bubble');
    if(m.kind === 'video'){
      el.innerHTML = '<span class="fw-media-wrap"><video src="' + esc(m.url) + '" controls playsinline preload="metadata"></video></span>';
    }else{
      el.innerHTML = '<a class="fw-media-wrap" href="' + esc(m.url) + '" target="_blank" rel="noopener"><img src="' + esc(m.url) + '" alt="图片"></a>';
    }
    return true;
  }

  function renderMedia(root){
    root = root || document;
    var selectors = '.fw-wx-pm-bubble,.fw-bubble p,.fw-bubble,.fw-msg p,.fw-room-message,.room-message,[data-message-content]';
    $$(selectors, root).forEach(renderOne);
    if(root.nodeType === 1){
      renderOne(root);
      var closest = root.closest && root.closest(selectors);
      if(closest) renderOne(closest);
    }
  }

  function scheduleRender(ms){
    clearTimeout(scanTimer);
    scanTimer = setTimeout(function(){ renderMedia(document); }, ms || 20);
  }

  function burstRender(){
    var n = 0;
    clearInterval(burstTimer);
    burstTimer = setInterval(function(){
      n += 1;
      renderMedia(document);
      if(n >= 18) clearInterval(burstTimer);
    }, 220);
  }

  function bind(){
    document.addEventListener('click', function(e){
      var btn = e.target.closest && e.target.closest('[data-fw-media-trigger]');
      if(!btn) return;
      e.preventDefault();
      if(uploading){ toast('正在发送文件，请稍等。'); return; }
      activeForm = btn.closest('form');
      activeInput = findInput(activeForm);
      var input = ensureFileInput();
      input.click();
    }, true);

    document.addEventListener('change', function(e){
      var input = e.target.closest && e.target.closest('[data-fw-chat-media-file]');
      if(!input) return;
      var file = input.files && input.files[0];
      input.value = '';
      if(!file) return;
      uploadAndSend(file).catch(function(err){ toast(friendlyError(err), 4200); });
    }, true);

    document.addEventListener('submit', function(e){
      var f = e.target;
      if(f && (f.matches('[data-fw-wx-compose]') || f.matches('[data-room-form]'))) burstRender();
    }, true);
  }

  function observe(){
    var obs = new MutationObserver(function(mutations){
      var hit = false;
      mutations.forEach(function(m){
        Array.from(m.addedNodes || []).forEach(function(node){
          if(node.nodeType !== 1) return;
          enhanceForms();
          if(String(node.textContent || '').indexOf('[[FW_MEDIA_') >= 0){
            hit = true;
            renderMedia(node);
          }
        });
      });
      if(hit){ scheduleRender(10); burstRender(); }
    });
    obs.observe(document.body, {childList:true, subtree:true});
  }

  function boot(){
    injectStyle();
    ensureFileInput();
    enhanceForms();
    renderMedia(document);
    bind();
    observe();
    setInterval(function(){ enhanceForms(); renderMedia(document); }, 1500);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
