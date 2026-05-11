// F.w 研究所旧版本地演示登录脚本已停用。
// 当前网站使用 Supabase 邮箱验证码登录，核心逻辑在：
// - assets/supabase-config.js
// - assets/supabase-db.js
// - assets/supabase-live.js
//
// 保留这个空壳文件，是为了兼容仍然引用 assets/auth.js 的页面，避免 404 报错。
// 同时在这里做一个轻量兜底：如果某些页面还缓存了旧版 app.js，也尽量加载全站前台收口补丁。
(function(){
  window.FW_LEGACY_AUTH_DISABLED = true;

  function has(selector){
    return !!document.querySelector(selector);
  }

  function loadCss(href){
    if(has('link[href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function loadJs(src){
    if(has('script[src="' + src + '"]')) return;
    var script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.defer = false;
    document.body.appendChild(script);
  }

  function loadPolishFallback(){
    loadCss('assets/fw-frontend-polish.css?v=frontend-polish-20260511-1');
    loadJs('assets/fw-frontend-polish.js?v=frontend-polish-20260511-1');
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', loadPolishFallback);
  }else{
    loadPolishFallback();
  }
})();
