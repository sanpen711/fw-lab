// F.w 研究所：手机端搭子私聊打开加速
// 作用：先用页面已有资料立即打开聊天壳；缓存会话 ID，减少重复打开时的等待。
(function(){
  if(window.__FW_MOBILE_BUDDY_OPEN_FAST__) return;
  window.__FW_MOBILE_BUDDY_OPEN_FAST__ = true;

  var PROFILE_KEY = 'fw_mobile_buddy_quick_profile:';
  var CONV_KEY = 'fw_mobile_buddy_conversation:';
  var openingTargetId = '';
  var rpcPatched = false;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function app(){ return window.FWApp || null; }
  function client(){ return window.fwDb && window.fwDb.client; }

  function safeParse(value){
    try{ return JSON.parse(value || '{}') || {}; }catch(e){ return {}; }
  }

  function getCachedProfile(targetId){
    try{ return safeParse(localStorage.getItem(PROFILE_KEY + String(targetId || ''))); }catch(e){ return {}; }
  }

  function setCachedProfile(targetId, profile){
    if(!targetId || !profile) return;
    try{
      localStorage.setItem(PROFILE_KEY + String(targetId), JSON.stringify({
        nickname:profile.nickname || '',
        lab_code:profile.lab_code || '',
        avatar_html:profile.avatar_html || '',
        updated_at:Date.now()
      }));
    }catch(e){}
  }

  function profileFromNode(node){
    node = node || document;
    var root = node.closest && node.closest('.buddy-contact-card,.buddy-message-row,.buddy-row,.buddy-profile-card,.list-item') || node;
    var nameNode = $('.buddy-contact-name', root) || $('.list-main b', root) || $('.buddy-profile-name', root);
    var avatarNode = $('.list-avatar', root);
    return {
      nickname:nameNode ? String(nameNode.textContent || '').trim() : '',
      avatar_html:avatarNode ? avatarNode.innerHTML : ''
    };
  }

  function storeConversation(targetId, convId){
    convId = Number(convId);
    if(!targetId || !Number.isFinite(convId) || convId <= 0) return;
    try{
      localStorage.setItem(CONV_KEY + String(targetId), JSON.stringify({id:convId, updated_at:Date.now()}));
    }catch(e){}
  }

  function cachedConversation(targetId){
    try{
      var row = safeParse(localStorage.getItem(CONV_KEY + String(targetId || '')));
      var id = Number(row.id);
      var age = Date.now() - Number(row.updated_at || 0);
      if(Number.isFinite(id) && id > 0 && age < 1000 * 60 * 60 * 12) return id;
    }catch(e){}
    return 0;
  }

  function patchRpc(){
    if(rpcPatched) return;
    var c = client();
    if(!c || typeof c.rpc !== 'function'){ setTimeout(patchRpc, 500); return; }
    rpcPatched = true;
    var originalRpc = c.rpc.bind(c);
    c.rpc = function(name, args){
      args = args || {};
      if(name === 'fw_get_or_create_conversation' && args.target_user_id){
        var targetId = String(args.target_user_id || '');
        var cached = cachedConversation(targetId);
        if(cached){
          // 只对已成功缓存过的会话走快速路径；原 openChat 后续仍会读取消息。
          return Promise.resolve({data:cached, error:null});
        }
        return originalRpc(name, args).then(function(result){
          if(result && !result.error) storeConversation(targetId, result.data);
          return result;
        });
      }
      return originalRpc.apply(c, arguments).then(function(result){
        if(name === 'fw_send_private_message_to_user' && args.target_user_id && result && !result.error){
          storeConversation(String(args.target_user_id), result.data);
        }
        return result;
      });
    };
  }

  function openShellQuick(targetId, profile){
    var view = $('[data-app-view="buddy"]');
    if(!view || !targetId) return;
    var title = $('[data-buddy-chat-title]');
    var sub = $('[data-buddy-chat-sub]');
    var box = $('[data-buddy-chat-messages]');
    profile = profile || {};
    view.classList.remove('is-profile');
    view.classList.add('is-chatting');
    document.body.classList.add('fw-buddy-chatting');
    if(title) title.textContent = '和 ' + (profile.nickname || '摸鱼搭子') + ' 私聊';
    if(sub) sub.textContent = profile.lab_code ? '实验品编号：' + profile.lab_code : '低功耗私聊连接中';
    if(box && !box.dataset.fwQuickOpening){
      box.dataset.fwQuickOpening = '1';
      box.innerHTML = '<div class="buddy-empty-tip">正在打开私聊...</div>';
      setTimeout(function(){ delete box.dataset.fwQuickOpening; }, 1800);
    }
  }

  function bindClicks(){
    document.addEventListener('click', function(event){
      var opener = event.target.closest && event.target.closest('[data-buddy-open-chat]');
      if(!opener) return;
      var targetId = opener.getAttribute('data-buddy-open-chat') || opener.dataset.buddyOpenChat || '';
      if(!targetId) return;
      openingTargetId = targetId;
      var profile = profileFromNode(opener);
      var cached = getCachedProfile(targetId);
      profile = Object.assign({}, cached, profile.nickname ? profile : {});
      setCachedProfile(targetId, profile);
      requestAnimationFrame(function(){
        if(openingTargetId === targetId) openShellQuick(targetId, profile);
      });
      setTimeout(function(){ if(openingTargetId === targetId) openingTargetId = ''; }, 2500);
    }, true);
  }

  function boot(){
    bindClicks();
    patchRpc();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
