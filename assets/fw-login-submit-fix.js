// F.w 研究所：登录提交修复补丁 v2
// 只处理登录表单 [data-login]，不处理注册验证码 [data-reg2]。
(function(){
  if(window.__FW_LOGIN_SUBMIT_FIX_V2__) return;
  window.__FW_LOGIN_SUBMIT_FIX_V2__ = true;

  var loginBusy = false;

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

  function withTimeout(promise, ms, message){
    return Promise.race([
      promise,
      new Promise(function(_, reject){
        setTimeout(function(){
          reject(new Error(message || '操作超时，请稍后重试。'));
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

    if(/timeout|超时/i.test(msg)){
      return '登录请求超时，请刷新页面后重试。';
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

  function resetLoginButton(){
    var form = $('[data-login]');
    if(!form) return;

    var btn = form.querySelector('button[type="submit"]');
    if(!btn) return;

    if(!loginBusy && btn.disabled && String(btn.textContent || '').includes('登录中')){
      setLoading(btn, false);
    }
  }

  function closeModal(){
    var modal = $('[data-sb-auth]');

    if(modal){
      modal.classList.remove('show');
    }
  }

  function reloadAfterLogin(){
    var url = window.location.origin + window.location.pathname + '?login=' + Date.now();
    window.location.replace(url);
  }

  async function handleLogin(form){
    if(loginBusy) return;

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

      var res = await withTimeout(
        window.fwDb.client.auth.signInWithPassword({
          email:email,
          password:password
        }),
        15000,
        '登录请求超时，请刷新页面后重试。'
      );

      if(res.error) throw res.error;

      if(!res.data || !res.data.session){
        throw new Error('登录状态未返回，请刷新页面后重试。');
      }

      toast('登录成功，正在进入研究所。');
      closeModal();

      setTimeout(reloadAfterLogin, 350);

    }catch(e){
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

  // 点击按钮、回车提交都处理；只管 [data-login]。
  window.addEventListener('click', interceptClick, true);
  window.addEventListener('submit', interceptSubmit, true);

  // 如果之前卡过“登录中...”，打开弹窗后自动恢复按钮。
  function boot(){
    resetLoginButton();

    var observer = new MutationObserver(function(){
      clearTimeout(window.__fwLoginFixRecoverTimer);
      window.__fwLoginFixRecoverTimer = setTimeout(resetLoginButton, 80);
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
