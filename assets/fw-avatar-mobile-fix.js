// F.w 研究所：手机头像上传增强补丁 v2
// 作用：
// 1. 上传前压缩头像，降低手机大图上传失败概率。
// 2. 尽量转成 JPG，避免部分移动端图片格式显示不稳定。
// 3. 对 HEIC/HEIF、过大图片、读取/压缩超时给出明确错误。
// 4. 只包装 fwDb.updateProfile，不改登录、注册、私聊、后台。
(function(){
  if(window.__FW_AVATAR_MOBILE_FIX_V2__) return;
  window.__FW_AVATAR_MOBILE_FIX_V2__ = true;

  var MAX_INPUT_SIZE = 10 * 1024 * 1024;
  var DIRECT_UPLOAD_SIZE = 650 * 1024;
  var TARGET_SIZE = 720;
  var JPEG_QUALITY = 0.78;
  var IMAGE_READ_TIMEOUT = 8000;
  var CANVAS_TIMEOUT = 10000;

  function waitForDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.updateProfile){
        resolve(true);
        return;
      }

      var n = 0;
      var timer = setInterval(function(){
        n += 1;

        if(window.fwDb && window.fwDb.updateProfile){
          clearInterval(timer);
          resolve(true);
        }

        if(n > 150){
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  function withTimeout(promise, ms, message){
    var timer;

    return Promise.race([
      Promise.resolve(promise).finally(function(){
        clearTimeout(timer);
      }),
      new Promise(function(_, reject){
        timer = setTimeout(function(){
          reject(new Error(message || '头像处理超时，请稍后重试。'));
        }, ms);
      })
    ]);
  }

  function isHeic(file){
    var name = String(file && file.name || '').toLowerCase();
    var type = String(file && file.type || '').toLowerCase();

    return /\.(heic|heif)$/.test(name) || type.indexOf('heic') >= 0 || type.indexOf('heif') >= 0;
  }

  function isImage(file){
    var name = String(file && file.name || '').toLowerCase();
    var type = String(file && file.type || '').toLowerCase();

    return type.indexOf('image/') === 0 || /\.(jpg|jpeg|png|webp|gif|bmp)$/.test(name);
  }

  function isDirectSafe(file, w, h){
    var name = String(file && file.name || '').toLowerCase();
    var type = String(file && file.type || '').toLowerCase();
    var safeType = type === 'image/jpeg' || type === 'image/png' || /\.(jpg|jpeg|png)$/.test(name);

    return safeType && file.size <= DIRECT_UPLOAD_SIZE && Math.max(w || 0, h || 0) <= TARGET_SIZE;
  }

  function loadImage(file){
    return withTimeout(new Promise(function(resolve, reject){
      var url = URL.createObjectURL(file);
      var img = new Image();

      function done(fn, value){
        try{ URL.revokeObjectURL(url); }catch(e){}
        fn(value);
      }

      img.onload = function(){
        done(resolve, img);
      };

      img.onerror = function(){
        done(reject, new Error('头像图片无法读取，请换一张图片再试。'));
      };

      img.src = url;
    }), IMAGE_READ_TIMEOUT, '头像处理超时，请稍后重试。');
  }

  function canvasToBlob(canvas, type, quality){
    return withTimeout(new Promise(function(resolve, reject){
      if(canvas.toBlob){
        canvas.toBlob(function(blob){
          if(blob) resolve(blob);
          else reject(new Error('头像压缩失败，请换一张图片再试。'));
        }, type, quality);
        return;
      }

      try{
        var dataUrl = canvas.toDataURL(type, quality);
        var parts = dataUrl.split(',');
        var mime = (parts[0].match(/:(.*?);/) || [])[1] || type;
        var binary = atob(parts[1]);
        var len = binary.length;
        var bytes = new Uint8Array(len);

        for(var i = 0; i < len; i += 1){
          bytes[i] = binary.charCodeAt(i);
        }

        resolve(new Blob([bytes], {type:mime}));
      }catch(e){
        reject(new Error('头像压缩失败，请换一张图片再试。'));
      }
    }), CANVAS_TIMEOUT, '头像压缩超时，请稍后重试。');
  }

  function makeFile(blob, originalName){
    var safeBase = String(originalName || 'avatar')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 36) || 'avatar';

    var fileName = safeBase + '_fw_avatar.jpg';

    try{
      return new File([blob], fileName, {
        type:'image/jpeg',
        lastModified:Date.now()
      });
    }catch(e){
      blob.name = fileName;
      blob.lastModified = Date.now();
      return blob;
    }
  }

  async function compressAvatar(file){
    if(!file || !file.size) return file;

    if(isHeic(file)){
      throw new Error('当前头像格式不支持，请换 JPG/PNG 图片。');
    }

    if(!isImage(file)){
      throw new Error('头像只能上传图片文件。');
    }

    if(file.size > MAX_INPUT_SIZE){
      throw new Error('头像图片太大，请换小一点的图片。');
    }

    var img = await loadImage(file);
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;

    if(!w || !h){
      throw new Error('无法读取头像尺寸，请换一张图片再试。');
    }

    if(isDirectSafe(file, w, h)){
      return file;
    }

    var canvas = document.createElement('canvas');
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;

    var ctx = canvas.getContext('2d', {
      alpha:false,
      willReadFrequently:false
    });

    if(!ctx){
      throw new Error('当前浏览器无法处理头像，请换一张较小的 JPG/PNG 图片。');
    }

    ctx.fillStyle = '#fffdf7';
    ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);

    var side = Math.min(w, h);
    var sx = Math.max(0, Math.floor((w - side) / 2));
    var sy = Math.max(0, Math.floor((h - side) / 2));

    try{
      ctx.drawImage(img, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE);
    }catch(e){
      throw new Error('头像处理失败，请换一张图片再试。');
    }

    var blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);

    if(!blob || !blob.size){
      throw new Error('头像压缩失败，请换一张图片再试。');
    }

    return makeFile(blob, file.name);
  }

  async function install(){
    var ok = await waitForDb();
    if(!ok || !window.fwDb || !window.fwDb.updateProfile) return;

    if(window.fwDb.__avatarMobileFixedV2) return;

    var originalUpdateProfile = window.fwDb.updateProfile.bind(window.fwDb);

    window.fwDb.updateProfile = async function(payload){
      payload = payload || {};

      var nextPayload = {
        nickname:payload.nickname,
        avatarFile:payload.avatarFile
      };

      if(payload.avatarFile && payload.avatarFile.size){
        nextPayload.avatarFile = await compressAvatar(payload.avatarFile);
      }

      return originalUpdateProfile(nextPayload);
    };

    window.fwDb.__avatarMobileFixedV2 = true;
  }

  install();
})();
