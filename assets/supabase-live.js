// F.w 研究所 Supabase 登录系统入口
// 旧版 OTP 弹窗已停用，新流程在 assets/supabase-auth-flow.js
(function(){
  if(window.__FW_SUPABASE_AUTH_FLOW_LOADED__) return;
  window.__FW_SUPABASE_AUTH_FLOW_LOADED__ = true;
  const script = document.createElement('script');
  script.src = 'assets/supabase-auth-flow.js?v=20260508-auth-flow';
  script.defer = false;
  document.head.appendChild(script);
})();
