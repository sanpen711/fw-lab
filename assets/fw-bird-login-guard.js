// F.w 研究所：观鸟台发布前登录守卫
// 点击“发布观察记录”时先判断登录状态，未登录先打开登录框；登录成功后自动继续打开发布窗口。
(function(){
  if(window.__FW_BIRD_LOGIN_GUARD__) return;
  window.__FW_BIRD_LOGIN_GUARD__ = true;

  var PENDING_KEY = 'fw_bird_compose_after_login';

  function $(selector){
    return document.querySelector(selector);
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

    clearTimeout(window.__fwBirdLoginGuardToast);
    window.__fwBirdLoginGuardToast = setTimeout(function(){
      t.classList.remove('show');
    }, 3200);
  }

  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
        resolve(true);
        return;
      }

      var n = 0;
      var timer = setInterval(function(){
        n += 1;

        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
          clearInterval(timer);
          resolve(true);
        }

        if(n > 120){
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  async function currentUser(){
    if(!(await waitDb())) return null;

    try{
      return await window.fwDb.getCurrentUser();
    }catch(e){
      return null;
    }
  }

  function openLogin(){
    var btn = $('[data-fw-open], [data-login-cta], [data-sb-open]');

    if(btn){
      btn.click();
    }
  }

  function isMuted(user){
    return user && user.muted_until && new Date(user.muted_until).getTime() > Date.now();
  }

  function triggerCompose(btn){
    if(!btn) return;

    btn.dataset.birdLoginGuardOk = '1';

    setTimeout(function(){
      delete btn.dataset.birdLoginGuardOk;
    }, 600);

    btn.click();
  }

  async function guardComposeClick(event){
    var btn = event.target && event.target.closest && event.target.closest('[data-bird-open-compose]');

    if(!btn) return;
    if(btn.dataset.birdLoginGuardOk === '1') return;

    event.preventDefault();
    event.stopPropagation();

    if(event.stopImmediatePropagation){
      event.stopImmediatePropagation();
    }

    var user = await currentUser();

    if(!user){
      try{
        sessionStorage.setItem(PENDING_KEY, '1');
      }catch(e){}

      toast('请先登录再发布。登录后会继续打开发布窗口。');
      openLogin();
      return;
    }

    if(user.disabled){
      toast('这个账号已被停用，不能发布观察记录。');
      return;
    }

    if(isMuted(user)){
      toast('这个账号正在禁言中，暂时不能发布观察记录。');
      return;
    }

    triggerCompose(btn);
  }

  async function resumeComposeAfterLogin(){
    try{
      if(sessionStorage.getItem(PENDING_KEY) !== '1') return;
    }catch(e){
      return;
    }

    var user = await currentUser();

    if(!user) return;
    if(user.disabled || isMuted(user)){
      try{ sessionStorage.removeItem(PENDING_KEY); }catch(e){}
      return;
    }

    var btn = $('[data-bird-open-compose]');
    if(!btn) return;

    try{ sessionStorage.removeItem(PENDING_KEY); }catch(e){}

    setTimeout(function(){
      triggerCompose(btn);
    }, 260);
  }

  function bindAuthResume(){
    waitDb().then(function(ok){
      if(!ok || !window.fwDb || !window.fwDb.client || !window.fwDb.client.auth) return;

      window.fwDb.client.auth.onAuthStateChange(function(event){
        if(event === 'SIGNED_IN'){
          resumeComposeAfterLogin();
        }
      });
    });
  }

  function boot(){
    document.addEventListener('click', guardComposeClick, true);
    bindAuthResume();

    setTimeout(resumeComposeAfterLogin, 700);
    setTimeout(resumeComposeAfterLogin, 1800);
    setTimeout(resumeComposeAfterLogin, 3200);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }else{
    boot();
  }
})();
