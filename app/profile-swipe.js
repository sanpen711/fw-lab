// F.w 研究所：我的页面二级页左滑返回
(function(){
  if(window.__FW_MOBILE_PROFILE_SWIPE__) return;
  window.__FW_MOBILE_PROFILE_SWIPE__ = true;

  var startX = 0;
  var startY = 0;
  var startAt = 0;
  var tracking = false;

  function activeProfileView(){
    var view = document.querySelector('[data-app-view="profile"].is-active');
    return view || null;
  }

  function canBack(){
    var view = activeProfileView();
    if(!view) return false;
    return !!view.querySelector('[data-profile-back]');
  }

  function isInteractive(target){
    return !!(target && target.closest && target.closest('input, textarea, select, button, label, a'));
  }

  function goBack(){
    var view = activeProfileView();
    if(!view) return;
    var back = view.querySelector('[data-profile-back]');
    if(back) back.click();
  }

  document.addEventListener('touchstart', function(e){
    if(!canBack()) return;
    if(!e.touches || e.touches.length !== 1) return;
    if(isInteractive(e.target)) return;
    var touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startAt = Date.now();
    tracking = true;
  }, {passive:true});

  document.addEventListener('touchend', function(e){
    if(!tracking) return;
    tracking = false;
    if(!canBack()) return;
    if(!e.changedTouches || e.changedTouches.length !== 1) return;
    var touch = e.changedTouches[0];
    var dx = touch.clientX - startX;
    var dy = touch.clientY - startY;
    var elapsed = Date.now() - startAt;

    var horizontalEnough = Math.abs(dx) >= 68 && Math.abs(dx) > Math.abs(dy) * 1.45;
    var fastEnough = elapsed <= 700;
    var leftSwipe = dx <= -68;

    if(horizontalEnough && fastEnough && leftSwipe){
      goBack();
    }
  }, {passive:true});
})();