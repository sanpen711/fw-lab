// F.w 研究所 Supabase 登录系统入口（验证码发送卡住修复版）
(function(){
  if(window.__FW_SUPABASE_AUTH_FLOW_LOADED__) return;
  window.__FW_SUPABASE_AUTH_FLOW_LOADED__ = true;

  function load(src){
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.defer = false;
    document.head.appendChild(script);
  }

  load('assets/supabase-auth-flow.js?v=send-code-unblock-20260510-1');
})();
