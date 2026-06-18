(function(){
  if(window.__FW_MOBILE_FEED_CACHE__) return;
  window.__FW_MOBILE_FEED_CACHE__ = true;

  var CACHE_PREFIX = 'fw_mobile_feed_cache_v1:';
  var PUBLIC_KEY = CACHE_PREFIX + 'public';
  var TTL = 30 * 24 * 60 * 60 * 1000;
  var REFRESH_THROTTLE = 25 * 1000;
  var MAX_POSTS = 80;
  var MAX_COMMENTS_PER_POST = 40;
  var patched = false;
  var saveTimer = 0;
  var refreshing = false;
  var warming = false;
  var lastRefreshAt = 0;

  function app(){ return window.FWApp || null; }
  function feed(){ return window.FWAppFeed || null; }
  function now(){ return Date.now(); }

  function currentUserKey(){
    var fw = app();
    var user = fw && fw.state && fw.state.user;
    return user && user.id ? String(user.id) : 'anon';
  }

  function cacheKey(){ return CACHE_PREFIX + currentUserKey(); }

  function clone(value){
    try{ return JSON.parse(JSON.stringify(value)); }
    catch(e){ return null; }
  }

  function parseCache(raw){
    if(!raw) return null;
    var data = JSON.parse(raw);
    if(!data || !Array.isArray(data.posts) || !data.posts.length) return null;
    if(now() - Number(data.at || 0) > TTL) return null;
    return data;
  }

  function readCache(){
    try{
      if(!window.localStorage) return null;
      var keys = [cacheKey(), PUBLIC_KEY, CACHE_PREFIX + 'anon'];
      var seen = {};
      for(var i = 0; i < keys.length; i += 1){
        var key = keys[i];
        if(!key || seen[key]) continue;
        seen[key] = true;
        var data = parseCache(localStorage.getItem(key));
        if(data) return data;
      }
    }catch(e){}
    return null;
  }

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
    var comments = Array.isArray(post.comments) ? post.comments.slice(0, MAX_COMMENTS_PER_POST).map(cleanComment).filter(Boolean) : [];
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
      comments:comments
    };
  }

  function avatarUrlsFromPosts(posts){
    var urls = [];
    var seen = {};
    (posts || []).forEach(function(post){
      var postUrl = post && (post.authorAvatar || post.avatar_url || '');
      if(postUrl && !seen[postUrl]){ seen[postUrl] = true; urls.push(postUrl); }
      (post && post.comments || []).forEach(function(comment){
        var commentUrl = comment && (comment.authorAvatar || comment.avatar_url || '');
        if(commentUrl && !seen[commentUrl]){ seen[commentUrl] = true; urls.push(commentUrl); }
        (comment && comment.replies || []).forEach(function(reply){
          var replyUrl = reply && (reply.authorAvatar || reply.avatar_url || '');
          if(replyUrl && !seen[replyUrl]){ seen[replyUrl] = true; urls.push(replyUrl); }
        });
      });
    });
    return urls;
  }

  function prefetchAvatars(posts){
    if(window.FWMobileMediaCache && typeof window.FWMobileMediaCache.prefetch === 'function'){
      try{ window.FWMobileMediaCache.prefetch(avatarUrlsFromPosts(posts || (app() && app().state && app().state.posts) || []), 'avatar'); }catch(e){}
    }
  }

  function scanMedia(){
    prefetchAvatars();
    if(window.FWMobileMediaCache && typeof window.FWMobileMediaCache.scan === 'function'){
      try{ window.FWMobileMediaCache.scan(); }catch(e){}
    }
  }

  function savePostsSoon(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePosts, 300);
  }

  function savePosts(){
    var fw = app();
    if(!fw || !fw.state || !Array.isArray(fw.state.posts)) return;
    try{
      var rows = fw.state.posts.slice(0, MAX_POSTS).map(cleanPost).filter(Boolean);
      if(!rows.length) return;
      var payload = JSON.stringify({at:now(), posts:rows});
      localStorage.setItem(cacheKey(), payload);
      localStorage.setItem(PUBLIC_KEY, payload);
      prefetchAvatars(rows);
    }catch(e){}
  }

  function hasPosts(){
    var fw = app();
    return !!(fw && fw.state && fw.state.postsLoaded && Array.isArray(fw.state.posts) && fw.state.posts.length);
  }

  function markFresh(){
    lastRefreshAt = now();
    var fw = app();
    if(fw && fw.state) fw.state.postsStale = false;
  }

  function prime(){
    var fw = app();
    if(!fw || !fw.state) return false;
    if(hasPosts()){
      prefetchAvatars(fw.state.posts);
      return true;
    }
    var cached = readCache();
    if(!cached || !cached.posts.length) return false;
    var rows = clone(cached.posts);
    if(!rows || !rows.length) return false;
    fw.state.posts = rows;
    fw.state.postsLoaded = true;
    fw.state.postsStale = true;
    prefetchAvatars(rows);
    if(fw.state.view === 'square'){
      var api = feed();
      if(api && typeof api.renderAll === 'function') api.renderAll();
    }
    scanMedia();
    return true;
  }

  function refresh(){
    var fw = app();
    var api = feed();
    if(refreshing || !fw || !fw.state || fw.state.view !== 'square' || !api || typeof api.load !== 'function') return;
    if(hasPosts() && now() - lastRefreshAt < REFRESH_THROTTLE) return;
    refreshing = true;
    fw.state.postsStale = false;
    Promise.resolve(api.load(true, {silent:true, preserveScroll:true})).then(function(){
      markFresh();
      prefetchAvatars(fw.state.posts || []);
      savePostsSoon();
      scanMedia();
    }).catch(function(){
      fw.state.postsStale = true;
    }).then(function(){ refreshing = false; });
  }

  function warm(reason){
    var fw = app();
    var api = feed();
    if(warming || hasPosts() || !fw || !fw.state || !api || typeof api.load !== 'function') return;
    warming = true;
    var wait = fw.waitForDb ? fw.waitForDb(4500) : Promise.resolve(true);
    Promise.resolve(wait).then(function(ok){
      if(!ok || hasPosts()) return;
      return api.load(false, {silent:true, preserveScroll:true, prewarm:true});
    }).then(function(){
      if(hasPosts()){
        markFresh();
        prefetchAvatars(fw.state.posts || []);
        savePostsSoon();
        scanMedia();
      }
    }).catch(function(e){
      var state = fw && fw.state;
      if(state) state.postsStale = true;
      console.warn('[FW mobile feed cache] warm failed', e);
    }).then(function(){ warming = false; });
  }

  function scheduleWarm(){
    [700, 1600, 3200].forEach(function(delay){
      setTimeout(function(){ warm('boot'); }, delay);
    });
  }

  function patchFeedForSaving(){
    if(patched) return true;
    var api = feed();
    if(!api || typeof api.load !== 'function') return false;
    var originalLoad = api.load;
    var originalEnsureLoaded = api.ensureLoaded;

    api.load = function(force, options){
      var fw = app();
      options = options || {};
      if(force === true && !options.silent && !options.detailPostId && fw && fw.state){
        if(fw.state.view === 'square' && hasPosts()){
          options = Object.assign({}, options, {silent:true, preserveScroll:true});
        }else if(fw.state.view !== 'square' && fw.state.view !== 'square-detail'){
          fw.state.postsStale = true;
          savePostsSoon();
          return Promise.resolve();
        }
      }
      var result = originalLoad.call(this, force, options);
      Promise.resolve(result).then(function(){
        if(force || options.prewarm) markFresh();
        prefetchAvatars((fw && fw.state && fw.state.posts) || []);
        savePostsSoon();
        scanMedia();
      }).catch(function(){});
      return result;
    };

    api.ensureLoaded = function(){
      var fw = app();
      prime();
      if(fw && fw.state && fw.state.view === 'square' && hasPosts()){
        if(typeof api.renderAll === 'function') api.renderAll();
        prefetchAvatars(fw.state.posts || []);
        if(fw.state.postsStale || now() - lastRefreshAt >= REFRESH_THROTTLE) setTimeout(refresh, 120);
        return;
      }
      if(typeof originalEnsureLoaded === 'function') return originalEnsureLoaded.call(this);
      return api.load(false);
    };

    var originalRenderAll = api.renderAll;
    if(typeof originalRenderAll === 'function'){
      api.renderAll = function(){
        var result = originalRenderAll.apply(this, arguments);
        prefetchAvatars((app() && app().state && app().state.posts) || []);
        savePostsSoon();
        return result;
      };
    }
    patched = true;
    return true;
  }

  function schedulePatch(){
    if(patchFeedForSaving()) return;
    [0, 120, 360, 900, 1800].forEach(function(delay){ setTimeout(patchFeedForSaving, delay); });
  }

  function bindLifecycle(){
    document.addEventListener('visibilitychange', function(){
      if(document.hidden) savePosts();
      else { savePostsSoon(); setTimeout(function(){ warm('visible'); }, 600); }
    }, {passive:true});
    window.addEventListener('pagehide', savePosts, {passive:true});
  }

  function start(){
    schedulePatch();
    scheduleWarm();
    bindLifecycle();
    window.FWMobileFeedCache = {
      prime:prime,
      refresh:refresh,
      warm:warm,
      save:savePosts,
      read:readCache
    };
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();