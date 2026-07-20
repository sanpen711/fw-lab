// 手机端账号页展示简化。
// 注册入口由 profile.js 直接渲染；这里只保留样式，避免异步插入造成重复按钮和切换竞态。
(function(){
  if(window.__FW_MOBILE_PROFILE_LOGIN_UI__) return;
  window.__FW_MOBILE_PROFILE_LOGIN_UI__ = true;

  function $(selector, root){ return (root || document).querySelector(selector); }

  function injectStyle(){
    if($('#fwMobileAuthSimpleStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileAuthSimpleStyle';
    style.textContent = [
      '.profile-login-entry .login-card{padding:14px!important}',
      '.profile-login-entry .mobile-login-kicker,.profile-login-entry .mobile-login-title,.profile-login-entry .mobile-login-desc{display:none!important}',
      '.profile-login-entry [data-login-form]>.mobile-auth-note{display:none!important}',
      '.mobile-auth-simple-entry{display:grid;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(16,23,15,.10)}',
      '.mobile-auth-simple-entry span{color:var(--muted);font-size:13px;line-height:1.45;font-weight:850}',
      '.mobile-auth-simple-entry button{width:100%;min-height:42px;border:1px solid rgba(16,23,15,.14);border-radius:999px;background:#fffaf1;color:var(--deep);font-size:15px;font-weight:1000}',
      '.profile-login-entry .stack{gap:9px!important}',
      '.profile-login-entry [data-register-form],.profile-login-entry [data-register-verify-form]{gap:8px!important}',
      '.profile-login-entry label{font-size:13px!important;line-height:1.25!important;margin:0!important}',
      '.profile-login-entry input{min-height:42px!important;padding-top:0!important;padding-bottom:0!important}',
      '.profile-login-entry .mobile-auth-note{margin:0!important;font-size:12px!important;line-height:1.35!important}',
      '.profile-login-entry .mobile-register-steps{margin:0 0 8px!important;gap:8px!important}',
      '.profile-login-entry .mobile-register-steps span{padding:7px 4px!important}',
      '.profile-login-entry .mobile-disclaimer{margin-top:2px!important;padding:9px!important;gap:5px!important}',
      '.profile-login-entry .mobile-disclaimer p{margin:0!important;font-size:12px!important;line-height:1.35!important}',
      '.profile-login-entry .mobile-disclaimer label{line-height:1.35!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function boot(){
    injectStyle();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('pageshow', boot);
})();
