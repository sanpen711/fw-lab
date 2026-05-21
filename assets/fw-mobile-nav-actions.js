// F.w 研究所：手机端压缩快捷导航条
// 作用：
// 1. 手机端在头部下方增加一条压缩导航：左侧放页面入口，右侧放回声/搭子。
// 2. 回声/搭子复用原有功能，不重写弹窗逻辑。
// 3. 电脑端完全不显示、不影响原布局。
(function(){
  if(window.__FW_MOBILE_NAV_ACTIONS_COMPACT__) return;
  window.__FW_MOBILE_NAV_ACTIONS_COMPACT__ = true;

  var badgeTimer = 0;
  var quickBadgeDelays = [300, 1000, 2500];
  var optimisticHiddenUntil = {echo:0, buddy:0};

  function $(s, root){ return (root || document).querySelector(s); }
  function $$(s, root){ return Array.from((root || document).querySelectorAll(s)); }

  function isMobile(){
    return window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
  }

  function injectStyle(){
    if($('#fw-mobile-nav-actions-style')) return;

    var style = document.createElement('style');
    style.id = 'fw-mobile-nav-actions-style';
    style.textContent = `
      .fw-mobile-compact-strip{display:none;}

      @media(max-width:760px){
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
        .fw-mobile-action-btn:active{
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

        .fw-mobile-action-btn.show .fw-mobile-action-badge{
          display:grid!important;
        }

        /* 手机顶部太窄，原桌面回声/搭子按钮隐藏，统一用这条压缩栏显示 */
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

  function fireOriginal(kind){
    var selector = kind === 'buddy' ? '[data-fw-open-buddy]' : '[data-fw-open-echo]';
    var original = $$(selector).find(function(el){
      return !el.closest('#fw-mobile-compact-strip');
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

  function getOriginalBadgeCount(kind){
    var selector = kind === 'buddy' ? '[data-fw-open-buddy]' : '[data-fw-open-echo]';
    var el = $$(selector).find(function(x){ return !x.closest('#fw-mobile-compact-strip'); });
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
    var btn = $('[data-fw-mobile-open="' + kind + '"]');
    if(!btn) return;

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
      var btn = e.target.closest && e.target.closest('[data-fw-mobile-open]');
      if(!btn) return;

      var kind = btn.dataset.fwMobileOpen;

      e.preventDefault();
      e.stopPropagation();
      setBadge(kind, 0);
      fireOriginal(kind);
      scheduleQuickBadgeSync(kind);
    }, true);

    window.addEventListener('resize', function(){
      ensureStrip();
      setTimeout(syncBadgesFromOriginal, 100);
    });

    document.addEventListener('visibilitychange', function(){
      if(!document.hidden) setTimeout(syncBadgesFromOriginal, 200);
    });
  }

  function boot(){
    injectStyle();
    ensureStrip();
    bind();
    syncBadgesFromOriginal();

    clearInterval(badgeTimer);
    badgeTimer = setInterval(syncBadgesFromOriginal, 5000);

    var timer = 0;
    var observer = new MutationObserver(function(){
      clearTimeout(timer);
      timer = setTimeout(function(){
        ensureStrip();
        syncBadgesFromOriginal();
      }, 120);
    });

    observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();