// F.w 研究所：手机端搭子页 UI 微调与本地未读状态
(function(){
  if(window.__FW_MOBILE_BUDDY_READ_TWEAKS__) return;
  window.__FW_MOBILE_BUDDY_READ_TWEAKS__ = true;

  function app(){ return window.FWApp || null; }
  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function userKey(){
    var fw = app();
    var userId = fw && fw.state && fw.state.user && fw.state.user.id;
    return 'fw_mobile_buddy_read:' + (userId || 'guest');
  }

  function readMap(){
    try{ return JSON.parse(localStorage.getItem(userKey()) || '{}') || {}; }
    catch(e){ return {}; }
  }

  function saveReadMap(map){
    try{ localStorage.setItem(userKey(), JSON.stringify(map || {})); }catch(e){}
  }

  function rowSignature(row){
    if(!row) return '';
    var userId = row.getAttribute('data-buddy-open-chat') || '';
    var snippet = $('.buddy-message-snippet', row);
    var time = $('.buddy-message-time', row);
    return [userId, snippet ? snippet.textContent.trim() : '', time ? time.textContent.trim() : ''].join('|');
  }

  function markReadByRow(row){
    if(!row) return;
    var userId = row.getAttribute('data-buddy-open-chat') || '';
    if(!userId) return;
    var map = readMap();
    map[userId] = rowSignature(row);
    saveReadMap(map);
    var dot = $('.buddy-dot', row);
    if(dot) dot.hidden = true;
  }

  function markReadByUserId(userId){
    if(!userId) return;
    var row = $('[data-buddy-open-chat="' + String(userId).replace(/"/g, '\\"') + '"].buddy-message-row');
    if(row) markReadByRow(row);
  }

  function applyUnreadDots(){
    var map = readMap();
    $$('.buddy-message-row[data-buddy-open-chat]').forEach(function(row){
      var userId = row.getAttribute('data-buddy-open-chat') || '';
      var dot = $('.buddy-dot', row);
      if(!dot || !userId) return;
      dot.hidden = map[userId] === rowSignature(row);
    });
  }

  function injectStyle(){
    if(document.getElementById('fwMobileBuddyReadTweaksStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileBuddyReadTweaksStyle';
    style.textContent = [
      '[data-app-view="buddy"] > .tabs{background:transparent!important;box-shadow:none!important;padding-top:0!important;padding-bottom:10px!important}',
      '[data-app-view="buddy"] > .tabs:before,[data-app-view="buddy"] > .tabs:after{display:none!important;content:none!important}',
      '.buddy-dot[hidden]{display:none!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function observeBuddyList(){
    var list = $('[data-buddy-list]');
    if(!list || list.__fwBuddyReadObserver) return;
    list.__fwBuddyReadObserver = true;
    var observer = new MutationObserver(function(){
      window.requestAnimationFrame(applyUnreadDots);
    });
    observer.observe(list, {childList:true, subtree:true});
  }

  function boot(){
    injectStyle();
    observeBuddyList();
    applyUnreadDots();
    document.addEventListener('click', function(e){
      var row = e.target.closest && e.target.closest('.buddy-message-row[data-buddy-open-chat]');
      if(row){
        markReadByRow(row);
        setTimeout(applyUnreadDots, 120);
        return;
      }
      var chat = e.target.closest && e.target.closest('[data-buddy-open-chat]');
      if(chat){
        markReadByUserId(chat.getAttribute('data-buddy-open-chat'));
        setTimeout(applyUnreadDots, 120);
      }
    }, true);
    window.addEventListener('focus', function(){ setTimeout(applyUnreadDots, 150); });
    setInterval(function(){ observeBuddyList(); applyUnreadDots(); }, 2500);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
