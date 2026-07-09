// F.w 研究所：精神广场 IndexedDB 缓存桥接
// 作用：保留现有 localStorage 快速缓存，同时把帖子数据同步到统一 IndexedDB 缓存。
(function(){
  if(window.__FW_MOBILE_FEED_IDB_BRIDGE__) return;
  window.__FW_MOBILE_FEED_IDB_BRIDGE__ = true;

  var SAVE_DELAY = 520;
  var saveTimer = 0;
  var priming = false;

  function app(){ return window.FWApp || null; }
  function feed(){ return window.FWAppFeed || null; }
  function cache(){ return window.FWMobileDataCache || null; }
  function now(){ return Date.now(); }
  function currentUserKey(){
    var fw = app();
    var user = fw && fw.state && fw.state.user;
    return user && user.id ? String(user.id) : 'anon';
  }
  function clone(value){ try{ return JSON.parse(JSON.stringify(value)); }catch(e){ return null; } }

  function cleanComment(comment){
    if(!comment || typeof comment !== 'object') return null;
    return {
      id:comment.id || '',
      userId:comment.userId || comment.authorId || '',
      authorId:comment.authorId || comment.userId || '',
      authorName:comment.authorName || comment.nickname || '匿名研究员',
      authorAvatar:comment.authorAvatar || comment.avatar_url || '',
      content:comment.content || '',
      createdAt:comment.createdAt || comment.created_at || '',
      time:comment.time || '',
      replies:Array.isArray(comment.replies) ? comment.replies.slice(0, 20).map(cleanComment).filter(Boolean) : []
    };
  }

  function cleanPost(post){
    if(!post || typeof post !== 'object' || !post.id) return null;
    return {
      id:post.id,
      userId:post.userId || post.user_id || '',
      authorName:post.authorName || post.nickname || '匿名研究员',
      authorAvatar:post.authorAvatar || post.avatar_url || '',
      content:post.content || '',
      status:post.status || post.status_tag || '今日无效',
      createdAt:post.createdAt || post.created_at || '',
      time:post.time || '',
      resonance:Number(post.resonance || 0),
      same:Number(post.same || 0),
      tissue:Number(post.tissue || 0),
      myReactions:post.myReactions || {resonance:false, same:false, tissue:false},
      comments:Array.isArray(post.comments) ? post.comments.slice(0, 60).map(cleanComment).filter(Boolean) : []
    };
  }

  function rowsFromState(){
    var fw = app();
    if(!fw || !fw.state || !Array.isArray(fw.state.posts) || !fw.state.posts.length) return [];
    return fw.state.posts.slice(0, 120).map(cleanPost).filter(Boolean);
  }

  function saveNow(){
    var api = cache();
    if(!api || typeof api.setFeed !== 'function') return;
    var rows = rowsFromState();
    if(!rows.length) return;
    api.setFeed(currentUserKey(), rows, {at:now()});
    api.setFeed('public', rows, {at:now()});
  }

  function saveSoon(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DELAY);
  }

  function scanMedia(){
    if(window.FWMobileMediaCache && typeof window.FWMobileMediaCache.scan === 'function'){
      try{ window.FWMobileMediaCache.scan(); }catch(e){}
    }
  }

  function hasPosts(){
    var fw = app();
    return !!(fw && fw.state && Array.isArray(fw.state.posts) && fw.state.posts.length);
  }

  function renderFeedIfNeeded(){
    var fw = app();
    var api = feed();
    if(fw && fw.state && fw.state.view === 'square' && api && typeof api.renderAll === 'function'){
      api.renderAll();
    }
  }

  function primeFromIDB(){
    var api = cache();
    var fw = app();
    if(priming || hasPosts() || !api || typeof api.getFeed !== 'function' || !fw || !fw.state) return Promise.resolve(false);
    priming = true;
    return api.getFeed(currentUserKey()).then(function(data){
      if(hasPosts() || !data || !Array.isArray(data.posts) || !data.posts.length) return false;
      var rows = clone(data.posts);
      if(!rows || !rows.length) return false;
      fw.state.posts = rows;
      fw.state.postsLoaded = true;
      fw.state.postsStale = true;
      renderFeedIfNeeded();
      scanMedia();
      return true;
    }).catch(function(){ return false; }).then(function(result){ priming = false; return result; });
  }

  function patchFeedCache(){
    var api = window.FWMobileFeedCache;
    if(!api || api.__idbBridgePatched) return !!api;
    var originalSave = api.save;
    var originalPrime = api.prime;
    api.save = function(){
      var result = typeof originalSave === 'function' ? originalSave.apply(api, arguments) : undefined;
      saveSoon();
      return result;
    };
    api.prime = function(){
      var used = typeof originalPrime === 'function' ? originalPrime.apply(api, arguments) : false;
      if(!used) primeFromIDB();
      return used;
    };
    api.primeIDB = primeFromIDB;
    api.saveIDB = saveNow;
    api.__idbBridgePatched = true;
    return true;
  }

  function schedulePatch(){
    if(patchFeedCache()) return;
    [80, 240, 700, 1500, 3000].forEach(function(delay){ setTimeout(patchFeedCache, delay); });
  }

  function bindLifecycle(){
    document.addEventListener('visibilitychange', function(){
      if(document.hidden) saveNow();
      else { setTimeout(primeFromIDB, 80); saveSoon(); }
    }, {passive:true});
    window.addEventListener('pagehide', saveNow, {passive:true});
    window.addEventListener('pageshow', function(){ setTimeout(primeFromIDB, 160); }, {passive:true});
  }

  function start(){
    schedulePatch();
    bindLifecycle();
    setTimeout(primeFromIDB, 900);
    setTimeout(saveSoon, 2600);
    window.FWMobileFeedIDBBridge = {prime:primeFromIDB, save:saveNow};
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();