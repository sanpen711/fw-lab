// F.w 研究所 Supabase 登录系统入口（简化注册版）
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

  load('assets/supabase-auth-flow.js?v=simple-register-20260509-1');
})();
