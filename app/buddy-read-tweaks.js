// Server notifications are authoritative; never mark unread messages from local signatures.
(function(){
  if(window.__FW_MOBILE_BUDDY_READ_TWEAKS__) return;
  window.__FW_MOBILE_BUDDY_READ_TWEAKS__ = true;
  var generation=0, timer=0, refreshTimer=0, inbox=[], owner='';
  function app(){return window.FWApp;}
  function client(){return window.fwDb && window.fwDb.client;}
  function currentUser(){return app() && app().state && app().state.user;}
  function $(selector,root){return (root||document).querySelector(selector);}
  function $$(selector,root){return Array.prototype.slice.call((root||document).querySelectorAll(selector));}
  function fail(result){if(result && result.error)throw result.error;return result && result.data || [];}
  function setBuddyBadge(count){
    var button=$('[data-app-nav="buddy"]');if(!button)return;
    var badge=button.querySelector('.mobile-buddy-badge');
    if(!badge){badge=document.createElement('span');badge.className='mobile-buddy-badge';badge.setAttribute('aria-hidden','true');button.appendChild(badge);}
    badge.classList.toggle('show',!!count);button.classList.toggle('has-mobile-buddy-badge',!!count);
  }
  function applyUnreadDots(){
    var me=currentUser(), map={};
    if(me && owner===me.id)inbox.forEach(function(row){map[row.user_id]=!!row.unread;});
    $$('.buddy-message-row[data-buddy-open-chat]').forEach(function(row){
      var dot=$('.buddy-dot',row);if(dot)dot.hidden=!map[row.dataset.buddyOpenChat];
    });
  }
  function setInbox(rows,uid){
    if(!currentUser() || currentUser().id!==uid)return;
    owner=uid;inbox=rows||[];applyUnreadDots();
  }
  async function refreshBuddyBadge(){
    var me=currentUser(), c=client(), token=++generation;
    if(!me || !c){owner='';inbox=[];setBuddyBadge(0);applyUnreadDots();return false;}
    try{
      var results=await Promise.all([
        c.rpc('fw_mobile_buddy_inbox'),
        c.from('friendships').select('id,requester_id,receiver_id,status').or('requester_id.eq.'+me.id+',receiver_id.eq.'+me.id)
      ]);
      var rows=fail(results[0]), relations=fail(results[1]);
      var received=relations.filter(function(row){return row.receiver_id===me.id && row.status==='pending';}).map(function(row){return String(row.id);});
      var accepted=relations.filter(function(row){return row.requester_id===me.id && row.status==='accepted';}).map(function(row){return String(row.id);});
      var notices=await Promise.all([
        received.length?c.from('notifications').select('id').eq('user_id',me.id).eq('type','friend_request').eq('is_read',false).in('target_id',received).limit(1):Promise.resolve({data:[]}),
        accepted.length?c.from('notifications').select('id').eq('user_id',me.id).eq('type','friend_accept').eq('is_read',false).in('target_id',accepted).limit(1):Promise.resolve({data:[]})
      ]);
      var hasBadge=rows.some(function(row){return row.unread;})||fail(notices[0]).length>0||fail(notices[1]).length>0;
      if(token!==generation || !currentUser() || currentUser().id!==me.id)return false;
      setInbox(rows,me.id);setBuddyBadge(hasBadge);
      return hasBadge;
    }catch(e){console.warn('[FW mobile app] buddy badge refresh failed',e);return false;}
  }
  function requestBadgeRefresh(delay){clearTimeout(refreshTimer);refreshTimer=setTimeout(refreshBuddyBadge,delay==null?100:delay);}
  function injectStyle(){
    if(document.getElementById('fwMobileBuddyReadTweaksStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileBuddyReadTweaksStyle';
    style.textContent = [
      '[data-app-view="buddy"] > .tabs{background:transparent!important;box-shadow:none!important;padding-top:0!important;padding-bottom:10px!important}',
      '[data-app-view="buddy"] > .tabs:before,[data-app-view="buddy"] > .tabs:after{display:none!important;content:none!important}',
      '.buddy-dot[hidden]{display:none!important}',
      '.app-tabbar button{position:relative}',
      '[data-app-nav="buddy"] .mobile-buddy-badge{position:absolute;right:22px;top:6px;width:13px;min-width:13px;height:13px;padding:0;border-radius:999px;background:#d95353;border:2px solid #fff;display:none;box-shadow:0 4px 12px rgba(0,0,0,.22);box-sizing:border-box}',
      '[data-app-nav="buddy"] .mobile-buddy-badge.show{display:block}'
    ].join('\n');
    document.head.appendChild(style);
  }


  function scheduleBadgeLoop(){
    clearTimeout(timer);if(document.hidden)return;
    timer=setTimeout(async function(){
      await refreshBuddyBadge();
      var fw=app(), buddy=window.FWAppBuddy;
      if(fw && fw.state.view==='buddy' && buddy && !buddy.getActiveTargetId())await buddy.load(true);
      scheduleBadgeLoop();
    },30000);
  }
  function boot(){
    injectStyle();refreshBuddyBadge();scheduleBadgeLoop();
    window.addEventListener('focus',function(){requestBadgeRefresh(0);});
    document.addEventListener('fw:app-visibility',function(event){if(!event.detail.visible){clearTimeout(timer);return;}requestBadgeRefresh(0);scheduleBadgeLoop();});
    document.addEventListener('fw:app-userchange',function(){++generation;owner='';inbox=[];setBuddyBadge(0);applyUnreadDots();requestBadgeRefresh(0);scheduleBadgeLoop();});
    document.addEventListener('fw:buddy-unread-changed',function(){requestBadgeRefresh(0);});
  }
  window.FWAppBuddyUnread={apply:applyUnreadDots,refresh:refreshBuddyBadge,refreshBadge:refreshBuddyBadge,setInbox:setInbox,requestBadgeRefresh:requestBadgeRefresh,hasUnread:refreshBuddyBadge,
    markRead:function(){return window.FWAppBuddy && window.FWAppBuddy.acknowledgeDisplayed();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
