(function(){
  if(window.FWAppNav) return;

  var bound = false;
  var hashBound = false;

  function app(){ return window.FWApp; }

  function polishSquareCopy(){
    var square = document.querySelector('[data-app-view="square"]');
    if(!square) return;
    var back = square.querySelector('[data-app-open="nav"]');
    var subtitle = square.querySelector('.view-head h1');
    if(back) back.textContent = '‹ 首页';
    if(subtitle) subtitle.textContent = '发牢骚、评论、互动';
  }

  function viewFromHash(){
    var hash = String(window.location.hash || '').replace(/^#/, '').toLowerCase();
    var map = {
      home:'nav',
      nav:'nav',
      index:'nav',
      square:'square',
      rooms:'rooms',
      bird:'bird',
      archive:'archive',
      rules:'rules',
      moderation:'moderation',
      admin:'moderation',
      buddy:'buddy',
      echo:'echo',
      profile:'profile',
      me:'profile'
    };
    return map[hash] || '';
  }

  function openHashView(){
    var view = viewFromHash();
    if(view) app().setView(view);
  }

  function bindHashRoutes(){
    if(hashBound) return;
    hashBound = true;
    window.addEventListener('hashchange', openHashView);
    setTimeout(openHashView, 0);
    setTimeout(openHashView, 180);
  }

  function bind(){
    if(bound) return;
    bound = true;

    document.addEventListener('click', function(e){
      var open = e.target.closest && e.target.closest('[data-app-open]');
      if(open){
        e.preventDefault();
        var view = open.dataset.appOpen || 'nav';
        app().setView(view);
        if(window.history && window.history.replaceState){
          var hash = view === 'nav' ? '' : '#' + view;
          window.history.replaceState(null, document.title, window.location.pathname + window.location.search + hash);
        }
        return;
      }

      var login = e.target.closest && e.target.closest('[data-app-login]');
      if(login){
        e.preventDefault();
        app().setView('profile');
        if(window.history && window.history.replaceState){
          window.history.replaceState(null, document.title, window.location.pathname + window.location.search + '#profile');
        }
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
    bindHashRoutes();
  }

  window.FWAppNav = {init:init, openHashView:openHashView};
})();