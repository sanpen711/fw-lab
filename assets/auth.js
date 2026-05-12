// F.w 研究所旧版本地演示登录脚本已停用。
// 当前网站使用 Supabase 邮箱验证码登录。
// 保留这个空壳文件，是为了兼容仍然引用 assets/auth.js 的页面，避免 404 报错。
// 如果某些页面还缓存旧版 app.js，这里兜底加载合并后的前台稳定核心。
(function(){
  window.FW_LEGACY_AUTH_DISABLED = true;

  function has(selector){ return !!document.querySelector(selector); }

  function loadJs(src){
    if(has('script[src="' + src + '"]')) return;
    var script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.defer = false;
    document.body.appendChild(script);
  }

  function loadFallbacks(){
    loadJs('assets/fw-stable-core.js?v=stable-core-20260512-1');
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadFallbacks);
  else loadFallbacks();
})();
