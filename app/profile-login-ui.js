// 手机端账号入口展示整理。
// 只负责显示账号入口选择；登录、注册、验证码等业务逻辑仍由 app/profile.js 负责。
(function(){
  if(window.__FW_MOBILE_PROFILE_LOGIN_UI__) return;
  window.__FW_MOBILE_PROFILE_LOGIN_UI__ = true;

  function $(selector, root){ return (root || document).querySelector(selector); }

  function injectStyle(){
    if($('#fwMobileAuthChoiceStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileAuthChoiceStyle';
    style.textContent = [
      '.mobile-auth-tabs{display:none!important}',
      '.mobile-auth-choice{display:grid;gap:12px}',
      '.mobile-auth-choice-card{width:100%;min-height:86px;border:1px solid rgba(16,23,15,.12);border-radius:14px;background:#fffaf1;color:var(--deep);padding:14px;text-align:left;display:grid;gap:6px;box-shadow:0 6px 16px rgba(16,23,15,.04)}',
      '.mobile-auth-choice-card strong{display:block;font-size:20px;line-height:1.1;font-weight:1000;letter-spacing:-.04em}',
      '.mobile-auth-choice-card span{display:block;color:var(--muted);font-size:13px;line-height:1.45;font-weight:850}',
      '.mobile-auth-choice-card.primary{background:var(--deep);color:#fffdf7}',
      '.mobile-auth-choice-card.primary span{color:rgba(255,253,247,.78)}',
      '.profile-login-entry[data-mobile-auth-choice="choice"] [data-login-form]{display:none!important}',
      '.profile-login-entry[data-mobile-auth-choice="login"] .mobile-auth-choice{display:none!important}',
      '.profile-login-entry[data-mobile-auth-choice="login"] [data-login-form]{display:grid!important}',
      '.mobile-auth-register-entry{display:none!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function setTitle(entry, mode){
    var head = entry && $('.profile-detail-head h2', entry);
    var title = entry && $('.mobile-login-title', entry);
    var desc = entry && $('.mobile-login-desc', entry);
    if(mode === 'choice'){
      if(head) head.textContent = '账号入口';
      if(title) title.textContent = '账号入口';
      if(desc) desc.textContent = '请选择登录或注册。';
    }else{
      if(head) head.textContent = '账号登录';
      if(title) title.textContent = '账号登录';
      if(desc) desc.textContent = '输入邮箱和密码，进入研究所。';
    }
  }

  function enhance(){
    injectStyle();
    var entry = $('.profile-login-entry');
    if(!entry) return;
    var loginForm = $('[data-login-form]', entry);
    var registerForm = $('[data-register-form], [data-register-verify-form]', entry);
    if(!loginForm || registerForm) return;

    var oldBottom = $('[data-mobile-register-entry]', loginForm);
    if(oldBottom) oldBottom.remove();

    var choice = $('.mobile-auth-choice', entry);
    if(!choice){
      choice = document.createElement('div');
      choice.className = 'mobile-auth-choice';
      choice.innerHTML = '<button class="mobile-auth-choice-card primary" type="button" data-mobile-auth-show-login><strong>账号登录</strong><span>已经注册过，用邮箱和密码进入研究所。</span></button>' +
        '<button class="mobile-auth-choice-card" type="button" data-auth-view="register1"><strong>注册账号</strong><span>新用户设置研究员ID、密码，并完成邮箱验证。</span></button>';
      loginForm.parentNode.insertBefore(choice, loginForm);
    }

    var emailValue = loginForm.email && String(loginForm.email.value || '').trim();
    if(!entry.dataset.mobileAuthChoice){
      entry.dataset.mobileAuthChoice = emailValue ? 'login' : 'choice';
    }
    setTitle(entry, entry.dataset.mobileAuthChoice || 'choice');
  }

  document.addEventListener('click', function(event){
    var btn = event.target.closest && event.target.closest('[data-mobile-auth-show-login]');
    if(!btn) return;
    var entry = btn.closest('.profile-login-entry');
    if(!entry) return;
    event.preventDefault();
    entry.dataset.mobileAuthChoice = 'login';
    setTitle(entry, 'login');
  }, true);

  function boot(){
    enhance();
    var panel = $('[data-profile-panel]');
    if(panel && !panel.__fwMobileAuthChoiceObserver){
      panel.__fwMobileAuthChoiceObserver = new MutationObserver(function(){ setTimeout(enhance, 0); });
      panel.__fwMobileAuthChoiceObserver.observe(panel, {childList:true, subtree:true});
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('pageshow', boot);
})();