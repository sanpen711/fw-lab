// F.w 研究所：手机端 APP 化导航与安全区
// 作用：
// 1. 手机端为顶部内容 / 底部内容增加 safe-area 适配。
// 2. 隐藏旧顶部导航区域，并新增底部固定导航栏与小型导航浮层。
// 3. 回声/搭子/我的复用原有功能入口，不重写业务逻辑。
(function(){
  if(window.__FW_MOBILE_NAV_ACTIONS_COMPACT__) return;
  window.__FW_MOBILE_NAV_ACTIONS_COMPACT__ = true;

  var badgeTimer = 0;
  var quickBadgeDelays = [300, 1000, 2500];
  var optimisticHiddenUntil = {echo:0, buddy:0};

  function $(s, root){ return (root || document).querySelector(s); }
  function $$(s, root){ return Array.from((root || document).querySelectorAll(s)); }

  function isMobile(){
    return (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) || /Android|iPhone|iPad|iPod|Mobile|MicroMessenger|MQQBrowser|baiduboxapp|baidubrowser/i.test(navigator.userAgent || '');
  }

  function currentPage(){
    var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    return page || 'index.html';
  }

  function icon(name){
    var icons = {
      nav:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16"></path><path d="M4 12h16"></path><path d="M4 18h16"></path></svg>',
      buddy:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path><circle cx="9.5" cy="7" r="4"></circle><path d="M19 8v6"></path><path d="M22 11h-6"></path></svg>',
      echo:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M13.7 21a2 2 0 0 1-3.4 0"></path></svg>',
      me:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg>'
    };

    return icons[name] || '';
  }

  function injectStyle(){
    if($('#fw-mobile-nav-actions-style')) return;

    var style = document.createElement('style');
    style.id = 'fw-mobile-nav-actions-style';
    style.textContent = `
      .fw-mobile-compact-strip,
      .fw-mobile-tabbar,
      .fw-mobile-nav-menu{display:none;}

      @media(max-width:768px){
        :root{
          --fw-mobile-tab-height:64px;
          --fw-mobile-bottom-space:calc(var(--fw-mobile-tab-height) + env(safe-area-inset-bottom, 0px) + 14px);
        }

        body{
          padding-bottom:var(--fw-mobile-bottom-space)!important;
        }

        .header,
        .fw-mobile-compact-strip,
        .mobile-nav,
        .mobile-nav.show{
          display:none!important;
        }

        .hero .hero-inner,
        .page-hero .hero-inner{
          padding-top:calc(env(safe-area-inset-top, 0px) + 24px)!important;
        }

        .footer{
          padding-bottom:calc(28px + var(--fw-mobile-bottom-space))!important;
        }

        .fw-mobile-page-link:active,
        .fw-mobile-action-btn:active,
        .fw-mobile-tab:active,
        .fw-mobile-nav-menu a:active{
          transform:translateY(1px)!important;
        }

        .fw-mobile-action-badge{
          position:absolute!important;
          right:-7px!important;
          top:-8px!important;
          min-width:17px!important;
          height:17px!important;
          padding:0 4px!important;
          border-radius:999px!important;
          background:#df7676!important;
          color:#fff!important;
          border:2px solid #151711!important;
          display:none!important;
          place-items:center!important;
          font-size:9px!important;
          line-height:12px!important;
          font-weight:1000!important;
          z-index:3!important;
        }

        .fw-mobile-action-btn.show .fw-mobile-action-badge,
        .fw-mobile-tab.show .fw-mobile-action-badge{
          display:grid!important;
        }

        .fw-mobile-tabbar{
          position:fixed!important;
          left:0!important;
          right:0!important;
          bottom:0!important;
          z-index:980!important;
          min-height:calc(var(--fw-mobile-tab-height) + env(safe-area-inset-bottom, 0px))!important;
          display:grid!important;
          grid-template-columns:repeat(4,minmax(0,1fr))!important;
          gap:0!important;
          padding:6px 8px calc(env(safe-area-inset-bottom, 0px) + 5px)!important;
          border-top:1px solid rgba(246,246,240,.16)!important;
          background:rgba(11,16,10,.92)!important;
          color:rgba(246,246,240,.6)!important;
          box-shadow:0 -12px 34px rgba(0,0,0,.26)!important;
          backdrop-filter:blur(18px)!important;
          -webkit-backdrop-filter:blur(18px)!important;
        }

        .fw-mobile-tab{
          position:relative!important;
          appearance:none!important;
          border:0!important;
          background:transparent!important;
          color:inherit!important;
          min-width:0!important;
          min-height:52px!important;
          padding:3px 2px 2px!important;
          display:flex!important;
          flex-direction:column!important;
          align-items:center!important;
          justify-content:center!important;
          gap:3px!important;
          font-size:11px!important;
          line-height:1!important;
          font-weight:850!important;
          letter-spacing:0!important;
          white-space:nowrap!important;
          border-radius:12px!important;
        }

        .fw-mobile-tab svg{
          width:22px!important;
          height:22px!important;
          fill:none!important;
          stroke:currentColor!important;
          stroke-width:2!important;
          stroke-linecap:round!important;
          stroke-linejoin:round!important;
        }

        .fw-mobile-tab span:not(.fw-mobile-action-badge){
          display:block!important;
        }

        .fw-mobile-tab.is-active{
          color:#fffdf7!important;
          background:rgba(217,121,121,.14)!important;
        }

        .fw-mobile-tab.is-active svg{
          color:var(--accent)!important;
        }

        .fw-mobile-tab .fw-mobile-action-badge{
          right:calc(50% - 22px)!important;
          top:1px!important;
          border-color:#0b100a!important;
        }

        .fw-mobile-nav-menu{
          position:fixed!important;
          left:12px!important;
          bottom:calc(var(--fw-mobile-tab-height) + env(safe-area-inset-bottom, 0px) + 12px)!important;
          z-index:981!important;
          width:min(246px, calc(100vw - 24px))!important;
          padding:8px!important;
          border-radius:10px!important;
          border:1px solid rgba(246,246,240,.18)!important;
          background:rgba(11,16,10,.94)!important;
          box-shadow:0 18px 48px rgba(0,0,0,.34)!important;
          backdrop-filter:blur(18px)!important;
          -webkit-backdrop-filter:blur(18px)!important;
          opacity:0!important;
          transform:translateY(8px)!important;
          pointer-events:none!important;
        }

        .fw-mobile-nav-menu.show{
          display:grid!important;
          gap:4px!important;
          opacity:1!important;
          transform:translateY(0)!important;
          pointer-events:auto!important;
        }

        .fw-mobile-nav-menu a{
          min-height:42px!important;
          display:flex!important;
          align-items:center!important;
          justify-content:space-between!important;
          padding:0 12px!important;
          border-radius:8px!important;
          color:rgba(246,246,240,.78)!important;
          font-size:14px!important;
          line-height:1!important;
          font-weight:900!important;
          text-decoration:none!important;
        }

        .fw-mobile-nav-menu a.is-current{
          color:#fffdf7!important;
          background:rgba(217,121,121,.16)!important;
        }

        .fw-mobile-nav-menu a.is-current::after{
          content:'当前'!important;
          color:var(--accent)!important;
          font-size:11px!important;
          font-weight:1000!important;
        }

        @media(max-width:390px){
          .fw-mobile-nav-menu{
            left:10px!important;
            width:min(230px, calc(100vw - 20px))!important;
          }
          .fw-mobile-tab{
            font-size:10px!important;
          }
        }
      }
    `;

    document.head.appendChild(style);
  }

  function findHeader(){
    return $('.header') || $('.site-header') || $('header');
  }

  function ensureStrip(){
    if($('#fw-mobile-compact-strip')) return;

    var header = findHeader();
    if(!header || !header.parentNode) return;

    var strip = document.createElement('div');
    strip.id = 'fw-mobile-compact-strip';
    strip.className = 'fw-mobile-compact-strip';
    strip.innerHTML = `
      <nav class="fw-mobile-page-links" aria-label="手机快捷导航">
        <a class="fw-mobile-page-link" href="archive.html">废话档案</a>
        <a class="fw-mobile-page-link" href="rules.html">入馆须知</a>
        <a class="fw-mobile-page-link" href="admin.html">处理公告</a>
      </nav>
      <div class="fw-mobile-right-actions">
        <button type="button" class="fw-mobile-action-btn" data-fw-mobile-open="echo">回声<span class="fw-mobile-action-badge" data-fw-mobile-badge="echo"></span></button>
        <button type="button" class="fw-mobile-action-btn" data-fw-mobile-open="buddy">搭子<span class="fw-mobile-action-badge" data-fw-mobile-badge="buddy"></span></button>
      </div>
    `;

    header.insertAdjacentElement('afterend', strip);
  }

  function ensureTabbar(){
    if($('#fw-mobile-tabbar')) return;

    var bar = document.createElement('nav');
    bar.id = 'fw-mobile-tabbar';
    bar.className = 'fw-mobile-tabbar';
    bar.setAttribute('aria-label', '手机底部导航');
    bar.innerHTML = `
      <button type="button" class="fw-mobile-tab" data-fw-mobile-tab="nav" aria-controls="fw-mobile-nav-menu" aria-expanded="false">${icon('nav')}<span>导航</span></button>
      <button type="button" class="fw-mobile-tab" data-fw-mobile-tab="buddy" data-fw-mobile-open="buddy">${icon('buddy')}<span>搭子</span><span class="fw-mobile-action-badge" data-fw-mobile-badge="buddy"></span></button>
      <button type="button" class="fw-mobile-tab" data-fw-mobile-tab="echo" data-fw-mobile-open="echo">${icon('echo')}<span>回声</span><span class="fw-mobile-action-badge" data-fw-mobile-badge="echo"></span></button>
      <button type="button" class="fw-mobile-tab" data-fw-mobile-tab="me">${icon('me')}<span>我的</span></button>
    `;

    document.body.appendChild(bar);
  }

  function ensureNavMenu(){
    var menu = $('#fw-mobile-nav-menu');
    if(menu) return menu;

    var page = currentPage();
    var items = [
      ['首页', 'index.html'],
      ['精神广场', 'square.html'],
      ['学术研讨', 'rooms.html'],
      ['观鸟台', 'bird.html'],
      ['废话档案', 'archive.html'],
      ['入馆须知', 'rules.html'],
      ['处理公告', 'admin.html']
    ];

    menu = document.createElement('nav');
    menu.id = 'fw-mobile-nav-menu';
    menu.className = 'fw-mobile-nav-menu';
    menu.setAttribute('aria-label', '页面导航');
    menu.innerHTML = items.map(function(item){
      var active = item[1] === page ? ' is-current' : '';
      return '<a class="' + active + '" href="' + item[1] + '">' + item[0] + '</a>';
    }).join('');

    document.body.appendChild(menu);
    return menu;
  }

  function setNavMenu(open){
    var menu = ensureNavMenu();
    var btn = $('[data-fw-mobile-tab="nav"]');

    if(open){
      menu.classList.add('show');
      if(btn){
        btn.classList.add('is-active');
        btn.setAttribute('aria-expanded', 'true');
      }
      return;
    }

    menu.classList.remove('show');
    if(btn){
      btn.classList.remove('is-active');
      btn.setAttribute('aria-expanded', 'false');
      btn.removeAttribute('aria-current');
    }
  }

  function toggleNavMenu(){
    var menu = ensureNavMenu();
    setNavMenu(!menu.classList.contains('show'));
  }

  function closeNavMenu(){
    var menu = $('#fw-mobile-nav-menu');
    if(menu && menu.classList.contains('show')) setNavMenu(false);
  }

  function fireOriginal(kind){
    var selector = kind === 'buddy' ? '[data-fw-open-buddy]' : '[data-fw-open-echo]';
    var original = $$(selector).find(function(el){
      return !el.closest('#fw-mobile-compact-strip') && !el.closest('#fw-mobile-tabbar');
    });

    if(original){
      original.click();
      return;
    }

    var tmp = document.createElement('button');
    tmp.type = 'button';
    tmp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    tmp.setAttribute(kind === 'buddy' ? 'data-fw-open-buddy' : 'data-fw-open-echo', '1');
    document.body.appendChild(tmp);
    tmp.click();
    setTimeout(function(){ tmp.remove(); }, 60);
  }

  function openMine(){
    var userAction = $('.fw-userbar [data-fw-open], .fw-userbar .fw-login-pill, .fw-userbar button');

    if(userAction){
      userAction.click();
      return;
    }

    var loginAction = $('[data-login-cta], [data-sb-open], [data-fw-open]');

    if(loginAction){
      loginAction.click();
    }
  }

  function setActiveTab(kind){
    $$('[data-fw-mobile-tab]').forEach(function(btn){
      var active = btn.dataset.fwMobileTab === kind;
      btn.classList.toggle('is-active', active);
      if(active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
  }

  function getOriginalBadgeCount(kind){
    var selector = kind === 'buddy' ? '[data-fw-open-buddy]' : '[data-fw-open-echo]';
    var el = $$(selector).find(function(x){ return !x.closest('#fw-mobile-compact-strip') && !x.closest('#fw-mobile-tabbar'); });
    if(!el) return 0;

    var badge = el.querySelector('.fw-top-badge, .fw-social-badge, [class*="badge"]');
    var text = badge ? String(badge.textContent || '').trim() : '';

    if(!text && el.classList && el.classList.contains('show')) text = '1';
    if(!text) return 0;
    if(text === '99+') return 99;

    var n = parseInt(text, 10);
    return isNaN(n) ? 1 : n;
  }

  function setBadge(kind, count){
    $$('[data-fw-mobile-open="' + kind + '"]').forEach(function(btn){
      var badge = $('[data-fw-mobile-badge="' + kind + '"]', btn);
      if(!badge) return;

      var n = Number(count || 0);
      if(n > 0){
        badge.textContent = n > 99 ? '99+' : String(n);
        btn.classList.add('show');
      }else{
        badge.textContent = '';
        btn.classList.remove('show');
      }
    });
  }

  function syncBadgesFromOriginal(kind){
    if(!isMobile()) return;

    function syncOne(name){
      var count = getOriginalBadgeCount(name);
      if(count > 0 && Date.now() < (optimisticHiddenUntil[name] || 0)) return;
      setBadge(name, count);
    }

    if(kind){
      syncOne(kind);
      return;
    }

    syncOne('echo');
    syncOne('buddy');
  }

  function refreshThenSync(kind){
    var p = null;

    if(typeof window.fwRefreshSplitBadges === 'function'){
      try{
        p = window.fwRefreshSplitBadges();
      }catch(e){}
    }

    if(p && typeof p.then === 'function'){
      p.then(function(){ syncBadgesFromOriginal(kind); }).catch(function(){ syncBadgesFromOriginal(kind); });
      return;
    }

    syncBadgesFromOriginal(kind);
  }

  function scheduleQuickBadgeSync(kind){
    optimisticHiddenUntil[kind] = Date.now() + 900;
    setBadge(kind, 0);

    quickBadgeDelays.forEach(function(ms){
      setTimeout(function(){
        refreshThenSync(kind);
      }, ms);
    });
  }

  function bind(){
    document.addEventListener('click', function(e){
      var menu = $('#fw-mobile-nav-menu');
      var menuLink = e.target.closest && e.target.closest('#fw-mobile-nav-menu a');

      if(menuLink){
        closeNavMenu();
        return;
      }

      var navTab = e.target.closest && e.target.closest('[data-fw-mobile-tab="nav"]');
      if(menu && menu.classList.contains('show') && !menu.contains(e.target) && !navTab){
        closeNavMenu();
      }

      var openBtn = e.target.closest && e.target.closest('[data-fw-mobile-open]');
      if(openBtn){
        var openKind = openBtn.dataset.fwMobileOpen;

        e.preventDefault();
        e.stopPropagation();
        closeNavMenu();
        setActiveTab(openKind);
        setBadge(openKind, 0);
        fireOriginal(openKind);
        scheduleQuickBadgeSync(openKind);
        return;
      }

      var tab = e.target.closest && e.target.closest('[data-fw-mobile-tab]');
      if(!tab) return;

      var kind = tab.dataset.fwMobileTab;

      e.preventDefault();
      e.stopPropagation();

      if(kind === 'nav'){
        toggleNavMenu();
        return;
      }

      closeNavMenu();
      setActiveTab(kind);

      if(kind === 'me'){
        openMine();
      }
    }, true);

    window.addEventListener('resize', function(){
      ensureStrip();
      ensureTabbar();
      ensureNavMenu();
      closeNavMenu();
      setTimeout(syncBadgesFromOriginal, 100);
    });

    window.addEventListener('scroll', function(){
      closeNavMenu();
    }, {passive:true});

    document.addEventListener('visibilitychange', function(){
      if(!document.hidden) setTimeout(syncBadgesFromOriginal, 200);
    });
  }

  function boot(){
    injectStyle();
    ensureStrip();
    ensureTabbar();
    ensureNavMenu();
    bind();
    syncBadgesFromOriginal();

    clearInterval(badgeTimer);
    badgeTimer = setInterval(syncBadgesFromOriginal, 5000);

    var timer = 0;
    var observer = new MutationObserver(function(){
      clearTimeout(timer);
      timer = setTimeout(function(){
        ensureStrip();
        ensureTabbar();
        ensureNavMenu();
        syncBadgesFromOriginal();
      }, 120);
    });

    observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();