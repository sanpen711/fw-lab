// F.w 研究所：发布区 / 评论区 表情与媒体工具
// 作用：
// 1. 发布区和评论区增加「😊」与「＋」。
// 2. 😊 内保持“小表情 / ♥ 我的表情包”同款面板。
// 3. ＋ 只选择媒体并显示预览，等用户点击发布/发送时再把媒体引用随文字一起提交。
// 4. 不改 posts/comments 表结构，仍把图片/视频/表情引用存进 content，前端负责渲染。
(function(){
  if(window.__FW_POST_MEDIA_TOOLS__) return;
  window.__FW_POST_MEDIA_TOOLS__ = true;

  var EMOJIS = [
    '😂','😭','😅','😡','😴','😵',
    '🐟','😓','🙃','🤔','👀','😶',
    '👍','👎','🤝','🙏','👏','❤️',
    '🧠','🔬','📉','🧻','☕','💤'
  ];

  var MAX_STICKERS = 30;
  var MAX_IMAGE_SIZE = 800 * 1024;
  var MAX_GIF_SIZE = 3 * 1024 * 1024;
  var MAX_VIDEO_SIZE = 20 * 1024 * 1024;
  var MAX_VIDEO_SECONDS = 30;
  var MAX_IMAGE_EDGE = 1280;

  var activeTarget = null;
  var activeHost = null;
  var activeTab = 'emoji';
  var stickerCache = null;
  var loadingStickers = false;
  var uploading = false;
  var scanTimer = 0;

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
    clearTimeout(window.__fwPostMediaToastTimer);
    window.__fwPostMediaToastTimer = setTimeout(function(){ t.classList.remove('show'); }, ms || 2600);
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
    var user = await withTimeout(window.fwDb.getCurrentUser(), 8000, '账号状态读取超时，请刷新后重试。');
    if(!user || !user.id) throw new Error('请先登录。');
    return user;
  }

  function friendlyError(e){
    var msg = String(e && e.message || e || '操作失败。');
    if(/user_stickers|relation|does not exist|schema cache|Could not find/i.test(msg)) return '表情包数据表还没初始化，请先运行表情包 SQL。';
    if(/chat-media|bucket|storage|not found/i.test(msg)) return '媒体存储桶还没初始化，请先运行媒体 SQL。';
    if(/row-level security|permission|policy|denied/i.test(msg)) return '上传权限未配置好，请检查 SQL 权限。';
    return msg;
  }

  function injectStyle(){
    if($('#fw-post-media-tools-style')) return;
    var style = document.createElement('style');
    style.id = 'fw-post-media-tools-style';
    style.textContent = `
      .fw-post-tools{display:flex;align-items:center;gap:8px;margin:10px 0 0;}
      .fw-comment-tools{display:flex;align-items:center;gap:8px;margin:10px 0 8px;}
      .fw-post-tool-btn{width:38px;height:38px;border-radius:999px;border:1px solid rgba(28,28,24,.18);background:#fffdf7;color:#1b1b18;font-size:18px;font-weight:1000;cursor:pointer;display:grid;place-items:center;padding:0;line-height:1;}
      .fw-post-tool-btn:hover{border-color:rgba(217,121,121,.55);background:#fff3ef;}
      .fw-post-tool-btn[disabled]{opacity:.55;cursor:not-allowed;}
      .fw-post-media-preview{display:none;margin:10px 0 0;padding:10px;border:1px dashed rgba(157,74,74,.35);background:#fffaf1;border-radius:14px;position:relative;max-width:280px;}
      .fw-post-media-preview.show{display:block;}
      .fw-post-media-preview img{max-width:240px;max-height:220px;object-fit:contain;display:block;border-radius:10px;background:#fffdf7;}
      .fw-post-media-preview video{max-width:250px;max-height:220px;display:block;border-radius:10px;background:#111;}
      .fw-post-media-remove{position:absolute;right:6px;top:6px;width:24px;height:24px;border:0;border-radius:999px;background:rgba(27,27,24,.78);color:#fff;cursor:pointer;font-weight:1000;}
      .fw-comment-media-preview{max-width:170px;margin:6px 0;}
      .fw-comment-media-preview img{max-width:150px;max-height:120px;}
      .fw-comment-media-preview video{max-width:160px;max-height:130px;}

      .fw-post-emoji-panel{position:fixed;z-index:14020;width:min(330px,calc(100vw - 24px));max-height:min(390px,calc(100vh - 30px));overflow:hidden;display:none;background:#fffdf7;color:#1d1d1a;border:1px solid rgba(217,121,121,.45);box-shadow:0 24px 90px rgba(0,0,0,.28);}
      .fw-post-emoji-panel.show{display:block;}
      .fw-post-emoji-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px 8px;}
      .fw-post-emoji-logo{color:#b85e5e;font-size:10px;font-weight:1000;letter-spacing:.16em;}
      .fw-post-emoji-close{border:0;background:transparent;font-size:22px;font-weight:1000;cursor:pointer;color:#1b1b18;line-height:1;}
      .fw-post-emoji-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 12px 10px;border-bottom:1px solid rgba(28,28,24,.1);}
      .fw-post-emoji-tab{height:34px;border-radius:999px;border:1px solid rgba(28,28,24,.14);background:#fffdf7;color:#1b1b18;font-size:14px;font-weight:1000;cursor:pointer;}
      .fw-post-emoji-tab.active{background:#1b1b18;color:#fffdf7;border-color:#1b1b18;}
      .fw-post-emoji-body{max-height:315px;overflow:auto;padding:12px;}
      .fw-post-emoji-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;}
      .fw-post-emoji-item{height:42px;border:1px solid rgba(28,28,24,.1);background:#fffaf1;border-radius:12px;font-size:24px;display:grid;place-items:center;cursor:pointer;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;}
      .fw-post-emoji-item:hover{border-color:rgba(217,121,121,.5);background:#fff3ef;}
      .fw-post-sticker-toolbar{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-bottom:10px;}
      .fw-post-sticker-upload{height:38px;border-radius:12px;border:1px dashed rgba(157,74,74,.45);background:#fff7ef;color:#9d4a4a;font-weight:1000;cursor:pointer;}
      .fw-post-sticker-count{font-size:11px;color:#8d857b;font-weight:900;white-space:nowrap;}
      .fw-post-sticker-empty{min-height:150px;display:grid;place-items:center;text-align:center;border:1px dashed rgba(28,28,24,.16);background:#fffaf1;border-radius:16px;color:#8d857b;font-weight:900;line-height:1.7;padding:12px;}
      .fw-post-sticker-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;}
      .fw-post-sticker-item{height:64px;border:1px solid rgba(28,28,24,.1);background:#fffaf1;border-radius:14px;cursor:pointer;padding:4px;display:grid;place-items:center;overflow:hidden;}
      .fw-post-sticker-item:hover{border-color:rgba(217,121,121,.55);background:#fff3ef;}
      .fw-post-sticker-item img{max-width:100%;max-height:100%;object-fit:contain;display:block;}

      .fw-rich-content{white-space:pre-wrap;line-height:1.55;}
      .fw-rich-content .fw-inline-sticker{display:block;margin:8px 0;max-width:144px;max-height:144px;}
      .fw-rich-content .fw-inline-sticker img{max-width:140px;max-height:140px;object-fit:contain;display:block;border-radius:10px;background:transparent;}
      .fw-rich-content .fw-inline-media{display:block;margin:10px 0;max-width:290px;}
      .fw-rich-content .fw-inline-media img{max-width:260px;max-height:320px;object-fit:contain;display:block;border-radius:12px;border:1px solid rgba(0,0,0,.08);background:#fffdf7;}
      .fw-rich-content .fw-inline-media video{max-width:280px;max-height:360px;display:block;border-radius:12px;background:#111;}
      .comment-list .fw-rich-content .fw-inline-sticker{max-width:104px;max-height:104px;}
      .comment-list .fw-rich-content .fw-inline-sticker img{max-width:100px;max-height:100px;}
      .comment-list .fw-rich-content .fw-inline-media img{max-width:180px;max-height:220px;}
      .comment-list .fw-rich-content .fw-inline-media video{max-width:190px;max-height:230px;}
      @media(max-width:760px){.fw-post-emoji-panel{width:calc(100vw - 24px);left:12px!important;right:12px!important;}.fw-rich-content .fw-inline-media img{max-width:220px;}.fw-rich-content .fw-inline-media video{max-width:230px;}}
    `;
    document.head.appendChild(style);
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
    if(blob.size > MAX_IMAGE_SIZE) throw new Error('图片压缩后仍超过 800KB，请换一张图片。');
    var ext = type.indexOf('webp') >= 0 ? 'webp' : 'jpg';
    return {file:makeFile(blob, 'fw_post_image_' + Date.now().toString(36) + '.' + ext, type), mime:type, ext:ext, kind:'image'};
  }

  function getVideoDuration(file){
    return withTimeout(new Promise(function(resolve, reject){
      var url = URL.createObjectURL(file);
      var video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = function(){ var d = video.duration || 0; try{ URL.revokeObjectURL(url); }catch(e){} resolve(d); };
      video.onerror = function(){ try{ URL.revokeObjectURL(url); }catch(e){} reject(new Error('视频读取失败，请换一个视频。')); };
      video.src = url;
    }), 10000, '视频读取超时，请换一个视频。');
  }

  async function validateVideo(file){
    if(file.size > MAX_VIDEO_SIZE) throw new Error('视频不能超过 20MB。');
    var duration = await getVideoDuration(file).catch(function(){ return 0; });
    if(duration && duration > MAX_VIDEO_SECONDS + 1) throw new Error('视频建议控制在 30 秒以内。');
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

  function encodeSticker(url){
    return '[[FW_USER_STICKER:' + btoa(String(url || '')) + ']]';
  }

  function makePath(userId, kind, ext){
    return userId + '/post/' + kind + '/' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8) + '.' + ext;
  }

  function previewHost(host, marker, kind, url){
    if(!host) return;
    host.dataset.fwPendingMedia = marker || '';
    host.dataset.fwPendingKind = kind || '';
    host.dataset.fwPendingUrl = url || '';
    var box = host.querySelector('[data-fw-post-media-preview]');
    if(!box) return;
    if(!marker){
      box.classList.remove('show');
      box.innerHTML = '';
      return;
    }
    box.classList.add('show');
    box.innerHTML = '<button type="button" class="fw-post-media-remove" data-fw-post-media-remove>×</button>' + (kind === 'video'
      ? '<video src="' + esc(url) + '" controls playsinline preload="metadata"></video>'
      : '<img src="' + esc(url) + '" alt="已选择媒体">');
  }

  async function uploadMediaForHost(host, file){
    if(uploading) return;
    uploading = true;
    var btn = host && host.querySelector('[data-fw-post-media]');
    if(btn) btn.disabled = true;
    try{
      var u = await getMe();
      toast('正在处理文件...', 6000);
      var prepared = await prepareMedia(file);
      var path = makePath(u.id, prepared.kind, prepared.ext || extFrom(prepared.file, prepared.kind === 'video' ? 'mp4' : 'jpg'));
      toast(prepared.kind === 'video' ? '正在上传视频...' : '正在上传图片...', 12000);
      var up = await withTimeout(
        window.fwDb.client.storage.from('chat-media').upload(path, prepared.file, {
          upsert:false,
          cacheControl:'3600',
          contentType:prepared.mime || prepared.file.type || file.type || 'application/octet-stream'
        }),
        prepared.kind === 'video' ? 45000 : 22000,
        prepared.kind === 'video' ? '视频上传超时，请稍后重试。' : '图片上传超时，请稍后重试。'
      );
      if(up.error) throw up.error;
      var publicUrl = (window.fwDb.client.storage.from('chat-media').getPublicUrl(path).data || {}).publicUrl || '';
      if(!publicUrl) throw new Error('媒体地址生成失败。');
      previewHost(host, encodeMarker(prepared.kind, publicUrl), prepared.kind, publicUrl);
      toast('已添加到发布内容，记得点发布/发送。');
    }finally{
      uploading = false;
      if(btn) btn.disabled = false;
    }
  }

  function ensureFileInput(){
    var input = $('[data-fw-post-media-file]');
    if(input) return input;
    input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.hidden = true;
    input.dataset.fwPostMediaFile = '1';
    document.body.appendChild(input);
    return input;
  }

  function getTextTargetFromHost(host){
    if(!host) return null;
    return host.matches('[data-post-form]') ? host.querySelector('textarea') : host.querySelector('.comment-box input, input');
  }

  function insertAtCursor(input, text){
    if(!input) return;
    var start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    var end = typeof input.selectionEnd === 'number' ? input.selectionEnd : input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    var next = start + text.length;
    input.focus();
    try{ input.setSelectionRange(next, next); }catch(e){}
    input.dispatchEvent(new Event('input', {bubbles:true}));
  }

  function appendPendingMedia(host){
    if(!host || !host.dataset.fwPendingMedia) return;
    var target = getTextTargetFromHost(host);
    if(!target) return;
    var marker = host.dataset.fwPendingMedia;
    if(String(target.value || '').indexOf(marker) >= 0) return;
    target.value = String(target.value || '').trim()
      ? String(target.value || '').replace(/\s*$/, '') + '\n' + marker
      : marker;
    target.dispatchEvent(new Event('input', {bubbles:true}));
  }

  function maybeClearAfterSubmit(host){
    setTimeout(function(){
      var target = getTextTargetFromHost(host);
      if(target && !String(target.value || '').trim()) previewHost(host, '', '', '');
      renderRichContent(document);
    }, 1200);
  }

  function ensureEmojiPanel(){
    var p = $('#fw-post-emoji-panel');
    if(p) return p;
    p = document.createElement('div');
    p.id = 'fw-post-emoji-panel';
    p.className = 'fw-post-emoji-panel';
    p.innerHTML = '<div class="fw-post-emoji-head"><span class="fw-post-emoji-logo">FW EMOJI</span><button type="button" class="fw-post-emoji-close" data-fw-post-emoji-close>×</button></div><div class="fw-post-emoji-tabs"><button type="button" class="fw-post-emoji-tab active" data-fw-post-emoji-tab="emoji">小表情</button><button type="button" class="fw-post-emoji-tab" data-fw-post-emoji-tab="stickers">♥</button></div><div class="fw-post-emoji-body" data-fw-post-emoji-body></div>';
    document.body.appendChild(p);
    renderEmojiBody();
    return p;
  }

  function setEmojiTab(tab){
    activeTab = tab || 'emoji';
    $$('.fw-post-emoji-tab').forEach(function(b){ b.classList.toggle('active', b.dataset.fwPostEmojiTab === activeTab); });
  }

  function renderEmojiBody(){
    var body = $('[data-fw-post-emoji-body]');
    if(!body) return;
    body.innerHTML = '<div class="fw-post-emoji-grid">' + EMOJIS.map(function(x){ return '<button type="button" class="fw-post-emoji-item" data-fw-post-emoji-insert="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>';
  }

  async function fetchStickers(force){
    if(stickerCache && !force) return stickerCache;
    var u = await getMe();
    var r = await withTimeout(
      window.fwDb.client.from('user_stickers').select('id,image_url,file_name,file_size,mime_type,storage_path,created_at').eq('user_id', u.id).eq('is_deleted', false).order('created_at', {ascending:false}).limit(MAX_STICKERS),
      10000,
      '表情列表读取超时，请稍后重试。'
    );
    if(r.error) throw r.error;
    stickerCache = r.data || [];
    return stickerCache;
  }

  function renderStickerList(rows){
    var body = $('[data-fw-post-emoji-body]');
    if(!body) return;
    var html = '<div class="fw-post-sticker-toolbar"><button type="button" class="fw-post-sticker-upload" data-fw-post-sticker-upload>+ 添加表情</button><span class="fw-post-sticker-count">' + rows.length + '/' + MAX_STICKERS + '</span></div>';
    if(!rows.length){
      html += '<div class="fw-post-sticker-empty"><div>♥<br>还没有添加表情<br>可以先在这里添加</div></div>';
    }else{
      html += '<div class="fw-post-sticker-grid">' + rows.map(function(s){ return '<button type="button" class="fw-post-sticker-item" data-fw-post-sticker-url="' + esc(s.image_url) + '"><img src="' + esc(s.image_url) + '" alt="表情"></button>'; }).join('') + '</div>';
    }
    body.innerHTML = html;
  }

  async function renderStickers(force){
    var body = $('[data-fw-post-emoji-body]');
    if(!body || loadingStickers) return;
    loadingStickers = true;
    body.innerHTML = '<div class="fw-post-sticker-empty">正在读取我的表情...</div>';
    try{
      renderStickerList(await fetchStickers(!!force));
    }catch(e){
      body.innerHTML = '<div class="fw-post-sticker-empty">' + esc(friendlyError(e)) + '</div>';
    }finally{
      loadingStickers = false;
    }
  }

  function positionEmojiPanel(trigger){
    var panel = ensureEmojiPanel();
    var rect = trigger.getBoundingClientRect();
    var gap = 10;
    var left = Math.max(12, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 12));
    var top = rect.top - panel.offsetHeight - gap;
    if(top < 12) top = rect.bottom + gap;
    panel.style.left = left + 'px';
    panel.style.top = Math.max(12, top) + 'px';
  }

  function openEmoji(trigger, target, host){
    activeTarget = target;
    activeHost = host;
    var panel = ensureEmojiPanel();
    setEmojiTab(activeTab || 'emoji');
    if(activeTab === 'stickers') renderStickers(false); else renderEmojiBody();
    panel.classList.add('show');
    requestAnimationFrame(function(){ positionEmojiPanel(trigger); });
  }

  function closeEmoji(){
    var p = $('#fw-post-emoji-panel');
    if(p) p.classList.remove('show');
  }

  function enhancePostForm(form){
    if(!form || form.dataset.fwPostTools === '1') return;
    var textarea = form.querySelector('textarea');
    var submit = form.querySelector('button[type="submit"]');
    if(!textarea || !submit) return;
    form.dataset.fwPostTools = '1';
    var preview = document.createElement('div');
    preview.className = 'fw-post-media-preview';
    preview.dataset.fwPostMediaPreview = '1';
    var tools = document.createElement('div');
    tools.className = 'fw-post-tools';
    tools.innerHTML = '<button type="button" class="fw-post-tool-btn" data-fw-post-emoji title="表情">😊</button><button type="button" class="fw-post-tool-btn" data-fw-post-media title="图片/视频">+</button>';
    textarea.insertAdjacentElement('afterend', preview);
    preview.insertAdjacentElement('afterend', tools);
  }

  function enhanceCommentBox(box){
    if(!box || box.dataset.fwPostTools === '1') return;
    var input = box.querySelector('input');
    var btn = box.querySelector('button[data-sb-action="comment-submit"]');
    if(!input || !btn) return;
    box.dataset.fwPostTools = '1';
    var preview = document.createElement('div');
    preview.className = 'fw-post-media-preview fw-comment-media-preview';
    preview.dataset.fwPostMediaPreview = '1';
    var tools = document.createElement('div');
    tools.className = 'fw-comment-tools';
    tools.innerHTML = '<button type="button" class="fw-post-tool-btn" data-fw-post-emoji title="表情">😊</button><button type="button" class="fw-post-tool-btn" data-fw-post-media title="图片/视频">+</button>';
    input.insertAdjacentElement('beforebegin', preview);
    input.insertAdjacentElement('beforebegin', tools);
  }

  function enhance(){
    $$('[data-post-form]').forEach(enhancePostForm);
    $$('.comment-box').forEach(enhanceCommentBox);
  }

  function getMarkerInfo(text, index){
    var raw = String(text || '');
    var specs = [
      {prefix:'[[FW_USER_STICKER:', end:']]', kind:'sticker'},
      {prefix:'[[FW_MEDIA_IMAGE:', end:']]', kind:'image'},
      {prefix:'[[FW_MEDIA_VIDEO:', end:']]', kind:'video'}
    ];
    for(var i = 0; i < specs.length; i += 1){
      var sp = specs[i];
      if(raw.indexOf(sp.prefix, index) === index){
        var end = raw.indexOf(sp.end, index + sp.prefix.length);
        if(end > index){
          var encoded = raw.slice(index + sp.prefix.length, end);
          try{
            var url = atob(encoded);
            if(/^https?:\/\//i.test(url)) return {kind:sp.kind, url:url, end:end + sp.end.length};
          }catch(e){}
        }
      }
    }
    return null;
  }

  function richHtml(text){
    text = String(text || '');
    var out = '';
    var i = 0;
    while(i < text.length){
      var next = text.indexOf('[[FW_', i);
      if(next < 0){ out += esc(text.slice(i)); break; }
      out += esc(text.slice(i, next));
      var m = getMarkerInfo(text, next);
      if(!m){ out += esc(text.slice(next, next + 5)); i = next + 5; continue; }
      if(m.kind === 'sticker'){
        out += '<span class="fw-inline-sticker"><img src="' + esc(m.url) + '" alt="表情"></span>';
      }else if(m.kind === 'video'){
        out += '<span class="fw-inline-media"><video src="' + esc(m.url) + '" controls playsinline preload="metadata"></video></span>';
      }else{
        out += '<a class="fw-inline-media" href="' + esc(m.url) + '" target="_blank" rel="noopener"><img src="' + esc(m.url) + '" alt="图片"></a>';
      }
      i = m.end;
    }
    return out;
  }

  function renderRichElement(el){
    if(!el || el.nodeType !== 1) return;
    if(el.dataset.fwRichRendered === '1') return;
    var text = el.textContent || '';
    if(text.indexOf('[[FW_') < 0) return;
    el.dataset.fwRichRendered = '1';
    el.classList.add('fw-rich-content');
    el.innerHTML = richHtml(text);
  }

  function renderRichContent(root){
    root = root || document;
    $$('.post-content, .comment-list li span', root).forEach(renderRichElement);
  }

  function scheduleRender(){
    clearTimeout(scanTimer);
    scanTimer = setTimeout(function(){ enhance(); renderRichContent(document); }, 120);
  }

  async function uploadStickerFromPanel(file){
    var u = await getMe();
    var ext = isGif(file) ? 'gif' : 'webp';
    var prepared;
    if(isGif(file)){
      if(file.size > 1024 * 1024) throw new Error('GIF 不能超过 1MB。');
      prepared = {file:file, mime:file.type || 'image/gif', ext:'gif'};
    }else{
      // 表情包继续使用 300×300、200KB 规则，复用简化压缩。
      var img = await loadImage(file);
      var side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
      var canvas = document.createElement('canvas');
      canvas.width = 300; canvas.height = 300;
      var ctx = canvas.getContext('2d', {alpha:true});
      var sx = Math.max(0, Math.floor(((img.naturalWidth || img.width) - side) / 2));
      var sy = Math.max(0, Math.floor(((img.naturalHeight || img.height) - side) / 2));
      ctx.drawImage(img, sx, sy, side, side, 0, 0, 300, 300);
      var blob = await canvasToBlob(canvas, 'image/webp', 0.82);
      var q = 0.82;
      while(blob.size > 200 * 1024 && q > 0.42){ q -= 0.08; blob = await canvasToBlob(canvas, 'image/webp', q); }
      if(blob.size > 200 * 1024) throw new Error('表情压缩后仍超过 200KB，请换一张。');
      prepared = {file:makeFile(blob, 'fw_sticker_' + Date.now().toString(36) + '.webp', 'image/webp'), mime:'image/webp', ext:'webp'};
    }
    var path = u.id + '/' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8) + '.' + prepared.ext;
    var up = await withTimeout(window.fwDb.client.storage.from('stickers').upload(path, prepared.file, {upsert:false, cacheControl:'3600', contentType:prepared.mime}), 22000, '表情上传超时，请稍后重试。');
    if(up.error) throw up.error;
    var url = (window.fwDb.client.storage.from('stickers').getPublicUrl(path).data || {}).publicUrl || '';
    var saved = await withTimeout(window.fwDb.client.from('user_stickers').insert({user_id:u.id,image_url:url,storage_path:path,file_name:file.name || 'sticker',file_size:prepared.file.size || file.size || 0,mime_type:prepared.mime}).select('id,image_url,file_name,file_size,mime_type,storage_path,created_at').single(), 12000, '表情保存超时，请稍后重试。');
    if(saved.error) throw saved.error;
    stickerCache = [saved.data].concat(stickerCache || []).slice(0, MAX_STICKERS);
    renderStickerList(stickerCache);
    toast('表情已添加。');
  }

  function bind(){
    document.addEventListener('click', function(e){
      var emoji = e.target.closest && e.target.closest('[data-fw-post-emoji]');
      if(emoji){
        e.preventDefault();
        var host = emoji.closest('[data-post-form], .comment-box');
        openEmoji(emoji, getTextTargetFromHost(host), host);
        return;
      }
      var media = e.target.closest && e.target.closest('[data-fw-post-media]');
      if(media){
        e.preventDefault();
        if(uploading){ toast('正在处理文件，请稍等。'); return; }
        activeHost = media.closest('[data-post-form], .comment-box');
        activeTarget = getTextTargetFromHost(activeHost);
        ensureFileInput().click();
        return;
      }
      var remove = e.target.closest && e.target.closest('[data-fw-post-media-remove]');
      if(remove){
        e.preventDefault();
        previewHost(remove.closest('[data-post-form], .comment-box'), '', '', '');
        return;
      }
      var close = e.target.closest && e.target.closest('[data-fw-post-emoji-close]');
      if(close){ e.preventDefault(); closeEmoji(); return; }
      var tab = e.target.closest && e.target.closest('[data-fw-post-emoji-tab]');
      if(tab){
        e.preventDefault();
        setEmojiTab(tab.dataset.fwPostEmojiTab || 'emoji');
        if(activeTab === 'stickers') renderStickers(false); else renderEmojiBody();
        return;
      }
      var emojiItem = e.target.closest && e.target.closest('[data-fw-post-emoji-insert]');
      if(emojiItem){
        e.preventDefault();
        insertAtCursor(activeTarget, emojiItem.dataset.fwPostEmojiInsert || '');
        return;
      }
      var sticker = e.target.closest && e.target.closest('[data-fw-post-sticker-url]');
      if(sticker){
        e.preventDefault();
        insertAtCursor(activeTarget, encodeSticker(sticker.dataset.fwPostStickerUrl || ''));
        closeEmoji();
        return;
      }
      var stUpload = e.target.closest && e.target.closest('[data-fw-post-sticker-upload]');
      if(stUpload){
        e.preventDefault();
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/jpeg,image/png,image/webp,image/gif';
        inp.onchange = function(){
          var file = inp.files && inp.files[0];
          if(!file) return;
          toast('正在添加表情...', 6000);
          uploadStickerFromPanel(file).catch(function(err){ toast(friendlyError(err), 4000); });
        };
        inp.click();
        return;
      }
      if($('#fw-post-emoji-panel')?.classList.contains('show') && !e.target.closest('#fw-post-emoji-panel')) closeEmoji();
    }, true);

    document.addEventListener('change', function(e){
      var input = e.target.closest && e.target.closest('[data-fw-post-media-file]');
      if(!input) return;
      var file = input.files && input.files[0];
      input.value = '';
      if(!file || !activeHost) return;
      uploadMediaForHost(activeHost, file).catch(function(err){ toast(friendlyError(err), 4200); });
    }, true);

    document.addEventListener('submit', function(e){
      var form = e.target.closest && e.target.closest('[data-post-form]');
      if(form){ appendPendingMedia(form); maybeClearAfterSubmit(form); }
    }, true);

    document.addEventListener('click', function(e){
      var btn = e.target.closest && e.target.closest('button[data-sb-action="comment-submit"]');
      if(btn){
        var box = btn.closest('.comment-box');
        appendPendingMedia(box);
        maybeClearAfterSubmit(box);
      }
    }, true);
  }

  function observe(){
    var obs = new MutationObserver(scheduleRender);
    obs.observe(document.body, {childList:true, subtree:true});
  }

  function boot(){
    injectStyle();
    ensureFileInput();
    ensureEmojiPanel();
    enhance();
    renderRichContent(document);
    bind();
    observe();
    setInterval(function(){ enhance(); renderRichContent(document); }, 1500);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
