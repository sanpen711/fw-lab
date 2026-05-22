// F.w 研究所：PWA 基础注册与安装入口
(function(){
  var savedPrompt = null;
  var installInFlight = false;
  var installed = false;

  var IOS_GUIDE = 'Safari 分享 → 添加到主屏幕';
  var DESKTOP_HINT = '可使用 Microsoft Edge 打开本站，并点击地址栏安装图标';
  var MOBILE_HINT = '请用手机系统浏览器或 Edge 打开本站，在浏览器菜单中选择‘添加到桌面’。';

  function $$(selector){
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  function setHidden(el, hidden){
    if(!el) return;
    if(hidden) el.setAttribute('hidden', '');
    else el.removeAttribute('hidden');
  }

  function isHome(){
    var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    return page === '' || page === 'index.html';
  }

  function isStandalone(){
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }

  function isIosDevice(){
    var ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isMobile(){
    var ua = navigator.userAgent || '';
    return (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) || /android|iphone|ipad|ipod|mobile/i.test(ua);
  }

  function injectInstallStyle(){
    if(document.getElementById('fw-pwa-install-style')) return;

    var style = document.createElement('style');
    style.id = 'fw-pwa-install-style';
    style.textContent = [
      '[data-fw-pwa-install][hidden],.fw-pwa-mobile-install[hidden],.fw-pwa-install-hint[hidden]{display:none!important}',
      '.fw-pwa-install-btn{min-height:38px;padding:0 16px;border-radius:999px;border:1px solid rgba(246,246,240,.5);background:rgba(246,246,240,.1);color:var(--white);font-size:13px;font-weight:950;white-space:nowrap}',
      '.fw-pwa-install-btn:not([aria-disabled="true"]):hover{background:var(--accent);border-color:var(--accent)}',
      '.fw-pwa-install-btn.is-install-hint{max-width:290px;min-height:38px;height:auto;padding:7px 14px;line-height:1.35;white-space:normal;text-align:left;cursor:default;background:rgba(246,246,240,.08);border-color:rgba(246,246,240,.28)}',
      '.fw-pwa-install-btn.is-ios-guide{max-width:230px;text-align:center}',
      '.fw-pwa-mobile-install{margin:18px 0 0;max-width:430px;padding:12px 14px;border:1px solid rgba(246,246,240,.24);background:rgba(246,246,240,.09);backdrop-filter:blur(10px)}',
      '.fw-pwa-mobile-install-btn{width:100%;min-height:48px;border:0;border-radius:999px;background:var(--accent);color:var(--white);font-size:15px;font-weight:1000}',
      '.fw-pwa-install-hint{margin:0;color:var(--white);font-size:13px;line-height:1.45;font-weight:900;text-align:center}',
      '@media(min-width:761px){.fw-pwa-mobile-install{display:none!important}}',
      '@media(max-width:760px){.fw-pwa-install-nav{display:none!important}.fw-pwa-mobile-install:not([hidden]){display:block!important}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureInstallEntrypoints(){
    if(!isHome()) return;

    injectInstallStyle();

    var header = document.querySelector('.header');
    if(header && !header.querySelector('[data-fw-pwa-install-nav]')){
      var navBtn = document.createElement('button');
      navBtn.className = 'fw-pwa-install-btn fw-pwa-install-nav';
      navBtn.type = 'button';
      navBtn.textContent = '安装应用';
      navBtn.setAttribute('data-fw-pwa-install', '');
      navBtn.setAttribute('data-fw-pwa-install-nav', '');
      navBtn.setAttribute('hidden', '');

      var userbar = header.querySelector('.fw-userbar');
      var menu = header.querySelector('.menu-btn');
      header.insertBefore(navBtn, userbar || menu || null);
    }

    placeNavButton();

    var hero = document.querySelector('.home-hero-clean > div') || document.querySelector('.home-hero-clean');
    if(hero && !document.querySelector('[data-fw-pwa-mobile-install]')){
      var box = document.createElement('div');
      box.className = 'fw-pwa-mobile-install';
      box.setAttribute('data-fw-pwa-mobile-install', '');
      box.setAttribute('hidden', '');
      box.innerHTML = '<button class="fw-pwa-mobile-install-btn" type="button" data-fw-pwa-install hidden>添加到桌面</button><p class="fw-pwa-install-hint" data-fw-pwa-install-hint hidden></p>';

      var actions = hero.querySelector('.hero-actions');
      if(actions) hero.insertBefore(box, actions);
      else hero.appendChild(box);
    }
  }

  function placeNavButton(){
    var btn = document.querySelector('[data-fw-pwa-install-nav]');
    if(!btn) return;

    var header = btn.closest('.header');
    if(!header) return;

    var userbar = header.querySelector('.fw-userbar');
    var menu = header.querySelector('.menu-btn');

    if(userbar && btn.nextElementSibling !== userbar){
      header.insertBefore(btn, userbar);
    }else if(!userbar && menu && btn.nextElementSibling !== menu){
      header.insertBefore(btn, menu);
    }
  }

  function setInstallButtons(mode, hintText){
    $$('[data-fw-pwa-install]').forEach(function(btn){
      var isNav = btn.hasAttribute('data-fw-pwa-install-nav');
      var disabled = mode === 'hint' || mode === 'ios';

      btn.classList.toggle('is-install-hint', mode === 'hint');
      btn.classList.toggle('is-ios-guide', mode === 'ios');

      if(mode === 'prompt'){
        btn.textContent = isNav ? '安装应用' : '添加到桌面';
        btn.removeAttribute('aria-disabled');
      }else{
        btn.textContent = hintText || (isNav ? '安装应用' : '添加到桌面');
        if(disabled) btn.setAttribute('aria-disabled', 'true');
        else btn.removeAttribute('aria-disabled');
      }
    });
  }

  function updateInstallUI(){
    ensureInstallEntrypoints();

    var standalone = installed || isStandalone();
    var promptReady = !standalone && !!savedPrompt;
    var iosGuide = !standalone && !promptReady && isIosDevice();
    var mobile = isMobile();
    var mobileHint = !standalone && !promptReady && !iosGuide && mobile;
    var desktopHint = !standalone && !promptReady && !iosGuide && !mobile;
    var hintText = iosGuide ? IOS_GUIDE : (mobileHint ? MOBILE_HINT : (desktopHint ? DESKTOP_HINT : ''));
    var mode = promptReady ? 'prompt' : (iosGuide ? 'ios' : ((mobileHint || desktopHint) ? 'hint' : 'hidden'));

    setInstallButtons(mode, hintText);

    $$('[data-fw-pwa-install]').forEach(function(btn){
      var isNav = btn.hasAttribute('data-fw-pwa-install-nav');
      var show = false;

      if(promptReady){
        show = true;
      }else if((iosGuide || desktopHint) && isNav){
        show = true;
      }

      setHidden(btn, !show);
    });

    $$('[data-fw-pwa-mobile-install]').forEach(function(box){
      setHidden(box, !(promptReady || iosGuide || mobileHint));
    });

    $$('[data-fw-pwa-install-hint]').forEach(function(el){
      el.textContent = hintText;
      setHidden(el, !(iosGuide || mobileHint));
    });
  }

  function bindInstallButtons(){
    document.addEventListener('click', function(e){
      var btn = e.target.closest && e.target.closest('[data-fw-pwa-install]');
      if(!btn) return;

      e.preventDefault();

      if(btn.getAttribute('aria-disabled') === 'true'){
        return;
      }

      if(!savedPrompt || installInFlight) return;

      installInFlight = true;

      var promptEvent = savedPrompt;
      promptEvent.prompt();

      Promise.resolve(promptEvent.userChoice)
        .catch(function(){})
        .then(function(){
          savedPrompt = null;
          installInFlight = false;
          updateInstallUI();
        });
    });
  }

  function observeHeader(){
    var header = document.querySelector('.header');
    if(!header || !window.MutationObserver) return;

    var timer = 0;
    var observer = new MutationObserver(function(){
      clearTimeout(timer);
      timer = setTimeout(updateInstallUI, 80);
    });

    observer.observe(header, {childList:true, subtree:false});
  }

  function bootInstallUI(){
    bindInstallButtons();
    updateInstallUI();
    observeHeader();

    document.addEventListener('visibilitychange', function(){
      if(!document.hidden) updateInstallUI();
    });

    if(window.matchMedia){
      var displayMode = window.matchMedia('(display-mode: standalone)');
      if(displayMode.addEventListener) displayMode.addEventListener('change', updateInstallUI);
      else if(displayMode.addListener) displayMode.addListener(updateInstallUI);

      var mobileMode = window.matchMedia('(max-width: 760px)');
      if(mobileMode.addEventListener) mobileMode.addEventListener('change', updateInstallUI);
      else if(mobileMode.addListener) mobileMode.addListener(updateInstallUI);
    }
  }

  if(!isIosDevice()){
    window.addEventListener('beforeinstallprompt', function(e){
      if(isStandalone()) return;
      e.preventDefault();
      savedPrompt = e;
      installed = false;
      updateInstallUI();
    });
  }

  window.addEventListener('appinstalled', function(){
    installed = true;
    savedPrompt = null;
    installInFlight = false;
    updateInstallUI();
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootInstallUI);
  else bootInstallUI();

  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('/service-worker.js').catch(function(err){
        console.warn('[FW PWA] service worker registration failed', err);
      });
    });
  }
})();
