// F.w 研究所：头像上传分段兜底补丁
// 作用：把头像保存拆成「获取用户 / 上传头像 / 保存资料」分段超时。
// 只包装 fwDb.updateProfile，不改登录、注册、私聊、后台。
(function(){
  if(window.__FW_AVATAR_UPLOAD_STAGE_FIX__) return;
  window.__FW_AVATAR_UPLOAD_STAGE_FIX__ = true;

  var GET_USER_TIMEOUT = 8000;
  var UPLOAD_TIMEOUT = 22000;
  var PROFILE_TIMEOUT = 12000;

  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.client && window.fwDb.getCurrentUser){
        resolve(true);
        return;
      }

      var n = 0;
      var timer = setInterval(function(){
        n += 1;

        if(window.fwDb && window.fwDb.client && window.fwDb.getCurrentUser){
          clearInterval(timer);
          resolve(true);
        }

        if(n > 160){
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
          reject(new Error(message));
        }, ms);
      })
    ]);
  }

  function safeName(name){
    return String(name || 'avatar.jpg')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 40) + '.jpg';
  }

  function normalizeProfile(rows, fallback){
    var p = Array.isArray(rows) ? rows[0] : rows;
    return p || fallback;
  }

  async function install(){
    var ok = await waitDb();
    if(!ok || !window.fwDb || !window.fwDb.client) return;
    if(window.fwDb.__avatarUploadStageFixed) return;

    window.fwDb.updateProfile = async function(payload){
      payload = payload || {};

      var client = window.fwDb.client;

      var u = await withTimeout(
        window.fwDb.getCurrentUser(),
        GET_USER_TIMEOUT,
        '读取账号状态超时，请稍后重试。'
      );

      if(!u || !u.id){
        throw new Error('请先登录。');
      }

      var avatarUrl = '';
      var avatarFile = payload.avatarFile;

      if(avatarFile && avatarFile.size){
        var path = u.id + '/' + Date.now() + '_' + safeName(avatarFile.name);

        var uploaded = await withTimeout(
          client.storage
            .from('avatars')
            .upload(path, avatarFile, {
              upsert:true,
              cacheControl:'3600',
              contentType:avatarFile.type || 'image/jpeg'
            }),
          UPLOAD_TIMEOUT,
          '头像上传超时，请稍后重试。'
        );

        if(uploaded.error){
          throw new Error('头像上传失败：' + uploaded.error.message);
        }

        avatarUrl = client.storage
          .from('avatars')
          .getPublicUrl(path)
          .data
          .publicUrl;
      }

      var nextNickname = payload.nickname ? String(payload.nickname).trim().slice(0, 24) : null;

      var saved = await withTimeout(
        client.rpc('fw_update_own_profile', {
          p_nickname:nextNickname,
          p_avatar_url:avatarUrl || null
        }),
        PROFILE_TIMEOUT,
        '资料保存超时，请稍后重试。'
      );

      if(saved.error){
        throw new Error('资料保存失败：' + saved.error.message);
      }

      return normalizeProfile(saved.data || [], {
        id:u.id,
        nickname:nextNickname || u.nickname,
        avatar_url:avatarUrl || u.avatar_url || '',
        lab_code:u.lab_code || ''
      });
    };

    window.fwDb.__avatarUploadStageFixed = true;
  }

  install();
})();
