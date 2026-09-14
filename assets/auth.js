// F.w 研究所旧版本地演示登录脚本已停用。
// 当前网站使用 Supabase 邮箱验证码登录。
// 同时作为 PC 网页公共视觉/导航同步层的轻量加载器。
(function(){
  window.FW_LEGACY_AUTH_DISABLED = true;

  var page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var explicit = ['index.html','square.html','play.html','games.html','membership.html'];
  if(explicit.indexOf(page) >= 0) return;

  var ua = navigator.userAgent || '';
  var mobile = /Android|iPhone|iPod|Mobile|Windows Phone/i.test(ua);
  var smallTouch = false;
  try{ smallTouch = window.matchMedia('(max-width: 820px)').matches && navigator.maxTouchPoints > 0; }catch(e){}
  if(mobile || smallTouch) return;

  if(!document.querySelector('link[data-fw-web-sync]')){
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'assets/web-sync-20260914.css?v=2';
    link.dataset.fwWebSync = '1';
    document.head.appendChild(link);
  }

  if(!document.querySelector('link[data-fw-web-page-alignment]')){
    var alignment = document.createElement('link');
    alignment.rel = 'stylesheet';
    alignment.href = 'assets/web-page-alignment-20260914.css?v=1';
    alignment.dataset.fwWebPageAlignment = '1';
    document.head.appendChild(alignment);
  }

  if(!document.querySelector('script[data-fw-web-sync]')){
    var script = document.createElement('script');
    script.src = 'assets/web-sync-20260914.js?v=2';
    script.defer = true;
    script.dataset.fwWebSync = '1';
    document.head.appendChild(script);
  }
})();