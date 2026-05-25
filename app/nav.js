(function(){
  if(window.FWAppNav) return;

  var bound = false;

  function app(){ return window.FWApp; }

  function polishSquareCopy(){
    var square = document.querySelector('[data-app-view="square"]');
    if(!square) return;
    var back = square.querySelector('[data-app-open="nav"]');
    var subtitle = square.querySelector('.view-head h1');
    if(back) back.textContent = '‹ 首页';
    if(subtitle) subtitle.textContent = '发牢骚、评论、互动';
  }

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
    polishSquareCopy();
    bind();
  }

  window.FWAppNav = {init:init};
})();
