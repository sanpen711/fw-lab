// F.w 研究所：登录 / 注册完成兜底修复
// 作用：
// 1. 登录成功后立即刷新页面，避免被资料/帖子刷新拖到“登录超时”。
// 2. 邮箱验证码通过后，明确写入 profiles.lab_code / email_search，避免注册后显示“实验品编号：未设置”。
// 说明：本文件应在 supabase-auth-flow.js 之前加载，用 window 捕获阶段抢先接管 login 与 register2 表单。
(function(){
  if(window.__FW_AUTH_FLOW_HOTFIX__) return;
  window.__FW_AUTH_FLOW_HOTFIX__ = true;

  function toast(msg){
    var t = document.querySelector('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwAuthHotfixToast);
    window.__fwAuthHotfixToast = setTimeout(function(){
      t.classList.remove('show');
    }, 3200);
  }

  function waitForDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client) return resolve(true);

      var count = 0;
      var timer = setInterval(function(){
        count += 1;

        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
          clearInterval(timer);
          resolve(true);
        }

        if(count > 120){
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

  function normalizeLabCode(value){
    return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
  }

  function validLabCode(value){
    return /^[A-Z0-9]{7}$/.test(normalizeLabCode(value));
  }

  function normalizeNickname(value){
    return String(value || '').trim();
  }

  function validNickname(value){
    var n = normalizeNickname(value);
    return n.length >= 2 && n.length <= 12;
  }

  function setLoading(btn, loading, text){
    if(!btn) return;

    if(loading){
      if(!btn.dataset.oldText) btn.dataset.oldText = btn.textContent;
      btn.textContent = text || '处理中...';
      btn.disabled = true;
      btn.classList.add('fw-btn-loading');
    }else{
      btn.textContent = btn.dataset.oldText || '提交';
      btn.disabled = false;
      btn.classList.remove('fw-btn-loading');
    }
  }

  function mapAuthError(err){
    var msg = String((err && err.message) || err || '');

    if(/invalid login credentials/i.test(msg)) return '邮箱或密码不正确。';
    if(/email not confirmed/i.test(msg)) return '邮箱还没有验证，请先完成邮箱验证码验证。';
    if(/token/i.test(msg) && /expired/i.test(msg)) return '验证码已过期，请重新发送验证码。';
    if(/rate limit|too many/i.test(msg)) return '尝试次数过多，请稍后再试。';
    if(/fetch|network|failed/i.test(msg)) return '网络连接异常，请刷新页面后重试。';
    if(msg.includes('实验品编号')) return msg;
    if(msg.includes('昵称')) return msg;

    return msg || '操作失败，请稍后重试。';
  }

  function storePendingRegister(email, labCode, nickname){
    try{
      sessionStorage.setItem('fw_pending_register_email', String(email || '').trim().toLowerCase());
      sessionStorage.setItem('fw_pending_register_lab_code', normalizeLabCode(labCode));
      sessionStorage.setItem('fw_pending_register_nickname', normalizeNickname(nickname));
    }catch(e){}
  }

  function readPendingRegister(){
    try{
      return {
        email: sessionStorage.getItem('fw_pending_register_email') || '',
        labCode: sessionStorage.getItem('fw_pending_register_lab_code') || '',
        nickname: sessionStorage.getItem('fw_pending_register_nickname') || ''
      };
    }catch(e){
      return {email:'', labCode:'', nickname:''};
    }
  }

  function clearPendingRegister(){
    try{
      sessionStorage.removeItem('fw_pending_register_email');
      sessionStorage.removeItem('fw_pending_register_lab_code');
      sessionStorage.removeItem('fw_pending_register_nickname');
    }catch(e){}
  }

  async function fastLogin(form){
    if(window.__FW_AUTH_HOTFIX_LOGIN_BUSY__) return;
    window.__FW_AUTH_HOTFIX_LOGIN_BUSY__ = true;

    var btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, '登录中...');

    try{
      var ok = await waitForDb();
      if(!ok) throw new Error('数据库连接未就绪，请刷新页面后重试。');

      var fd = new FormData(form);
      var email = String(fd.get('email') || '').trim();
      var password = String(fd.get('password') || '').trim();

      if(!email) throw new Error('请填写邮箱。');
      if(!password) throw new Error('请填写密码。');

      var res = await withTimeout(
        window.fwDb.client.auth.signInWithPassword({
          email: email,
          password: password
        }),
        16000,
        '登录请求超时，请检查网络后重试。'
      );

      if(res && res.error) throw res.error;

      toast('登录成功，正在进入研究所。');

      var modal = document.querySelector('[data-sb-auth]');
      if(modal) modal.classList.remove('show');

      setTimeout(function(){
        window.location.reload();
      }, 450);

    }catch(err){
      toast(mapAuthError(err));
      setLoading(btn, false);
      window.__FW_AUTH_HOTFIX_LOGIN_BUSY__ = false;
    }
  }

  async function completeSignup(form){
    if(window.__FW_AUTH_HOTFIX_SIGNUP_BUSY__) return;
    window.__FW_AUTH_HOTFIX_SIGNUP_BUSY__ = true;

    var btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, '验证中...');

    try{
      var ok = await waitForDb();
      if(!ok) throw new Error('数据库连接未就绪，请刷新页面后重试。');

      var reg1 = document.querySelector('[data-reg1]');
      var reg1Data = reg1 ? new FormData(reg1) : new FormData();
      var reg2Data = new FormData(form);

      var email = String(reg1Data.get('email') || '').trim().toLowerCase();
      var password = String(reg1Data.get('password') || '').trim();
      var labCode = normalizeLabCode(reg1Data.get('lab_code'));
      var nickname = normalizeNickname(reg1Data.get('nickname'));
      var token = String(reg2Data.get('token') || '').trim();

      var pending = readPendingRegister();

      if(!email) email = pending.email;
      if(!labCode) labCode = normalizeLabCode(pending.labCode);
      if(!nickname) nickname = normalizeNickname(pending.nickname);

      if(!email) throw new Error('注册邮箱丢失，请返回第一步重新填写。');
      if(!validLabCode(labCode)) throw new Error('实验品编号必须是 7 位字母或数字。');
      if(!token) throw new Error('请填写邮箱验证码。');

      if(!nickname){
        nickname = '研究员' + labCode;
      }

      if(!validNickname(nickname)){
        nickname = '研究员' + labCode;
      }

      var verified = await withTimeout(
        window.fwDb.client.auth.verifyOtp({
          email: email,
          token: token,
          type: 'signup'
        }),
        18000,
        '验证码验证超时，请稍后重试。'
      );

      if(verified && verified.error) throw verified.error;

      var user = verified && verified.data && verified.data.user;

      if(!user){
        var sessionRes = await window.fwDb.client.auth.getSession();
        user = sessionRes &&
          sessionRes.data &&
          sessionRes.data.session &&
          sessionRes.data.session.user;
      }

      if(!user || !user.id){
        throw new Error('邮箱已验证，但登录状态未同步，请刷新后登录。');
      }

      // 兜底：某些设置下密码可能没有在 signUp 阶段稳定写入，这里验证后再设置一次。
      if(password && password.length >= 6){
        await window.fwDb.client.auth.updateUser({
          password: password
        }).catch(function(){});
      }

      var saved = await window.fwDb.client
        .from('profiles')
        .update({
          lab_code: labCode,
          email_search: email,
          nickname: nickname,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select('id,nickname,lab_code,email_search')
        .maybeSingle();

      if(saved && saved.error) throw saved.error;

      clearPendingRegister();

      await window.fwDb.client.auth.signOut().catch(function(){});

      toast('注册成功，请登录。');

      var modal = document.querySelector('[data-sb-auth]');
      if(modal){
        modal.querySelectorAll('[data-view]').forEach(function(v){
          v.classList.toggle('show', v.dataset.view === 'login');
        });

        var title = modal.querySelector('[data-title]');
        var desc = modal.querySelector('[data-desc]');

        if(title) title.textContent = '账号登录';
        if(desc) desc.textContent = '输入邮箱和密码，进入研究所。';

        var loginEmail = modal.querySelector('[data-login] input[name="email"]');
        var loginPwd = modal.querySelector('[data-login] input[name="password"]');

        if(loginEmail) loginEmail.value = email;
        if(loginPwd) loginPwd.focus();
      }

    }catch(err){
      toast(mapAuthError(err));
    }finally{
      setLoading(btn, false);
      window.__FW_AUTH_HOTFIX_SIGNUP_BUSY__ = false;
    }
  }

  // 记录注册第一步资料，不阻止原注册第一步发送验证码逻辑。
  window.addEventListener('submit', function(e){
    var form = e.target && e.target.closest && e.target.closest('[data-reg1]');
    if(!form) return;

    var fd = new FormData(form);

    storePendingRegister(
      fd.get('email'),
      fd.get('lab_code'),
      fd.get('nickname')
    );
  }, true);

  // 抢先接管登录与注册第二步，阻止原控制器继续等待额外刷新导致超时。
  window.addEventListener('submit', function(e){
    var loginForm = e.target && e.target.closest && e.target.closest('[data-login]');
    var reg2Form = e.target && e.target.closest && e.target.closest('[data-reg2]');
    var form = loginForm || reg2Form;

    if(!form) return;

    var view = form.closest('[data-view]');
    if(view && !view.classList.contains('show')) return;

    e.preventDefault();
    e.stopPropagation();

    if(e.stopImmediatePropagation){
      e.stopImmediatePropagation();
    }

    if(loginForm) fastLogin(loginForm);
    if(reg2Form) completeSignup(reg2Form);
  }, true);
})();
