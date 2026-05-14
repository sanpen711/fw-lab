// F.w 研究所：学术研讨稳定显示补丁
// 作用：
// 1. 修复房间头像/昵称一会有一会没有的问题。
// 2. 给房间消息补发言时间。
// 3. 禁用旧的异步二次修补，避免每次轮询时闪烁。
(function(){
  if(window.__FW_ROOM_STABLE_DISPLAY_FIX__) return;
  window.__FW_ROOM_STABLE_DISPLAY_FIX__ = true;

  // 提前占用这个标记，阻止 fw-avatar-mobile-fix.js 里旧的房间异步补丁运行。
  // 旧补丁会在原始消息渲染后再查库补资料，导致每 5 秒轮询时“先消失再出现”。
  window.__FW_ROOM_PROFILE_TIME_FIX__ = true;

  var messageCache = {};
  var profileCache = {};
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
      if(!(await waitDb())) return null;
      return await window.fwDb.getCurrentUser();
    }catch(e){
      return null;
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
        var timeHtml = time ? '<span class="fw-room-msg-time">' + esc(time) + '</span>' : '';
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

    var me = await getMe();

    // 先用已有缓存同步补一次，避免轮询重绘后肉眼闪烁。
    applyCached(me);

    // 再补新消息缓存，补完后再更新一次。
    await loadMissing(ids);
    applyCached(me);
  }

  function schedule(){
    clearTimeout(renderTimer);
    renderTimer = setTimeout(enhance, 20);
  }

  function boot(){
    injectStyle();
    patchProfileSelect();
    schedule();

    var obs = new MutationObserver(function(mutations){
      var should = mutations.some(function(m){
        return Array.from(m.addedNodes || []).some(function(n){
          return n.nodeType === 1 && (n.matches && (n.matches('.fw-msg') || n.matches('[data-room-messages]')) || n.querySelector && n.querySelector('.fw-msg'));
        });
      });
      if(should) schedule();
    });

    obs.observe(document.body, {childList:true, subtree:true});

    document.addEventListener('click', function(e){
      if(e.target.closest && (e.target.closest('[data-room]') || e.target.closest('[data-room-modal]'))){
        setTimeout(schedule, 80);
        setTimeout(schedule, 500);
      }
    }, true);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
