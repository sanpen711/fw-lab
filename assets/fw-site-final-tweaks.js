// F.w 研究所：最终补丁
// 修复：1）点击回声不清掉搭子私聊未读；2）搭子头像/列表/消息增加身份提示；3）全站补公开处刑入口。
(function(){
  if(window.__FW_SITE_FINAL_TWEAKS__) return;
  window.__FW_SITE_FINAL_TWEAKS__ = true;

  var profileCache = {};
  var previewCache = {time:0, data:{}};
  var enhancing = false;

  var $ = function(s){ return document.querySelector(s); };
  var $$ = function(s){ return Array.from(document.querySelectorAll(s)); };

  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
        resolve(true);
        return;
      }

      var n = 0;
      var timer = setInterval(function(){
        n++;

        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
          clearInterval(timer);
          resolve(true);
        }

        if(n > 80){
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  async function getMe(){
    try{
      if(!(await waitDb())) return null;
      return await window.fwDb.getCurrentUser();
    }catch(e){
      return null;
    }
  }

  function shortText(v){
    var s = String(v || '').replace(/\s+/g, ' ').trim();
    return s.length > 32 ? s.slice(0, 32) + '…' : s;
  }

  function patchNav(){
    var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    var active = page === 'admin.html';

    function one(nav){
      if(!nav) return;

      var a = nav.querySelector('a[href="admin.html"]');

      if(!a){
        a = document.createElement('a');
        a.href = 'admin.html';
        nav.appendChild(a);
      }

      a.textContent = '公开处刑';
      a.classList.toggle('active', active);
    }

    $$('.nav').forEach(one);
    $$('.mobile-nav').forEach(one);
  }

  async function unreadPrivateIds(){
    try{
      var u = await getMe();
      if(!u || !u.id) return [];

      var r = await window.fwDb.client
        .from('notifications')
        .select('id')
        .eq('user_id', u.id)
        .eq('is_read', false)
        .eq('type', 'private_message');

      if(r.error) return [];

      return (r.data || []).map(function(x){
        return x.id;
      }).filter(Boolean);
    }catch(e){
      return [];
    }
  }

  async function restorePrivateUnread(ids){
    try{
      if(!ids || !ids.length) return;

      await window.fwDb.client
        .from('notifications')
        .update({is_read:false})
        .in('id', ids)
        .eq('type', 'private_message');
    }catch(e){}
  }

  function protectEcho(){
    window.addEventListener('click', async function(e){
      var btn = e.target.closest && e.target.closest('[data-fw-open-echo]');
      if(!btn) return;

      var ids = await unreadPrivateIds();

      e.preventDefault();
      e.stopPropagation();

      if(e.stopImmediatePropagation){
        e.stopImmediatePropagation();
      }

      if(typeof window.fwOpenStableEcho === 'function'){
        window.fwOpenStableEcho();
      }

      setTimeout(function(){
        restorePrivateUnread(ids);
      }, 700);

      setTimeout(function(){
        restorePrivateUnread(ids);
      }, 1500);
    }, true);
  }

  async function fetchProfiles(ids){
    ids = Array.from(new Set((ids || []).filter(Boolean)));

    var need = ids.filter(function(id){
      return !profileCache[id];
    });

    if(need.length){
      try{
        var r = await window.fwDb.client
          .from('profiles')
          .select('id,nickname,avatar_url,lab_code')
          .in('id', need);

        if(!r.error){
          (r.data || []).forEach(function(p){
            profileCache[p.id] = p;
          });
        }
      }catch(e){}
    }

    var out = {};

    ids.forEach(function(id){
      if(profileCache[id]){
        out[id] = profileCache[id];
      }
    });

    return out;
  }

  async function getPreviews(){
    var u = await getMe();

    if(!u || !u.id) return {};

    if(Date.now() - previewCache.time < 1800){
      return previewCache.data;
    }

    var out = {};

    try{
      var c = await window.fwDb.client
        .from('conversations')
        .select('id,user_one_id,user_two_id,updated_at')
        .or('user_one_id.eq.' + u.id + ',user_two_id.eq.' + u.id)
        .order('updated_at', {ascending:false})
        .limit(120);

      var convs = c.data || [];
      var ids = convs.map(function(x){ return x.id; });
      var other = {};

      convs.forEach(function(x){
        other[x.id] = x.user_one_id === u.id ? x.user_two_id : x.user_one_id;
      });

      if(ids.length){
        var m = await window.fwDb.client
          .from('private_messages')
          .select('id,conversation_id,sender_id,content,is_deleted,created_at')
          .in('conversation_id', ids)
          .eq('is_deleted', false)
          .order('created_at', {ascending:false})
          .limit(240);

        (m.data || []).forEach(function(msg){
          var oid = other[msg.conversation_id];

          if(!oid || out[oid]) return;

          out[oid] = {
            mine: msg.sender_id === u.id,
            content: msg.content || ''
          };
        });
      }
    }catch(e){}

    previewCache = {
      time: Date.now(),
      data: out
    };

    return out;
  }

  async function enhanceBuddyList(){
    if(enhancing) return;

    var modal = $('[data-fw-wx-buddy-modal].show, .fw-wx-modal.show');
    var list = $('[data-fw-wx-list]');

    if(!modal || !list) return;

    enhancing = true;

    try{
      var rows = $$('.fw-wx-item[data-fw-wx-chat-user]').filter(function(x){
        return list.contains(x);
      });

      var ids = rows.map(function(x){
        return x.dataset.fwWxChatUser;
      }).filter(Boolean);

      var ps = await fetchProfiles(ids);
      var pv = await getPreviews();

      rows.forEach(function(row){
        var id = row.dataset.fwWxChatUser;
        var p = ps[id] || {};

        var nameBox = row.querySelector('.fw-wx-name');
        var name = p.nickname || (nameBox && nameBox.textContent) || '低功耗研究员';
        var lab = p.lab_code || '未设置';

        var title = name + '｜实验品编号：' + lab;

        row.title = title;
        row.setAttribute('aria-label', title);

        var av = row.querySelector('.fw-wx-avatar');

        if(av){
          av.title = title;
          av.setAttribute('aria-label', title);
        }

        if(nameBox){
          nameBox.textContent = name;
          nameBox.title = title;
        }

        var sub = row.querySelector('.fw-wx-sub');

        if(sub){
          var text = '实验品编号：' + lab;

          if(pv[id]){
            text += '｜最后消息：' + (pv[id].mine ? '我：' : '对方：') + shortText(pv[id].content);
          }else{
            text += '｜点击进入私聊';
          }

          sub.textContent = text;
          sub.title = text;
        }
      });
    }finally{
      enhancing = false;
    }
  }

  function enhanceChatNames(){
    var modal = $('[data-fw-wx-buddy-modal].show, .fw-wx-modal.show');

    if(!modal) return;

    var chatTitle = $('[data-fw-wx-chat-title]');
    var chatSub = $('[data-fw-wx-chat-sub]');

    var name = (chatTitle ? chatTitle.textContent : '')
      .replace(/^和\s*/, '')
      .replace(/\s*私聊$/, '')
      .trim() || '搭子';

    var sub = chatSub ? chatSub.textContent : '';
    var match = sub.match(/实验品编号[:：]\s*([^\s｜]+)/);
    var lab = match ? match[1] : '未设置';

    $$('.fw-wx-pm').forEach(function(pm){
      var box = pm.querySelector('.fw-wx-pm-name');

      if(!box) return;

      if(pm.classList.contains('me')){
        box.textContent = '我｜本人';
        box.title = '我｜本人';
      }else{
        var text = name + '｜实验品编号：' + lab;
        box.textContent = text;
        box.title = text;
      }
    });
  }

  function scheduleEnhance(){
    setTimeout(function(){
      enhanceBuddyList();
      enhanceChatNames();
    }, 250);

    setTimeout(function(){
      enhanceBuddyList();
      enhanceChatNames();
    }, 800);

    setTimeout(function(){
      enhanceBuddyList();
      enhanceChatNames();
    }, 1600);
  }

  function bindEnhance(){
    document.addEventListener('click', function(e){
      if(e.target.closest('[data-fw-open-buddy], [data-fw-wx-tab], [data-fw-wx-chat-user], [data-fw-wx-chat-direct], [data-fw-start-chat], [data-fw-wx-reset]')){
        scheduleEnhance();
      }
    }, true);

    document.addEventListener('submit', function(e){
      if(e.target.closest('[data-fw-wx-compose], [data-fw-wx-search]')){
        scheduleEnhance();
      }
    }, true);

    var obs = new MutationObserver(function(){
      if($('.fw-wx-modal.show')){
        scheduleEnhance();
      }
    });

    obs.observe(document.body, {
      childList:true,
      subtree:true
    });

    setInterval(function(){
      if($('.fw-wx-modal.show')){
        enhanceBuddyList();
        enhanceChatNames();
      }
    }, 2200);
  }

  function boot(){
    patchNav();
    protectEcho();
    bindEnhance();

    setTimeout(patchNav, 700);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }else{
    boot();
  }
})();
