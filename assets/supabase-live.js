// F.w 研究所 Supabase 登录系统入口
// 加载顺序：先加载登录/注册兜底修复，再加载主登录注册控制器。
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

  load('assets/fw-auth-flow-hotfix.js?v=auth-hotfix-20260510-1');
  load('assets/supabase-auth-flow.js?v=auth-flow-20260510-2');
})();
