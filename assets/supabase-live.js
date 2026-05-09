// F.w 研究所 Supabase 登录系统入口（干净版）
// 只加载一个注册/登录控制器，避免多个补丁脚本互相抢事件。
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

  load('assets/supabase-auth-flow.js?v=clean-auth-20260509-1');
})();
