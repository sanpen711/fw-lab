// F.w 研究所：注册第二步修复补丁
// 只拦截“注册验证码确认”流程，不改登录、不改退出、不改个人资料。
(function(){
  if(window.__FW_SIGNUP_COMPLETE_FIX__) return;
  window.__FW_SIGNUP_COMPLETE_FIX__ = true;

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

    clearTimeout(window.__fwSignupFixToast);
    window.__fwSignupFixToast = setTimeout(function(){
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

  function authMsg(err){
    var msg = String((err && err.message) || err || '');

    if(/token/i.test(msg) && /expired/i.test(msg)){
      return '验证码已过期，请重新发送验证码。';
    }

    if(/invalid/i.test(msg) && /token/i.test(msg)){
      return '验证码不正确，请检查后重新输入。';
    }

    if(/实验品编号|昵称|注册|邮箱|验证码/.test(msg)){
      return msg;
    }

    if(/permission denied/i.test(msg)){
      return '注册资料保存权限异常，请确认已运行注册修复 SQL。';
    }

    return msg || '注册失败，请稍后重试。';
  }

  function setLoading(btn, loading, text){
    if(!btn) return;

    if(loading){
      if(!btn.dataset.oldText){
        btn.dataset.oldText = btn.textContent;
      }

      btn.textContent = text || '验证中...';
      btn.disabled = true;
      btn.classList.add('fw-btn-loading');
    }else{
      btn.textContent = btn.dataset.oldText || '确认验证码，完成注册';
      btn.disabled = false;
      btn.classList.remove('fw-btn-loading');
    }
  }

  function validCode(v){
    return /^[A-Z0-9]{7}$/.test(String(v || '').trim().replace(/\s+/g, '').toUpperCase());
  }

  function showLogin(email){
    document.querySelectorAll('[data-view]').forEach(function(view){
      view.classList.toggle('show', view.dataset.view === 'login');
    });

    var title = $('[data-title]');
    var desc = $('[data-desc]');
    var progress = $('[data-progress]');
    var modal = $('[data-sb-auth]');
    var loginForm = $('[data-login]');

    if(modal){
      modal.classList.add('show');
    }

    if(title){
      title.textContent = '账号登录';
    }

    if(desc){
      desc.textContent = '注册成功，请用邮箱和密码登录。';
    }

    if(progress){
      progress.style.display = 'none';
    }

    if(loginForm){
      if(loginForm.email){
        loginForm.email.value = email || '';
      }

      if(loginForm.password){
        loginForm.password.value = '';
        setTimeout(function(){
          loginForm.password.focus();
        }, 80);
      }
    }
  }

  async function handleRegisterStep2(form){
    var btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, '验证中...');

    try{
      var ok = await waitDb();

      if(!ok){
        throw new Error('数据库连接未就绪，请刷新页面后重试。');
      }

      var state = {};

      try{
        state = JSON.parse(sessionStorage.getItem('fw_register_state') || '{}');
      }catch(e){
        state = {};
      }

      var email = String(state.email || '').trim().toLowerCase();
      var labCode = String(state.labCode || '').trim().replace(/\s+/g, '').toUpperCase();
      var token = String(new FormData(form).get('token') || '').trim().replace(/\s+/g, '');

      if(!email || !validCode(labCode)){
        throw new Error('注册信息丢失，请返回第一步重新填写。');
      }

      if(!token){
        throw new Error('请填写验证码。');
      }

      var verified = await withTimeout(
        window.fwDb.client.auth.verifyOtp({
          email:email,
          token:token,
          type:'signup'
        }),
        18000,
        '验证码验证超时，请稍后重试。'
      );

      if(verified.error) throw verified.error;

      var user = verified.data && verified.data.user;

      if(!user){
        var sessionRes = await withTimeout(
          window.fwDb.client.auth.getSession(),
          8000,
          '读取登录状态超时，请刷新后登录。'
        );

        user = sessionRes.data && sessionRes.data.session && sessionRes.data.session.user;
      }

      if(!user || !user.id){
        throw new Error('邮箱已验证，但登录状态未同步，请刷新后登录。');
      }

      var saved = await withTimeout(
        window.fwDb.client.rpc('fw_complete_signup_profile', {
          p_lab_code:labCode,
          p_email:email
        }),
        15000,
        '保存实验品编号超时，请稍后重试。'
      );

      if(saved.error) throw saved.error;

      sessionStorage.removeItem('fw_register_state');

      toast('注册成功，正在进入研究所。');

      var modal = $('[data-sb-auth]');

      if(modal){
        modal.classList.remove('show');
      }

      setTimeout(function(){
        var cleanPath = window.location.origin + window.location.pathname;
        window.location.replace(cleanPath + '?signup=' + Date.now());
      }, 450);

    }catch(e){
      toast(authMsg(e));
    }finally{
      setLoading(btn, false);
    }
  }

  function intercept(e){
    var form = e.target && e.target.closest && e.target.closest('[data-reg2]');

    if(!form) return;

    e.preventDefault();
    e.stopPropagation();

    if(e.stopImmediatePropagation){
      e.stopImmediatePropagation();
    }

    handleRegisterStep2(form);
  }

  // 用捕获阶段拦截，只替换注册第二步，不影响登录 submit。
  window.addEventListener('submit', intercept, true);
})();
