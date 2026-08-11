// F.w 研究所 Windows 客户端外壳 v1.0.2
// 仅在 Tauri 自定义 User-Agent 中启用，网页、PWA 与 Android 不受影响。
(function(){
  'use strict';

  if(window.__FW_DESKTOP_CLIENT_SHELL__) return;
  if(!/FWYanjiusuoDesktop\//i.test(navigator.userAgent || '')) return;
  window.__FW_DESKTOP_CLIENT_SHELL__ = true;

  var ROUTES = {
    'index.html': {key:'home', title:'首页', subtitle:'活动、公告和每天一句话都会放在这里'},
    'compose.html': {key:'compose', title:'发牢骚', subtitle:'把今天想说的话单独放在这里'},
    'square.html': {key:'square', title:'精神广场', subtitle:'匿名说点真话，也听听别人的今天'},
    'rooms.html': {key:'rooms', title:'学术研讨', subtitle:'一本正经地研究不太正经的问题'},
    'bird.html': {key:'bird', title:'观鸟台', subtitle:'看看研究所里此刻发生了什么'},
    'echo.html': {key:'echo', title:'回声', subtitle:'评论、回复和互动都在这里'},
    'buddy.html': {key:'buddy', title:'搭子', subtitle:'左边选人，右边直接聊天'},
    'archive.html': {key:'archive', title:'废话档案', subtitle:'翻一翻被留下来的研究记录'},
    'rules.html': {key:'more', title:'入馆须知', subtitle:'匿名不等于没有边界'}
  };

  var NAV = [
    {key:'home', href:'index.html', label:'首页', icon:'home'},
    {key:'square', href:'square.html', label:'精神广场', icon:'bubble'},
    {key:'rooms', href:'rooms.html', label:'学术研讨', icon:'flask'},
    {key:'bird', href:'bird.html', label:'观鸟台', icon:'eye'},
    {key:'echo', href:'echo.html', label:'回声', icon:'bell', badge:'echo'},
    {key:'buddy', href:'buddy.html', label:'搭子', icon:'users', badge:'buddy'},
    {key:'archive', href:'archive.html', label:'档案', icon:'archive'}
  ];

  var ICONS = {
    home:'<path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M5.5 10v10h13V10M9.5 20v-6h5v6"/>',
    bubble:'<path d="M5 6.5h14v9H9l-4 3v-12Z"/><path d="M9 10h6M9 13h4"/>',
    flask:'<path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M8 14h8"/>',
    eye:'<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/>',
    bell:'<path d="M6 17h12l-1.5-2.5V10a4.5 4.5 0 0 0-9 0v4.5L6 17Z"/><path d="M10 20h4"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3.5 19v-2a5.5 5.5 0 0 1 11 0v2M16 6.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.8"/>',
    archive:'<path d="M4 6h16v14H4zM3 3h18v4H3z"/><path d="M9 11h6"/>',
    user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    more:'<circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>'
  };

  function icon(name){
    return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + '</svg>';
  }

  function pageName(){
    return (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  }

  function currentRoute(){
    return ROUTES[pageName()] || {key:'more', title:'F.w 研究所', subtitle:'低功耗匿名交流区'};
  }

  function buildShell(){
    if(document.querySelector('[data-fw-desktop-sidebar]')) return;
    var route = currentRoute();
    document.documentElement.classList.add('fw-desktop-app', 'fw-route-' + route.key);
    document.body.classList.add('fw-desktop-body');

    var aside = document.createElement('aside');
    aside.className = 'fw-desktop-sidebar';
    aside.dataset.fwDesktopSidebar = '1';
    aside.innerHTML =
      '<a class="fw-desktop-brand" href="index.html" aria-label="F.w 研究所首页"><span>F.w</span><small>研究所</small></a>' +
      '<a class="fw-desktop-compose' + (route.key === 'compose' ? ' active' : '') + '" href="compose.html" data-fw-desktop-compose title="发牢骚">' + icon('plus') + '<span>发牢骚</span></a>' +
      '<nav class="fw-desktop-nav" aria-label="软件主导航">' + NAV.map(function(item){
        return '<a class="fw-desktop-nav-item' + (route.key === item.key ? ' active' : '') + '" href="' + item.href + '" data-fw-desktop-nav="' + item.key + '" title="' + item.label + '">' +
          icon(item.icon) + '<span>' + item.label + '</span>' + (item.badge ? '<b data-fw-desktop-badge="' + item.badge + '"></b>' : '') + '</a>';
      }).join('') + '</nav>' +
      '<a class="fw-desktop-nav-item fw-desktop-more' + (route.key === 'more' ? ' active' : '') + '" href="rules.html" title="更多">' + icon('more') + '<span>更多</span></a>' +
      '<button class="fw-desktop-nav-item fw-desktop-account" type="button" data-fw-desktop-account title="我的">' + icon('user') + '<span>我的</span></button>';
    document.body.appendChild(aside);

    var connection = document.createElement('div');
    connection.className = 'fw-desktop-connection';
    connection.dataset.fwDesktopConnection = '1';
    connection.innerHTML = '<span>网络已断开，部分内容可能暂时不可用。</span><button type="button" data-fw-desktop-retry>重新连接</button>';
    document.body.appendChild(connection);

  }

  function openComposer(){
    if(pageName() === 'compose.html'){
      var field = document.querySelector('[data-post-form] textarea');
      if(field) field.focus();
      return;
    }
    rememberRoute('compose.html');
    document.body.classList.add('fw-desktop-navigating');
    location.href = 'compose.html';
  }

  function markPageReady(){
    document.documentElement.classList.remove('fw-desktop-preparing');
    document.body.classList.remove('fw-desktop-navigating');
  }

  function openDedicatedSocialPage(kind){
    var attempts = 0;
    function tryOpen(){
      attempts += 1;
      if(kind === 'echo' && typeof window.fwOpenStableEcho === 'function'){
        window.fwOpenStableEcho();
        markPageReady();
        return;
      }
      if(kind === 'buddy' && window.FWMobileActions && typeof window.FWMobileActions.openBuddy === 'function'){
        window.FWMobileActions.openBuddy();
        markPageReady();
        return;
      }
      if(attempts < 50) setTimeout(tryOpen, 80);
      else markPageReady();
    }
    setTimeout(tryOpen, 0);
  }

  function syncBadges(){
    ['echo','buddy'].forEach(function(kind){
      var target = document.querySelector('[data-fw-desktop-badge="' + kind + '"]');
      if(!target) return;
      var source = document.querySelector('[data-fw-open-' + kind + '] .fw-top-badge, [data-fw-open-' + kind + '].fw-has-badge .fw-top-badge');
      var visible = source && (source.classList.contains('show') || source.parentElement.classList.contains('show') || source.parentElement.classList.contains('fw-has-badge'));
      var value = source ? (source.textContent || '').trim() : '';
      target.textContent = value && value !== '0' ? value : '';
      target.classList.toggle('show', Boolean(visible && value !== '0'));
    });
  }

  function saveScroll(){
    try{ sessionStorage.setItem('fw:desktop:scroll:' + pageName(), String(Math.max(0, window.scrollY || 0))); }catch(e){}
  }

  function restoreScroll(){
    if(location.search || location.hash) return;
    var value = 0;
    try{ value = Number(sessionStorage.getItem('fw:desktop:scroll:' + pageName()) || 0); }catch(e){}
    if(!Number.isFinite(value) || value < 40) return;
    var cancelled = false;
    var stop = function(){ cancelled = true; };
    window.addEventListener('wheel', stop, {once:true, passive:true});
    window.addEventListener('touchstart', stop, {once:true, passive:true});
    window.addEventListener('pointerdown', stop, {once:true, passive:true});
    function apply(){ if(!cancelled) window.scrollTo(0, value); }
    requestAnimationFrame(apply);
    setTimeout(apply, 220);
    setTimeout(apply, 900);
    var surface = document.querySelector('[data-feed], [data-polls-list], [data-bird-feed]');
    if(surface && window.MutationObserver){
      var observer = new MutationObserver(function(){
        apply();
        if(surface.children.length > 0) setTimeout(function(){ observer.disconnect(); }, 250);
      });
      observer.observe(surface, {childList:true});
      setTimeout(function(){ observer.disconnect(); }, 2500);
    }
  }

  function prefetchRoute(href){
    if(!href || href === pageName() || document.querySelector('link[data-fw-desktop-prefetch="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    link.as = 'document';
    link.dataset.fwDesktopPrefetch = href;
    document.head.appendChild(link);
  }

  function setupRouteIntent(){
    document.addEventListener('pointerover', function(e){
      var next = e.target.closest && e.target.closest('.fw-desktop-compose[href], .fw-desktop-nav-item[href], .fw-desktop-brand[href]');
      if(next) prefetchRoute(next.getAttribute('href'));
    }, {passive:true});
    document.addEventListener('focusin', function(e){
      var next = e.target.closest && e.target.closest('.fw-desktop-compose[href], .fw-desktop-nav-item[href], .fw-desktop-brand[href]');
      if(next) prefetchRoute(next.getAttribute('href'));
    });
  }

  function rememberRoute(route){
    if(!ROUTES[route]) return;
    try{ localStorage.setItem('fw:desktop:last-route', route); }catch(e){}
  }

  function resumeLastRoute(){
    try{
      if(sessionStorage.getItem('fw:desktop:session-started') === '1') return false;
      sessionStorage.setItem('fw:desktop:session-started', '1');
      var last = localStorage.getItem('fw:desktop:last-route') || '';
      if(ROUTES[last] && last !== pageName()){
        location.replace(last);
        return true;
      }
    }catch(e){}
    return false;
  }

  function openHomeAfterUpgrade(){
    try{
      var key = 'fw:desktop:home-enabled-20260811';
      if(localStorage.getItem(key) === '1') return false;
      localStorage.setItem(key, '1');
      if(pageName() !== 'index.html'){
        localStorage.setItem('fw:desktop:last-route', 'index.html');
        location.replace('index.html');
        return true;
      }
    }catch(e){}
    return false;
  }

  function syncConnection(){
    var banner = document.querySelector('[data-fw-desktop-connection]');
    if(banner) banner.classList.toggle('show', navigator.onLine === false);
  }

  function desktopVersion(){
    var match = (navigator.userAgent || '').match(/FWYanjiusuoDesktop\/([0-9]+(?:\.[0-9]+){1,3})/i);
    return match ? match[1] : '';
  }

  function compareVersions(left, right){
    var a = String(left || '').split('.').map(Number);
    var b = String(right || '').split('.').map(Number);
    for(var i = 0; i < Math.max(a.length, b.length); i += 1){
      var partA = Number.isFinite(a[i]) ? a[i] : 0;
      var partB = Number.isFinite(b[i]) ? b[i] : 0;
      if(partA !== partB) return partA > partB ? 1 : -1;
    }
    return 0;
  }

  function showLegacyUpdater(release){
    if(document.querySelector('[data-fw-legacy-updater]')) return;

    var style = document.createElement('style');
    style.textContent =
      '.fw-legacy-updater{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;background:rgba(11,22,18,.58);backdrop-filter:blur(4px)}' +
      '.fw-legacy-update-card{width:min(460px,calc(100vw - 48px));padding:28px;border:1px solid rgba(17,56,44,.16);border-radius:22px;background:#fffaf0;box-shadow:0 24px 70px rgba(4,24,18,.28);color:#15372c}' +
      '.fw-legacy-update-card h2{margin:0 0 10px;font-size:24px}.fw-legacy-update-card p{margin:0 0 18px;line-height:1.75;color:#52665f}' +
      '.fw-legacy-update-card .fw-legacy-update-note{margin-top:-8px;font-size:13px;color:#687a73}' +
      '.fw-legacy-update-actions{display:flex;gap:10px;justify-content:flex-end}.fw-legacy-update-actions a,.fw-legacy-update-actions button{min-height:42px;padding:0 18px;border-radius:999px;font:inherit;font-weight:700;cursor:pointer}' +
      '.fw-legacy-update-actions a{display:inline-flex;align-items:center;text-decoration:none;background:#153f33;color:#fff}.fw-legacy-update-actions button{border:1px solid #c8d2cc;background:transparent;color:#42564f}';
    document.head.appendChild(style);

    var layer = document.createElement('div');
    layer.className = 'fw-legacy-updater';
    layer.dataset.fwLegacyUpdater = '1';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-labelledby', 'fw-legacy-update-title');
    layer.innerHTML =
      '<section class="fw-legacy-update-card">' +
        '<h2 id="fw-legacy-update-title">软件更新已准备好</h2>' +
        '<p>版本 <strong data-fw-legacy-version></strong> 开始支持软件内自动更新。这一次点击下载安装包后直接运行即可覆盖升级，不需要卸载，账号、缓存和浏览位置都会保留。</p>' +
        '<p class="fw-legacy-update-note" data-fw-legacy-update-status>点击“下载并升级”后会打开 Microsoft Edge 下载；这是旧版本最后一次借助浏览器更新。</p>' +
        '<div class="fw-legacy-update-actions"><button type="button" data-fw-legacy-later>稍后</button><a data-fw-legacy-download>下载并升级</a></div>' +
      '</section>';
    layer.querySelector('[data-fw-legacy-version]').textContent = release.version;
    var download = layer.querySelector('[data-fw-legacy-download]');
    var downloadUrl = release.downloadUrl || 'https://fwyanjiusuo.com/download/fw-lab-windows-latest.exe';
    download.href = 'microsoft-edge:' + downloadUrl;
    download.addEventListener('click', function(){
      saveScroll();
      layer.querySelector('[data-fw-legacy-update-status]').textContent = '正在打开 Microsoft Edge 下载。如果系统询问是否打开，请选择“允许”。下载完成后直接运行安装包即可。';
    });
    layer.querySelector('[data-fw-legacy-later]').addEventListener('click', function(){
      try{ sessionStorage.setItem('fw:desktop:update-later:' + release.version, '1'); }catch(e){}
      layer.remove();
    });
    document.body.appendChild(layer);
  }

  function checkLegacyUpdater(){
    var current = desktopVersion();
    if(!current || compareVersions(current, '1.0.3') >= 0) return;
    fetch('download/windows-version.json?legacy-updater=' + Date.now(), {cache:'no-store'})
      .then(function(response){ if(!response.ok) throw new Error('release unavailable'); return response.json(); })
      .then(function(release){
        if(!release || !release.available || compareVersions(release.version, current) <= 0) return;
        try{ if(sessionStorage.getItem('fw:desktop:update-later:' + release.version) === '1') return; }catch(e){}
        showLegacyUpdater(release);
      })
      .catch(function(){});
  }

  function bind(){
    document.addEventListener('click', function(e){
      var compose = e.target.closest('[data-fw-desktop-compose]');
      if(compose){ e.preventDefault(); openComposer(); return; }
      var account = e.target.closest('[data-fw-desktop-account]');
      if(account){
        e.preventDefault();
        var opener = document.querySelector('.header [data-fw-open], [data-login-cta], [data-sb-open]');
        if(opener) opener.click();
        return;
      }
      if(e.target.closest('[data-fw-desktop-retry]')){ e.preventDefault(); location.reload(); return; }
      var current = e.target.closest('.fw-desktop-nav-item.active');
      if(current && current.getAttribute('href') === pageName()){
        e.preventDefault();
        window.scrollTo({top:0, behavior:'smooth'});
        try{ sessionStorage.setItem('fw:desktop:scroll:' + pageName(), '0'); }catch(err){}
        return;
      }
      var next = e.target.closest('.fw-desktop-nav-item[href], .fw-desktop-brand[href]');
      if(next){
        saveScroll();
        rememberRoute((next.getAttribute('href') || '').split('?')[0].split('#')[0]);
        document.body.classList.add('fw-desktop-navigating');
      }
    });

    document.addEventListener('keydown', function(e){
      var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName || '');
      if(!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n'){
        e.preventDefault(); openComposer();
      }
      if(e.ctrlKey && !e.shiftKey && !e.altKey){
        var href = {'1':'index.html','2':'square.html','3':'echo.html','4':'buddy.html'}[e.key];
        if(href){ e.preventDefault(); location.href = href; }
      }
    });

    window.addEventListener('pagehide', saveScroll);
    window.addEventListener('beforeunload', function(){ document.body.classList.add('fw-desktop-navigating'); });
    window.addEventListener('online', syncConnection);
    window.addEventListener('offline', syncConnection);
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) syncBadges(); });
    setTimeout(syncBadges, 800);
    setTimeout(syncBadges, 2600);
    setInterval(syncBadges, 20000);
  }

  function boot(){
    if(openHomeAfterUpgrade()) return;
    if(resumeLastRoute()) return;
    rememberRoute(pageName());
    buildShell();
    bind();
    setupRouteIntent();
    syncBadges();
    syncConnection();
    restoreScroll();
    setTimeout(checkLegacyUpdater, 1200);
    if(pageName() === 'echo.html'){ openDedicatedSocialPage('echo'); return; }
    if(pageName() === 'buddy.html'){ openDedicatedSocialPage('buddy'); return; }
    markPageReady();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
