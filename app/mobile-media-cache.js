// F.w 研究所：手机端媒体本地缓存
// 作用：缓存已展示过的头像、表情、帖子图片等媒体，提升 PWA / APK 二次打开速度。
(function(){
  if(window.__FW_MOBILE_MEDIA_CACHE__) return;
  window.__FW_MOBILE_MEDIA_CACHE__ = true;

  var CACHE_NAME = 'fw-mobile-media-cache-v1';
  var INDEX_KEY = 'fw_mobile_media_cache_index_v1';
  var MAX_ENTRIES = 180;
  var MAX_PREFETCH_PER_SCAN = 8;
  var DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000;
  var LONG_TTL = 21 * 24 * 60 * 60 * 1000;
  var scanTimer = 0;
  var pruneTimer = 0;
  var inFlight = {};
  var activeObjectUrls = [];

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function supported(){
    return !!(window.caches && window.fetch && window.URL && window.Blob);
  }

  function now(){ return Date.now(); }

  function readIndex(){
    try{
      var raw = window.localStorage && localStorage.getItem(INDEX_KEY);
      if(!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    }catch(e){
      return {};
    }
  }

  function writeIndex(index){
    try{
      if(window.localStorage) localStorage.setItem(INDEX_KEY, JSON.stringify(index || {}));
    }catch(e){}
  }

  function normalizeUrl(url){
    try{
      var u = new URL(String(url || ''), window.location.href);
      if(u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return u.href;
    }catch(e){
      return '';
    }
  }

  function isAllowedHost(url){
    try{
      var u = new URL(url);
      if(u.origin === window.location.origin) return true;
      if(/(^|\.)supabase\.co$/i.test(u.hostname)) return true;
      if(/(^|\.)supabase\.in$/i.test(u.hostname)) return true;
      return false;
    }catch(e){
      return false;
    }
  }

  function hasImageExtension(url){
    try{
      var path = new URL(url).pathname.toLowerCase();
      return /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(path);
    }catch(e){
      return false;
    }
  }

  function inferKind(img, url){
    var cls = String(img.className || '').toLowerCase();
    var parent = img.parentElement;
    var wrapCls = parent ? String(parent.className || '').toLowerCase() : '';
    var combined = cls + ' ' + wrapCls;
    var lower = String(url || '').toLowerCase();
    if(combined.indexOf('avatar') >= 0 || lower.indexOf('avatar') >= 0) return 'avatar';
    if(combined.indexOf('sticker') >= 0 || lower.indexOf('/stickers/') >= 0 || lower.indexOf('sticker') >= 0) return 'sticker';
    if(combined.indexOf('media') >= 0 || lower.indexOf('chat-media') >= 0 || lower.indexOf('/post/') >= 0 || lower.indexOf('/comment/') >= 0) return 'media';
    if(img.closest && img.closest('.post-card,.detail-comments-card,.bird-feed-mobile,.mobile-bird-detail-view,.mobile-echo-item,.buddy-chat')) return 'media';
    return hasImageExtension(url) ? 'image' : '';
  }

  function ttlForKind(kind){
    if(kind === 'avatar' || kind === 'sticker') return LONG_TTL;
    return DEFAULT_TTL;
  }

  function cacheableImage(img){
    if(!img || !img.getAttribute) return null;
    var src = img.dataset.fwMediaOriginalSrc || img.currentSrc || img.getAttribute('src') || '';
    src = normalizeUrl(src);
    if(!src || !isAllowedHost(src)) return null;
    var kind = inferKind(img, src);
    if(!kind) return null;
    return {url:src, kind:kind};
  }

  function isFresh(meta){
    if(!meta || !meta.url) return false;
    var ttl = ttlForKind(meta.kind || 'image');
    return now() - Number(meta.at || 0) <= ttl;
  }

  async function cachedBlobUrl(url, kind){
    if(!supported()) return '';
    var index = readIndex();
    var meta = index[url];
    if(!isFresh(meta)) return '';
    try{
      var cache = await caches.open(CACHE_NAME);
      var response = await cache.match(url);
      if(!response || !response.ok) return '';
      var blob = await response.blob();
      if(!blob || !String(blob.type || '').toLowerCase().indexOf('image/') === 0) return '';
      index[url] = Object.assign({}, meta, {last:now(), kind:kind || meta.kind || 'image'});
      writeIndex(index);
      var objectUrl = URL.createObjectURL(blob);
      activeObjectUrls.push(objectUrl);
      if(activeObjectUrls.length > 48){
        var old = activeObjectUrls.splice(0, activeObjectUrls.length - 48);
        old.forEach(function(item){ try{ URL.revokeObjectURL(item); }catch(e){} });
      }
      return objectUrl;
    }catch(e){
      return '';
    }
  }

  async function fetchAndStore(url, kind){
    if(!supported() || inFlight[url]) return;
    inFlight[url] = true;
    try{
      var request = new Request(url, {mode:'cors', credentials:'omit', cache:'force-cache'});
      var response = await fetch(request);
      if(!response || !response.ok) return;
      var type = String(response.headers.get('content-type') || '').toLowerCase();
      if(type && type.indexOf('image/') !== 0 && type.indexOf('application/octet-stream') !== 0) return;
      var cache = await caches.open(CACHE_NAME);
      await cache.put(url, response.clone());
      var index = readIndex();
      index[url] = {url:url, kind:kind || 'image', at:now(), last:now()};
      writeIndex(index);
      schedulePrune();
    }catch(e){
      // 跨域图片如果不允许 JS 读取，就交给浏览器默认缓存，不影响页面展示。
    }finally{
      delete inFlight[url];
    }
  }

  async function applyCachedImage(img, url, kind){
    if(!img || img.dataset.fwMediaCacheApplied === url) return;
    img.dataset.fwMediaOriginalSrc = url;
    var cached = await cachedBlobUrl(url, kind);
    if(!cached) return;
    if(!document.documentElement.contains(img)){
      try{ URL.revokeObjectURL(cached); }catch(e){}
      return;
    }
    if((img.dataset.fwMediaOriginalSrc || '') !== url) return;
    try{
      if(img.dataset.fwMediaCacheBlobUrl) URL.revokeObjectURL(img.dataset.fwMediaCacheBlobUrl);
    }catch(e){}
    img.dataset.fwMediaCacheBlobUrl = cached;
    img.dataset.fwMediaCacheApplied = url;
    img.src = cached;
  }

  function processImages(root){
    if(!supported()) return;
    var images = $$('img', root || document);
    var prefetchCount = 0;
    images.forEach(function(img){
      var item = cacheableImage(img);
      if(!item) return;
      applyCachedImage(img, item.url, item.kind);
      if(prefetchCount < MAX_PREFETCH_PER_SCAN && !inFlight[item.url]){
        prefetchCount += 1;
        fetchAndStore(item.url, item.kind);
      }
    });
  }

  function scheduleScan(root){
    clearTimeout(scanTimer);
    scanTimer = setTimeout(function(){ processImages(root || document); }, 120);
  }

  async function pruneCache(){
    if(!supported()) return;
    var index = readIndex();
    var urls = Object.keys(index);
    if(!urls.length) return;
    var cache = await caches.open(CACHE_NAME);
    var current = now();
    var kept = {};
    var rows = urls.map(function(url){
      var meta = index[url] || {};
      return {url:url, meta:meta, last:Number(meta.last || meta.at || 0), expired:current - Number(meta.at || 0) > ttlForKind(meta.kind || 'image')};
    }).sort(function(a,b){ return b.last - a.last; });

    for(var i = 0; i < rows.length; i += 1){
      var row = rows[i];
      if(row.expired || i >= MAX_ENTRIES){
        try{ await cache.delete(row.url); }catch(e){}
      }else{
        kept[row.url] = row.meta;
      }
    }
    writeIndex(kept);
  }

  function schedulePrune(){
    clearTimeout(pruneTimer);
    pruneTimer = setTimeout(function(){ pruneCache().catch(function(){}); }, 1200);
  }

  function bindObserver(){
    if(!window.MutationObserver) return;
    var observer = new MutationObserver(function(mutations){
      for(var i = 0; i < mutations.length; i += 1){
        var m = mutations[i];
        if(m.type === 'childList' && m.addedNodes && m.addedNodes.length){ scheduleScan(document); return; }
        if(m.type === 'attributes' && m.target && String(m.attributeName || '') === 'src'){ scheduleScan(m.target.parentElement || document); return; }
      }
    });
    observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['src']});
  }

  function bindLifecycle(){
    window.addEventListener('pageshow', function(){ scheduleScan(document); schedulePrune(); }, {passive:true});
    document.addEventListener('visibilitychange', function(){ if(!document.hidden){ scheduleScan(document); schedulePrune(); } }, {passive:true});
    document.addEventListener('click', function(){ scheduleScan(document); }, true);
  }

  function start(){
    if(!supported()) return;
    scheduleScan(document);
    schedulePrune();
    bindObserver();
    bindLifecycle();
    window.FWMobileMediaCache = {
      scan:function(){ scheduleScan(document); },
      prune:function(){ schedulePrune(); }
    };
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
