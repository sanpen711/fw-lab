// F.w 研究所：手机端 PWA 轻量转场动画
(function(){
  if(window.__FW_MOBILE_TRANSITIONS__) return;
  window.__FW_MOBILE_TRANSITIONS__ = true;

  var ENTER_MS = 320;
  var CLEAN_MS = 390;
  var EDGE_LIMIT = 44;
  var touchState = null;
  var lastView = '';
  var patched = false;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function app(){ return window.FWApp || null; }
  function reduceMotion(){ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function takeSkipNextViewMotion(){
    var skip = !!window.__FW_MOBILE_SKIP_NEXT_VIEW_MOTION__;
    if(skip) window.__FW_MOBILE_SKIP_NEXT_VIEW_MOTION__ = false;
    return skip;
  }
  function scroller(){ return $('#appMain') || document.scrollingElement || document.documentElement; }

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
      'html.fw-mobile-motion-ready .app-view.fw-view-edge-peek{will-change:transform,opacity;transition:none!important}',
      'html.fw-mobile-motion-ready .app-view.fw-view-edge-release{will-change:transform,opacity;transition:transform 250ms cubic-bezier(.18,.82,.22,1),opacity 250ms cubic-bezier(.18,.82,.22,1)!important}',
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
    // 重新触发同名动画。
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

  function isInteractive(target){
    return !!(target && target.closest && target.closest('input,textarea,select,[contenteditable="true"],button,a,label'));
  }

  function isHorizontalArea(target){
    return !!(target && target.closest && target.closest('.status-filter,.status-picks,.rooms-filter,.mobile-admin-tabs,.tabs,.mobile-bird-images,.profile-sticker-grid'));
  }

  function canEdgePreview(view){
    if(!view || view === 'nav') return false;
    return true;
  }

  function clearEdgePreview(node, animated){
    if(!node) return;
    node.classList.remove('fw-view-edge-peek');
    if(animated){
      node.classList.add('fw-view-edge-release');
      node.style.transform = '';
      node.style.opacity = '';
      clearTimeout(node.__fwEdgeTimer);
      node.__fwEdgeTimer = setTimeout(function(){ node.classList.remove('fw-view-edge-release'); }, 270);
    }else{
      node.classList.remove('fw-view-edge-release');
      node.style.transform = '';
      node.style.opacity = '';
    }
  }

  function onTouchStart(event){
    if(reduceMotion()) return;
    if(!event.touches || event.touches.length !== 1) return;
    if(isInteractive(event.target) || isHorizontalArea(event.target)) return;
    var viewName = currentView();
    if(!canEdgePreview(viewName)) return;
    var touch = event.touches[0];
    if(!touch || touch.clientX > EDGE_LIMIT) return;
    var view = activeView();
    var scroll = scroller();
    if(!view) return;
    touchState = {x:touch.clientX,y:touch.clientY,view:view,viewName:viewName,tracking:false,scroll:scroll,scrollTop:scroll ? scroll.scrollTop || 0 : 0};
  }

  function onTouchMove(event){
    if(!touchState || !event.touches || event.touches.length !== 1) return;
    if(currentView() !== touchState.viewName) return;
    var touch = event.touches[0];
    var dx = touch.clientX - touchState.x;
    var dy = touch.clientY - touchState.y;
    if(dx <= 0) return;
    if(!touchState.tracking){
      if(Math.abs(dx) < 10) return;
      if(Math.abs(dy) > Math.abs(dx) * .95) return;
      touchState.tracking = true;
    }
    if(event.cancelable) event.preventDefault();
    if(touchState.scroll) touchState.scroll.scrollTop = touchState.scrollTop;
    var offset = Math.min(52, dx * 0.32);
    var opacity = Math.max(.92, 1 - offset / 520);
    touchState.view.classList.add('fw-view-edge-peek');
    touchState.view.style.transform = 'translate3d(' + offset + 'px,0,0)';
    touchState.view.style.opacity = String(opacity);
  }

  function onTouchEnd(){
    if(!touchState) return;
    var node = touchState.view;
    var tracked = touchState.tracking;
    var scroll = touchState.scroll;
    var scrollTop = touchState.scrollTop;
    touchState = null;
    if(tracked && scroll) scroll.scrollTop = scrollTop;
    if(tracked) clearEdgePreview(node, true);
  }

  function bindEdgePreview(){
    var main = $('#appMain') || document;
    main.addEventListener('touchstart', onTouchStart, {passive:true});
    main.addEventListener('touchmove', onTouchMove, {passive:false});
    main.addEventListener('touchend', onTouchEnd, {passive:true});
    main.addEventListener('touchcancel', onTouchEnd, {passive:true});
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
    bindEdgePreview();
    bindPressFeedback();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();