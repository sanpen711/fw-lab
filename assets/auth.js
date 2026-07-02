// F.w 研究所旧版本地演示登录脚本已停用。
// 当前网站使用 Supabase 邮箱验证码登录。
// 保留这个兼容入口，是为了避免仍然引用 assets/auth.js 的页面 404；同时只在电脑端加载回声中心增强。
(function(){
  window.FW_LEGACY_AUTH_DISABLED = true;

  if(window.__FW_AUTH_COMPAT_LOADER__) return;
  window.__FW_AUTH_COMPAT_LOADER__ = true;

  if(/\/app\//.test(window.location.pathname || '')) return;

  function loadDesktopOnly(src){
    if(document.querySelector('script[src="' + src + '"]')) return;

    var script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.defer = false;
    document.body.appendChild(script);
  }

  loadDesktopOnly('assets/fw-echo-center-desktop.js?v=desktop-echo-center-20260702-3');
})();
