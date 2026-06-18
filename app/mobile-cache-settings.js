// F.w 研究所：我的 - 缓存清理二级页
// 作用：把手机端本地缓存清理入口放进“我的”，不影响现有功能和线上数据。
(function(){
  if(window.__FW_MOBILE_CACHE_SETTINGS__) return;
  window.__FW_MOBILE_CACHE_SETTINGS__ = true;

  var mounted = false;
  var MENU_SELECTOR = '[data-profile-panel] .profile-menu';
  var PANEL_SELECTOR = '[data-profile-panel]';

  var LOCAL_PREFIXES = [
    'fw_mobile_feed_cache_v1:',
    'fw_mobile_module_cache_v1:',
    'fw_mobile_buddy_chat_cache:',
    'fw_mobile_media_cache_index_',
    'fw_mobile_poll_',
    'fw_mobile_echo_',
    'fw_mobile_bird_'
  ];

  var CACHE_NAMES = [
    'fw-mobile-media-cache-v1',
    'fw-mobile-media-cache-v2'
  ];

  function app(){ return window.FWApp || null; }
  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function toast(message){ var fw = app(); if(fw && fw.toast) fw.toast(message); }
  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function injectStyle(){
    if(document.getElementById('fwMobileCacheSettingsStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileCacheSettingsStyle';
    style.textContent = [
      '.profile-menu-icon.cache{color:#7a6ad8;background:rgba(122,106,216,.12)}',
      '.mobile-cache-page{display:grid;gap:12px}',
      '.mobile-cache-card{border:1px solid rgba(16,23,15,.10);border-radius:14px;background:#fffdf7;box-shadow:0 8px 22px rgba(16,23,15,.05);padding:14px;display:grid;gap:12px}',
      '.mobile-cache-card h3{margin:0;color:var(--deep);font-size:17px;font-weight:1000}',
      '.mobile-cache-card p{margin:0;color:var(--muted);font-size:13px;line-height:1.65;font-weight:850}',
      '.mobile-cache-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}',
      '.mobile-cache-list li{border:1px solid rgba(16,23,15,.08);border-radius:12px;background:#fffaf1;padding:10px;color:var(--deep);font-size:13px;line-height:1.45;font-weight:900}',
      '.mobile-cache-actions{display:grid;gap:9px}',
      '.mobile-cache-btn{min-height:42px;border:1px solid rgba(16,23,15,.12);border-radius:999px;background:#fffaf1;color:var(--deep);font-size:14px;font-weight:1000}',
      '.mobile-cache-btn.dark{background:var(--deep);border-color:var(--deep);color:#fffdf7}',
      '.mobile-cache-btn.danger{background:#fff6f2;border-color:rgba(217,121,121,.35);color:#b55d45}',
      '.mobile-cache-status{min-height:20px;color:var(--accent-dark)!important;font-weight:1000!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function menuButtonHtml(){
    return '<button class="profile-menu-item" type="button" data-profile-cache-open data-profile-cache-entry>' +
      '<span class="profile-menu-icon cache">♻</span><b>缓存清理</b></button>';
  }

  function addEntry(){
    var menu = $(MENU_SELECTOR);
    if(!menu || $('[data-profile-cache-entry]', menu)) return;
    menu.insertAdjacentHTML('beforeend', menuButtonHtml());
  }

  function renderCachePage(){
    var panel = $(PANEL_SELECTOR);
    if(!panel) return;
    panel.innerHTML = '<section class="profile-detail-card mobile-cache-page" data-mobile-cache-page>' +
      '<div class="profile-detail-head"><button class="profile-back-btn" type="button" data-profile-back>‹ 返回</button><h2>缓存清理</h2></div>' +
      '<div class="mobile-cache-card">' +
        '<h3>清理范围</h3>' +
        '<p>只清理手机端本地缓存，不删除账号、不退出登录，也不会删除线上帖子、回声、搭子和聊天记录。</p>' +
        '<ul class="mobile-cache-list">' +
          '<li>精神广场、回声、搭子、观鸟台等页面的本地列表缓存</li>' +
          '<li>头像、表情、帖子图片等媒体缓存</li>' +
          '<li>私聊本地快速显示缓存</li>' +
        '</ul>' +
      '</div>' +
      '<div class="mobile-cache-card">' +
        '<h3>操作</h3>' +
        '<div class="mobile-cache-actions">' +
          '<button class="mobile-cache-btn dark" type="button" data-mobile-cache-clear>清理本地缓存</button>' +
          '<button class="mobile-cache-btn" type="button" data-mobile-cache-scan>重新扫描当前页面图片</button>' +
        '</div>' +
        '<p class="mobile-cache-status" data-mobile-cache-status>清理后，再次进入页面会重新加载并生成新缓存。</p>' +
      '</div>' +
    '</section>';
  }

  function setStatus(text){
    var node = $('[data-mobile-cache-status]');
    if(node) node.textContent = text;
  }

  function removeMatchingLocalStorage(){
    var removed = 0;
    try{
      if(!window.localStorage) return 0;
      var keys = [];
      for(var i = 0; i < localStorage.length; i += 1){ keys.push(localStorage.key(i)); }
      keys.forEach(function(key){
        if(!key) return;
        var matched = LOCAL_PREFIXES.some(function(prefix){ return key.indexOf(prefix) === 0; });
        if(matched){ localStorage.removeItem(key); removed += 1; }
      });
    }catch(e){}
    return removed;
  }

  async function removeNamedCaches(){
    var removed = 0;
    if(!window.caches || !caches.keys) return removed;
    try{
      var names = await caches.keys();
      for(var i = 0; i < names.length; i += 1){
        var name = names[i];
        if(CACHE_NAMES.indexOf(name) >= 0 || /^fw-mobile-media-cache-/.test(name)){
          var ok = await caches.delete(name);
          if(ok) removed += 1;
        }
      }
    }catch(e){}
    return removed;
  }

  function resetRuntimeFlags(){
    var fw = app();
    if(fw && fw.state){
      if(Array.isArray(fw.state.posts)) fw.state.postsStale = true;
    }
    if(window.FWMobileModuleCache && typeof window.FWMobileModuleCache.patch === 'function'){
      try{ window.FWMobileModuleCache.patch(); }catch(e){}
    }
    if(window.FWMobileMediaCache && typeof window.FWMobileMediaCache.scan === 'function'){
      try{ window.FWMobileMediaCache.scan(); }catch(e){}
    }
  }

  async function clearCache(button){
    if(!window.confirm('确定清理手机端本地缓存吗？不会删除账号和线上数据。')) return;
    var old = button && button.textContent;
    if(button){ button.disabled = true; button.textContent = '清理中...'; }
    setStatus('正在清理本地缓存...');
    try{
      var localCount = removeMatchingLocalStorage();
      var cacheCount = await removeNamedCaches();
      resetRuntimeFlags();
      setStatus('已清理：本地记录 ' + localCount + ' 项，图片缓存 ' + cacheCount + ' 组。');
      toast('缓存已清理');
    }catch(e){
      console.warn('[FW mobile cache settings] clear failed', e);
      setStatus('清理失败，请稍后再试。');
      toast('缓存清理失败');
    }finally{
      if(button){ button.disabled = false; button.textContent = old || '清理本地缓存'; }
    }
  }

  function scanImages(){
    if(window.FWMobileMediaCache && typeof window.FWMobileMediaCache.scan === 'function'){
      try{
        window.FWMobileMediaCache.scan();
        setStatus('已重新扫描当前页面图片。');
        toast('已扫描图片缓存');
        return;
      }catch(e){}
    }
    setStatus('当前浏览器暂不支持图片缓存扫描。');
  }

  function backHome(){
    if(window.FWAppProfile && typeof window.FWAppProfile.render === 'function'){
      window.FWAppProfile.render();
      setTimeout(addEntry, 0);
      return;
    }
    var fw = app();
    if(fw && typeof fw.setView === 'function') fw.setView('profile');
  }

  function bind(){
    if(mounted) return;
    mounted = true;
    document.addEventListener('click', function(event){
      var target = event.target;
      if(!target || !target.closest) return;
      var open = target.closest('[data-profile-cache-open]');
      if(open){
        event.preventDefault();
        event.stopPropagation();
        renderCachePage();
        return;
      }
      var clear = target.closest('[data-mobile-cache-clear]');
      if(clear){
        event.preventDefault();
        event.stopPropagation();
        clearCache(clear);
        return;
      }
      var scan = target.closest('[data-mobile-cache-scan]');
      if(scan){
        event.preventDefault();
        event.stopPropagation();
        scanImages();
        return;
      }
    }, true);

    document.addEventListener('click', function(event){
      var page = $('[data-mobile-cache-page]');
      var back = event.target && event.target.closest && event.target.closest('[data-profile-back]');
      if(page && back){
        event.preventDefault();
        event.stopPropagation();
        if(event.stopImmediatePropagation) event.stopImmediatePropagation();
        backHome();
      }
    }, true);

    if(window.MutationObserver){
      var observer = new MutationObserver(function(){ addEntry(); });
      observer.observe(document.body, {childList:true, subtree:true});
    }
  }

  function start(){
    injectStyle();
    bind();
    addEntry();
    [120, 500, 1500].forEach(function(delay){ setTimeout(addEntry, delay); });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();