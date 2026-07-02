// F.w 研究所：下载客户端入口（Windows / IOS / Android）
(function(){
  if(window.__FW_DOWNLOAD_CLIENT_MODAL__) return;
  window.__FW_DOWNLOAD_CLIENT_MODAL__ = true;

  var MODAL_ID = 'fw-download-client-modal';
  var STYLE_ID = 'fw-download-client-style';

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function isStandalone(){
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }

  function getDeviceType(){
    var ua = navigator.userAgent || '';
    if(/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    if(/android/i.test(ua)) return 'android';
    return 'windows';
  }

  function getSiteBase(){
    var script = document.currentScript;
    if(!script){
      var scripts = $$('script[src*="fw-download-client.js"]');
      script = scripts[scripts.length - 1];
    }
    var src = script && script.src ? script.src : new URL('assets/fw-download-client.js', location.href).href;
    return src.replace(/assets\/fw-download-client\.js(?:\?.*)?$/, '');
  }

  var SITE_BASE = getSiteBase();
  var DOWNLOADS = {
    windows: SITE_BASE + 'downloads/fw-lab-windows.exe',
    android: SITE_BASE + 'downloads/fw-lab-android.apk'
  };

  function injectStyle(){
    if(document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '[data-fw-download-client][hidden]{display:none!important}',
      '.fw-download-client-btn{cursor:pointer}',
      '.hero-actions .fw-download-client-btn{border-color:rgba(246,246,240,.72);background:rgba(246,246,240,.16)}',
      '.nav-secondary .fw-download-client-btn{margin-left:8px}',
      '.fw-download-modal[hidden]{display:none!important}',
      '.fw-download-modal{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.58);backdrop-filter:blur(10px)}',
      '.fw-download-panel{width:min(720px,100%);max-height:min(760px,92vh);overflow:auto;border:1px solid rgba(246,246,240,.22);border-radius:28px;background:#10170f;color:#f6f6f0;box-shadow:0 30px 90px rgba(0,0,0,.42)}',
      '.fw-download-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 24px 12px}',
      '.fw-download-head h2{margin:0;font-size:22px;line-height:1.2;color:#f6f6f0}',
      '.fw-download-close{width:38px;height:38px;border:1px solid rgba(246,246,240,.22);border-radius:999px;background:rgba(246,246,240,.08);color:#f6f6f0;font-size:22px;line-height:1;cursor:pointer}',
      '.fw-download-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:14px 24px 24px}',
      '.fw-download-card{display:flex;min-height:174px;flex-direction:column;gap:10px;padding:18px;border:1px solid rgba(246,246,240,.18);border-radius:22px;background:rgba(246,246,240,.07)}',
      '.fw-download-card.is-current{border-color:rgba(246,246,240,.42);background:rgba(246,246,240,.11)}',
      '.fw-download-card h3{margin:0;font-size:20px;line-height:1.15;color:#f6f6f0}',
      '.fw-download-card p{margin:0;color:rgba(246,246,240,.78);font-size:14px;line-height:1.55;font-weight:700}',
      '.fw-download-card .fw-download-spacer{flex:1}',
      '.fw-download-file{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border-radius:999px;background:#f6f6f0;color:#10170f;text-decoration:none;font-weight:1000;font-size:14px}',
      '.fw-download-ios-note{margin-top:auto;padding:12px 13px;border-radius:16px;background:rgba(246,246,240,.08);color:rgba(246,246,240,.86);font-size:14px;line-height:1.55;font-weight:850}',
      'body.fw-download-modal-open{overflow:hidden}',
      '@media(max-width:760px){.fw-download-modal{align-items:flex-end;padding:12px}.fw-download-panel{max-height:86vh;border-radius:24px}.fw-download-head{padding:19px 18px 8px}.fw-download-head h2{font-size:19px}.fw-download-list{grid-template-columns:1fr;padding:12px 18px 18px}.fw-download-card{min-height:auto}.nav-secondary .fw-download-client-btn{margin-left:0;margin-top:8px}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function makeButton(className){
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = '下载客户端';
    btn.setAttribute('data-fw-download-client', '');
    return btn;
  }

  function ensureButton(){
    if(isStandalone()){
      $$('[data-fw-download-client]').forEach(function(btn){ btn.setAttribute('hidden', ''); });
      return;
    }

    var appSecondary = $('.app-shell .nav-secondary');
    if(appSecondary && !appSecondary.querySelector('[data-fw-download-client]')){
      appSecondary.appendChild(makeButton('app-btn fw-download-client-btn'));
    }

    var heroActions = $('.hero-actions');
    if(heroActions && !heroActions.querySelector('[data-fw-download-client]')){
      heroActions.appendChild(makeButton('btn light fw-download-client-btn'));
    }

    $$('[data-fw-download-client]').forEach(function(btn){ btn.removeAttribute('hidden'); });
  }

  function cardHtml(type, current){
    if(type === 'windows'){
      return '<section class="fw-download-card' + (current ? ' is-current' : '') + '"><h3>Windows</h3><p>适用于电脑端使用</p><span class="fw-download-spacer"></span><a class="fw-download-file" href="' + DOWNLOADS.windows + '" download>下载安装包</a></section>';
    }
    if(type === 'ios'){
      return '<section class="fw-download-card' + (current ? ' is-current' : '') + '"><h3>IOS</h3><div class="fw-download-ios-note">使用 Safari 打开本站，点击底部分享按钮，选择“添加到主屏幕”。</div></section>';
    }
    return '<section class="fw-download-card' + (current ? ' is-current' : '') + '"><h3>Android</h3><p>适用于安卓手机</p><span class="fw-download-spacer"></span><a class="fw-download-file" href="' + DOWNLOADS.android + '" download>下载安装包</a></section>';
  }

  function buildModal(){
    var modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'fw-download-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'fw-download-title');
    modal.setAttribute('hidden', '');
    modal.innerHTML = '<div class="fw-download-panel"><div class="fw-download-head"><h2 id="fw-download-title">下载 F.w 研究所客户端</h2><button class="fw-download-close" type="button" data-fw-download-close aria-label="关闭">×</button></div><div class="fw-download-list" data-fw-download-list></div></div>';
    document.body.appendChild(modal);
    return modal;
  }

  function ensureModal(){
    var modal = document.getElementById(MODAL_ID) || buildModal();
    var current = getDeviceType();
    var order = ['windows', 'ios', 'android'];
    if(current === 'ios') order = ['ios', 'windows', 'android'];
    else if(current === 'android') order = ['android', 'windows', 'ios'];
    var list = $('[data-fw-download-list]', modal);
    if(list){
      list.innerHTML = order.map(function(type){ return cardHtml(type, type === current); }).join('');
    }
    return modal;
  }

  function openModal(){
    injectStyle();
    var modal = ensureModal();
    modal.removeAttribute('hidden');
    document.body.classList.add('fw-download-modal-open');
    var close = $('[data-fw-download-close]', modal);
    if(close) close.focus({preventScroll:true});
  }

  function closeModal(){
    var modal = document.getElementById(MODAL_ID);
    if(!modal) return;
    modal.setAttribute('hidden', '');
    document.body.classList.remove('fw-download-modal-open');
  }

  function bind(){
    document.addEventListener('click', function(event){
      var trigger = event.target.closest && event.target.closest('[data-fw-download-client]');
      if(trigger){
        event.preventDefault();
        openModal();
        return;
      }
      if(event.target.closest && event.target.closest('[data-fw-download-close]')){
        event.preventDefault();
        closeModal();
        return;
      }
      var modal = document.getElementById(MODAL_ID);
      if(modal && !modal.hasAttribute('hidden') && event.target === modal){
        closeModal();
      }
    });

    document.addEventListener('keydown', function(event){
      if(event.key === 'Escape') closeModal();
    });
  }

  function start(){
    injectStyle();
    ensureButton();
    bind();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
