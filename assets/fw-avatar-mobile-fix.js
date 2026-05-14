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

// F.w 研究所：学术研讨头像昵称 + 发言时间兜底补丁
// 原因：房间模块旧查询包含 role 字段，普通用户读取可能被 RLS 拦截，导致头像昵称退回“研究员”。
// 处理：不改房间核心发送逻辑，只在消息渲染后用安全字段补齐昵称、头像和时间。
(function(){
  if(window.__FW_ROOM_PROFILE_TIME_FIX__) return;
  window.__FW_ROOM_PROFILE_TIME_FIX__ = true;

  var timer = 0;
  var lastSig = '';

  function $(s){ return document.querySelector(s); }
  function $$(s){ return Array.from(document.querySelectorAll(s)); }
  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      var n = 0;
      var t = setInterval(function(){
        n += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(t); resolve(true); }
        if(n > 120){ clearInterval(t); resolve(false); }
      }, 100);
    });
  }

  function fmtTime(v){
    if(!v) return '';
    var d = new Date(v);
    if(isNaN(d.getTime())) return '';

    var now = new Date();
    var sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    var yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    var isYest = d.getFullYear() === yest.getFullYear() && d.getMonth() === yest.getMonth() && d.getDate() === yest.getDate();
    var hm = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');

    if(sameDay) return hm;
    if(isYest) return '昨天 ' + hm;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
  }

  function initials(name){
    return String(name || 'FW').trim().slice(0,2).toUpperCase();
  }

  function avatarHtml(name, url){
    if(url){
      return '<img src="' + esc(url) + '" alt="' + esc(name) + '">';
    }
    return esc(initials(name));
  }

  function injectStyle(){
    if($('#fw-room-profile-time-style')) return;
    var style = document.createElement('style');
    style.id = 'fw-room-profile-time-style';
    style.textContent = `
      .fw-msg-name{
        display:flex!important;
        align-items:center!important;
        gap:8px!important;
        flex-wrap:wrap!important;
      }
      .fw-msg.me .fw-msg-name{
        justify-content:flex-end!important;
      }
      .fw-room-msg-time{
        color:#8c8378!important;
        font-size:11px!important;
        font-weight:850!important;
        letter-spacing:0!important;
        opacity:.9!important;
      }
      .fw-msg.me .fw-room-msg-time{
        color:rgba(255,255,255,.82)!important;
      }
    `;
    document.head.appendChild(style);
  }

  async function enhanceRoomMessages(){
    var box = $('[data-room-messages]');
    if(!box) return;
    var items = $$('.fw-msg[data-message-id][data-user-id]', box);
    if(!items.length) return;

    var ids = items.map(function(el){ return Number(el.dataset.messageId); }).filter(Boolean);
    var sig = ids.join(',') + '|' + items.length;
    if(sig === lastSig && Date.now() - Number(box.dataset.fwRoomProfileTouched || 0) < 2500) return;
    lastSig = sig;
    box.dataset.fwRoomProfileTouched = String(Date.now());

    if(!(await waitDb())) return;

    try{
      var msgRes = await window.fwDb.client
        .from('chat_messages')
        .select('id,user_id,created_at')
        .in('id', ids);
      if(msgRes.error) throw msgRes.error;

      var msgMap = {};
      var userIds = [];
      (msgRes.data || []).forEach(function(r){
        msgMap[String(r.id)] = r;
        if(r.user_id && userIds.indexOf(r.user_id) < 0) userIds.push(r.user_id);
      });

      var profileMap = {};
      if(userIds.length){
        var profileRes = await window.fwDb.client
          .from('profiles')
          .select('id,nickname,avatar_url,lab_code')
          .in('id', userIds);
        if(!profileRes.error){
          (profileRes.data || []).forEach(function(p){ profileMap[p.id] = p; });
        }
      }

      var me = null;
      try{ me = await window.fwDb.getCurrentUser(); }catch(e){}

      items.forEach(function(el){
        var msg = msgMap[String(el.dataset.messageId)] || {};
        var uid = msg.user_id || el.dataset.userId;
        var p = profileMap[uid] || {};
        var isMe = me && uid === me.id;
        var name = p.nickname || (isMe ? me.nickname : '研究员');
        var url = p.avatar_url || (isMe ? me.avatar_url : '');
        var time = fmtTime(msg.created_at);

        var avatar = el.querySelector('.fw-avatar.room');
        if(avatar){ avatar.innerHTML = avatarHtml(name, url); }

        var nameEl = el.querySelector('.fw-msg-name');
        if(nameEl){
          var finalName = name + (isMe ? '（我）' : '');
          if(nameEl.dataset.fwFinalName !== finalName){
            nameEl.textContent = finalName;
            nameEl.dataset.fwFinalName = finalName;
          }

          var timeEl = nameEl.querySelector('.fw-room-msg-time');
          if(!timeEl){
            timeEl = document.createElement('span');
            timeEl.className = 'fw-room-msg-time';
            nameEl.appendChild(timeEl);
          }
          timeEl.textContent = time;
        }
      });
    }catch(e){
      console.warn('[FW room profile time fix] failed', e);
    }
  }

  function schedule(){
    clearTimeout(timer);
    timer = setTimeout(enhanceRoomMessages, 160);
  }

  function boot(){
    injectStyle();
    schedule();

    var obs = new MutationObserver(schedule);
    obs.observe(document.body, {childList:true, subtree:true});

    document.addEventListener('click', function(e){
      if(e.target.closest && (e.target.closest('[data-room]') || e.target.closest('[data-room-modal]'))){
        setTimeout(schedule, 300);
        setTimeout(schedule, 900);
      }
    }, true);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
