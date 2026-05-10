// F.w 研究所：登录超时 + 注册资料补写兜底修复 v2
// 作用：
// 1. 只接管登录表单：登录成功后立即刷新页面，避免误报“登录超时”。
// 2. 不再接管验证码验证，避免卡在“验证中...”。
// 3. 注册第一步记录 email / lab_code / nickname。
// 4. 注册成功后或首次登录后，自动补写 profiles.lab_code / email_search。
(function(){
  if(window.__FW_AUTH_FLOW_HOTFIX_V2__) return;
  window.__FW_AUTH_FLOW_HOTFIX_V2__ = true;

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
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
        return resolve(true);
      }

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

  function mapAuthError(err){
    var msg = String((err && err.message) || err || '');

    if(/invalid login credentials/i.test(msg)) return '邮箱或密码不正确。';
    if(/email not confirmed/i.test(msg)) return '邮箱还没有验证，请先完成邮箱验证码验证。';
    if(/rate limit|too many/i.test(msg)) return '尝试次数过多，请稍后再试。';
    if(/fetch|network|failed/i.test(msg)) return '网络连接异常，请刷新页面后重试。';
    if(msg.indexOf('实验品编号') >= 0) return msg;
    if(msg.indexOf('昵称') >= 0) return msg;
    if(msg.indexOf('duplicate') >= 0) return '该资料已被占用，请换一个。';

    return msg || '操作失败，请稍后重试。';
  }

  function setLoading(btn, loading, text){
    if(!btn) return;

    if(loading){
      if(!btn.dataset.oldText){
        btn.dataset.oldText = btn.textContent;
      }
      btn.textContent = text || '处理中...';
      btn.disabled = true;
      btn.classList.add('fw-btn-loading');
    }else{
      btn.textContent = btn.dataset.oldText || '提交';
      btn.disabled = false;
      btn.classList.remove('fw-btn-loading');
    }
  }

  function storePendingRegister(email, labCode, nickname){
    try{
      sessionStorage.setItem(
        'fw_pending_register_email',
        String(email || '').trim().toLowerCase()
      );

      sessionStorage.setItem(
        'fw_pending_register_lab_code',
        normalizeLabCode(labCode)
      );

      sessionStorage.setItem(
        'fw_pending_register_nickname',
        normalizeNickname(nickname)
      );
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
      return {
        email: '',
        labCode: '',
        nickname: ''
      };
    }
  }

  function clearPendingRegister(){
    try{
      sessionStorage.removeItem('fw_pending_register_email');
      sessionStorage.removeItem('fw_pending_register_lab_code');
      sessionStorage.removeItem('fw_pending_register_nickname');
    }catch(e){}
  }

  async function patchPendingProfile(user){
    if(!user || !user.id) return false;

    var pending = readPendingRegister();
    var email = String(pending.email || '').trim().toLowerCase();
    var labCode = normalizeLabCode(pending.labCode);
    var nickname = normalizeNickname(pending.nickname);

    if(!email || !validLabCode(labCode)){
      return false;
    }

    var userEmail = String(user.email || '').trim().toLowerCase();

    // 避免把 A 邮箱注册时的编号补到 B 账号上
    if(userEmail && email && userEmail !== email){
      return false;
    }

    if(!validNickname(nickname)){
      nickname = '研究员' + labCode;
    }

    if(!validNickname(nickname)){
      nickname = '研究员' + labCode.slice(-7);
    }

    var current = await withTimeout(
      window.fwDb.client
        .from('profiles')
        .select('id,nickname,lab_code,email_search')
        .eq('id', user.id)
        .maybeSingle(),
      8000,
      '读取用户资料超时。'
    );

    if(current && current.error){
      throw current.error;
    }

    var profile = current && current.data ? current.data : null;

    // 已经有编号就不重复写，防止触发“编号不可修改”
    if(profile && profile.lab_code){
      clearPendingRegister();
      return true;
    }

    var saved = await withTimeout(
      window.fwDb.client
        .from('profiles')
        .update({
          lab_code: labCode,
          email_search: email,
          nickname: nickname,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select('id,nickname,lab_code,email_search')
        .maybeSingle(),
      10000,
      '保存实验品编号超时。'
    );

    if(saved && saved.error){
      throw saved.error;
    }

    clearPendingRegister();
    return true;
  }

  async function patchPendingProfileSafe(user){
    try{
      var ok = await waitForDb();
      if(!ok) return false;

      var done = await patchPendingProfile(user);

      if(done){
        console.info('[FW] pending profile patched.');
      }

      return done;
    }catch(err){
      console.warn('[FW] pending profile patch failed:', err);
      toast(mapAuthError(err));
      return false;
    }
  }

  async function fastLogin(form){
    if(window.__FW_AUTH_HOTFIX_LOGIN_BUSY__) return;
    window.__FW_AUTH_HOTFIX_LOGIN_BUSY__ = true;

    var btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, '登录中...');

    try{
      var ok = await waitForDb();

      if(!ok){
        throw new Error('数据库连接未就绪，请刷新页面后重试。');
      }

      var fd = new FormData(form);
      var email = String(fd.get('email') || '').trim();
      var password = String(fd.get('password') || '').trim();

      if(!email){
        throw new Error('请填写邮箱。');
      }

      if(!password){
        throw new Error('请填写密码。');
      }

      var res = await withTimeout(
        window.fwDb.client.auth.signInWithPassword({
          email: email,
          password: password
        }),
        16000,
        '登录请求超时，请检查网络后重试。'
      );

      if(res && res.error){
        throw res.error;
      }

      var user = res && res.data ? res.data.user : null;

      // 如果这个账号是刚注册后首次登录，并且本地还存着 lab_code，就顺手补写资料
      if(user){
        await patchPendingProfileSafe(user);
      }

      toast('登录成功，正在进入研究所。');

      var modal = document.querySelector('[data-sb-auth]');
      if(modal){
        modal.classList.remove('show');
      }

      setTimeout(function(){
        window.location.reload();
      }, 450);

    }catch(err){
      toast(mapAuthError(err));
      setLoading(btn, false);
      window.__FW_AUTH_HOTFIX_LOGIN_BUSY__ = false;
    }
  }

  // 记录注册第一步信息，不阻止原验证码发送逻辑
  window.addEventListener('submit', function(e){
    var form = e.target &&
      e.target.closest &&
      e.target.closest('[data-reg1]');

    if(!form) return;

    var fd = new FormData(form);

    storePendingRegister(
      fd.get('email'),
      fd.get('lab_code'),
      fd.get('nickname')
    );
  }, true);

  // 只接管登录，不接管 register2 验证码
  window.addEventListener('submit', function(e){
    var form = e.target &&
      e.target.closest &&
      e.target.closest('[data-login]');

    if(!form) return;

    var view = form.closest('[data-view]');
    if(view && !view.classList.contains('show')){
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if(e.stopImmediatePropagation){
      e.stopImmediatePropagation();
    }

    fastLogin(form);
  }, true);

  // 监听注册验证成功后的登录态，自动补写资料
  function installAuthListener(){
    if(!window.fwDb || !window.fwDb.client || !window.fwDb.client.auth){
      setTimeout(installAuthListener, 300);
      return;
    }

    if(window.__FW_AUTH_HOTFIX_AUTH_LISTENER__) return;
    window.__FW_AUTH_HOTFIX_AUTH_LISTENER__ = true;

    window.fwDb.client.auth.onAuthStateChange(function(event, session){
      if(event === 'SIGNED_IN' && session && session.user){
        patchPendingProfileSafe(session.user);
      }
    });
  }

  installAuthListener();
})();
