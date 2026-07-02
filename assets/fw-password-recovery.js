// F.w 研究所：忘记密码 / Supabase recovery 回调补全
// 功能：发送重置邮件时附带标记；检测 recovery 回调；自动打开设置新密码表单；成功后退出并提示重新登录。
(function(){
  if(window.__FW_PASSWORD_RECOVERY_FLOW_V1__) return;
  window.__FW_PASSWORD_RECOVERY_FLOW_V1__ = true;

  var RECOVERY_MARK = 'fw_recovery';
  var PENDING_KEY = 'fw_password_recovery_pending';
  var busy = false;

  function $(selector){
    return document.querySelector(selector);
  }

  function $$(selector){
    return Array.from(document.querySelectorAll(selector));
  }

  function db(){
    return window.fwDb;
  }

  function on(){
    return !!(db() && db().enabled && db().client);
  }

  function sleep(ms){
    return new Promise(function(resolve){
      setTimeout(resolve, ms);
    });
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

    clearTimeout(window.__fwPasswordRecoveryToast);
    window.__fwPasswordRecoveryToast = setTimeout(function(){
      t.classList.remove('show');
    }, 3600);
  }

  function authMsg(err){
    var msg = String((err && err.message) || err || '');

    if(/token/i.test(msg) && /expired/i.test(msg)) return '找回密码链接已过期，请重新发送找回密码邮件。';
    if(/session/i.test(msg) && /missing|not found|invalid/i.test(msg)) return '找回密码登录状态无效，请重新发送找回密码邮件。';
    if(/weak password/i.test(msg)) return '密码强度不够，请换一个更复杂的密码。';
    if(/rate limit|too many/i.test(msg)) return '尝试次数过多，请稍后再试。';

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

  function waitForDb(){
    return new Promise(function(resolve){
      if(on()) return resolve(true);

      var n = 0;
      var timer = setInterval(function(){
        n += 1;

        if(on()){
          clearInterval(timer);
          resolve(true);
        }

        if(n > 140){
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  function recoveryRedirect(){
    var base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
    return base + '?' + RECOVERY_MARK + '=1';
  }

  function parseRecoveryParams(){
    var search = new URLSearchParams(window.location.search || '');
    var hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));

    return {
      marked:search.get(RECOVERY_MARK) === '1' || hash.get(RECOVERY_MARK) === '1',
      type:search.get('type') || hash.get('type') || '',
      code:search.get('code') || hash.get('code') || '',
      accessToken:search.get('access_token') || hash.get('access_token') || '',
      error:search.get('error') || hash.get('error') || '',
      errorCode:search.get('error_code') || hash.get('error_code') || '',
      errorDescription:search.get('error_description') || hash.get('error_description') || ''
    };
  }

  function shouldOpenRecovery(){
    var p = parseRecoveryParams();

    return p.marked ||
      p.type === 'recovery' ||
      !!p.errorCode ||
      sessionStorage.getItem(PENDING_KEY) === '1';
  }

  function cleanupRecoveryUrl(){
    try{
      var url = new URL(window.location.href);
      [
        RECOVERY_MARK,
        'code',
        'type',
        'token_hash',
        'access_token',
        'refresh_token',
        'expires_in',
        'expires_at',
        'token_type',
        'error',
        'error_code',
        'error_description'
      ].forEach(function(key){
        url.searchParams.delete(key);
      });

      window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
    }catch(e){
      if(window.history && window.history.replaceState){
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }

  function ensureResetView(){
    var modal = $('[data-sb-auth]');
    if(!modal) return null;

    var existing = modal.querySelector('[data-view="reset2"]');
    if(existing) return existing;

    var section = document.createElement('section');
    section.className = 'fw-auth-view';
    section.dataset.view = 'reset2';
    section.innerHTML = [
      '<form data-update-password class="fw-form show">',
      '  <h3>设置新密码</h3>',
      '  <p class="form-tip">请设置一个新的登录密码，提交成功后需要重新登录。</p>',
      '  <label>新密码</label>',
      '  <input name="password" type="password" placeholder="至少 6 位" autocomplete="new-password">',
      '  <label>确认新密码</label>',
      '  <input name="password2" type="password" placeholder="再输入一次新密码" autocomplete="new-password">',
      '  <button class="btn dark full" type="submit">确认修改密码</button>',
      '  <p class="form-tip fw-auth-links">',
      '    <button type="button" data-fw-pw-back-login>返回登录</button>',
      '  </p>',
      '</form>'
    ].join('\n');

    var profile = modal.querySelector('[data-view="profile"]');
    if(profile && profile.parentNode){
      profile.parentNode.insertBefore(section, profile);
    }else{
      var panel = modal.querySelector('.fw-auth-panel') || modal;
      panel.appendChild(section);
    }

    return section;
  }

  async function waitForAuthModal(){
    for(var i = 0; i < 100; i += 1){
      if($('[data-sb-auth]')){
        ensureResetView();
        return true;
      }

      await sleep(80);
    }

    return false;
  }

  function showAuthView(view, title, desc){
    var modal = $('[data-sb-auth]');
    if(!modal) return;

    ensureResetView();

    modal.classList.add('show');

    $$('[data-view]').forEach(function(el){
      el.classList.toggle('show', el.dataset.view === view);
    });

    var titleEl = $('[data-title]');
    var descEl = $('[data-desc]');
    var progress = $('[data-progress]');

    if(titleEl) titleEl.textContent = title || '账号登录';
    if(descEl) descEl.textContent = desc || '输入邮箱和密码，进入研究所。';
    if(progress) progress.style.display = 'none';

    setTimeout(function(){
      var input = $('[data-view="' + view + '"] input');
      if(input && !input.disabled) input.focus();
    }, 80);
  }

  async function ensureRecoverySession(){
    var ok = await waitForDb();
    if(!ok) throw new Error('数据库连接未就绪，请刷新页面后重试。');

    for(var i = 0; i < 36; i += 1){
      var res = await db().client.auth.getSession();
      var session = res && res.data && res.data.session;

      if(session && session.user){
        return session;
      }

      await sleep(250);
    }

    throw new Error('找回密码链接无效或已过期，请重新发送找回密码邮件。');
  }

  async function openRecoveryView(){
    await waitForAuthModal();

    var p = parseRecoveryParams();

    if(p.error || p.errorCode){
      sessionStorage.removeItem(PENDING_KEY);
      cleanupRecoveryUrl();
      showAuthView('reset', '找回密码', '找回链接无效或已过期，请重新发送找回密码邮件。');
      toast(decodeURIComponent(p.errorDescription || '找回密码链接无效或已过期。'));
      return;
    }

    sessionStorage.setItem(PENDING_KEY, '1');
    showAuthView('reset2', '设置新密码', '链接验证通过后，请设置新的登录密码。');

    try{
      await ensureRecoverySession();
      toast('请设置新密码。');
    }catch(e){
      toast(authMsg(e));
    }
  }

  async function submitNewPassword(form){
    if(busy) return;

    busy = true;

    var btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, '修改中...');

    try{
      var fd = new FormData(form);
      var password = String(fd.get('password') || '').trim();
      var password2 = String(fd.get('password2') || '').trim();

      if(password.length < 6) throw new Error('密码至少 6 位。');
      if(password !== password2) throw new Error('两次密码不一致。');

      await ensureRecoverySession();

      var r = await db().client.auth.updateUser({
        password:password
      });

      if(r.error) throw r.error;

      try{
        await db().client.auth.signOut();
      }catch(e){}

      sessionStorage.removeItem(PENDING_KEY);
      cleanupRecoveryUrl();

      form.reset();
      toast('密码已修改成功，请重新登录。');
      showAuthView('login', '账号登录', '密码已更新，请用新密码重新登录。');

    }catch(e){
      toast(authMsg(e));
    }finally{
      setLoading(btn, false);
      busy = false;
    }
  }

  function bind(){
    document.body.addEventListener('submit', function(e){
      var form = e.target.closest('[data-update-password]');

      if(!form) return;

      e.preventDefault();
      submitNewPassword(form);
    });

    document.body.addEventListener('click', function(e){
      if(!e.target.closest('[data-fw-pw-back-login]')) return;

      e.preventDefault();
      showAuthView('login', '账号登录', '输入邮箱和密码，进入研究所。');
    });
  }

  async function patchResetSender(){
    var ok = await waitForDb();
    if(!ok || !db() || !db().client || db().__fwPasswordRecoveryPatched) return;

    db().__fwPasswordRecoveryPatched = true;
    db().sendPasswordReset = async function(payload){
      var email = String((payload && payload.email) || '').trim();
      var r = await db().client.auth.resetPasswordForEmail(email, {
        redirectTo:recoveryRedirect()
      });

      if(r.error){
        throw new Error(r.error.message);
      }

      return {ok:true};
    };
  }

  async function bindRecoveryEvent(){
    var ok = await waitForDb();
    if(!ok || !db() || !db().client || db().__fwPasswordRecoveryEventBound) return;

    db().__fwPasswordRecoveryEventBound = true;

    db().client.auth.onAuthStateChange(function(event){
      if(event === 'PASSWORD_RECOVERY'){
        sessionStorage.setItem(PENDING_KEY, '1');
        openRecoveryView();
      }
    });
  }

  async function boot(){
    bind();
    patchResetSender();
    bindRecoveryEvent();

    if(shouldOpenRecovery()){
      openRecoveryView();
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }else{
    boot();
  }
})();
