// F.w 研究所：学术研讨稳定显示补丁 v2
// 作用：
// 1. 修复房间头像/昵称一会有一会没有的问题。
// 2. 给房间消息补发言时间。
// 3. 轮询重绘后先同步使用缓存补齐，减少时间一会有一会没有。
(function(){
  if(window.__FW_ROOM_STABLE_DISPLAY_FIX_V2__) return;
  window.__FW_ROOM_STABLE_DISPLAY_FIX_V2__ = true;

  // 阻止 fw-avatar-mobile-fix.js 里旧的房间异步补丁运行。
  window.__FW_ROOM_PROFILE_TIME_FIX__ = true;

  var messageCache = {};
  var profileCache = {};
  var currentMeCache = null;
  var loadingIds = false;
  var renderTimer = 0;
  var profileSelectPatched = false;

  function $(s){ return document.querySelector(s); }
  function $$(s, root){ return Array.from((root || document).querySelectorAll(s)); }

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      var n = 0;
      var t = setInterval(function(){
        n += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(t); resolve(true); }
        if(n > 120){ clearInterval(t); resolve(false); }
      }, 100);
    });
  }

  function injectStyle(){
    if($('#fw-room-stable-display-style')) return;
    var style = document.createElement('style');
    style.id = 'fw-room-stable-display-style';
    style.textContent = `
      .fw-msg-name{
        display:flex!important;
        align-items:center!important;
        gap:8px!important;
        flex-wrap:wrap!important;
      }
      .fw-msg.me .fw-msg-name{
        justify-content:flex-end!important;
      }
      .fw-room-msg-time{
        color:#8c8378!important;
        font-size:11px!important;
        font-weight:850!important;
        opacity:.92!important;
        white-space:nowrap!important;
        min-width:38px!important;
        display:inline-block!important;
      }
      .fw-msg.me .fw-room-msg-time{
        color:rgba(255,255,255,.84)!important;
      }
      .fw-avatar.room img{
        width:100%!important;
        height:100%!important;
        object-fit:cover!important;
        display:block!important;
        border-radius:999px!important;
      }
    `;
    document.head.appendChild(style);
  }

  function fmtTime(v){
    if(!v) return '';
    var d = new Date(v);
    if(isNaN(d.getTime())) return '';

    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.round((today.getTime() - day.getTime()) / 86400000);
    var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

    if(diff === 0) return hm;
    if(diff === 1) return '昨天 ' + hm;
    if(now.getFullYear() === d.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
  }

  function initials(name){
    return String(name || 'FW').trim().slice(0, 2).toUpperCase();
  }

  function avatarHtml(name, url){
    if(url) return '<img src="' + esc(url) + '" alt="' + esc(name || '研究员') + '">';
    return esc(initials(name));
  }

  async function getMe(){
    try{
      if(!(await waitDb())) return currentMeCache;
      currentMeCache = await window.fwDb.getCurrentUser();
      return currentMeCache;
    }catch(e){
      return currentMeCache;
    }
  }

  async function patchProfileSelect(){
    if(profileSelectPatched) return;
    if(!(await waitDb())) return;
    if(!window.fwDb || !window.fwDb.client || !window.fwDb.client.from) return;

    profileSelectPatched = true;
    var client = window.fwDb.client;
    var oldFrom = client.from.bind(client);

    client.from = function(table){
      var builder = oldFrom(table);

      if(table === 'profiles' && builder && typeof builder.select === 'function' && !builder.__fwRoomProfileSelectPatched){
        var oldSelect = builder.select.bind(builder);
        builder.select = function(columns){
          if(typeof columns === 'string'){
            columns = columns
              .replace(/,\s*role\b/g, '')
              .replace(/\brole\s*,/g, '')
              .replace(/,\s*is_banned\b/g, '')
              .replace(/\bis_banned\s*,/g, '');
          }
          return oldSelect.apply(builder, [columns].concat(Array.prototype.slice.call(arguments, 1)));
        };
        builder.__fwRoomProfileSelectPatched = true;
      }

      return builder;
    };
  }

  async function loadMissing(ids){
    if(loadingIds) return;
    if(!(await waitDb())) return;

    var missing = ids.filter(function(id){ return id && !messageCache[id]; });
    if(!missing.length) return;

    loadingIds = true;
    try{
      var msgRes = await window.fwDb.client
        .from('chat_messages')
        .select('id,user_id,created_at')
        .in('id', missing);

      if(msgRes.error) throw msgRes.error;

      var userIds = [];
      (msgRes.data || []).forEach(function(row){
        messageCache[String(row.id)] = row;
        if(row.user_id && userIds.indexOf(row.user_id) < 0 && !profileCache[row.user_id]) userIds.push(row.user_id);
      });

      if(userIds.length){
        var profileRes = await window.fwDb.client
          .from('profiles')
          .select('id,nickname,avatar_url,lab_code')
          .in('id', userIds);

        if(!profileRes.error){
          (profileRes.data || []).forEach(function(p){ profileCache[p.id] = p; });
        }
      }
    }catch(e){
      console.warn('[FW room stable display] load missing failed', e);
    }finally{
      loadingIds = false;
    }
  }

  function applyCached(me){
    var box = $('[data-room-messages]');
    if(!box) return;

    $$('.fw-msg[data-message-id][data-user-id]', box).forEach(function(el){
      var id = String(el.dataset.messageId || '');
      var uid = String(el.dataset.userId || '');
      var msg = messageCache[id] || {};
      uid = String(msg.user_id || uid);

      var p = profileCache[uid] || {};
      var isMe = !!(me && uid === me.id);
      var name = p.nickname || (isMe ? me.nickname : '研究员');
      var url = p.avatar_url || (isMe ? me.avatar_url : '');
      var time = fmtTime(msg.created_at);

      var avatar = el.querySelector('.fw-avatar.room');
      if(avatar){
        var nextAvatar = avatarHtml(name, url);
        if(avatar.dataset.fwStableAvatar !== nextAvatar){
          avatar.innerHTML = nextAvatar;
          avatar.dataset.fwStableAvatar = nextAvatar;
        }
      }

      var nameEl = el.querySelector('.fw-msg-name');
      if(nameEl){
        var baseName = name + (isMe ? '（我）' : '');
        var oldTimeEl = nameEl.querySelector('.fw-room-msg-time');
        var oldTime = oldTimeEl ? oldTimeEl.textContent : '';
        var finalTime = time || oldTime || '';
        var timeHtml = finalTime ? '<span class="fw-room-msg-time">' + esc(finalTime) + '</span>' : '';
        var nextName = esc(baseName) + timeHtml;
        if(nameEl.dataset.fwStableName !== nextName){
          nameEl.innerHTML = nextName;
          nameEl.dataset.fwStableName = nextName;
        }
      }
    });
  }

  async function enhance(){
    var box = $('[data-room-messages]');
    if(!box) return;

    var ids = $$('.fw-msg[data-message-id]', box)
      .map(function(el){ return String(el.dataset.messageId || ''); })
      .filter(Boolean);

    if(!ids.length) return;

    // 先同步补一次：轮询重绘后立刻恢复旧缓存，避免肉眼看到时间消失。
    applyCached(currentMeCache);

    var me = await getMe();
    applyCached(me);

    await loadMissing(ids);
    applyCached(me || currentMeCache);
  }

  function schedule(delay){
    clearTimeout(renderTimer);
    renderTimer = setTimeout(enhance, typeof delay === 'number' ? delay : 0);
  }

  function boot(){
    injectStyle();
    patchProfileSelect();
    getMe();
    schedule(0);

    var obs = new MutationObserver(function(mutations){
      var should = mutations.some(function(m){
        return Array.from(m.addedNodes || []).some(function(n){
          return n.nodeType === 1 && ((n.matches && (n.matches('.fw-msg') || n.matches('[data-room-messages]'))) || (n.querySelector && n.querySelector('.fw-msg')));
        });
      });
      if(should) schedule(0);
    });

    obs.observe(document.body, {childList:true, subtree:true});

    document.addEventListener('click', function(e){
      if(e.target.closest && (e.target.closest('[data-room]') || e.target.closest('[data-room-modal]'))){
        setTimeout(function(){ schedule(0); }, 40);
        setTimeout(function(){ schedule(0); }, 400);
      }
    }, true);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
