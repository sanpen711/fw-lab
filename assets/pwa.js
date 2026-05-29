// F.w 研究所：PWA 基础注册与安装入口
(function(){
  var savedPrompt = null;
  var installInFlight = false;
  var installed = false;

  var IOS_GUIDE = 'iPhone 用户：点下方分享按钮，再选‘添加到主屏幕’';
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

  function isIosSafari(){
    var ua = navigator.userAgent || '';
    var safari = /safari/i.test(ua) && !/crios|fxios|edgios|opios|duckduckgo|baiduboxapp|baidubrowser|MicroMessenger|MQQBrowser|QQ\/|WeiBo|Weibo|UCBrowser|Quark/i.test(ua);
    return isIosDevice() && safari;
  }

  function isMobile(){
    var ua = navigator.userAgent || '';
    var userAgentMobile = /android|iphone|ipad|ipod|mobile/i.test(ua);
    var userAgentDataMobile = !!(navigator.userAgentData && navigator.userAgentData.mobile);
    var narrowScreen = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    return narrowScreen || userAgentMobile || userAgentDataMobile;
  }

  function isInAppBrowser(){
    var ua = navigator.userAgent || '';
    return /baiduboxapp|baidubrowser|baiduhd|MicroMessenger|QQ\/|MQQBrowser|WeiBo|Weibo|AlipayClient|DingTalk|UCBrowser|Quark|NewsArticle|ToutiaoMicroApp/i.test(ua);
  }

  function isMobileInstallContext(){
    return isMobile() || isIosDevice() || isInAppBrowser();
  }

  function iosShareIcon(){
    return '<span class="fw-pwa-ios-share-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 15V4"></path><path d="M8 8l4-4 4 4"></path><path d="M6 11v8h12v-8"></path></svg></span>';
  }

  function renderInstallHint(el, mode, hintText){
    if(!el) return;
    el.classList.toggle('is-ios-guide', mode === 'ios');
    if(mode === 'ios'){
      el.innerHTML = 'iPhone 用户：点下方' + iosShareIcon() + '分享按钮，再选‘添加到主屏幕’';
    }else{
      el.textContent = hintText;
    }
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
      '.fw-pwa-install-nav{flex:0 0 auto;margin-left:10px;margin-right:10px}',
      '.fw-pwa-mobile-install{margin:18px 0 0;max-width:430px;padding:12px 14px;border:1px solid rgba(246,246,240,.24);background:rgba(246,246,240,.09);backdrop-filter:blur(10px)}',
      '.fw-pwa-mobile-install.is-ios-guide{padding:12px 13px;border-color:rgba(10,132,255,.44);background:rgba(10,132,255,.12)}',
      '.fw-pwa-mobile-install-btn{width:100%;min-height:48px;border:0;border-radius:999px;background:var(--accent);color:var(--white);font-size:15px;font-weight:1000}',
      '.fw-pwa-install-hint{margin:0;color:var(--white);font-size:13px;line-height:1.45;font-weight:900;text-align:center}',
      '.fw-pwa-install-hint.is-ios-guide{display:flex;align-items:center;justify-content:center;gap:4px;flex-wrap:wrap;text-align:center}',
      '.fw-pwa-ios-share-icon{display:inline-flex;align-items:center;justify-content:center;width:21px;height:21px;margin:0 1px;border-radius:6px;background:#0a84ff;color:#fff;vertical-align:middle;flex:0 0 auto}',
      '.fw-pwa-ios-share-icon svg{display:block;width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      '@media(min-width:761px){.fw-pwa-mobile-install:not(.is-mobile-device){display:none!important}}',
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
      var actions = header.querySelector('.fw-social-actions');
      var menu = header.querySelector('.menu-btn');

      if(userbar) header.insertBefore(navBtn, userbar);
      else if(actions && actions.nextSibling) header.insertBefore(navBtn, actions.nextSibling);
      else if(menu) header.insertBefore(navBtn, menu);
      else header.appendChild(navBtn);
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
    var actions = header.querySelector('.fw-social-actions');
    var menu = header.querySelector('.menu-btn');

    if(actions && userbar && (actions.nextElementSibling !== btn || btn.nextElementSibling !== userbar)){
      header.insertBefore(btn, userbar);
    }else if(userbar && btn.nextElementSibling !== userbar){
      header.insertBefore(btn, userbar);
    }else if(actions && !userbar && actions.nextElementSibling !== btn){
      header.insertBefore(btn, actions.nextSibling);
    }else if(!actions && !userbar && menu && btn.nextElementSibling !== menu){
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
    var mobile = !standalone && isMobileInstallContext();
    var iosGuide = !standalone && !promptReady && isIosSafari();
    var mobileHint = !standalone && !promptReady && !iosGuide && mobile;
    var desktopHint = !standalone && !promptReady && !iosGuide && !mobile;
    var hintText = iosGuide ? IOS_GUIDE : (mobileHint ? MOBILE_HINT : (desktopHint ? DESKTOP_HINT : ''));
    var mode = promptReady ? 'prompt' : (iosGuide ? 'ios' : ((mobileHint || desktopHint) ? 'hint' : 'hidden'));

    setInstallButtons(mode, hintText);

    $$('[data-fw-pwa-install]').forEach(function(btn){
      var isNav = btn.hasAttribute('data-fw-pwa-install-nav');
      var show = false;

      if(promptReady){
        show = mobile ? !isNav : isNav;
      }else if((iosGuide || desktopHint) && isNav && !mobile){
        show = true;
      }

      setHidden(btn, !show);
    });

    $$('[data-fw-pwa-mobile-install]').forEach(function(box){
      box.classList.toggle('is-mobile-device', mobile);
      box.classList.toggle('is-ios-guide', iosGuide);
      setHidden(box, !(mobile && (promptReady || iosGuide || mobileHint)));
    });

    $$('[data-fw-pwa-install-hint]').forEach(function(el){
      renderInstallHint(el, mode, hintText);
      setHidden(el, !(mobile && (iosGuide || mobileHint)));
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
      navigator.serviceWorker.register('service-worker.js').catch(function(err){
        console.warn('[FW PWA] service worker registration failed', err);
      });
    });
  }
})();