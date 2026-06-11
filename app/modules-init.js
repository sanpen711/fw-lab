(function(){
  var archiveScriptLoading = false;
  var reportScriptLoading = false;
  var commentReplyScriptLoading = false;
  var initialHashApplied = false;

  function loadArchiveModule(){
    if(window.FWAppArchive){
      window.FWAppArchive.init && window.FWAppArchive.init();
      window.FWAppArchive.ensureLoaded && window.FWAppArchive.ensureLoaded();
      return;
    }
    if(archiveScriptLoading) return;
    archiveScriptLoading = true;
    var script = document.createElement('script');
    script.src = './archive.js?v=mobile-archive-20260529-1';
    script.onload = function(){
      archiveScriptLoading = false;
      if(window.FWAppArchive){
        window.FWAppArchive.init && window.FWAppArchive.init();
        window.FWAppArchive.ensureLoaded && window.FWAppArchive.ensureLoaded();
      }
    };
    script.onerror = function(){ archiveScriptLoading = false; };
    document.head.appendChild(script);
  }

  function loadReportModule(){
    if(window.__FW_MOBILE_REPORT_BRIDGE__) return;
    if(reportScriptLoading) return;
    reportScriptLoading = true;
    var script = document.createElement('script');
    script.src = './report.js?v=mobile-report-20260602-1';
    script.onload = function(){ reportScriptLoading = false; };
    script.onerror = function(){ reportScriptLoading = false; };
    document.head.appendChild(script);
  }

  function loadCommentReplyModule(){
    if(window.__FW_MOBILE_COMMENT_REPLY_FIX__) return;
    if(commentReplyScriptLoading) return;
    commentReplyScriptLoading = true;
    var script = document.createElement('script');
    script.src = './comment-reply-fix.js?v=mobile-comment-threaded-20260608-1';
    script.onload = function(){ commentReplyScriptLoading = false; };
    script.onerror = function(){ commentReplyScriptLoading = false; };
    document.head.appendChild(script);
  }

  function getInitialHashView(){
    var hash = String(window.location.hash || '').replace(/^#/, '').toLowerCase();
    var allowed = {
      nav:true,
      square:true,
      rooms:true,
      bird:true,
      archive:true,
      rules:true,
      moderation:true,
      buddy:true,
      echo:true,
      profile:true
    };
    return allowed[hash] ? hash : '';
  }

  function openInitialView(view){
    var api = window.FWApp;
    if(!api) return false;
    if(typeof api.openView === 'function'){
      api.openView(view, {updateHash:false});
      return true;
    }
    if(typeof api.setView === 'function'){
      api.setView(view);
      return true;
    }
    return false;
  }

  function applyInitialHashRoute(){
    var view = getInitialHashView();
    if(!view || !window.FWApp) return;
    if(initialHashApplied && window.FWApp.state && window.FWApp.state.view === view) return;
    if(openInitialView(view)) initialHashApplied = true;
  }

  function run(){
    if(!window.FWApp) return;
    if(window.FWAppRooms && window.FWAppRooms.init) window.FWAppRooms.init();
    if(window.FWAppBird && window.FWAppBird.init) window.FWAppBird.init();
    if(window.FWAppArchive && window.FWAppArchive.init) window.FWAppArchive.init();
    loadReportModule();
    loadCommentReplyModule();
    if(window.__fwMobileModulesWrapped) return;
    window.__fwMobileModulesWrapped = true;
    var originalSetView = window.FWApp.setView;
    window.FWApp.setView = function(name){
      originalSetView.call(window.FWApp, name);
      if(name === 'rooms' && window.FWAppRooms) window.FWAppRooms.ensureLoaded();
      if(name === 'bird' && window.FWAppBird) window.FWAppBird.ensureLoaded();
      if(name === 'bird-detail' && window.FWAppBird) window.FWAppBird.ensureLoaded();
      if(name === 'archive') loadArchiveModule();
    };
    var current = window.FWApp.state && window.FWApp.state.view;
    if(current === 'rooms' && window.FWAppRooms) window.FWAppRooms.ensureLoaded();
    if((current === 'bird' || current === 'bird-detail') && window.FWAppBird) window.FWAppBird.ensureLoaded();
    if(current === 'archive') loadArchiveModule();
    [0, 80, 240, 700].forEach(function(delay){
      setTimeout(applyInitialHashRoute, delay);
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();