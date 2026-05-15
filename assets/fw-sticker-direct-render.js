// F.w 研究所：自定义表情直接显示补丁
// 作用：发送表情时只发送已保存的图片引用；聊天区一出现引用标记，立即显示为图片。
(function(){
  if(window.__FW_STICKER_DIRECT_RENDER__) return;
  window.__FW_STICKER_DIRECT_RENDER__ = true;

  var scanTimer = 0;
  var burstTimer = 0;

  function $(s, root){ return (root || document).querySelector(s); }
  function $$(s, root){ return Array.from((root || document).querySelectorAll(s)); }

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function decodeSticker(text){
    var raw = String(text || '').replace(/\s+/g, '');
    var prefix = '[[FW_USER_STICKER:';
    var start = raw.indexOf(prefix);
    if(start < 0) return '';
    start += prefix.length;
    var end = raw.indexOf(']]', start);
    if(end < 0) return '';
    var url = '';
    try{ url = atob(raw.slice(start, end)); }catch(e){ return ''; }
    if(url.indexOf('http') !== 0) return '';
    return url;
  }

  function injectStyle(){
    if($('#fw-sticker-direct-render-style')) return;
    var style = document.createElement('style');
    style.id = 'fw-sticker-direct-render-style';
    style.textContent = ''
      + '.fw-sticker-direct-bubble{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;color:inherit!important;word-break:normal!important;}'
      + '.fw-sticker-direct-imgwrap{display:inline-grid!important;place-items:center!important;max-width:132px!important;max-height:132px!important;background:transparent!important;padding:0!important;}'
      + '.fw-sticker-direct-imgwrap img{max-width:128px!important;max-height:128px!important;object-fit:contain!important;display:block!important;border-radius:10px!important;}';
    document.head.appendChild(style);
  }

  function renderBubble(el){
    if(!el || el.nodeType !== 1) return false;
    if(el.dataset && el.dataset.fwStickerDirectRendered === '1') return false;
    var url = decodeSticker(el.textContent || '');
    if(!url) return false;
    if(el.dataset) el.dataset.fwStickerDirectRendered = '1';
    el.classList.add('fw-sticker-direct-bubble');
    el.innerHTML = '<span class="fw-sticker-direct-imgwrap"><img src="' + esc(url) + '" alt="表情"></span>';
    return true;
  }

  function scan(root){
    root = root || document;
    var selectors = '.fw-wx-pm-bubble,.fw-bubble p,.fw-bubble,.fw-msg p,.fw-room-message,.room-message,[data-message-content]';
    $$(selectors, root).forEach(renderBubble);
    if(root.nodeType === 1){
      renderBubble(root);
      var closest = root.closest && root.closest(selectors);
      if(closest) renderBubble(closest);
    }
  }

  function schedule(ms){
    clearTimeout(scanTimer);
    scanTimer = setTimeout(function(){ scan(document); }, ms || 20);
  }

  function burst(){
    var n = 0;
    clearInterval(burstTimer);
    burstTimer = setInterval(function(){
      n += 1;
      scan(document);
      if(n >= 16) clearInterval(burstTimer);
    }, 200);
  }

  function observe(){
    var obs = new MutationObserver(function(mutations){
      var hit = false;
      mutations.forEach(function(m){
        Array.from(m.addedNodes || []).forEach(function(node){
          if(node.nodeType !== 1) return;
          if(String(node.textContent || '').indexOf('[[FW_USER_STICKER:') >= 0){
            hit = true;
            scan(node);
          }
        });
      });
      if(hit){ schedule(10); burst(); }
    });
    obs.observe(document.body, {childList:true, subtree:true});
  }

  function bind(){
    document.addEventListener('click', function(e){
      if(e.target.closest && e.target.closest('[data-fw-sticker-url]')) burst();
    }, true);
    document.addEventListener('submit', function(e){
      var f = e.target;
      if(f && (f.matches('[data-fw-wx-compose]') || f.matches('[data-room-form]'))) burst();
    }, true);
  }

  function boot(){
    injectStyle();
    observe();
    bind();
    schedule(0);
    setInterval(function(){ scan(document); }, 1000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
