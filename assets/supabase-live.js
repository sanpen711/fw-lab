// F.w 研究所 Supabase 登录系统入口（干净版）
// 只加载一个账号控制器，避免登录、验证码、退出互相抢流程。
(function(){
  if(window.__FW_SUPABASE_AUTH_FLOW_LOADED__) return;
  window.__FW_SUPABASE_AUTH_FLOW_LOADED__ = true;

  function load(src){
    var script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.defer = false;
    document.head.appendChild(script);
  }

  load('assets/supabase-auth-clean.js?v=desktop-auth-a11y-20260716-2');
  load('assets/fw-password-recovery.js?v=password-recovery-20260702-2');
})();
