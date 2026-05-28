// F.w 研究所：观鸟台移动端文案、指南入口与手势返回补丁
(function(){
  var bound = false;
  var swipeBound = false;
  var touchState = null;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function app(){ return window.FWApp || null; }

  function injectStyle(){
    if(document.getElementById('fwMobileBirdTweaksStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileBirdTweaksStyle';
    style.textContent = [
      '.bird-main-head h1{font-size:38px;line-height:1.05;letter-spacing:-.04em}',
      '.bird-main-head p{margin:9px 0 0;color:var(--accent-dark);font-size:14px;line-height:1.35;font-weight:1000;letter-spacing:.08em}',
      '.mobile-bird-guide-view .module-card{padding:18px 18px 20px}',
      '.mobile-bird-guide-view .module-card h2{margin:0 0 12px;font-size:24px;line-height:1.18;font-weight:1000}',
      '.mobile-bird-guide-view .module-card p{margin:0 0 14px;color:var(--muted);font-size:16px;line-height:1.65;font-weight:850}',
      '.mobile-bird-guide-view .module-card ol{margin:12px 0 0;padding-left:22px;color:var(--muted);font-size:15px;line-height:1.7;font-weight:900}',
      '.mobile-bird-guide-view .module-card li{margin:4px 0}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureGuideView(){
    var main = $('#appMain');
    if(!main || $('[data-app-view="bird-guide"]')) return;
    var section = document.createElement('section');
    section.className = 'app-view mobile-bird-guide-view';
    section.dataset.appView = 'bird-guide';
    section.setAttribute('aria-label', '观鸟指南');
    section.innerHTML = [
      '<div class="view-head">',
        '<button class="back-btn" type="button" data-mobile-bird-guide-back>‹ 观鸟台</button>',
        '<p>观鸟指南</p>',
        '<h1>林子大了，什么鸟都有</h1>',
      '</div>',
      '<div class="module-card bird-guide-card">',
        '<h2>林子大了，什么鸟都有</h2>',
        '<p>这里收录生活和职场里的奇异样本。请匿名观察，文明记录，不要实名攻击。</p>',
        '<ol>',
          '<li>不写真姓名、手机号、住址、公司全称。</li>',
          '<li>不上传他人清晰正脸、工牌、车牌等可识别信息。</li>',
          '<li>可以吐槽行为，不要煽动攻击个人。</li>',
        '</ol>',
      '</div>'
    ].join('');
    var bird = $('[data-app-view="bird"]');
    if(bird && bird.nextSibling) main.insertBefore(section, bird.nextSibling);
    else main.appendChild(section);
  }

  function applyBirdCopy(){
    var navBird = $('[data-app-open="bird"] span');
    if(navBird) navBird.textContent = '离谱八卦分享';

    var bird = $('[data-app-view="bird"]');
    var head = bird && $('.view-head', bird);
    if(head){
      head.classList.add('bird-main-head');
      var kicker = $('p', head);
      var title = $('h1', head);
      if(title) title.textContent = '观鸟台';
      if(kicker) kicker.textContent = '离谱八卦分享';
      if(title && kicker && title.compareDocumentPosition(kicker) & Node.DOCUMENT_POSITION_FOLLOWING){
        head.insertBefore(title, kicker);
      }
    }

    var rule = bird && $('.bird-rule-mini', bird);
    if(rule) rule.hidden = true;

    var guideBtn = bird && $('[data-mobile-bird-refresh]', bird);
    if(guideBtn){
      guideBtn.textContent = '观鸟指南';
      guideBtn.removeAttribute('data-mobile-bird-refresh');
      guideBtn.setAttribute('data-mobile-bird-guide', '');
    }
  }

  function goBackFromBird(view){
    var fw = app();
    if(!fw || !fw.setView) return;
    if(view === 'bird'){
      fw.setView('nav');
      return;
    }
    if(view === 'bird-detail' && window.FWAppBird && window.FWAppBird.backToBird){
      window.FWAppBird.backToBird();
      return;
    }
    fw.setView('bird');
  }

  function bindSwipeBack(){
    if(swipeBound) return;
    var main = $('#appMain');
    if(!main) return;
    swipeBound = true;
    main.addEventListener('touchstart', function(e){
      var fw = app();
      var view = fw && fw.state && fw.state.view;
      if(['bird','bird-detail','bird-compose','bird-guide'].indexOf(view) < 0) return;
      var touch = e.touches && e.touches[0];
      if(!touch || touch.clientX > 42) return;
      touchState = {x:touch.clientX, y:touch.clientY, view:view};
    }, {passive:true});
    main.addEventListener('touchend', function(e){
      if(!touchState) return;
      var touch = e.changedTouches && e.changedTouches[0];
      if(!touch){ touchState = null; return; }
      var dx = touch.clientX - touchState.x;
      var dy = Math.abs(touch.clientY - touchState.y);
      var view = touchState.view;
      touchState = null;
      if(dx < 72 || dy > 55) return;
      goBackFromBird(view);
    }, {passive:true});
  }

  function bindGuideButton(){
    if(bound) return;
    bound = true;
    document.addEventListener('click', function(e){
      var guide = e.target.closest && e.target.closest('[data-mobile-bird-guide]');
      if(guide){
        e.preventDefault();
        var fw = app();
        if(fw && fw.setView) fw.setView('bird-guide');
        return;
      }
      var back = e.target.closest && e.target.closest('[data-mobile-bird-guide-back]');
      if(back){
        e.preventDefault();
        var fwBack = app();
        if(fwBack && fwBack.setView) fwBack.setView('bird');
      }
    });
  }

  function run(){
    injectStyle();
    ensureGuideView();
    applyBirdCopy();
    bindGuideButton();
    bindSwipeBack();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
