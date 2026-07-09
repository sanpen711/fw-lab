// F.w 研究所：手机端统一数据缓存
// 作用：为 PWA / APK 提供 IndexedDB 结构化缓存；localStorage 继续作为旧版本兜底。
(function(){
  if(window.FWMobileDataCache) return;

  var DB_NAME = 'fw-mobile-data-cache-v1';
  var DB_VERSION = 1;
  var FEED_STORE = 'feeds';
  var CHAT_STORE = 'chats';
  var META_STORE = 'meta';
  var FEED_PREFIX = 'fw_mobile_feed_cache_v1:';
  var CHAT_PREFIX = 'fw_mobile_buddy_chat_cache:';
  var DAY = 24 * 60 * 60 * 1000;
  var FEED_TTL = 30 * DAY;
  var CHAT_TTL = 180 * DAY;
  var dbPromise = null;

  function now(){ return Date.now(); }
  function supported(){ return !!window.indexedDB; }
  function feedKey(userKey){ return 'feed:' + String(userKey || 'anon'); }
  function chatKey(meId, targetId){ return 'chat:' + String(meId || 'guest') + ':' + String(targetId || ''); }
  function clone(value){ try{ return JSON.parse(JSON.stringify(value)); }catch(e){ return null; } }

  function openDb(){
    if(!supported()) return Promise.reject(new Error('IndexedDB not supported'));
    if(dbPromise) return dbPromise;
    dbPromise = new Promise(function(resolve, reject){
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function(event){
        var db = event.target.result;
        if(!db.objectStoreNames.contains(FEED_STORE)) db.createObjectStore(FEED_STORE, {keyPath:'key'});
        if(!db.objectStoreNames.contains(CHAT_STORE)) db.createObjectStore(CHAT_STORE, {keyPath:'key'});
        if(!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, {keyPath:'key'});
      };
      request.onsuccess = function(){ resolve(request.result); };
      request.onerror = function(){ reject(request.error || new Error('IndexedDB open failed')); };
    }).catch(function(error){ dbPromise = null; throw error; });
    return dbPromise;
  }

  function idbGet(storeName, key){
    return openDb().then(function(db){
      return new Promise(function(resolve, reject){
        var tx = db.transaction(storeName, 'readonly');
        var store = tx.objectStore(storeName);
        var request = store.get(key);
        request.onsuccess = function(){ resolve(request.result || null); };
        request.onerror = function(){ reject(request.error || new Error('IndexedDB get failed')); };
      });
    });
  }

  function idbPut(storeName, value){
    return openDb().then(function(db){
      return new Promise(function(resolve, reject){
        var tx = db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        var request = store.put(value);
        request.onsuccess = function(){ resolve(value); };
        request.onerror = function(){ reject(request.error || new Error('IndexedDB put failed')); };
      });
    });
  }

  function idbClear(storeName){
    return openDb().then(function(db){
      return new Promise(function(resolve, reject){
        var tx = db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        var request = store.clear();
        request.onsuccess = function(){ resolve(true); };
        request.onerror = function(){ reject(request.error || new Error('IndexedDB clear failed')); };
      });
    });
  }

  function parseFeedPayload(raw){
    try{
      var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if(!data || !Array.isArray(data.posts) || !data.posts.length) return null;
      if(now() - Number(data.at || 0) > FEED_TTL) return null;
      return {at:Number(data.at || now()), posts:clone(data.posts) || []};
    }catch(e){ return null; }
  }

  function parseChatPayload(raw){
    try{
      var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      var rows = data && Array.isArray(data.rows) ? data.rows : [];
      if(!rows.length) return null;
      var at = Number(data.updated_at || data.at || now());
      if(now() - at > CHAT_TTL) return null;
      return {at:at, rows:clone(rows) || []};
    }catch(e){ return null; }
  }

  function legacyFeed(userKey){
    try{
      if(!window.localStorage) return null;
      var keys = [FEED_PREFIX + String(userKey || 'anon'), FEED_PREFIX + 'public', FEED_PREFIX + 'anon'];
      var seen = {};
      for(var i = 0; i < keys.length; i += 1){
        var key = keys[i];
        if(seen[key]) continue;
        seen[key] = true;
        var data = parseFeedPayload(localStorage.getItem(key));
        if(data) return data;
      }
    }catch(e){}
    return null;
  }

  function legacyChat(meId, targetId){
    try{
      if(!window.localStorage) return null;
      return parseChatPayload(localStorage.getItem(CHAT_PREFIX + String(meId || 'guest') + ':' + String(targetId || '')));
    }catch(e){ return null; }
  }

  function getFeed(userKey){
    var keys = [feedKey(userKey), feedKey('public'), feedKey('anon')];
    var index = 0;
    function next(){
      if(index >= keys.length) return Promise.resolve(legacyFeed(userKey));
      var key = keys[index++];
      return idbGet(FEED_STORE, key).then(function(row){
        if(row && Array.isArray(row.posts) && row.posts.length && now() - Number(row.at || 0) <= FEED_TTL){
          return {at:Number(row.at || now()), posts:clone(row.posts) || []};
        }
        return next();
      }).catch(function(){ return legacyFeed(userKey); });
    }
    return next();
  }

  function setFeed(userKey, posts, meta){
    posts = Array.isArray(posts) ? posts.slice(0, 150) : [];
    if(!posts.length) return Promise.resolve(false);
    var at = meta && meta.at ? Number(meta.at) : now();
    return idbPut(FEED_STORE, {key:feedKey(userKey), userKey:String(userKey || 'anon'), at:at, posts:clone(posts) || posts}).then(function(){
      return true;
    }).catch(function(){ return false; });
  }

  function getChat(meId, targetId){
    return idbGet(CHAT_STORE, chatKey(meId, targetId)).then(function(row){
      if(row && Array.isArray(row.rows) && row.rows.length && now() - Number(row.at || 0) <= CHAT_TTL){
        return {at:Number(row.at || now()), rows:clone(row.rows) || []};
      }
      return legacyChat(meId, targetId);
    }).catch(function(){ return legacyChat(meId, targetId); });
  }

  function setChat(meId, targetId, rows, meta){
    rows = Array.isArray(rows) ? rows.slice(-200) : [];
    if(!rows.length || !targetId) return Promise.resolve(false);
    var at = meta && meta.at ? Number(meta.at) : now();
    return idbPut(CHAT_STORE, {key:chatKey(meId, targetId), meId:String(meId || 'guest'), targetId:String(targetId), at:at, rows:clone(rows) || rows}).then(function(){
      return true;
    }).catch(function(){ return false; });
  }

  function importLegacy(){
    if(!window.localStorage) return Promise.resolve(false);
    var tasks = [];
    try{
      for(var i = 0; i < localStorage.length; i += 1){
        var key = localStorage.key(i);
        if(!key) continue;
        if(key.indexOf(FEED_PREFIX) === 0){
          var feedUser = key.slice(FEED_PREFIX.length) || 'anon';
          var feedData = parseFeedPayload(localStorage.getItem(key));
          if(feedData) tasks.push(setFeed(feedUser, feedData.posts, {at:feedData.at}));
        }
        if(key.indexOf(CHAT_PREFIX) === 0){
          var rest = key.slice(CHAT_PREFIX.length).split(':');
          var meId = rest.shift() || 'guest';
          var targetId = rest.join(':');
          var chatData = parseChatPayload(localStorage.getItem(key));
          if(chatData && targetId) tasks.push(setChat(meId, targetId, chatData.rows, {at:chatData.at}));
        }
      }
    }catch(e){}
    return Promise.all(tasks).then(function(){ return true; }).catch(function(){ return false; });
  }

  function clearAll(){
    if(!supported()) return Promise.resolve(false);
    return Promise.all([idbClear(FEED_STORE), idbClear(CHAT_STORE), idbClear(META_STORE)]).then(function(){ return true; }).catch(function(){ return false; });
  }

  window.FWMobileDataCache = {
    supported:supported,
    getFeed:getFeed,
    setFeed:setFeed,
    getChat:getChat,
    setChat:setChat,
    importLegacy:importLegacy,
    clearAll:clearAll,
    dbName:DB_NAME
  };

  setTimeout(importLegacy, 600);
})();