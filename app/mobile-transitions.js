// F.w 研究所：手机端 PWA 轻量转场动画
// 只负责页面切换动画和按钮按压反馈；左滑返回统一交给 mobile-swipe-back.js。
(function(){
  if(window.__FW_MOBILE_TRANSITIONS__) return;
  window.__FW_MOBILE_TRANSITIONS__ = true;

  var CLEAN_MS = 390;
  var lastView = '';
  var patched = false;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function app(){ return window.FWApp || null; }
  function reduceMotion(){ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function takeSkipNextViewMotion(){
    var skip = !!window.__FW_MOBILE_SKIP_NEXT_VIEW_MOTION__;
    if(skip) window.__FW_MOBILE_SKIP_NEXT_VIEW_MOTION__ = false;
    return skip;
  }

  function currentView(){
    var fw = app();
    if(fw && fw.state && fw.state.view) return fw.state.view;
    var active = $('[data-app-view].is-active');
    return active && active.dataset ? active.dataset.appView : '';
  }

  function activeView(){ return $('[data-app-view].is-active'); }

  function cssEscape(value){
    if(window.CSS && CSS.escape) return CSS.escape(String(value || ''));
    return String(value || '').replace(/"/g, '\\"');
  }

  function injectStyle(){
    if($('#fwMobileTransitionsStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileTransitionsStyle';
    style.textContent = [
      'html.fw-mobile-motion-ready .app-view.is-active.fw-view-enter-forward{animation:fwViewEnterForward 320ms cubic-bezier(.18,.82,.22,1) both}',
      'html.fw-mobile-motion-ready .app-view.is-active.fw-view-enter-back{animation:fwViewEnterBack 290ms cubic-bezier(.18,.82,.22,1) both}',
      'html.fw-mobile-motion-ready .app-view.is-active.fw-view-enter-tab{animation:fwViewEnterTab 310ms cubic-bezier(.18,.82,.22,1) both}',
      'html.fw-mobile-motion-ready button,html.fw-mobile-motion-ready .app-btn,html.fw-mobile-motion-ready [role="button"]{transition:transform 170ms ease,filter 170ms ease,box-shadow 220ms ease}',
      'html.fw-mobile-motion-ready .fw-pressing{transform:scale(.975)!important;filter:brightness(.985)}',
      'html.fw-mobile-motion-ready .app-tabbar button{transition:none!important}',
      'html.fw-mobile-motion-ready .app-tabbar button.fw-pressing{transform:none!important;filter:none!important}',
      '@keyframes fwViewEnterForward{0%{opacity:.01;transform:translate3d(18px,0,0)}100%{opacity:1;transform:translate3d(0,0,0)}}',
      '@keyframes fwViewEnterBack{0%{opacity:.01;transform:translate3d(-14px,0,0)}100%{opacity:1;transform:translate3d(0,0,0)}}',
      '@keyframes fwViewEnterTab{0%{opacity:.01;transform:translate3d(0,8px,0)}100%{opacity:1;transform:translate3d(0,0,0)}}',
      '@media (prefers-reduced-motion:reduce){html.fw-mobile-motion-ready .app-view.is-active.fw-view-enter-forward,html.fw-mobile-motion-ready .app-view.is-active.fw-view-enter-back,html.fw-mobile-motion-ready .app-view.is-active.fw-view-enter-tab{animation:none!important}html.fw-mobile-motion-ready button,html.fw-mobile-motion-ready .app-btn,html.fw-mobile-motion-ready [role="button"]{transition:none!important}}'
    ].join('\n');
    document.head.appendChild(style);
    if(!reduceMotion()) document.documentElement.classList.add('fw-mobile-motion-ready');
  }

  function tabForView(view){
    return (view === 'buddy' || view === 'echo' || view === 'profile') ? view : 'nav';
  }

  function parentOf(view){
    return {
      'square-detail':'square',
      'rooms-compose':'rooms',
      'bird-detail':'bird',
      'bird-compose':'bird',
      'bird-guide':'bird'
    }[view] || '';
  }

  function transitionType(from, to){
    if(!from || from === to) return '';
    if(to === parentOf(from)) return 'back';
    if(to === 'nav' && from !== 'nav') return 'back';
    if(from === 'nav' && to !== 'nav') return 'forward';
    if(tabForView(from) !== tabForView(to)) return 'tab';
    return 'forward';
  }

  function animateView(viewName, type){
    if(reduceMotion() || !viewName || !type) return;
    var view = $('[data-app-view="' + cssEscape(viewName) + '"].is-active') || activeView();
    if(!view) return;
    view.classList.remove('fw-view-enter-forward','fw-view-enter-back','fw-view-enter-tab');
    void view.offsetWidth;
    view.classList.add('fw-view-enter-' + type);
    clearTimeout(view.__fwTransitionTimer);
    view.__fwTransitionTimer = setTimeout(function(){
      view.classList.remove('fw-view-enter-forward','fw-view-enter-back','fw-view-enter-tab');
    }, CLEAN_MS);
  }

  function patchSetView(){
    var fw = app();
    if(patched || !fw || typeof fw.setView !== 'function') return false;
    var original = fw.setView;
    fw.setView = function(name){
      var from = currentView() || lastView;
      var skipMotion = takeSkipNextViewMotion();
      var result = original.apply(this, arguments);
      var to = currentView() || name || '';
      var type = skipMotion ? '' : transitionType(from, to);
      lastView = to;
      if(type) requestAnimationFrame(function(){ animateView(to, type); });
      return result;
    };
    patched = true;
    lastView = currentView() || '';
    return true;
  }

  function schedulePatch(){
    if(patchSetView()) return;
    [0, 80, 240, 700, 1500].forEach(function(delay){ setTimeout(patchSetView, delay); });
  }

  function bindPressFeedback(){
    document.addEventListener('pointerdown', function(event){
      if(reduceMotion()) return;
      var node = event.target && event.target.closest && event.target.closest('button,.app-btn,[role="button"]');
      if(!node || node.disabled) return;
      if(node.closest && node.closest('.app-tabbar')) return;
      node.classList.add('fw-pressing');
      clearTimeout(node.__fwPressTimer);
      node.__fwPressTimer = setTimeout(function(){ node.classList.remove('fw-pressing'); }, 280);
    }, true);

    ['pointerup','pointercancel','pointerleave','blur'].forEach(function(type){
      document.addEventListener(type, function(event){
        var node = event.target && event.target.closest && event.target.closest('button,.app-btn,[role="button"]');
        if(node) node.classList.remove('fw-pressing');
      }, true);
    });
  }

  function boot(){
    injectStyle();
    schedulePatch();
    bindPressFeedback();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();