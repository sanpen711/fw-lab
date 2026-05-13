// F.w 研究所：登录提交修复补丁 v3
// 只处理登录表单 [data-login]，不处理注册验证码 [data-reg2]。
// 修复：登录实际成功但页面卡住 / 提示超时的问题。
(function(){
  if(window.__FW_LOGIN_SUBMIT_FIX_V3__) return;
  window.__FW_LOGIN_SUBMIT_FIX_V3__ = true;

  var loginBusy = false;
  var loginReloading = false;

  function $(s){
    return document.querySelector(s);
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

    clearTimeout(window.__fwLoginFixToast);
    window.__fwLoginFixToast = setTimeout(function(){
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

  function withTimeout(promise, ms){
    return Promise.race([
      promise,
      new Promise(function(resolve){
        setTimeout(function(){
          resolve({
            __timeout:true
          });
        }, ms || 15000);
      })
    ]);
  }

  function loginMsg(err){
    var msg = String((err && err.message) || err || '');

    if(/invalid login credentials/i.test(msg)){
      return '邮箱或密码不正确。';
    }

    if(/email not confirmed/i.test(msg)){
      return '邮箱还没有验证，请先完成邮箱验证码验证。';
    }

    if(/rate limit|too many/i.test(msg)){
      return '尝试次数过多，请稍后再试。';
    }

    if(/network|fetch|failed/i.test(msg)){
      return '网络连接异常，请刷新后重试。';
    }

    return msg || '登录失败，请稍后重试。';
  }

  function setLoading(btn, loading){
    if(!btn) return;

    if(loading){
      if(!btn.dataset.oldText){
        btn.dataset.oldText = btn.textContent || '登录';
      }

      btn.textContent = '登录中...';
      btn.disabled = true;
      btn.classList.add('fw-btn-loading');
    }else{
      btn.textContent = btn.dataset.oldText || '登录';
      btn.disabled = false;
      btn.classList.remove('fw-btn-loading');
    }
  }

  function closeModal(){
    var modal = $('[data-sb-auth]');

    if(modal){
      modal.classList.remove('show');
    }
  }

  function goAfterLogin(){
    if(loginReloading) return;

    loginReloading = true;

    toast('登录成功，正在进入研究所。');
    closeModal();

    setTimeout(function(){
      var cleanPath = window.location.origin + window.location.pathname;
      window.location.replace(cleanPath + '?login=' + Date.now());
    }, 350);
  }

  async function hasSession(){
    try{
      if(!window.fwDb || !window.fwDb.client || !window.fwDb.client.auth){
        return false;
      }

      var res = await window.fwDb.client.auth.getSession();
      return !!(res && res.data && res.data.session && res.data.session.user);
    }catch(e){
      return false;
    }
  }

  function watchSessionAfterLogin(){
    var n = 0;

    var timer = setInterval(async function(){
      n += 1;

      if(await hasSession()){
        clearInterval(timer);
        goAfterLogin();
      }

      if(n > 20){
        clearInterval(timer);
      }
    }, 400);
  }

  async function handleLogin(form){
    if(loginBusy || loginReloading) return;

    loginBusy = true;

    var btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true);

    try{
      var ok = await waitDb();

      if(!ok){
        throw new Error('数据库连接未就绪，请刷新页面后重试。');
      }

      var fd = new FormData(form);
      var email = String(fd.get('email') || '').trim().toLowerCase();
      var password = String(fd.get('password') || '').trim();

      if(!email || !password){
        throw new Error('请填写邮箱和密码。');
      }

      // 先开启会话监听：有些情况下登录已经成功，但 signInWithPassword 返回慢。
      watchSessionAfterLogin();

      var res = await withTimeout(
        window.fwDb.client.auth.signInWithPassword({
          email:email,
          password:password
        }),
        12000
      );

      // 如果请求超时，但 session 已经写入，则直接进入网站，不再报超时。
      if(res && res.__timeout){
        if(await hasSession()){
          goAfterLogin();
          return;
        }

        throw new Error('登录请求超时，请刷新页面后重试。');
      }

      if(res && res.error){
        throw res.error;
      }

      if(res && res.data && res.data.session){
        goAfterLogin();
        return;
      }

      if(await hasSession()){
        goAfterLogin();
        return;
      }

      throw new Error('登录状态未同步，请刷新页面后重试。');

    }catch(e){
      if(await hasSession()){
        goAfterLogin();
        return;
      }

      loginBusy = false;
      toast(loginMsg(e));
      setLoading(btn, false);
    }
  }

  function interceptSubmit(e){
    var form = e.target && e.target.closest && e.target.closest('[data-login]');

    if(!form) return;

    // 只拦截登录，不碰注册第二步。
    if(form.closest('[data-reg2]')) return;

    e.preventDefault();
    e.stopPropagation();

    if(e.stopImmediatePropagation){
      e.stopImmediatePropagation();
    }

    handleLogin(form);
  }

  function interceptClick(e){
    var btn = e.target && e.target.closest && e.target.closest('[data-login] button[type="submit"]');

    if(!btn) return;

    var form = btn.closest('[data-login]');

    if(!form) return;

    // 只拦截登录，不碰注册第二步。
    if(form.closest('[data-reg2]')) return;

    e.preventDefault();
    e.stopPropagation();

    if(e.stopImmediatePropagation){
      e.stopImmediatePropagation();
    }

    handleLogin(form);
  }

  window.addEventListener('click', interceptClick, true);
  window.addEventListener('submit', interceptSubmit, true);

  function recoverLoginButton(){
    var form = $('[data-login]');
    if(!form) return;

    var btn = form.querySelector('button[type="submit"]');
    if(!btn) return;

    if(!loginBusy && btn.disabled && String(btn.textContent || '').includes('登录中')){
      setLoading(btn, false);
    }
  }

  function boot(){
    recoverLoginButton();

    var observer = new MutationObserver(function(){
      clearTimeout(window.__fwLoginFixRecoverTimer);
      window.__fwLoginFixRecoverTimer = setTimeout(recoverLoginButton, 80);
    });

    observer.observe(document.body, {
      childList:true,
      subtree:true
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }else{
    boot();
  }
})();
