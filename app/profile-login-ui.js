// 手机端账号入口展示清理。
// 注册/登录提交逻辑仍统一由 app/profile.js 负责；这里只隐藏旧式并排 tab，并补一个清晰的注册入口。
(function(){
  if(window.__FW_MOBILE_PROFILE_LOGIN_UI__) return;
  window.__FW_MOBILE_PROFILE_LOGIN_UI__ = true;

  function $(selector, root){ return (root || document).querySelector(selector); }

  function injectStyle(){
    if($('#fwMobileAuthEntryCleanStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileAuthEntryCleanStyle';
    style.textContent = [
      '.mobile-auth-tabs{display:none!important}',
      '.mobile-auth-register-entry{display:grid;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(16,23,15,.10)}',
      '.mobile-auth-register-entry p{margin:0;color:var(--muted);font-size:12px;line-height:1.55;font-weight:850}',
      '.mobile-auth-register-entry button{min-height:42px;border:1px solid rgba(16,23,15,.14);border-radius:999px;background:#fffaf1;color:var(--deep);font-size:14px;font-weight:1000}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function enhanceLoginEntry(){
    injectStyle();
    var form = $('[data-login-form]');
    if(!form || form.querySelector('[data-mobile-register-entry]')) return;
    var entry = document.createElement('div');
    entry.className = 'mobile-auth-register-entry';
    entry.setAttribute('data-mobile-register-entry', '1');
    entry.innerHTML = '<p>还没有账号？先完成邮箱验证并设置研究员ID。</p><button type="button" data-auth-view="register1">注册新账号</button>';
    form.appendChild(entry);
  }

  function boot(){
    enhanceLoginEntry();
    var panel = $('[data-profile-panel]');
    if(panel && !panel.__fwMobileAuthEntryObserver){
      panel.__fwMobileAuthEntryObserver = new MutationObserver(function(){
        setTimeout(enhanceLoginEntry, 0);
      });
      panel.__fwMobileAuthEntryObserver.observe(panel, {childList:true, subtree:true});
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('pageshow', boot);
})();
