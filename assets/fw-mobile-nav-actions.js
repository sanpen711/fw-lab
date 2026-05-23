// F.w 研究所：手机端 APP 化导航与安全区
// 作用：
// 1. 手机端为顶部内容 / 底部内容增加 safe-area 适配。
// 2. 隐藏旧顶部导航区域，并新增底部固定导航栏与小型导航浮层。
// 3. 回声/搭子/我的复用原有功能入口，不重写业务逻辑。
(function(){
  if(window.__FW_MOBILE_NAV_ACTIONS_COMPACT__) return;
  window.__FW_MOBILE_NAV_ACTIONS_COMPACT__ = true;

  var badgeTimer = 0;
  var shellRefreshTimer = 0;
  var observerTimer = 0;
  var mobileShellBound = false;
  var mobileShellObserver = null;
  var quickBadgeDelays = [300, 1000, 2500];
  var entryRetryDelays = [100, 300];
  var optimisticHiddenUntil = {echo:0, buddy:0};

  function $(s, root){ return (root || document).querySelector(s); }
  function $$(s, root){ return Array.from((root || document).querySelectorAll(s)); }

  function isMobile(){
    return (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) || /Android|iPhone|iPad|iPod|Mobile|MicroMessenger|MQQBrowser|baiduboxapp|baidubrowser/i.test(navigator.userAgent || '');
  }

  function debug(){
    if(!window.console || typeof window.console.debug !== 'function') return;
    try{
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[FWMobileActions]');
      window.console.debug.apply(window.console, args);
    }catch(e){}
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
          --fw-mobile-tabbar-height:78px;
          --fw-mobile-bottom-space:calc(var(--fw-mobile-tabbar-height) + env(safe-area-inset-bottom, 0px) + 14px);
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
          bottom:calc(var(--fw-mobile-tabbar-height) + env(safe-area-inset-bottom, 0px) + 12px)!important;
          z-index:982!important;
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

        .fw-mobile-nav-menu a.fw-mobile-reload-link{
          margin-top:4px!important;
          border-top:1px solid rgba(246,246,240,.14)!important;
          color:rgba(246,246,240,.72)!important;
        }

        .fw-toast{
          position:fixed!important;
          left:50%!important;
          right:auto!important;
          top:auto!important;
          bottom:calc(var(--fw-mobile-tabbar-height, 78px) + env(safe-area-inset-bottom, 0px) + 16px)!important;
          width:max-content!important;
          max-width:min(320px, calc(100vw - 32px))!important;
          padding:10px 14px!important;
          box-sizing:border-box!important;
          white-space:normal!important;
          text-align:center!important;
          line-height:1.45!important;
          transform:translateX(-50%) translateY(10px)!important;
          pointer-events:none!important;
          z-index:981!important;
        }

        .fw-toast.show{
          transform:translateX(-50%) translateY(0)!important;
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

  function firstById(id){
    var nodes = $$('[id="' + id + '"]');
    nodes.slice(1).forEach(function(node){ node.remove(); });
    return nodes[0] || null;
  }

  function findHeader(){
    return $('.header') || $('.site-header') || $('header');
  }

  function ensureStrip(){
    var current = firstById('fw-mobile-compact-strip');
    if(current) return current;

    var header = findHeader();
    if(!header || !header.parentNode) return null;

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
    return strip;
  }

  function ensureTabbar(){
    var current = firstById('fw-mobile-tabbar');
    if(current) return current;
    if(!document.body) return null;

    var bar = document.createElement('nav');
    bar.id = 'fw-mobile-tabbar';
    bar.className = 'fw-mobile-tabbar';
    bar.setAttribute('aria-label', '手机底部导航');
    bar.innerHTML = `
      <button type="button" class="fw-mobile-tab" data-fw-mobile-tab="nav" aria-controls="fw-mobile-nav-menu" aria-expanded="false">${icon('nav')}<span>导航</span></button>
      <button type="button" class="fw-mobile-tab" data-fw-mobile-tab="buddy">${icon('buddy')}<span>搭子</span><span class="fw-mobile-action-badge" data-fw-mobile-badge="buddy"></span></button>
      <button type="button" class="fw-mobile-tab" data-fw-mobile-tab="echo">${icon('echo')}<span>回声</span><span class="fw-mobile-action-badge" data-fw-mobile-badge="echo"></span></button>
      <button type="button" class="fw-mobile-tab" data-fw-mobile-tab="me">${icon('me')}<span>我的</span></button>
    `;

    document.body.appendChild(bar);
    return bar;
  }

  function ensureNavMenu(){
    var menu = firstById('fw-mobile-nav-menu');
    if(menu) return menu;
    if(!document.body) return null;

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
    }).join('') + '<a class="fw-mobile-reload-link" href="#" data-fw-mobile-reload>重新加载</a>';

    document.body.appendChild(menu);
    return menu;
  }

  function setNavMenu(open){
    var menu = ensureNavMenu();
    var btn = $('[data-fw-mobile-tab="nav"]');
    if(!menu) return;

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
    if(!menu) return;
    setNavMenu(!menu.classList.contains('show'));
  }

  function closeNavMenu(){
    var menu = $('#fw-mobile-nav-menu');
    if(menu && menu.classList.contains('show')) setNavMenu(false);
  }

  function isMobileNavOwned(el){
    return !!(el && (el.closest('#fw-mobile-compact-strip') || el.closest('#fw-mobile-tabbar') || el.closest('#fw-mobile-nav-menu')));
  }

  function isDisabledEntry(el){
    return !!(el && (el.disabled || el.getAttribute('aria-disabled') === 'true'));
  }

  function isVisibleEntry(el){
    if(!el || !el.isConnected || el.hidden || isDisabledEntry(el)) return false;
    if(el.closest('[hidden], [aria-hidden="true"]')) return false;

    var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if(style && (style.display === 'none' || style.visibility === 'hidden')) return false;

    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function entryCandidates(selector){
    return $$(selector).filter(function(el){
      return el && el.isConnected && !isMobileNavOwned(el) && !isDisabledEntry(el);
    });
  }

  function findEntry(selector){
    var entries = entryCandidates(selector);
    return entries.find(isVisibleEntry) || entries[0] || null;
  }

  function clickEntry(el){
    if(!el) return false;
    el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
    return true;
  }

  function isPanelOpen(kind){
    if(kind === 'buddy') return !!$('[data-fw-wx-buddy-modal].show, .fw-wx-modal.show');
    return !!$('[data-fw-stable-echo-modal].show, .fw-stable-echo-modal.show, [data-fw-mobile-echo-modal].show, .fw-mobile-echo-modal.show');
  }

  function ensureBuddyPanelShell(){
    var modal = $('[data-fw-wx-buddy-modal], .fw-wx-modal');
    if(modal && modal.querySelector('[data-fw-wx-panel], .fw-wx-panel')) return modal;
    if(!document.body) return null;

    modal = document.createElement('div');
    modal.className = 'fw-wx-modal';
    modal.dataset.fwWxBuddyModal = '1';
    modal.innerHTML = `
      <div class="fw-wx-panel" data-fw-wx-panel>
        <header class="fw-wx-head">
          <div class="fw-wx-title"><small>BUDDY CENTER</small><h2>搭子中心</h2></div>
          <div class="fw-wx-tools"><button class="fw-wx-tool" data-fw-wx-reset type="button">复位</button><button class="fw-wx-close" data-fw-wx-close type="button">×</button></div>
        </header>
        <div class="fw-wx-shell">
          <aside class="fw-wx-left">
            <div class="fw-wx-search"><form data-fw-wx-search><input name="q" placeholder="搜索实验品编号 / 昵称 / 完整邮箱"><button type="submit">搜索</button></form></div>
            <div class="fw-wx-tabs"><button class="fw-wx-tab active" data-fw-wx-tab="friends">我的搭子</button><button class="fw-wx-tab" data-fw-wx-tab="incoming">收到申请</button><button class="fw-wx-tab" data-fw-wx-tab="outgoing">发出申请</button></div>
            <div class="fw-wx-list" data-fw-wx-list><div class="fw-wx-empty">正在恢复搭子列表...</div></div>
          </aside>
          <section class="fw-wx-right">
            <div class="fw-wx-chat-head"><div><button class="fw-wx-back-list" data-fw-wx-back-list type="button">← 返回搭子列表</button><h3 data-fw-wx-chat-title>选择一个搭子</h3><span data-fw-wx-chat-sub>左侧点一个搭子，右侧开始低功耗私聊。</span></div></div>
            <div class="fw-wx-messages" data-fw-wx-messages><div class="fw-wx-empty">还没有选择聊天对象。</div></div>
            <form class="fw-wx-compose" data-fw-wx-compose><input name="message" maxlength="300" autocomplete="off" placeholder="说一句只给搭子看的话，最多 300 字..."><button type="submit">发送</button></form>
          </section>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function ensureEchoPanelShell(){
    var modal = $('[data-fw-stable-echo-modal], .fw-stable-echo-modal, [data-fw-mobile-echo-modal], .fw-mobile-echo-modal');
    if(modal) return modal;
    if(!document.body) return null;

    modal = document.createElement('div');
    modal.className = 'fw-stable-echo-modal';
    modal.dataset.fwStableEchoModal = '1';
    modal.innerHTML = '<section class="fw-stable-echo-panel" role="dialog" aria-modal="false" aria-label="回声"><header class="fw-stable-echo-head"><div><small>ECHO CENTER</small><h2>回声</h2></div><button class="fw-stable-echo-close" type="button" data-fw-stable-echo-close>×</button></header><div class="fw-stable-echo-body" data-fw-stable-echo-body><div class="fw-stable-echo-empty">正在读取回声...</div></div></section>';
    document.body.appendChild(modal);
    return modal;
  }

  function openExistingBuddyPanel(){
    var modal = ensureBuddyPanelShell();
    if(!modal || !modal.querySelector('[data-fw-wx-panel], .fw-wx-panel')) return false;
    modal.classList.add('show');
    modal.classList.remove('fw-wx-mobile-chatting');
    if(document.body) document.body.classList.add('fw-wx-modal-open');
    var list = $('[data-fw-wx-list]', modal);
    if(list && !String(list.innerHTML || '').trim()) list.innerHTML = '<div class="fw-wx-empty">正在恢复搭子列表...</div>';
    debug('openBuddy direct panel');
    return true;
  }

  function openExistingEchoPanel(){
    var modal = ensureEchoPanelShell();
    if(!modal) return false;
    modal.classList.add('show');
    var body = $('[data-fw-stable-echo-body], [data-fw-mobile-echo-body]', modal);
    if(body && !String(body.innerHTML || '').trim()) body.innerHTML = '<div class="fw-stable-echo-empty">正在读取回声...</div>';
    debug('openEcho direct panel');
    return true;
  }

  function ensureActionNamespace(reason){
    var api = window.FWMobileActions = window.FWMobileActions || {};

    if(typeof api.openBuddy !== 'function' || api.openBuddy.__fwMobileNavFallback){
      api.openBuddy = function(){
        var opened = openExistingBuddyPanel();
        setTimeout(function(){ triggerOriginal('buddy'); }, 0);
        return opened;
      };
      api.openBuddy.__fwMobileNavFallback = true;
    }

    if(typeof api.openEcho !== 'function' || api.openEcho.__fwMobileNavFallback){
      api.openEcho = function(){
        var opened = openExistingEchoPanel();
        if(typeof window.fwOpenStableEcho === 'function'){
          setTimeout(function(){
            debug('openEcho direct function fwOpenStableEcho');
            window.fwOpenStableEcho();
          }, 0);
          return true;
        }
        setTimeout(function(){ triggerOriginal('echo'); }, 0);
        return opened;
      };
      api.openEcho.__fwMobileNavFallback = true;
    }

    debug('check openers', {
      reason: reason || 'manual',
      openBuddy: typeof api.openBuddy === 'function',
      openEcho: typeof api.openEcho === 'function',
      stableEcho: typeof window.fwOpenStableEcho === 'function'
    });

    return api;
  }

  function callDirectAction(kind){
    var api = ensureActionNamespace('click-' + kind);
    var fn = kind === 'buddy' ? api.openBuddy : api.openEcho;
    if(typeof fn !== 'function') return false;

    try{
      debug(kind === 'buddy' ? 'openBuddy via direct function' : 'openEcho via direct function');
      return fn() !== false;
    }catch(e){
      debug(kind === 'buddy' ? 'openBuddy direct failed' : 'openEcho direct failed', e && e.message ? e.message : e);
      return false;
    }
  }

  function triggerOriginal(kind){
    var selector = kind === 'buddy' ? '[data-fw-open-buddy]' : '[data-fw-open-echo]';
    debug(kind === 'buddy' ? 'openBuddy via fallback click' : 'openEcho via fallback click');
    return clickEntry(findEntry(selector));
  }

  function markActiveWhenOpen(kind, message, source){
    var tries = 0;
    var delays = [80, 260, 700, 1400];

    function check(){
      if(isPanelOpen(kind)){
        setActiveTab(kind);
        debug(kind + ' opened', source || 'unknown');
        return;
      }

      if(tries >= delays.length){
        setActiveTab('');
        showMobileHint(message);
        debug(kind + ' open failed', source || 'unknown');
        return;
      }

      setTimeout(check, delays[tries]);
      tries += 1;
    }

    check();
  }

  function triggerOriginalWithRetry(kind, message){
    var attempt = 0;

    function run(){
      if(callDirectAction(kind)){
        markActiveWhenOpen(kind, message, 'direct');
        return;
      }

      if(triggerOriginal(kind)){
        markActiveWhenOpen(kind, message, 'fallback-click');
        return;
      }

      if(attempt >= entryRetryDelays.length){
        setActiveTab('');
        showMobileHint(message);
        debug(kind + ' opener missing');
        return;
      }

      setTimeout(run, entryRetryDelays[attempt]);
      attempt += 1;
    }

    run();
  }

  function openMine(){
    var selectors = [
      '.fw-userbar [data-fw-open], .fw-userbar .fw-login-pill, .fw-userbar button',
      '[data-login-cta], [data-sb-open], [data-fw-open]'
    ];

    for(var i = 0; i < selectors.length; i += 1){
      var entry = findEntry(selectors[i]);
      if(clickEntry(entry)) return true;
    }

    return false;
  }

  function openMineWithRetry(){
    var attempt = 0;

    function run(){
      if(openMine()) return;

      if(attempt >= entryRetryDelays.length){
        showMobileHint('账号入口还没加载完成，请稍后再点。');
        return;
      }

      setTimeout(run, entryRetryDelays[attempt]);
      attempt += 1;
    }

    run();
  }

  function ensureToastNode(){
    var nodes = $$('.fw-toast');
    nodes.slice(1).forEach(function(node){ node.remove(); });
    return nodes[0] || null;
  }

  function clearStaleToast(){
    clearTimeout(window.__fwMobileNavToast);
    var t = ensureToastNode();
    if(t) t.classList.remove('show');
  }

  function showMobileHint(message){
    var t = ensureToastNode();
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }

    t.textContent = message;
    t.classList.add('show');
    clearTimeout(window.__fwMobileNavToast);
    window.__fwMobileNavToast = setTimeout(function(){ t.classList.remove('show'); }, 2400);
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
    var el = findEntry(selector);
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
    $$('[data-fw-mobile-open="' + kind + '"], [data-fw-mobile-tab="' + kind + '"]').forEach(function(btn){
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

  function openSocialFromTab(kind){
    closeNavMenu();
    setActiveTab('');
    scheduleQuickBadgeSync(kind);

    triggerOriginalWithRetry(
      kind,
      kind === 'buddy' ? '搭子功能还没加载完成，请稍后再点。' : '回声功能还没加载完成，请稍后再点。'
    );
  }

  function bindMobileNavActions(){
    if(mobileShellBound) return;
    mobileShellBound = true;

    document.addEventListener('click', function(e){
      var menu = $('#fw-mobile-nav-menu');
      var reloadLink = e.target.closest && e.target.closest('[data-fw-mobile-reload]');

      if(reloadLink){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        closeNavMenu();
        window.location.reload();
        return;
      }

      var menuLink = e.target.closest && e.target.closest('#fw-mobile-nav-menu a');

      if(menuLink){
        closeNavMenu();
        return;
      }

      var navTab = e.target.closest && e.target.closest('[data-fw-mobile-tab="nav"]');
      if(menu && menu.classList.contains('show') && !menu.contains(e.target) && !navTab){
        closeNavMenu();
      }

      var tab = e.target.closest && e.target.closest('[data-fw-mobile-tab]');
      if(tab){
        var kind = tab.dataset.fwMobileTab;

        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();

        if(kind === 'nav'){
          toggleNavMenu();
          return;
        }

        if(kind === 'buddy' || kind === 'echo'){
          openSocialFromTab(kind);
          return;
        }

        closeNavMenu();
        setActiveTab(kind);

        if(kind === 'me'){
          openMineWithRetry();
        }
        return;
      }

      var openBtn = e.target.closest && e.target.closest('[data-fw-mobile-open]');
      if(openBtn){
        var openKind = openBtn.dataset.fwMobileOpen;

        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();

        if(openKind === 'buddy' || openKind === 'echo'){
          openSocialFromTab(openKind);
        }
      }
    }, true);

    window.addEventListener('resize', function(){ scheduleMobileShellRefresh('resize', 80); });

    window.addEventListener('scroll', function(){
      closeNavMenu();
    }, {passive:true});

    window.addEventListener('pageshow', function(){ scheduleMobileShellRefresh('pageshow', 80); });
    window.addEventListener('focus', function(){ scheduleMobileShellRefresh('focus', 120); });
    window.addEventListener('online', function(){ scheduleMobileShellRefresh('online', 120); });

    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible') scheduleMobileShellRefresh('visible', 80);
    });
  }

  function startBadgeTimer(){
    clearInterval(badgeTimer);
    badgeTimer = setInterval(syncBadgesFromOriginal, 5000);
  }

  function startObserver(){
    if(mobileShellObserver || !document.body) return;

    mobileShellObserver = new MutationObserver(function(){
      clearTimeout(observerTimer);
      observerTimer = setTimeout(function(){
        ensureStrip();
        ensureTabbar();
        ensureNavMenu();
        syncBadgesFromOriginal();
      }, 120);
    });

    mobileShellObserver.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
  }

  function refreshMobileShell(reason){
    if(!document.body) return;

    injectStyle();
    firstById('fw-mobile-compact-strip');
    firstById('fw-mobile-tabbar');
    firstById('fw-mobile-nav-menu');
    ensureStrip();
    ensureTabbar();
    ensureNavMenu();
    ensureActionNamespace(reason || 'refresh');
    closeNavMenu();
    clearStaleToast();
    bindMobileNavActions();
    startBadgeTimer();
    startObserver();
    setTimeout(syncBadgesFromOriginal, 80);
  }

  function scheduleMobileShellRefresh(reason, delay){
    clearTimeout(shellRefreshTimer);
    shellRefreshTimer = setTimeout(function(){
      refreshMobileShell(reason);
    }, delay || 60);
  }

  function initMobileShell(){
    refreshMobileShell('boot');
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMobileShell);
  else initMobileShell();
})();