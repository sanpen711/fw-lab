(function(){
  function run(){
    if(!window.FWApp) return;
    if(window.FWAppRooms && window.FWAppRooms.init) window.FWAppRooms.init();
    if(window.FWAppBird && window.FWAppBird.init) window.FWAppBird.init();
    if(window.__fwMobileModulesWrapped) return;
    window.__fwMobileModulesWrapped = true;
    var originalSetView = window.FWApp.setView;
    window.FWApp.setView = function(name){
      originalSetView.call(window.FWApp, name);
      if(name === 'rooms' && window.FWAppRooms) window.FWAppRooms.ensureLoaded();
      if(name === 'bird' && window.FWAppBird) window.FWAppBird.ensureLoaded();
      if(name === 'bird-detail' && window.FWAppBird) window.FWAppBird.ensureLoaded();
    };
    var current = window.FWApp.state && window.FWApp.state.view;
    if(current === 'rooms' && window.FWAppRooms) window.FWAppRooms.ensureLoaded();
    if((current === 'bird' || current === 'bird-detail') && window.FWAppBird) window.FWAppBird.ensureLoaded();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
