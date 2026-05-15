// F.w 研究所：登录提交修复补丁 v4
// 只处理登录表单 [data-login]，不处理注册验证码 [data-reg2]。
// 桌面端：保持原来的登录成功后刷新页面逻辑。
// 手机端：登录成功后不只依赖页面刷新，直接同步右上角头像/昵称，避免手机浏览器缓存导致“已登录但右上角不显示”。
(function(){
  if(window.__FW_LOGIN_SUBMIT_FIX_V4__) return;
  window.__FW_LOGIN_SUBMIT_FIX_V4__ = true;

  var loginBusy = false;
  var loginReloading = false;

  function $(s){ return document.querySelector(s); }
  function $$(s){ return Array.from(document.querySelectorAll(s)); }

  function isMobileLoginMode(){
    try{
      return window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    }catch(e){
      return window.innerWidth <= 760;
    }
  }

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function avatar(name, url, m){
    m = m || '';
    if(url){
      return '<span class="fw-avatar ' + esc(m) + '"><img src="' + esc(url) + '" alt="' + esc(name || '研究员') + '"></span>';
    }
    return '<span class="fw-avatar ' + esc(m) + '">' + esc(String(name || 'FW').slice(0, 2).toUpperCase()) + '</span>';
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
        setTimeout(function(){ resolve({__timeout:true}); }, ms || 15000);
      })
    ]);
  }

  function loginMsg(err){
    var msg = String((err && err.message) || err || '');

    if(/invalid login credentials/i.test(msg)) return '邮箱或密码不正确。';
    if(/email not confirmed/i.test(msg)) return '邮箱还没有验证，请先完成邮箱验证码验证。';
    if(/rate limit|too many/i.test(msg)) return '尝试次数过多，请稍后再试。';
    if(/network|fetch|failed/i.test(msg)) return '网络连接异常，请刷新后重试。';

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
    if(modal) modal.classList.remove('show');
  }

  async function hasSession(){
    try{
      if(!window.fwDb || !window.fwDb.client || !window.fwDb.client.auth) return false;
      var res = await window.fwDb.client.auth.getSession();
      return !!(res && res.data && res.data.session && res.data.session.user);
    }catch(e){
      return false;
    }
  }

  async function getMobileUserWithRetry(){
    var user = null;
    for(var i = 0; i < 12; i += 1){
      try{
        if(window.fwDb && typeof window.fwDb.getCurrentUser === 'function'){
          user = await window.fwDb.getCurrentUser();
        }
      }catch(e){
        user = null;
      }

      if(user && user.id) return user;

      await new Promise(function(resolve){ setTimeout(resolve, 350); });
    }

    return null;
  }

  function updateMobileUserbar(user){
    if(!user || !user.id) return false;

    $$('.header').forEach(function(h){
      if(h.querySelector('.fw-userbar')) return;
      var b = document.createElement('div');
      b.className = 'fw-userbar fw-userbar-supabase';
      b.innerHTML = '<button type="button" class="fw-login-pill" data-fw-open><span data-fw-avatar-slot></span><span data-fw-current>注册 / 登录</span></button><div class="fw-profile-popover"><div class="fw-profile-card-head"><span data-fw-card-avatar></span><div><b data-fw-card-name>未登录</b><span data-fw-card-status>点击注册 / 登录</span></div></div><p><strong>绑定邮箱：</strong><span data-fw-card-email>未绑定</span></p><p><strong>实验品编号：</strong><span data-fw-card-code>未设置</span></p><p><strong>账号状态：</strong><span data-fw-card-role>游客</span></p><div class="fw-profile-card-actions"><button type="button" data-fw-open>编辑资料</button><button type="button" data-sb-logout>退出</button></div></div>';
      h.appendChild(b);
    });

    var nickname = user.nickname || '研究员';

    $$('[data-fw-current]').forEach(function(x){ x.textContent = nickname; });
    $$('[data-fw-avatar-slot]').forEach(function(x){ x.innerHTML = avatar(nickname, user.avatar_url, 'mini'); });
    $$('[data-fw-card-avatar]').forEach(function(x){ x.innerHTML = avatar(nickname, user.avatar_url); });
    $$('[data-fw-card-name]').forEach(function(x){ x.textContent = nickname; });
    $$('[data-fw-card-status]').forEach(function(x){ x.textContent = '已进入研究所'; });
    $$('[data-fw-card-email]').forEach(function(x){ x.textContent = user.email || '未绑定'; });
    $$('[data-fw-card-code]').forEach(function(x){ x.textContent = user.lab_code || '未设置'; });
    $$('[data-fw-card-role]').forEach(function(x){ x.textContent = user.isAdmin ? '管理员' : (user.disabled ? '已停用' : '正常'); });
    $$('.fw-profile-card-actions').forEach(function(x){ x.style.display = 'flex'; });

    $$('[data-post-form]').forEach(function(form){
      var notice = form.querySelector('[data-notice]');
      if(notice) notice.textContent = '已登录，可以发布和互动。';
    });

    return true;
  }

  async function reloadMobilePosts(){
    try{
      if(window.fwDb && typeof window.fwDb.loadPosts === 'function'){
        var posts = await window.fwDb.loadPosts();
        if(typeof window.savePosts === 'function') window.savePosts(posts);
        if(typeof window.renderFeeds === 'function') window.renderFeeds();
      }
    }catch(e){}
  }

  async function finishMobileLogin(btn){
    toast('登录成功，正在进入研究所。');
    closeModal();

    var user = await getMobileUserWithRetry();

    if(user && updateMobileUserbar(user)){
      await reloadMobilePosts();
      loginBusy = false;
      loginReloading = false;
      setLoading(btn || $('[data-login] button[type="submit"]'), false);
      try{ window.dispatchEvent(new CustomEvent('fw:mobile-login-ready', {detail:{user:user}})); }catch(e){}
      toast('登录成功。');
      return;
    }

    // 手机端如果直接同步失败，再退回原来的刷新方案；这是兜底，不影响桌面端。
    setTimeout(function(){
      var cleanPath = window.location.origin + window.location.pathname;
      window.location.replace(cleanPath + '?login=' + Date.now());
    }, 300);
  }

  function goAfterLogin(btn){
    if(loginReloading) return;

    loginReloading = true;

    if(isMobileLoginMode()){
      finishMobileLogin(btn);
      return;
    }

    // 桌面端保留原逻辑，避免误碰电脑端。
    toast('登录成功，正在进入研究所。');
    closeModal();

    setTimeout(function(){
      var cleanPath = window.location.origin + window.location.pathname;
      window.location.replace(cleanPath + '?login=' + Date.now());
    }, 350);
  }

  function watchSessionAfterLogin(btn){
    var n = 0;

    var timer = setInterval(async function(){
      n += 1;

      if(await hasSession()){
        clearInterval(timer);
        goAfterLogin(btn);
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
      watchSessionAfterLogin(btn);

      var res = await withTimeout(
        window.fwDb.client.auth.signInWithPassword({email:email,password:password}),
        12000
      );

      // 如果请求超时，但 session 已经写入，则直接进入网站，不再报超时。
      if(res && res.__timeout){
        if(await hasSession()){
          goAfterLogin(btn);
          return;
        }

        throw new Error('登录请求超时，请刷新页面后重试。');
      }

      if(res && res.error) throw res.error;

      if(res && res.data && res.data.session){
        goAfterLogin(btn);
        return;
      }

      if(await hasSession()){
        goAfterLogin(btn);
        return;
      }

      throw new Error('登录状态未同步，请刷新页面后重试。');

    }catch(e){
      if(await hasSession()){
        goAfterLogin(btn);
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
    if(form.closest('[data-reg2]')) return;

    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();

    handleLogin(form);
  }

  function interceptClick(e){
    var btn = e.target && e.target.closest && e.target.closest('[data-login] button[type="submit"]');
    if(!btn) return;

    var form = btn.closest('[data-login]');
    if(!form) return;
    if(form.closest('[data-reg2]')) return;

    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();

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

    observer.observe(document.body, {childList:true,subtree:true});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
