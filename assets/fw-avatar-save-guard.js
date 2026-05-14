// F.w 研究所：头像保存兜底补丁
// 防止部分手机图片处理或上传长时间无返回。
// 只包装 fwDb.updateProfile，不改登录、注册、私聊、后台。
(function(){
  if(window.__FW_AVATAR_SAVE_GUARD__) return;
  window.__FW_AVATAR_SAVE_GUARD__ = true;

  var SAVE_LIMIT = 32000;

  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.updateProfile){ resolve(true); return; }
      var n = 0;
      var timer = setInterval(function(){
        n += 1;
        if(window.fwDb && window.fwDb.updateProfile){ clearInterval(timer); resolve(true); }
        if(n > 160){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  function limited(promise, ms){
    var timer;
    return Promise.race([
      Promise.resolve(promise).finally(function(){ clearTimeout(timer); }),
      new Promise(function(_, reject){
        timer = setTimeout(function(){ reject(new Error('保存超时，请稍后重试。')); }, ms);
      })
    ]);
  }

  function cleanError(e){
    var msg = String((e && e.message) || e || '');
    if(/timeout|超时/i.test(msg)) return new Error('保存超时，请稍后重试。');
    if(/network|fetch|failed/i.test(msg)) return new Error('网络异常，保存失败。');
    return e instanceof Error ? e : new Error(msg || '保存失败。');
  }

  async function install(){
    var ok = await waitDb();
    if(!ok || !window.fwDb || !window.fwDb.updateProfile) return;
    if(window.fwDb.__avatarSaveGuard) return;

    var original = window.fwDb.updateProfile.bind(window.fwDb);

    window.fwDb.updateProfile = async function(payload){
      try{
        return await limited(original(payload || {}), SAVE_LIMIT);
      }catch(e){
        throw cleanError(e);
      }
    };

    window.fwDb.__avatarSaveGuard = true;
  }

  install();
})();
