// F.w 研究所：手机端 APP 化导航与安全区
// 作用：
// 1. 手机端为顶部 header / 底部内容增加 safe-area 适配。
// 2. 保留原有压缩快捷导航，并新增底部固定导航栏。
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
      .fw-mobile-tabbar{display:none;}

      @media(max-width:768px){
        :root{
          --fw-mobile-tab-height:64px;
          --fw-mobile-bottom-space:calc(var(--fw-mobile-tab-height) + env(safe-area-inset-bottom, 0px) + 14px);
        }

        body{
          padding-bottom:var(--fw-mobile-bottom-space)!important;
        }

        .header{
          padding-top:calc(env(safe-area-inset-top, 0px) + 12px)!important;
          padding-right:24px!important;
          padding-bottom:16px!important;
          padding-left:24px!important;
          align-items:center!important;
        }

        .header .logo{
          line-height:1.12!important;
        }

        .header .menu-btn,
        .header .fw-login-pill,
        .header [data-login-cta],
        .header [data-fw-open],
        .header [data-sb-open]{
          margin-top:0!important;
        }

        .footer{
          padding-bottom:calc(28px + var(--fw-mobile-bottom-space))!important;
        }

        .fw-mobile-compact-strip{
          display:flex!important;
          align-items:stretch!important;
          gap:10px!important;
          width:calc(100% - 28px)!important;
          margin:0 auto 12px!important;
          position:relative!important;
          z-index:45!important;
        }

        .fw-mobile-page-links{
          flex:1 1 auto!important;
          min-width:0!important;
          display:grid!important;
          grid-template-columns:repeat(3,minmax(0,1fr))!important;
          gap:5px!important;
          border:0!important;
          padding:0!important;
          background:transparent!important;
          backdrop-filter:none!important;
          -webkit-backdrop-filter:none!important;
        }

        .fw-mobile-page-link{
          min-width:0!important;
          height:30px!important;
          display:flex!important;
          align-items:center!important;
          justify-content:center!important;
          border:1px solid rgba(255,255,255,.22)!important;
          border-radius:999px!important;
          background:rgba(255,253,247,.055)!important;
          color:#fffdf7!important;
          text-decoration:none!important;
          font-size:11px!important;
          line-height:1!important;
          font-weight:1000!important;
          letter-spacing:-.05em!important;
          white-space:nowrap!important;
        }

        .fw-mobile-page-link:active,
        .fw-mobile-action-btn:active,
        .fw-mobile-tab:active{
          transform:translateY(1px)!important;
        }

        .fw-mobile-right-actions{
          flex:0 0 116px!important;
          width:116px!important;
          display:grid!important;
          grid-template-columns:1fr 1fr!important;
          gap:5px!important;
          border:0!important;
          padding:0!important;
          background:transparent!important;
          backdrop-filter:none!important;
          -webkit-backdrop-filter:none!important;
        }

        .fw-mobile-action-btn{
          position:relative!important;
          appearance:none!important;
          border:1px solid rgba(255,255,255,.32)!important;
          border-radius:999px!important;
          background:rgba(255,253,247,.07)!important;
          color:#fffdf7!important;
          height:30px!important;
          padding:0!important;
          font-size:11px!important;
          line-height:1!important;
          font-weight:1000!important;
          letter-spacing:-.05em!important;
          white-space:nowrap!important;
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

        /* 手机顶部太窄，原桌面回声/搭子按钮隐藏，统一用这条压缩栏和底部栏显示 */
        .header [data-fw-open-echo],
        .header [data-fw-open-buddy],
        .top-actions [data-fw-open-echo],
        .top-actions [data-fw-open-buddy],
        .header-actions [data-fw-open-echo],
        .header-actions [data-fw-open-buddy],
        .user-area [data-fw-open-echo],
        .user-area [data-fw-open-buddy],
        .auth-area [data-fw-open-echo],
        .auth-area [data-fw-open-buddy],
        .nav-actions [data-fw-open-echo],
        .nav-actions [data-fw-open-buddy]{
          display:none!important;
        }

        @media(max-width:390px){
          .fw-mobile-compact-strip{
            gap:7px!important;
            width:calc(100% - 22px)!important;
          }
          .fw-mobile-right-actions{
            flex-basis:102px!important;
            width:102px!important;
          }
          .fw-mobile-page-link,
          .fw-mobile-action-btn{
            font-size:10px!important;
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
      <button type="button" class="fw-mobile-tab is-active" data-fw-mobile-tab="nav">${icon('nav')}<span>导航</span></button>
      <button type="button" class="fw-mobile-tab" data-fw-mobile-tab="buddy" data-fw-mobile-open="buddy">${icon('buddy')}<span>搭子</span><span class="fw-mobile-action-badge" data-fw-mobile-badge="buddy"></span></button>
      <button type="button" class="fw-mobile-tab" data-fw-mobile-tab="echo" data-fw-mobile-open="echo">${icon('echo')}<span>回声</span><span class="fw-mobile-action-badge" data-fw-mobile-badge="echo"></span></button>
      <button type="button" class="fw-mobile-tab" data-fw-mobile-tab="me">${icon('me')}<span>我的</span></button>
    `;

    document.body.appendChild(bar);
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

  function openMobileMenu(){
    var btn = $('.menu-btn');

    if(btn){
      btn.click();
      return;
    }

    var nav = $('.mobile-nav');
    if(nav) nav.classList.toggle('show');
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
      var openBtn = e.target.closest && e.target.closest('[data-fw-mobile-open]');
      if(openBtn){
        var openKind = openBtn.dataset.fwMobileOpen;

        e.preventDefault();
        e.stopPropagation();
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
      setActiveTab(kind);

      if(kind === 'nav'){
        openMobileMenu();
        return;
      }

      if(kind === 'me'){
        openMine();
      }
    }, true);

    window.addEventListener('resize', function(){
      ensureStrip();
      ensureTabbar();
      setTimeout(syncBadgesFromOriginal, 100);
    });

    document.addEventListener('visibilitychange', function(){
      if(!document.hidden) setTimeout(syncBadgesFromOriginal, 200);
    });
  }

  function boot(){
    injectStyle();
    ensureStrip();
    ensureTabbar();
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
        syncBadgesFromOriginal();
      }, 120);
    });

    observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();