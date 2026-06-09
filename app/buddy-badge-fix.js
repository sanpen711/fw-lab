(function(){
  if(window.__FW_MOBILE_BUDDY_BADGE_FIX__) return;
  window.__FW_MOBILE_BUDDY_BADGE_FIX__ = true;

  var timer = 0;
  var busy = false;
  var lastVisible = false;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function app(){ return window.FWApp || null; }
  function client(){ return window.fwDb && window.fwDb.client; }

  function badge(){
    var button = $('[data-app-nav="buddy"]');
    if(!button) return null;
    var node = $('.mobile-echo-badge', button);
    if(!node){
      node = document.createElement('span');
      node.className = 'mobile-echo-badge';
      button.appendChild(node);
    }
    return node;
  }

  function setBadge(visible){
    var button = $('[data-app-nav="buddy"]');
    var node = badge();
    if(!button || !node) return;
    node.textContent = '';
    node.setAttribute('aria-hidden', 'true');
    node.classList.toggle('show', !!visible);
    button.classList.toggle('has-mobile-echo-badge', !!visible);
    lastVisible = !!visible;
  }

  function dotOnly(){
    if($('#fwMobileBuddyBadgeFixStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileBuddyBadgeFixStyle';
    style.textContent = [
      '[data-app-nav="buddy"] .mobile-echo-badge{width:13px!important;min-width:13px!important;height:13px!important;padding:0!important;border-radius:999px!important;font-size:0!important;line-height:0!important;color:transparent!important;overflow:hidden!important;right:22px!important;top:6px!important}',
      '[data-app-nav="buddy"] .mobile-echo-badge::before{content:""!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  async function currentUser(){
    var fw = app();
    if(fw && fw.state && fw.state.user) return fw.state.user;
    if(fw && fw.refreshUser){
      try{ return await fw.refreshUser(); }catch(e){}
    }
    if(window.fwDb && window.fwDb.getCurrentUser){
      try{ return await window.fwDb.getCurrentUser(); }catch(e){}
    }
    return null;
  }

  async function refresh(){
    dotOnly();
    var node = badge();
    if(node) node.textContent = '';
    if(busy) return;
    busy = true;
    try{
      var c = client();
      var me = await currentUser();
      if(!c || !me || !me.id){ setBadge(false); return; }

      var notices = await c
        .from('notifications')
        .select('id,type')
        .eq('user_id', me.id)
        .eq('is_read', false)
        .in('type', ['private_message','friend_request','friend_accept'])
        .limit(1);
      if(notices && notices.error) throw notices.error;
      if((notices.data || []).length){ setBadge(true); return; }

      var pending = await c
        .from('friendships')
        .select('id', {count:'exact', head:true})
        .eq('receiver_id', me.id)
        .eq('status', 'pending');
      if(pending && pending.error) throw pending.error;
      setBadge(Number(pending && pending.count || 0) > 0);
    }catch(e){
      console.warn('[FW mobile app] buddy badge fix refresh failed', e);
      setBadge(lastVisible);
    }finally{
      busy = false;
    }
  }

  function boot(){
    dotOnly();
    setTimeout(refresh, 300);
    setTimeout(refresh, 1200);
    setTimeout(refresh, 2600);
    clearInterval(timer);
    timer = setInterval(refresh, 2500);
    document.addEventListener('click', function(e){
      if(e.target.closest && e.target.closest('[data-buddy-open-chat],[data-buddy-tab],[data-app-nav="buddy"]')){
        setTimeout(refresh, 350);
        setTimeout(refresh, 1400);
      }
    }, true);
    window.addEventListener('focus', function(){ setTimeout(refresh, 300); });
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) setTimeout(refresh, 300); });
    window.FWAppBuddyBadgeFix = {refresh:refresh, set:setBadge};
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
