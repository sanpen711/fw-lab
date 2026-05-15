// F.w 研究所：默认 Emoji + 我的表情包面板
// 当前版本：
// 1. 学术研讨房间、搭子私聊增加表情按钮。
// 2. 面板顶部样式：FW EMOJI / 小表情 / ♥ / 关闭。
// 3. 小表情：点击插入输入框。
// 4. ♥：用户可上传自己的表情包；普通图片压缩到 300×300 且控制在 200KB 内；GIF 保留动图但限制 1MB。
// 5. 表情包通过特殊文本码发送，不改原消息表结构。
(function(){
  if(window.__FW_EMOJI_PANEL_V3__) return;
  window.__FW_EMOJI_PANEL_V3__ = true;

  var EMOJIS = [
    '😂','😭','😅','😡','😴','😵',
    '🐟','😓','🙃','🤔','👀','😶',
    '👍','👎','🤝','🙏','👏','❤️',
    '🧠','🔬','📉','🧻','☕','💤'
  ];

  var MAX_STICKERS = 30;
  var MAX_GIF_SIZE = 1024 * 1024;
  var MAX_STATIC_SIZE = 200 * 1024;
  var TARGET_SIZE = 300;

  var activeInput = null;
  var activeForm = null;
  var activeTab = 'emoji';
  var panelOpen = false;
  var stickerCache = null;
  var loadingStickers = false;

  function $(s, root){ return (root || document).querySelector(s); }
  function $$(s, root){ return Array.from((root || document).querySelectorAll(s)); }

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function toast(msg){
    var t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwEmojiToastTimer);
    window.__fwEmojiToastTimer = setTimeout(function(){ t.classList.remove('show'); }, 2600);
  }

  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      var n = 0;
      var timer = setInterval(function(){
        n += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(timer); resolve(true); }
        if(n > 150){ clearInterval(timer); resolve(false); }
      }, 100);
    });
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

  function isGif(file){
    var name = String(file && file.name || '').toLowerCase();
    var type = String(file && file.type || '').toLowerCase();
    return type === 'image/gif' || /\.gif$/.test(name);
  }

  function isAllowedImage(file){
    var name = String(file && file.name || '').toLowerCase();
    var type = String(file && file.type || '').toLowerCase();
    return /^image\/(jpeg|jpg|png|webp|gif)$/.test(type) || /\.(jpg|jpeg|png|webp|gif)$/.test(name);
  }

  function extFromType(type, fallback){
    type = String(type || '').toLowerCase();
    if(type.indexOf('gif') >= 0) return 'gif';
    if(type.indexOf('png') >= 0) return 'png';
    if(type.indexOf('webp') >= 0) return 'webp';
    if(type.indexOf('jpeg') >= 0 || type.indexOf('jpg') >= 0) return 'jpg';
    return fallback || 'jpg';
  }

  function safeFileBase(name){
    return String(name || 'sticker')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 38) || 'sticker';
  }

  function loadImage(file){
    return withTimeout(new Promise(function(resolve, reject){
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function(){ try{ URL.revokeObjectURL(url); }catch(e){} resolve(img); };
      img.onerror = function(){ try{ URL.revokeObjectURL(url); }catch(e){} reject(new Error('图片读取失败，请换一张图片。')); };
      img.src = url;
    }), 8000, '图片处理超时，请稍后重试。');
  }

  function canvasToBlob(canvas, type, quality){
    return withTimeout(new Promise(function(resolve, reject){
      if(canvas.toBlob){
        canvas.toBlob(function(blob){
          if(blob) resolve(blob);
          else reject(new Error('图片压缩失败，请换一张图片。'));
        }, type, quality);
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
      }catch(e){
        reject(new Error('图片压缩失败，请换一张图片。'));
      }
    }), 10000, '图片压缩超时，请稍后重试。');
  }

  async function compressStaticSticker(file){
    var img = await loadImage(file);
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if(!w || !h) throw new Error('无法读取图片尺寸。');

    var canvas = document.createElement('canvas');
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    var ctx = canvas.getContext('2d', {alpha:true, willReadFrequently:false});
    if(!ctx) throw new Error('当前浏览器无法处理这张图片。');

    ctx.clearRect(0, 0, TARGET_SIZE, TARGET_SIZE);
    var side = Math.min(w, h);
    var sx = Math.max(0, Math.floor((w - side) / 2));
    var sy = Math.max(0, Math.floor((h - side) / 2));
    ctx.drawImage(img, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE);

    var type = 'image/webp';
    var quality = 0.82;
    var blob = await canvasToBlob(canvas, type, quality);
    if(!blob || !blob.type || blob.type.indexOf('webp') < 0){
      type = 'image/jpeg';
      quality = 0.82;
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#fffdf7';
      ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);
      blob = await canvasToBlob(canvas, type, quality);
    }

    while(blob.size > MAX_STATIC_SIZE && quality > 0.46){
      quality = Math.max(0.46, quality - 0.08);
      blob = await canvasToBlob(canvas, type, quality);
    }

    if(blob.size > MAX_STATIC_SIZE){
      throw new Error('图片压缩后仍超过 200KB，请换一张简单一点的图片。');
    }

    var ext = type.indexOf('webp') >= 0 ? 'webp' : 'jpg';
    var newName = safeFileBase(file.name) + '_fw300.' + ext;
    try{
      return new File([blob], newName, {type:type, lastModified:Date.now()});
    }catch(e){
      blob.name = newName;
      return blob;
    }
  }

  async function prepareStickerFile(file){
    if(!file || !file.size) throw new Error('没有选择图片。');
    if(!isAllowedImage(file)) throw new Error('只支持 JPG、PNG、WebP、GIF 图片。');

    if(isGif(file)){
      if(file.size > MAX_GIF_SIZE) throw new Error('GIF 不能超过 1MB。');
      return {file:file, mime:file.type || 'image/gif', ext:'gif'};
    }

    var compressed = await compressStaticSticker(file);
    return {file:compressed, mime:compressed.type || 'image/webp', ext:extFromType(compressed.type, 'webp')};
  }

  function encodeStickerUrl(url){
    return '[[FW_USER_STICKER:' + btoa(String(url || '')) + ']]';
  }

  function decodeStickerText(text){
    var m = String(text || '').trim().match(/^\[\[FW_USER_STICKER:([A-Za-z0-9+/=]+)\]\]$/);
    if(!m) return '';
    try{ return atob(m[1]); }catch(e){ return ''; }
  }

  function injectStyle(){
    if($('#fw-emoji-panel-style')) return;

    var style = document.createElement('style');
    style.id = 'fw-emoji-panel-style';
    style.textContent = `
      .fw-emoji-trigger{
        width:44px!important;min-width:44px!important;height:44px!important;border-radius:999px!important;
        border:1px solid rgba(28,28,24,.18)!important;background:#fffdf7!important;color:#1b1b18!important;
        font-size:19px!important;font-weight:1000!important;cursor:pointer!important;display:grid!important;place-items:center!important;padding:0!important;
      }
      [data-room-form].fw-emoji-enhanced,[data-fw-wx-compose].fw-emoji-enhanced{grid-template-columns:auto 1fr auto!important;}
      .fw-emoji-panel{position:fixed;z-index:13020;width:min(330px,calc(100vw - 24px));max-height:min(390px,calc(100vh - 30px));overflow:hidden;display:none;background:#fffdf7;color:#1d1d1a;border:1px solid rgba(217,121,121,.45);box-shadow:0 24px 90px rgba(0,0,0,.28);}
      .fw-emoji-panel.show{display:block;}
      .fw-emoji-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px 8px;}
      .fw-emoji-logo{color:#b85e5e;font-size:10px;font-weight:1000;letter-spacing:.16em;}
      .fw-emoji-close{border:0;background:transparent;font-size:22px;font-weight:1000;cursor:pointer;color:#1b1b18;line-height:1;}
      .fw-emoji-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 12px 10px;border-bottom:1px solid rgba(28,28,24,.1);}
      .fw-emoji-tab{height:34px;border-radius:999px;border:1px solid rgba(28,28,24,.14);background:#fffdf7;color:#1b1b18;font-size:14px;font-weight:1000;cursor:pointer;}
      .fw-emoji-tab.active{background:#1b1b18;color:#fffdf7;border-color:#1b1b18;}
      .fw-emoji-body{max-height:315px;overflow:auto;padding:12px;}
      .fw-emoji-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;}
      .fw-emoji-item{height:42px;border:1px solid rgba(28,28,24,.1);background:#fffaf1;border-radius:12px;font-size:24px;display:grid;place-items:center;cursor:pointer;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;}
      .fw-emoji-item:hover{border-color:rgba(217,121,121,.5);background:#fff3ef;}
      .fw-sticker-toolbar{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-bottom:10px;}
      .fw-sticker-upload-btn{height:38px;border-radius:12px;border:1px dashed rgba(157,74,74,.45);background:#fff7ef;color:#9d4a4a;font-weight:1000;cursor:pointer;}
      .fw-sticker-count{font-size:11px;color:#8d857b;font-weight:900;white-space:nowrap;}
      .fw-sticker-empty{min-height:160px;display:grid;place-items:center;text-align:center;border:1px dashed rgba(28,28,24,.16);background:#fffaf1;border-radius:16px;color:#8d857b;font-weight:900;line-height:1.7;}
      .fw-sticker-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;}
      .fw-sticker-item{position:relative;height:64px;border:1px solid rgba(28,28,24,.1);background:#fffaf1;border-radius:14px;cursor:pointer;padding:4px;display:grid;place-items:center;overflow:hidden;}
      .fw-sticker-item:hover{border-color:rgba(217,121,121,.55);background:#fff3ef;}
      .fw-sticker-item img{max-width:100%;max-height:100%;object-fit:contain;display:block;}
      .fw-sticker-del{position:absolute;right:3px;top:3px;width:18px;height:18px;border:0;border-radius:50%;background:rgba(27,27,24,.72);color:#fff;font-size:13px;line-height:18px;cursor:pointer;display:none;}
      .fw-sticker-item:hover .fw-sticker-del{display:block;}
      .fw-sticker-message{display:inline-grid;place-items:center;max-width:132px;max-height:132px;background:transparent!important;padding:0!important;}
      .fw-sticker-message img{max-width:128px;max-height:128px;object-fit:contain;display:block;border-radius:10px;}
      .fw-wx-pm-bubble.fw-sticker-bubble,.fw-bubble p.fw-sticker-bubble{background:transparent!important;box-shadow:none!important;border:0!important;padding:0!important;}
      @media(max-width:760px){.fw-emoji-panel{width:calc(100vw - 24px);left:12px!important;right:12px!important;}.fw-emoji-grid{grid-template-columns:repeat(6,1fr);}.fw-sticker-grid{grid-template-columns:repeat(4,1fr);}}
    `;

    document.head.appendChild(style);
  }

  function ensurePanel(){
    var panel = $('#fw-emoji-panel');
    if(panel) return panel;

    panel = document.createElement('div');
    panel.id = 'fw-emoji-panel';
    panel.className = 'fw-emoji-panel';
    panel.innerHTML = `
      <div class="fw-emoji-head"><span class="fw-emoji-logo">FW EMOJI</span><button type="button" class="fw-emoji-close" data-fw-emoji-close>×</button></div>
      <div class="fw-emoji-tabs"><button type="button" class="fw-emoji-tab active" data-fw-emoji-tab="emoji">小表情</button><button type="button" class="fw-emoji-tab" data-fw-emoji-tab="stickers">♥</button></div>
      <div class="fw-emoji-body" data-fw-emoji-body></div>
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden data-fw-sticker-file>
    `;
    document.body.appendChild(panel);
    renderPanelBody('emoji');
    return panel;
  }

  function setTabs(tab){
    activeTab = tab || 'emoji';
    $$('.fw-emoji-tab').forEach(function(btn){ btn.classList.toggle('active', btn.dataset.fwEmojiTab === activeTab); });
  }

  function renderEmojiBody(){
    var body = $('[data-fw-emoji-body]');
    if(!body) return;
    body.innerHTML = '<div class="fw-emoji-grid">' + EMOJIS.map(function(item){
      return '<button type="button" class="fw-emoji-item" data-fw-emoji-insert="' + esc(item) + '">' + esc(item) + '</button>';
    }).join('') + '</div>';
  }

  async function getMe(){
    if(!(await waitDb())) throw new Error('账号系统还没加载完成。');
    var u = await window.fwDb.getCurrentUser();
    if(!u || !u.id) throw new Error('请先登录。');
    return u;
  }

  function friendlyDbError(e){
    var msg = String(e && e.message || e || '');
    if(/user_stickers|relation|does not exist|schema cache|Could not find/i.test(msg)) return '表情包数据表还没初始化，请先运行表情包 SQL。';
    if(/bucket|storage|not found/i.test(msg)) return '表情包存储桶还没初始化，请先运行表情包 SQL。';
    return msg || '操作失败。';
  }

  async function fetchMyStickers(force){
    if(stickerCache && !force) return stickerCache;
    var u = await getMe();
    var r = await window.fwDb.client
      .from('user_stickers')
      .select('id,image_url,file_name,file_size,mime_type,storage_path,created_at')
      .eq('user_id', u.id)
      .eq('is_deleted', false)
      .order('created_at', {ascending:false})
      .limit(MAX_STICKERS);
    if(r.error) throw r.error;
    stickerCache = r.data || [];
    return stickerCache;
  }

  function renderStickerList(rows){
    var body = $('[data-fw-emoji-body]');
    if(!body) return;
    var html = '<div class="fw-sticker-toolbar"><button type="button" class="fw-sticker-upload-btn" data-fw-sticker-upload>+ 添加表情</button><span class="fw-sticker-count">' + rows.length + '/' + MAX_STICKERS + '</span></div>';
    if(!rows.length){
      html += '<div class="fw-sticker-empty"><div>♥<br>还没有添加表情<br>点上方添加</div></div>';
    }else{
      html += '<div class="fw-sticker-grid">' + rows.map(function(s){
        return '<button type="button" class="fw-sticker-item" data-fw-sticker-url="' + esc(s.image_url) + '" title="发送表情">'
          + '<img src="' + esc(s.image_url) + '" alt="表情">'
          + '<span type="button" class="fw-sticker-del" data-fw-sticker-delete="' + esc(s.id) + '" title="删除">×</span>'
          + '</button>';
      }).join('') + '</div>';
    }
    body.innerHTML = html;
  }

  async function renderStickerBody(force){
    var body = $('[data-fw-emoji-body]');
    if(!body || loadingStickers) return;
    loadingStickers = true;
    body.innerHTML = '<div class="fw-sticker-empty">正在读取我的表情...</div>';
    try{
      var rows = await fetchMyStickers(!!force);
      renderStickerList(rows);
    }catch(e){
      body.innerHTML = '<div class="fw-sticker-empty">' + esc(friendlyDbError(e)) + '</div>';
    }finally{
      loadingStickers = false;
    }
  }

  function renderPanelBody(tab){
    setTabs(tab || activeTab);
    if(activeTab === 'stickers') renderStickerBody(false);
    else renderEmojiBody();
  }

  function positionPanel(trigger){
    var panel = ensurePanel();
    var rect = trigger.getBoundingClientRect();
    var gap = 10;
    var left = Math.max(12, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 12));
    var top = rect.top - panel.offsetHeight - gap;
    if(top < 12) top = rect.bottom + gap;
    panel.style.left = left + 'px';
    panel.style.top = Math.max(12, top) + 'px';
  }

  function openPanel(trigger, input, form){
    activeInput = input;
    activeForm = form;
    var panel = ensurePanel();
    renderPanelBody(activeTab || 'emoji');
    panel.classList.add('show');
    panelOpen = true;
    requestAnimationFrame(function(){ positionPanel(trigger); });
  }

  function closePanel(){
    var panel = $('#fw-emoji-panel');
    if(panel) panel.classList.remove('show');
    panelOpen = false;
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

  function enhanceForm(form, type){
    if(!form || form.dataset.fwEmojiEnhanced === '1') return;
    var input = form.querySelector('input[name="message"], input');
    if(!input) return;
    form.dataset.fwEmojiEnhanced = '1';
    form.classList.add('fw-emoji-enhanced');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fw-emoji-trigger';
    btn.dataset.fwEmojiTrigger = type;
    btn.setAttribute('aria-label', '打开表情面板');
    btn.textContent = '😊';
    form.insertBefore(btn, input);
  }

  function enhanceForms(){
    enhanceForm($('[data-room-form]'), 'room');
    enhanceForm($('[data-fw-wx-compose]'), 'buddy');
  }

  async function uploadSticker(file){
    var u = await getMe();
    var rows = await fetchMyStickers(false).catch(function(){ return []; });
    if(rows.length >= MAX_STICKERS) throw new Error('最多只能添加 ' + MAX_STICKERS + ' 个表情。');

    var prepared = await prepareStickerFile(file);
    var uploadFile = prepared.file;
    var ext = prepared.ext || extFromType(uploadFile.type, 'jpg');
    var path = u.id + '/' + Date.now() + '_' + Math.random().toString(16).slice(2) + '_' + safeFileBase(uploadFile.name || file.name) + '.' + ext;

    var up = await withTimeout(
      window.fwDb.client.storage.from('stickers').upload(path, uploadFile, {
        upsert:true,
        cacheControl:'3600',
        contentType:prepared.mime || uploadFile.type || file.type || 'image/jpeg'
      }),
      22000,
      '表情上传超时，请稍后重试。'
    );
    if(up.error) throw up.error;

    var publicUrl = window.fwDb.client.storage.from('stickers').getPublicUrl(path).data.publicUrl;
    var saved = await window.fwDb.client.from('user_stickers').insert({
      user_id:u.id,
      image_url:publicUrl,
      storage_path:path,
      file_name:file.name || uploadFile.name || 'sticker',
      file_size:uploadFile.size || file.size || 0,
      mime_type:prepared.mime || uploadFile.type || file.type || ''
    }).select('id').single();
    if(saved.error) throw saved.error;

    stickerCache = null;
    await renderStickerBody(true);
    toast('表情已添加。');
  }

  async function deleteSticker(id){
    if(!id) return;
    try{
      var res = await window.fwDb.client.from('user_stickers').update({is_deleted:true}).eq('id', id);
      if(res.error) throw res.error;
      stickerCache = null;
      await renderStickerBody(true);
      toast('表情已删除。');
    }catch(e){
      toast(friendlyDbError(e));
    }
  }

  function sendSticker(url){
    if(!activeInput || !activeForm){ toast('先打开一个聊天输入框。'); return; }
    activeInput.value = encodeStickerUrl(url);
    activeInput.dispatchEvent(new Event('input', {bubbles:true}));
    closePanel();
    activeForm.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}));
  }

  function renderStickerMessages(){
    $$('.fw-bubble p, .fw-wx-pm-bubble').forEach(function(el){
      if(el.dataset.fwStickerRendered === '1') return;
      var url = decodeStickerText(el.textContent);
      if(!url) return;
      el.dataset.fwStickerRendered = '1';
      el.classList.add('fw-sticker-bubble');
      el.innerHTML = '<span class="fw-sticker-message"><img src="' + esc(url) + '" alt="表情"></span>';
    });
  }

  function bind(){
    document.addEventListener('click', function(e){
      var trigger = e.target.closest && e.target.closest('[data-fw-emoji-trigger]');
      if(trigger){
        e.preventDefault(); e.stopPropagation();
        var form = trigger.closest('form');
        var input = form && form.querySelector('input[name="message"], input');
        if(input) openPanel(trigger, input, form);
        return;
      }

      var close = e.target.closest && e.target.closest('[data-fw-emoji-close]');
      if(close){ e.preventDefault(); closePanel(); return; }

      var tab = e.target.closest && e.target.closest('[data-fw-emoji-tab]');
      if(tab){ e.preventDefault(); renderPanelBody(tab.dataset.fwEmojiTab || 'emoji'); return; }

      var emoji = e.target.closest && e.target.closest('[data-fw-emoji-insert]');
      if(emoji){ e.preventDefault(); insertAtCursor(activeInput, emoji.dataset.fwEmojiInsert || ''); return; }

      var upload = e.target.closest && e.target.closest('[data-fw-sticker-upload]');
      if(upload){ e.preventDefault(); var input = $('[data-fw-sticker-file]'); if(input) input.click(); return; }

      var del = e.target.closest && e.target.closest('[data-fw-sticker-delete]');
      if(del){ e.preventDefault(); e.stopPropagation(); deleteSticker(del.dataset.fwStickerDelete); return; }

      var sticker = e.target.closest && e.target.closest('[data-fw-sticker-url]');
      if(sticker){ e.preventDefault(); sendSticker(sticker.dataset.fwStickerUrl); return; }

      if(panelOpen && !e.target.closest('#fw-emoji-panel')) closePanel();
    }, true);

    document.addEventListener('change', function(e){
      var input = e.target.closest && e.target.closest('[data-fw-sticker-file]');
      if(!input) return;
      var file = input.files && input.files[0];
      input.value = '';
      if(!file) return;
      toast('正在添加表情...');
      uploadSticker(file).catch(function(err){ toast(friendlyDbError(err)); });
    }, true);

    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closePanel(); });

    window.addEventListener('resize', function(){
      if(panelOpen){ var trigger = $('[data-fw-emoji-trigger]'); if(trigger) positionPanel(trigger); }
    });
  }

  function observe(){
    var timer = 0;
    var observer = new MutationObserver(function(){
      clearTimeout(timer);
      timer = setTimeout(function(){ enhanceForms(); renderStickerMessages(); }, 120);
    });
    observer.observe(document.body, {childList:true, subtree:true});
  }

  function boot(){
    injectStyle();
    ensurePanel();
    enhanceForms();
    renderStickerMessages();
    bind();
    observe();
    setInterval(renderStickerMessages, 1800);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
