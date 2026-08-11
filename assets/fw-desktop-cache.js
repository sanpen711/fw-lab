// F.w 研究所 Windows 本地内容缓存桥。
// 只在受信任的 Tauri 客户端中启用；普通网页、PWA 与 Android 不访问本地文件系统。
(function(){
  'use strict';

  if(window.__FW_DESKTOP_CACHE_BRIDGE__) return;
  if(!/FWYanjiusuoDesktop\//i.test(navigator.userAgent || '')) return;
  window.__FW_DESKTOP_CACHE_BRIDGE__ = true;

  var memory = Object.create(null);
  var writes = Promise.resolve();
  var invoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
  var available = typeof invoke === 'function';

  function safeKey(key){
    key = String(key || '');
    if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key)) throw new Error('缓存名称不合法。');
    return key;
  }

  function clone(value){
    if(value == null) return value;
    try{ return JSON.parse(JSON.stringify(value)); }catch(e){ return null; }
  }

  async function read(key){
    key = safeKey(key);
    if(Object.prototype.hasOwnProperty.call(memory, key)) return clone(memory[key]);
    if(!available) return null;
    try{
      var value = await invoke('desktop_cache_read', {key:key});
      memory[key] = value == null ? null : value;
      return clone(memory[key]);
    }catch(error){
      console.warn('[FW desktop cache] read unavailable', error);
      return null;
    }
  }

  function write(key, value){
    key = safeKey(key);
    var snapshot = clone(value);
    if(snapshot == null && value != null) return Promise.resolve(false);
    memory[key] = snapshot;
    if(!available) return Promise.resolve(false);
    writes = writes
      .catch(function(){})
      .then(function(){ return invoke('desktop_cache_write', {key:key, value:snapshot}); })
      .then(function(){ return true; })
      .catch(function(error){
        console.warn('[FW desktop cache] write skipped', error);
        return false;
      });
    return writes;
  }

  function remove(key){
    key = safeKey(key);
    delete memory[key];
    if(!available) return Promise.resolve(false);
    writes = writes
      .catch(function(){})
      .then(function(){ return invoke('desktop_cache_remove', {key:key}); })
      .then(function(){ return true; })
      .catch(function(error){
        console.warn('[FW desktop cache] remove skipped', error);
        return false;
      });
    return writes;
  }

  async function status(){
    if(!available) return {enabled:false, entries:0, bytes:0};
    try{ return await invoke('desktop_cache_status'); }
    catch(error){ return {enabled:false, entries:0, bytes:0}; }
  }

  window.fwDesktopCache = {
    enabled:available,
    read:read,
    write:write,
    remove:remove,
    status:status
  };
  window.dispatchEvent(new CustomEvent('fw:desktop-cache-ready', {detail:{enabled:available}}));
})();
