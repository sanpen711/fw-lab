// F.w 研究所网页版会员身份同步。
// 只读取电脑端同一 RPC 返回的公开会员主题，不读取订单或支付信息。
(function(){
  'use strict';
  if(window.__FW_WEB_MEMBERSHIP__) return;
  window.__FW_WEB_MEMBERSHIP__ = true;

  var THEMES = {rose_gold:true, black_gold:true, pink_starlight:true};
  var themeByUser = Object.create(null);
  var resolved = new Set();
  var pending = new Set();
  var flushTimer = 0;
  var observer = null;
  var authBound = false;

  function validId(value){
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
  }
  function themeClass(theme){ return 'fw-vip-theme-' + (THEMES[theme] ? theme : 'rose_gold'); }
  function motionDelay(){
    var now = window.performance && typeof window.performance.now === 'function' ? window.performance.now() : Date.now();
    return '-' + Math.round(now % 6000) + 'ms';
  }
  function clearTheme(node){
    node.classList.remove('fw-web-vip-identity','fw-vip-theme-rose_gold','fw-vip-theme-black_gold','fw-vip-theme-pink_starlight');
  }
  function isNameNode(node){
    if(!node || !node.matches || !node.matches('b[data-user-id],span[data-user-id]')) return false;
    return !node.classList.contains('fw-avatar') && !node.classList.contains('fw-web-vip-badge') && !node.closest('.fw-avatar');
  }
  function badgeAfter(node, userId, theme){
    var next = node.nextElementSibling;
    var badge = next && next.matches('[data-fw-web-vip-badge]') ? next : null;
    if(!theme){ if(badge) badge.remove(); return; }
    if(!badge){
      badge = document.createElement('span');
      badge.className = 'fw-web-vip-badge';
      badge.dataset.fwWebVipBadge = userId;
      badge.textContent = 'VIP';
      node.insertAdjacentElement('afterend', badge);
    }
    clearTheme(badge);
    badge.classList.add('fw-web-vip-badge', themeClass(theme));
    badge.style.setProperty('--fw-vip-motion-delay', motionDelay());
  }
  function decorate(root){
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = [];
    if(scope.matches && scope.matches('[data-user-id],[data-fw-profile-user]')) nodes.push(scope);
    nodes = nodes.concat(Array.from(scope.querySelectorAll('[data-user-id],[data-fw-profile-user]')));
    nodes.forEach(function(node){
      if(node.hasAttribute('data-fw-web-vip-badge')) return;
      var userId = String(node.dataset.userId || node.dataset.fwProfileUser || '');
      if(!validId(userId)) return;
      var theme = themeByUser[userId] || '';
      if(node.matches('.fw-avatar,.fw-social-avatar,.web-square-echo-avatar')){
        clearTheme(node);
        if(theme) node.classList.add('fw-web-vip-identity', themeClass(theme));
      }
      if(isNameNode(node)) badgeAfter(node, userId, theme);
      if(!resolved.has(userId)) pending.add(userId);
    });
    if(pending.size) scheduleFlush();
  }
  function redecorateUsers(ids){
    (ids || []).forEach(function(userId){
      document.querySelectorAll('[data-user-id="' + userId + '"],[data-fw-profile-user="' + userId + '"]').forEach(function(node){ decorate(node); });
    });
  }
  function waitForClient(){
    return new Promise(function(resolve){
      var tries = 0;
      function check(){
        var client = window.fwDb && window.fwDb.enabled && window.fwDb.client;
        if(client){ resolve(client); return; }
        tries += 1;
        if(tries >= 50){ resolve(null); return; }
        setTimeout(check, 120);
      }
      check();
    });
  }
  async function hasSession(client){
    try{
      var result = await client.auth.getSession();
      return !!(result && result.data && result.data.session && result.data.session.user);
    }catch(e){ return false; }
  }
  function bindAuth(client){
    if(authBound || !client || !client.auth || !client.auth.onAuthStateChange) return;
    authBound = true;
    client.auth.onAuthStateChange(function(_, session){
      resolved.clear();
      pending.clear();
      if(!session){
        themeByUser = Object.create(null);
        decorate(document);
        return;
      }
      decorate(document);
    });
  }
  async function flush(){
    clearTimeout(flushTimer);
    flushTimer = 0;
    var ids = Array.from(pending).slice(0, 200);
    ids.forEach(function(id){ pending.delete(id); });
    if(!ids.length) return;
    var client = await waitForClient();
    if(!client) return;
    bindAuth(client);
    if(!(await hasSession(client))) return;
    ids.forEach(function(id){ resolved.add(id); });
    try{
      var result = await client.rpc('fw_get_active_membership_styles', {p_user_ids:ids});
      if(result.error) throw result.error;
      var found = Object.create(null);
      (result.data || []).forEach(function(row){
        var id = String(row.user_id || '');
        if(validId(id)) found[id] = THEMES[row.theme] ? row.theme : 'rose_gold';
      });
      ids.forEach(function(id){ themeByUser[id] = found[id] || ''; });
      redecorateUsers(ids);
    }catch(e){
      ids.forEach(function(id){ resolved.delete(id); });
      console.warn('[FW web membership] 会员标志读取失败', e);
    }
    if(pending.size) scheduleFlush();
  }
  function scheduleFlush(){
    if(flushTimer) return;
    flushTimer = setTimeout(flush, 80);
  }
  function boot(){
    decorate(document);
    observer = new MutationObserver(function(records){
      records.forEach(function(record){
        record.addedNodes.forEach(function(node){ if(node.nodeType === 1) decorate(node); });
      });
    });
    observer.observe(document.body, {childList:true, subtree:true});
    window.addEventListener('focus', function(){ decorate(document); });
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) decorate(document); });
    document.addEventListener('fw:square-data-updated', function(){ decorate(document); });
    waitForClient().then(bindAuth);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
