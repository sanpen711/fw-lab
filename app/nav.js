(function(){
  if(window.FWAppNav) return;

  var bound = false;

  function app(){ return window.FWApp; }

  function bind(){
    if(bound) return;
    bound = true;

    document.addEventListener('click', function(e){
      var open = e.target.closest && e.target.closest('[data-app-open]');
      if(open){
        e.preventDefault();
        app().setView(open.dataset.appOpen || 'nav');
        return;
      }

      var login = e.target.closest && e.target.closest('[data-app-login]');
      if(login){
        e.preventDefault();
        app().setView('profile');
        return;
      }

      var reload = e.target.closest && e.target.closest('[data-app-reload]');
      if(reload){
        e.preventDefault();
        window.location.reload();
      }
    });
  }

  function init(){
    bind();
  }

  window.FWAppNav = {init:init};
})();
