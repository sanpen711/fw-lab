(function(){
  if(window.FWApp) return;

  var state = {
    view:'nav',
    user:null,
    posts:[],
    postsLoaded:false,
    filterStatus:'全部'
  };

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.from((root || document).querySelectorAll(selector)); }
  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function initials(name){ return String(name || 'FW').trim().slice(0, 2).toUpperCase() || 'FW'; }

  function avatarHtml(user){
    var name = user && (user.nickname || user.email) || 'F.w';
    var url = user && user.avatar_url || '';
    if(url) return '<img src="' + esc(url) + '" alt="' + esc(name) + '">';
    return esc(initials(name));
  }

  function db(){ return window.fwDb && window.fwDb.enabled ? window.fwDb : null; }

  function waitForDb(timeout){
    timeout = timeout || 8000;
    return new Promise(function(resolve){
      if(db()) { resolve(true); return; }
      var start = Date.now();
      var timer = setInterval(function(){
        if(db()){
          clearInterval(timer);
          resolve(true);
          return;
        }
        if(Date.now() - start > timeout){
          clearInterval(timer);
          resolve(false);
        }
      }, 80);
    });
  }

  function toast(message){
    var node = $('[data-app-toast]');
    if(!node) return;
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(window.__fwAppToastTimer);
    window.__fwAppToastTimer = setTimeout(function(){ node.classList.remove('show'); }, 2200);
  }

  function setStatus(text){
    var node = $('[data-app-status]');
    if(node) node.textContent = text;
  }

  function renderUser(){
    var label = $('[data-app-user-label]');
    var avatar = $('[data-app-avatar]');
    if(!label || !avatar) return;

    if(state.user){
      label.textContent = state.user.nickname || '研究员';
      avatar.innerHTML = avatarHtml(state.user);
      setStatus('已登录');
      return;
    }

    label.textContent = '未登录';
    avatar.textContent = 'F';
    setStatus(db() ? '可浏览，登录后互动' : '正在连接');
  }

  async function refreshUser(){
    if(!(await waitForDb())){
      state.user = null;
      renderUser();
      return null;
    }

    try{
      state.user = await window.fwDb.getCurrentUser();
    }catch(e){
      state.user = null;
    }

    renderUser();
    if(window.FWAppProfile) window.FWAppProfile.render();
    return state.user;
  }

  function tabForView(name){
    if(name === 'buddy' || name === 'echo' || name === 'profile') return name;
    return 'nav';
  }

  function setView(name){
    state.view = name || 'nav';
    $$('[data-app-view]').forEach(function(view){
      view.classList.toggle('is-active', view.dataset.appView === state.view);
    });
    $$('[data-app-nav]').forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.appNav === tabForView(state.view));
    });
    var main = $('#appMain');
    if(main) main.scrollTop = 0;

    if(state.view === 'square' && window.FWAppFeed) window.FWAppFeed.ensureLoaded();
    if(state.view === 'buddy' && window.FWAppBuddy) window.FWAppBuddy.ensureLoaded();
    if(state.view === 'echo' && window.FWAppEcho) window.FWAppEcho.ensureLoaded();
    if(state.view === 'profile' && window.FWAppProfile) window.FWAppProfile.render();
  }

  function registerServiceWorker(){
    if(!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/app/sw.js', {scope:'/app/'}).catch(function(err){
      console.warn('[FW mobile app] service worker register failed', err);
    });
  }

  function bindShell(){
    document.addEventListener('click', function(e){
      var nav = e.target.closest && e.target.closest('[data-app-nav]');
      if(nav){
        e.preventDefault();
        setView(nav.dataset.appNav || 'nav');
        return;
      }

      var profile = e.target.closest && e.target.closest('[data-app-profile-trigger]');
      if(profile){
        e.preventDefault();
        setView('profile');
      }
    });
  }

  function onAuthChange(){
    if(!db() || !window.fwDb.onAuthChange) return;
    try{
      window.fwDb.onAuthChange(function(){
        refreshUser().then(function(){
          if(window.FWAppFeed) window.FWAppFeed.load(true);
          if(window.FWAppBuddy) window.FWAppBuddy.load(true);
          if(window.FWAppEcho) window.FWAppEcho.load(true);
        });
      });
    }catch(e){}
  }

  async function start(){
    registerServiceWorker();
    bindShell();
    setStatus('正在连接');
    await refreshUser();
    onAuthChange();
    if(window.FWAppNav) window.FWAppNav.init();
    if(window.FWAppFeed) window.FWAppFeed.init();
    if(window.FWAppPublish) window.FWAppPublish.init();
    if(window.FWAppBuddy) window.FWAppBuddy.init();
    if(window.FWAppEcho) window.FWAppEcho.init();
    if(window.FWAppProfile) window.FWAppProfile.init();
    setView('nav');
  }

  window.FWApp = {
    state:state,
    $:$,
    $$:$$,
    esc:esc,
    initials:initials,
    avatarHtml:avatarHtml,
    db:db,
    waitForDb:waitForDb,
    toast:toast,
    setStatus:setStatus,
    setView:setView,
    refreshUser:refreshUser,
    renderUser:renderUser
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
