(function(){
  if(window.FWAppPublish) return;

  var selectedStatus = '已疲惫';
  var bound = false;
  var squareScrollTop = 0;
  var pendingImage = null;
  var uploadingImage = false;
  var stickerCache = null;
  var loadingStickers = false;
  var selectedStickers = [];

  var MAX_IMAGE_SIZE = 800 * 1024;
  var MAX_GIF_SIZE = 3 * 1024 * 1024;
  var MAX_IMAGE_EDGE = 1280;
  var MAX_SELECTED_STICKERS = 6;

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function $$(selector, root){ return app().$$(selector, root); }
  function esc(value){ return app().esc(value); }

  function injectStyle(){
    if(document.getElementById('fwAppSquarePublishStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwAppSquarePublishStyle';
    style.textContent = [
      '.view-head.square-head{position:relative;padding-right:58px}',
      '.square-publish-trigger{position:absolute;right:4px;bottom:12px;width:44px;height:44px;border:0;border-radius:16px;background:var(--accent);color:#fff;font-size:27px;font-weight:1000;line-height:1;box-shadow:0 10px 24px rgba(152,77,77,.22)}',
      '.square-publish-view .view-head{padding-bottom:14px}',
      '.square-publish-subtitle{display:block;margin-top:10px;color:var(--muted);font-size:14px;line-height:1.55;font-weight:850}',
      '.square-publish-view .publish-card[data-publish-form]{display:grid;gap:12px;margin:0 0 18px;padding:15px;border-radius:16px}',
      '.square-publish-view .publish-card[data-publish-form] label{color:var(--deep);font-size:13px;font-weight:1000}',
      '.square-publish-view .publish-card[data-publish-form] textarea{min-height:240px;font-size:16px;line-height:1.6;resize:none}',
      '.square-publish-view .publish-card[data-publish-form] .form-row{gap:8px;align-items:center}',
      '.square-publish-view .publish-card[data-publish-form] .form-row .app-btn{padding:0 14px;min-width:74px}',
      '.square-publish-view .publish-card[data-publish-form] .form-row span{margin-right:auto;color:var(--muted);font-size:12px;font-weight:900}',
      '.app-publish-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.app-publish-tool-btn{min-height:38px;border:1px solid rgba(30,30,28,.14);border-radius:999px;background:rgba(255,253,247,.82);color:var(--green);padding:0 13px;font-size:12px;font-weight:1000}',
      '.app-publish-tool-btn:disabled{opacity:.55}',
      '.app-publish-image-preview:empty,.app-publish-selected-stickers:empty{display:none}',
      '.app-publish-image-card{position:relative;margin-top:2px;border:1px solid rgba(30,30,28,.12);border-radius:14px;background:#fffaf1;padding:9px;overflow:hidden}',
      '.app-publish-image-card img{display:block;max-width:100%;max-height:260px;object-fit:contain;border-radius:10px;margin:0 auto}',
      '.app-publish-image-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;color:var(--muted);font-size:12px;font-weight:900}',
      '.app-publish-remove{min-width:36px;min-height:32px;border:1px solid rgba(217,121,121,.32);border-radius:999px;background:#fff7f4;color:var(--accent-dark);font-size:12px;font-weight:1000}',
      '.app-publish-selected-stickers{display:flex;gap:8px;flex-wrap:wrap}',
      '.app-publish-sticker-chip{position:relative;width:58px;height:58px;border:1px solid rgba(30,30,28,.12);border-radius:14px;background:#fffaf1;display:grid;place-items:center}',
      '.app-publish-sticker-chip img{max-width:48px;max-height:48px;object-fit:contain}',
      '.app-publish-sticker-chip button{position:absolute;right:-6px;top:-6px;width:24px;height:24px;border:0;border-radius:999px;background:var(--accent);color:#fff;font-size:16px;line-height:1;font-weight:1000}',
      '.app-publish-sticker-panel{border:1px solid rgba(30,30,28,.12);border-radius:14px;background:#fffaf1;padding:10px;max-height:232px;overflow:auto}',
      '.app-publish-sticker-panel[hidden]{display:none!important}',
      '.app-publish-sticker-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}',
      '.app-publish-sticker-grid button{min-width:0;height:54px;border:1px solid rgba(30,30,28,.1);border-radius:12px;background:#fffdf7;display:grid;place-items:center;padding:5px}',
      '.app-publish-sticker-grid img{max-width:44px;max-height:44px;object-fit:contain}',
      '.app-publish-panel-note{margin:0;color:var(--muted);font-size:12px;line-height:1.55;font-weight:900}'
    ].join('\n');
    document.head.appendChild(style);
  }

  async function requireUser(){
    if(app().state.user) return app().state.user;
    await app().refreshUser();
    if(app().state.user) return app().state.user;
    app().toast('登录后才能发牢骚。');
    return null;
  }

  function publishForm(){
    return $('[data-publish-form]');
  }

  function getMain(){
    return $('#appMain') || $('.app-main');
  }

  function cleanupLegacySheet(){
    $$('[data-publish-backdrop]').forEach(function(node){
      if(node.parentNode) node.parentNode.removeChild(node);
    });
    var shell = $('.app-shell');
    if(shell) shell.classList.remove('publish-open');
    var form = publishForm();
    if(!form) return;
    form.classList.remove('is-open');
    $$('[data-publish-sheet-title],[data-publish-close]', form).forEach(function(node){
      if(node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function ensurePublishView(){
    var main = getMain();
    var form = publishForm();
    if(!main || !form) return null;

    var view = $('[data-app-view="square-publish"]');
    if(!view){
      view = document.createElement('section');
      view.className = 'app-view square-publish-view';
      view.dataset.appView = 'square-publish';
      view.setAttribute('aria-label', '发布牢骚');
      view.innerHTML = [
        '<div class="view-head compact">',
          '<button class="back-btn" type="button" data-publish-back-square>‹ 精神广场</button>',
          '<p>精神广场</p>',
          '<h1>发一句牢骚</h1>',
          '<span class="square-publish-subtitle">把今天不想处理的情绪先放在这里</span>',
        '</div>',
        '<div data-publish-page-slot></div>'
      ].join('');
      main.appendChild(view);
    }

    var slot = $('[data-publish-page-slot]', view);
    if(slot && form.parentNode !== slot) slot.appendChild(form);
    return view;
  }

  function encodeMarker(prefix, url){
    return '[[' + prefix + ':' + btoa(String(url || '')) + ']]';
  }

  function encodeImage(url){
    return encodeMarker('FW_MEDIA_IMAGE', url);
  }

  function encodeSticker(url){
    return encodeMarker('FW_USER_STICKER', url);
  }

  function revokeLocalImage(){
    if(pendingImage && pendingImage.localUrl){
      try{ URL.revokeObjectURL(pendingImage.localUrl); }catch(e){}
    }
  }

  function imagePreviewNode(){
    return $('[data-publish-image-preview]');
  }

  function stickerPanelNode(){
    return $('[data-publish-sticker-panel]');
  }

  function selectedStickersNode(){
    return $('[data-publish-selected-stickers]');
  }

  function renderImagePreview(){
    var node = imagePreviewNode();
    if(!node) return;
    if(!pendingImage){
      node.innerHTML = '';
      return;
    }
    var src = pendingImage.localUrl || pendingImage.url || '';
    var note = pendingImage.uploading ? '正在上传图片...' : '图片已准备好';
    if(pendingImage.error) note = pendingImage.error;
    node.innerHTML = '<div class="app-publish-image-card">' +
      (src ? '<img src="' + esc(src) + '" alt="已选择的图片">' : '') +
      '<div class="app-publish-image-meta"><span>' + esc(note) + '</span><button class="app-publish-remove" type="button" data-publish-image-remove>删除</button></div>' +
    '</div>';
  }

  function renderSelectedStickers(){
    var node = selectedStickersNode();
    if(!node) return;
    node.innerHTML = selectedStickers.map(function(sticker, index){
      return '<span class="app-publish-sticker-chip"><img src="' + esc(sticker.url) + '" alt="已选表情"><button type="button" aria-label="移除表情" data-publish-sticker-remove="' + index + '">×</button></span>';
    }).join('');
  }

  function renderStickerPanel(rows, message){
    var panel = stickerPanelNode();
    if(!panel) return;
    panel.hidden = false;
    if(message){
      panel.innerHTML = '<p class="app-publish-panel-note">' + esc(message) + '</p>';
      return;
    }
    rows = rows || [];
    if(!rows.length){
      panel.innerHTML = '<p class="app-publish-panel-note">暂时没有可用表情。</p>';
      return;
    }
    panel.innerHTML = '<div class="app-publish-sticker-grid">' + rows.map(function(row){
      var url = row.image_url || row.url || '';
      return '<button type="button" data-publish-sticker-url="' + esc(url) + '" aria-label="选择表情"><img src="' + esc(url) + '" alt="表情"></button>';
    }).join('') + '</div>';
  }

  function ensureMediaControls(){
    var form = publishForm();
    if(!form || form.querySelector('[data-publish-media-controls]')) return;
    var textarea = form.querySelector('textarea[name="content"]');
    if(!textarea) return;
    var wrapper = document.createElement('div');
    wrapper.dataset.publishMediaControls = 'true';
    wrapper.innerHTML = [
      '<div class="app-publish-tools">',
        '<button class="app-publish-tool-btn" type="button" data-publish-image>添加图片</button>',
        '<button class="app-publish-tool-btn" type="button" data-publish-stickers>我的表情</button>',
        '<input type="file" accept="image/*" data-publish-image-file hidden>',
      '</div>',
      '<div class="app-publish-image-preview" data-publish-image-preview></div>',
      '<div class="app-publish-selected-stickers" data-publish-selected-stickers></div>',
      '<div class="app-publish-sticker-panel" data-publish-sticker-panel hidden></div>'
    ].join('');
    textarea.insertAdjacentElement('afterend', wrapper);
  }

  function updateCount(){
    var textarea = $('[data-publish-form] textarea[name="content"]');
    var counter = $('[data-publish-count]');
    if(counter && textarea) counter.textContent = String((textarea.value || '').length) + '/500';
  }

  function clearForm(){
    var form = publishForm();
    var textarea = form && form.querySelector('textarea[name="content"]');
    if(textarea){
      textarea.value = '';
      textarea.blur();
    }
    selectedStatus = '已疲惫';
    selectedStickers = [];
    revokeLocalImage();
    pendingImage = null;
    uploadingImage = false;
    $$('[data-publish-status] [data-status]').forEach(function(item){
      item.classList.toggle('active', item.dataset.status === selectedStatus);
    });
    var panel = stickerPanelNode();
    if(panel) panel.hidden = true;
    renderImagePreview();
    renderSelectedStickers();
    updateCount();
  }

  function ensurePublishTrigger(){
    var square = $('[data-app-view="square"]');
    var head = square && $('.view-head', square);
    if(!head) return;
    head.classList.add('square-head');
    if(head.querySelector('[data-publish-open]')) return;
    var trigger = document.createElement('button');
    trigger.className = 'square-publish-trigger';
    trigger.type = 'button';
    trigger.dataset.publishOpen = 'true';
    trigger.setAttribute('aria-label', '发牢骚');
    trigger.textContent = '+';
    head.appendChild(trigger);
  }

  function ensureCancelButton(){
    var form = publishForm();
    var row = form && form.querySelector('.form-row');
    if(!row || row.querySelector('[data-publish-cancel]')) return;
    var submit = row.querySelector('button[type="submit"]');
    if(!submit) return;
    var cancel = document.createElement('button');
    cancel.className = 'app-btn';
    cancel.type = 'button';
    cancel.dataset.publishCancel = 'true';
    cancel.textContent = '取消';
    row.insertBefore(cancel, submit);
  }

  function rememberSquareScroll(){
    var main = getMain();
    if(app().state.view === 'square' && main) squareScrollTop = main.scrollTop || 0;
  }

  function restoreSquareScroll(){
    var main = getMain();
    if(!main) return;
    requestAnimationFrame(function(){
      main.scrollTop = squareScrollTop || 0;
      requestAnimationFrame(function(){ main.scrollTop = squareScrollTop || 0; });
    });
  }

  function returnToSquare(options){
    options = options || {};
    cleanupLegacySheet();
    app().setView('square');
    if(options.restoreScroll) restoreSquareScroll();
  }

  function openPublishPage(){
    cleanupLegacySheet();
    rememberSquareScroll();
    ensurePublishView();
    ensureCancelButton();
    ensureMediaControls();
    updateCount();
    app().setView('square-publish');
    if(!app().state.user){
      app().refreshUser().then(function(user){
        if(!user) app().toast('登录后才能发牢骚。');
      });
    }
  }

  function fileExt(file, fallback){
    var name = file && file.name || '';
    var match = name.match(/\.([a-z0-9]+)$/i);
    if(match) return match[1].toLowerCase();
    var type = file && file.type || '';
    if(type.indexOf('png') >= 0) return 'png';
    if(type.indexOf('webp') >= 0) return 'webp';
    if(type.indexOf('gif') >= 0) return 'gif';
    return fallback || 'jpg';
  }

  function makeImagePath(userId, ext){
    var random = Math.random().toString(36).slice(2, 8);
    return String(userId || 'anonymous') + '/post/image/' + Date.now().toString(36) + '_' + random + '.' + (ext || 'jpg');
  }

  function withTimeout(promise, ms, message){
    return new Promise(function(resolve, reject){
      var timer = setTimeout(function(){ reject(new Error(message || 'timeout')); }, ms);
      promise.then(function(value){
        clearTimeout(timer);
        resolve(value);
      }).catch(function(error){
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function loadImage(file){
    return new Promise(function(resolve, reject){
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function(){
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function(){
        URL.revokeObjectURL(url);
        reject(new Error('image-load'));
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality){
    return new Promise(function(resolve){
      canvas.toBlob(function(blob){ resolve(blob); }, type, quality);
    });
  }

  function makeFile(blob, name, type){
    try{
      return new File([blob], name, {type:type || blob.type || 'image/jpeg'});
    }catch(e){
      blob.name = name;
      return blob;
    }
  }

  async function compressImage(file){
    if(!file || !/^image\//i.test(file.type || '')) throw new Error('not-image');
    var isGif = /gif/i.test(file.type || '') || /\.gif$/i.test(file.name || '');
    if(isGif){
      if(file.size > MAX_GIF_SIZE) throw new Error('image-too-large');
      return file;
    }
    if(file.size <= MAX_IMAGE_SIZE) return file;

    var img = await loadImage(file);
    var scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    var width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    var height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    var blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
    if(!blob) return file;
    return makeFile(blob, (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg', 'image/jpeg');
  }

  async function uploadImage(file){
    var user = await requireUser();
    if(!user) return null;
    var db = app().db();
    var client = db && db.client;
    if(!client || !client.storage) throw new Error('storage-missing');

    var uploadFile = await compressImage(file);
    var ext = fileExt(uploadFile, 'jpg');
    var path = makeImagePath(user.id, ext);
    var result = await withTimeout(
      client.storage.from('chat-media').upload(path, uploadFile, {
        cacheControl:'31536000',
        upsert:false,
        contentType:uploadFile.type || 'image/jpeg'
      }),
      35000,
      'upload-timeout'
    );
    if(result.error) throw result.error;

    var publicData = client.storage.from('chat-media').getPublicUrl(path);
    var publicUrl = publicData && publicData.data && publicData.data.publicUrl;
    if(!publicUrl) throw new Error('public-url-missing');
    return {url:publicUrl, marker:encodeImage(publicUrl)};
  }

  async function fetchStickers(force){
    if(stickerCache && !force) return stickerCache;
    if(loadingStickers) return stickerCache || [];
    var user = await requireUser();
    if(!user) return [];
    var db = app().db();
    var client = db && db.client;
    if(!client) throw new Error('db');

    loadingStickers = true;
    try{
      var res = await client
        .from('user_stickers')
        .select('id,image_url,file_name,file_size,mime_type,storage_path,created_at')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .order('created_at', {ascending:false})
        .limit(30);
      if(res.error) throw res.error;
      stickerCache = (res.data || []).filter(function(row){ return row && row.image_url; });
      return stickerCache;
    }finally{
      loadingStickers = false;
    }
  }

  function composeContent(text){
    var parts = [];
    var cleanText = String(text || '').trim();
    if(cleanText) parts.push(cleanText);
    selectedStickers.forEach(function(sticker){
      if(sticker.marker) parts.push(sticker.marker);
    });
    if(pendingImage && pendingImage.marker) parts.push(pendingImage.marker);
    return parts.join('\n').trim();
  }

  function bind(){
    if(bound) return;
    bound = true;

    document.addEventListener('click', async function(e){
      var open = e.target.closest && e.target.closest('[data-publish-open]');
      if(open){
        e.preventDefault();
        openPublishPage();
        return;
      }

      var imageBtn = e.target.closest && e.target.closest('[data-publish-image]');
      if(imageBtn){
        e.preventDefault();
        if(uploadingImage){
          app().toast('图片还在上传，请稍后。');
          return;
        }
        var userForImage = await requireUser();
        if(!userForImage) return;
        var fileInput = $('[data-publish-image-file]');
        if(fileInput) fileInput.click();
        return;
      }

      var imageRemove = e.target.closest && e.target.closest('[data-publish-image-remove]');
      if(imageRemove){
        e.preventDefault();
        revokeLocalImage();
        pendingImage = null;
        uploadingImage = false;
        renderImagePreview();
        return;
      }

      var stickerToggle = e.target.closest && e.target.closest('[data-publish-stickers]');
      if(stickerToggle){
        e.preventDefault();
        var panel = stickerPanelNode();
        if(!panel) return;
        if(!panel.hidden){
          panel.hidden = true;
          return;
        }
        renderStickerPanel([], '正在读取我的表情...');
        try{
          var rows = await fetchStickers(false);
          renderStickerPanel(rows);
        }catch(err){
          console.warn('[FW mobile app] sticker load failed', err);
          renderStickerPanel([], '表情暂时读取失败，请稍后再试。');
        }
        return;
      }

      var stickerPick = e.target.closest && e.target.closest('[data-publish-sticker-url]');
      if(stickerPick){
        e.preventDefault();
        var url = stickerPick.dataset.publishStickerUrl || '';
        if(!url) return;
        if(selectedStickers.length >= MAX_SELECTED_STICKERS){
          app().toast('这次先放这么多表情吧。');
          return;
        }
        selectedStickers.push({url:url, marker:encodeSticker(url)});
        renderSelectedStickers();
        app().toast('已加入表情');
        return;
      }

      var stickerRemove = e.target.closest && e.target.closest('[data-publish-sticker-remove]');
      if(stickerRemove){
        e.preventDefault();
        var index = Number(stickerRemove.dataset.publishStickerRemove);
        if(index >= 0) selectedStickers.splice(index, 1);
        renderSelectedStickers();
        return;
      }

      var back = e.target.closest && e.target.closest('[data-publish-back-square]');
      if(back){
        e.preventDefault();
        returnToSquare({restoreScroll:true});
        return;
      }

      var cancel = e.target.closest && e.target.closest('[data-publish-cancel]');
      if(cancel){
        e.preventDefault();
        clearForm();
        returnToSquare({restoreScroll:true});
        return;
      }

      var btn = e.target.closest && e.target.closest('[data-status]');
      if(!btn || !btn.closest('[data-publish-status]')) return;
      selectedStatus = btn.dataset.status || '已疲惫';
      $$('[data-publish-status] [data-status]').forEach(function(item){
        item.classList.toggle('active', item === btn);
      });
    });

    document.addEventListener('input', function(e){
      if(e.target.closest && e.target.closest('[data-publish-form]')) updateCount();
    });

    document.addEventListener('change', async function(e){
      var fileInput = e.target.closest && e.target.closest('[data-publish-image-file]');
      if(!fileInput) return;
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if(!file) return;
      if(!/^image\//i.test(file.type || '')){
        app().toast('请选择图片文件。');
        return;
      }

      revokeLocalImage();
      pendingImage = {
        name:file.name || 'image',
        localUrl:URL.createObjectURL(file),
        url:'',
        marker:'',
        uploading:true,
        error:''
      };
      uploadingImage = true;
      renderImagePreview();
      try{
        var uploaded = await uploadImage(file);
        if(!uploaded) return;
        if(!pendingImage) return;
        pendingImage.url = uploaded.url;
        pendingImage.marker = uploaded.marker;
        pendingImage.uploading = false;
        app().toast('图片已准备好');
      }catch(err){
        console.warn('[FW mobile app] image upload failed', err);
        if(pendingImage) pendingImage.error = '图片上传失败';
        app().toast('图片上传失败，请稍后再试。');
      }finally{
        uploadingImage = false;
        if(pendingImage) pendingImage.uploading = false;
        renderImagePreview();
      }
    });

    document.addEventListener('submit', async function(e){
      var form = e.target.closest && e.target.closest('[data-publish-form]');
      if(!form) return;
      e.preventDefault();

      var user = await requireUser();
      if(!user) return;
      if(uploadingImage || (pendingImage && pendingImage.uploading)){
        app().toast('图片还在上传，请稍后再发布。');
        return;
      }

      var textarea = form.querySelector('textarea[name="content"]');
      var content = composeContent(textarea.value || '');
      if(!content){
        textarea.focus();
        app().toast('先写点什么再发布。');
        return;
      }

      var submit = form.querySelector('button[type="submit"]');
      var oldText = submit.textContent;
      submit.disabled = true;
      submit.textContent = '发布中...';

      try{
        await window.fwDb.createPost({content:content, status:selectedStatus});
        clearForm();
        app().state.postsLoaded = false;
        if(window.FWAppFeed) await window.FWAppFeed.load(true);
        app().toast('已记录');
        app().setView('square');
        var main = getMain();
        if(main) main.scrollTop = 0;
      }catch(err){
        console.warn('[FW mobile app] publish failed', err);
        app().toast('发布失败，请稍后再试。');
      }finally{
        submit.disabled = false;
        submit.textContent = oldText;
      }
    });
  }

  function init(){
    injectStyle();
    cleanupLegacySheet();
    ensurePublishTrigger();
    ensurePublishView();
    ensureCancelButton();
    ensureMediaControls();
    bind();
    updateCount();
  }

  window.FWAppPublish = {init:init, open:openPublishPage, close:returnToSquare};
})();
