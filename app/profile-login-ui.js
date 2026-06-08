// 手机端账号页展示简化。
// 只调整页面展示，不处理提交、不拦截验证码、不修改注册/登录逻辑。
(function(){
  if(window.__FW_MOBILE_PROFILE_LOGIN_UI__) return;
  window.__FW_MOBILE_PROFILE_LOGIN_UI__ = true;

  function $(selector, root){ return (root || document).querySelector(selector); }

  function injectStyle(){
    if($('#fwMobileAuthSimpleStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileAuthSimpleStyle';
    style.textContent = [
      '.profile-login-entry .login-card{padding:16px!important}',
      '.profile-login-entry .mobile-login-kicker,.profile-login-entry .mobile-login-title,.profile-login-entry .mobile-login-desc{display:none!important}',
      '.profile-login-entry .mobile-auth-tabs{display:none!important}',
      '.profile-login-entry [data-login-form]>.mobile-auth-note{display:none!important}',
      '.mobile-auth-simple-entry{display:grid;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(16,23,15,.10)}',
      '.mobile-auth-simple-entry span{color:var(--muted);font-size:13px;line-height:1.5;font-weight:850}',
      '.mobile-auth-simple-entry button{width:100%;min-height:42px;border:1px solid rgba(16,23,15,.14);border-radius:999px;background:#fffaf1;color:var(--deep);font-size:15px;font-weight:1000}',
      '.mobile-register-steps{margin-top:0!important}',
      '.profile-login-entry .stack{gap:12px!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function simplifyLogin(){
    injectStyle();
    var form = $('[data-login-form]');
    if(!form) return;
    if(form.querySelector('[data-mobile-auth-simple-entry]')) return;

    var entry = document.createElement('div');
    entry.className = 'mobile-auth-simple-entry';
    entry.setAttribute('data-mobile-auth-simple-entry', '1');
    entry.innerHTML = '<span>还没有账号？先注册，再用邮箱和密码登录。</span><button type="button" data-auth-view="register1">注册账号</button>';
    form.appendChild(entry);
  }

  function boot(){
    simplifyLogin();
    var panel = $('[data-profile-panel]');
    if(panel && !panel.__fwMobileAuthSimpleObserver){
      panel.__fwMobileAuthSimpleObserver = new MutationObserver(function(){
        setTimeout(simplifyLogin, 0);
      });
      panel.__fwMobileAuthSimpleObserver.observe(panel, {childList:true, subtree:true});
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('pageshow', boot);
})();
