// F.w 研究所：手机头像上传增强补丁
// 作用：
// 1. 上传前压缩头像，降低手机大图上传失败概率。
// 2. 尽量转成 JPG，避免部分移动端图片格式显示不稳定。
// 3. 对 HEIC/HEIF 给出明确提示。
// 4. 只包装 fwDb.updateProfile，不改登录、注册、私聊、后台。
(function(){
  if(window.__FW_AVATAR_MOBILE_FIX__) return;
  window.__FW_AVATAR_MOBILE_FIX__ = true;

  var MAX_INPUT_SIZE = 15 * 1024 * 1024; // 15MB，超过容易让手机浏览器崩或超时
  var TARGET_SIZE = 900;                 // 头像统一压到 900×900
  var JPEG_QUALITY = 0.84;

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
        reject(new Error('这张图片无法读取。可能是 HEIC 格式、图片损坏，或手机浏览器不支持。请换 JPG/PNG，或截图后再上传。'));
      };

      img.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality){
    return new Promise(function(resolve, reject){
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
    });
  }

  function makeFile(blob, originalName){
    var safeBase = String(originalName || 'avatar')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 42) || 'avatar';

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
      throw new Error('当前头像可能是 iPhone HEIC/HEIF 格式，网页端不稳定。请在相册里截图后上传，或改用 JPG/PNG 图片。');
    }

    if(!isImage(file)){
      throw new Error('头像只能上传图片文件，请选择 JPG、PNG 或 WebP。');
    }

    if(file.size > MAX_INPUT_SIZE){
      throw new Error('头像图片太大，请选择 15MB 以内的图片，或截图后再上传。');
    }

    var img = await loadImage(file);
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;

    if(!w || !h){
      throw new Error('无法读取图片尺寸，请换一张图片再试。');
    }

    // 小 JPG 可以直接上传；大图或非 JPG 统一转成 JPG，解决手机格式不稳定。
    var lowerName = String(file.name || '').toLowerCase();
    var type = String(file.type || '').toLowerCase();
    var isJpg = type === 'image/jpeg' || /\.(jpg|jpeg)$/.test(lowerName);

    if(isJpg && file.size <= 900 * 1024 && Math.max(w, h) <= TARGET_SIZE){
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
      throw new Error('当前浏览器不支持头像压缩，请换一张小于 1MB 的 JPG 图片。');
    }

    // JPG 背景，防止 PNG 透明区变黑。
    ctx.fillStyle = '#fffdf7';
    ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);

    // 中心裁剪成正方形，适合圆形头像显示。
    var side = Math.min(w, h);
    var sx = Math.max(0, Math.floor((w - side) / 2));
    var sy = Math.max(0, Math.floor((h - side) / 2));

    ctx.drawImage(img, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE);

    var blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);

    if(!blob || !blob.size){
      throw new Error('头像压缩失败，请换一张图片再试。');
    }

    return makeFile(blob, file.name);
  }

  async function install(){
    var ok = await waitForDb();
    if(!ok || !window.fwDb || !window.fwDb.updateProfile) return;

    if(window.fwDb.__avatarMobileFixed) return;

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

    window.fwDb.__avatarMobileFixed = true;
  }

  install();
})();
