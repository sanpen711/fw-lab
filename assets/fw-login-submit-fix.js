// F.w 研究所：登录提交修复补丁
// 只处理登录表单 [data-login]，不处理注册验证码 [data-reg2]。
(function(){
  if(window.__FW_LOGIN_SUBMIT_FIX__) return;
  window.__FW_LOGIN_SUBMIT_FIX__ = true;

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
        }, ms || 20000);
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

  async function handleLogin(form){
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
        25000,
        '登录请求超时，请检查网络后重试。'
      );

      if(res.error) throw res.error;

      toast('登录成功，正在进入研究所。');

      var modal = $('[data-sb-auth]');

      if(modal){
        modal.classList.remove('show');
      }

      setTimeout(function(){
        window.location.reload();
      }, 450);

    }catch(e){
      toast(loginMsg(e));
      setLoading(btn, false);
    }
  }

  function intercept(e){
    var form = e.target && e.target.closest && e.target.closest('[data-login]');

    if(!form) return;

    e.preventDefault();
    e.stopPropagation();

    if(e.stopImmediatePropagation){
      e.stopImmediatePropagation();
    }

    handleLogin(form);
  }

  // 捕获阶段只拦截登录表单，不碰注册验证表单。
  window.addEventListener('submit', intercept, true);

  // 防止上一次卡住后按钮一直 disabled。
  function recoverLoginButton(){
    var form = $('[data-login]');
    if(!form) return;

    var btn = form.querySelector('button[type="submit"]');
    if(!btn) return;

    if(btn.disabled && btn.textContent.indexOf('登录中') >= 0){
      setLoading(btn, false);
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', recoverLoginButton);
  }else{
    recoverLoginButton();
  }
})();
