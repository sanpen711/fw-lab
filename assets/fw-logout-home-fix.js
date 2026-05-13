// F.w 研究所：退出登录强制回首页补丁
// 解决个人资料弹窗里点击退出后按钮停在“正在退出...”的问题。
(function(){
  if(window.__FW_LOGOUT_HOME_FIX__) return;
  window.__FW_LOGOUT_HOME_FIX__ = true;

  var busy = false;
  var FORCE_INTRO_KEY = 'fw_force_home_intro_v1';

  function homeUrl(){
    return window.location.origin + window.location.pathname.replace(/[^/]*$/, 'index.html');
  }

  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.client && window.fwDb.client.auth){
        resolve(true);
        return;
      }

      var n = 0;
      var timer = setInterval(function(){
        n += 1;

        if(window.fwDb && window.fwDb.client && window.fwDb.client.auth){
          clearInterval(timer);
          resolve(true);
        }

        if(n > 20){
          clearInterval(timer);
          resolve(false);
        }
      }, 80);
    });
  }

  function clearLocalAuth(){
    try{
      Object.keys(localStorage).forEach(function(k){
        if(/^sb-|supabase|fw_register_state/i.test(k)){
          localStorage.removeItem(k);
        }
      });

      Object.keys(sessionStorage).forEach(function(k){
        if(/^sb-|supabase|fw_register_state/i.test(k)){
          sessionStorage.removeItem(k);
        }
      });

      sessionStorage.setItem(FORCE_INTRO_KEY, '1');
    }catch(e){}
  }

  function withTimeout(promise, ms){
    return Promise.race([
      promise,
      new Promise(function(resolve){
        setTimeout(resolve, ms || 900);
      })
    ]);
  }

  function goHome(){
    window.location.replace(homeUrl() + '?logout=' + Date.now());
  }

  async function logout(btn){
    if(busy) return;
    busy = true;

    if(btn){
      btn.disabled = true;
      btn.textContent = '正在退出...';
    }

    clearLocalAuth();

    // 兜底跳转：避免 Supabase signOut 或旧监听卡住。
    var fallback = setTimeout(goHome, 1200);

    try{
      await waitDb();

      if(window.fwDb && window.fwDb.client && window.fwDb.client.auth){
        await withTimeout(window.fwDb.client.auth.signOut({scope:'local'}), 650);
        await withTimeout(window.fwDb.client.auth.signOut(), 650);
      }
    }catch(e){}

    clearTimeout(fallback);
    clearLocalAuth();
    goHome();
  }

  function intercept(e){
    var btn = e.target && e.target.closest && e.target.closest('[data-sb-logout]');

    if(!btn) return;

    e.preventDefault();
    e.stopPropagation();

    if(e.stopImmediatePropagation){
      e.stopImmediatePropagation();
    }

    logout(btn);
  }

  // 用 pointerdown / mousedown 抢在旧 click 监听前执行，避免旧逻辑把按钮卡死。
  window.addEventListener('pointerdown', intercept, true);
  window.addEventListener('mousedown', intercept, true);
  window.addEventListener('touchstart', intercept, true);
  window.addEventListener('click', intercept, true);
})();
