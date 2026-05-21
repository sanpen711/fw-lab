// F.w 研究所：通知分流 + 搭子红点 + 私聊防闪补丁
// 作用：
// 1. 回声只显示帖子互动 / 房间赞同 / 系统类通知。
// 2. 搭子只显示私信 / 搭子申请相关红点。
// 3. 搭子列表头像左上角显示私信未读红点。
// 4. 防止私聊消息区相同内容反复重绘导致闪烁。
(function(){
  if(window.__FW_NOTIFICATION_SPLIT_FIX__) return;
  window.__FW_NOTIFICATION_SPLIT_FIX__ = true;

  var badgeTimer = 0;
  var buddyTimer = 0;
  var patchInnerHtmlInstalled = false;
  var quickBadgeDelays = [300, 1000, 2500];

  function $(s){
    return document.querySelector(s);
  }

  function $$(s){
    return Array.from(document.querySelectorAll(s));
  }

  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
        resolve(true);
        return;
      }

      var n = 0;
      var timer = setInterval(function(){
        n += 1;

        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
          clearInterval(timer);
          resolve(true);
        }

        if(n > 120){
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

  function injectStyle(){
    if($('#fw-notification-split-style')) return;

    var style = document.createElement('style');
    style.id = 'fw-notification-split-style';
    style.textContent = `
      /* 隐藏旧模块自带的小红点，统一用 fw-top-badge 管理 */
      .fw-social-badge{
        display:none!important;
      }

      .fw-has-badge{
        position:relative!important;
        overflow:visible!important;
      }

      .fw-top-badge{
        position:absolute;
        right:-7px;
        top:-8px;
        min-width:18px;
        height:18px;
        padding:0 5px;
        border-radius:999px;
        background:#df7676;
        color:#fff;
        border:2px solid #161611;
        display:none;
        place-items:center;
        font-size:10px;
        line-height:14px;
        font-weight:1000;
        box-shadow:0 4px 12px rgba(0,0,0,.25);
        z-index:20;
      }

      .fw-has-badge.show .fw-top-badge{
        display:grid;
      }

      .fw-wx-avatar{
        position:relative!important;
        overflow:visible!important;
      }

      .fw-wx-avatar img{
        border-radius:50%;
      }

      .fw-wx-unread-badge{
        position:absolute;
        left:-6px;
        top:-7px;
        min-width:18px;
        height:18px;
        padding:0 5px;
        border-radius:999px;
        background:#df7676;
        color:#fff;
        border:2px solid #fffdf7;
        display:none;
        place-items:center;
        font-size:10px;
        line-height:14px;
        font-weight:1000;
        box-shadow:0 4px 12px rgba(0,0,0,.22);
        z-index:30;
      }

      .fw-wx-item.fw-wx-unread{
        background:linear-gradient(135deg,#fffdf7,#fff3ef)!important;
        border-color:rgba(217,121,121,.55)!important;
      }

      .fw-wx-item.fw-wx-unread .fw-wx-name{
        font-weight:1000!important;
      }

      [data-fw-wx-messages]{
        backface-visibility:hidden;
        transform:translateZ(0);
      }
    `;

    document.head.appendChild(style);
  }

  function setTopBadge(btn, count){
    if(!btn) return;

    btn.classList.add('fw-has-badge');

    var badge = btn.querySelector('.fw-top-badge');

    if(!badge){
      badge = document.createElement('span');
      badge.className = 'fw-top-badge';
      btn.appendChild(badge);
    }

    var n = Number(count || 0);

    if(n > 0){
      badge.textContent = n > 99 ? '99+' : String(n);
      btn.classList.add('show');
    }else{
      badge.textContent = '';
      btn.classList.remove('show');
    }
  }

  function setKindBadge(kind, count){
    var selector = kind === 'buddy' ? '[data-fw-open-buddy]' : '[data-fw-open-echo]';
    $$(selector).forEach(function(btn){
      if(btn.closest('#fw-mobile-compact-strip')) return;
      setTopBadge(btn, count);
    });
  }

  function isEchoType(type){
    return ![
      'private_message',
      'friend_request',
      'friend_accept'
    ].includes(String(type || ''));
  }

  function isBuddyNoticeType(type){
    return [
      'private_message',
      'friend_request',
      'friend_accept'
    ].includes(String(type || ''));
  }

  async function refreshSplitBadges(){
    var me = await getMe();

    if(!me || !me.id){
      setKindBadge('echo', 0);
      setKindBadge('buddy', 0);
      return;
    }

    try{
      var notices = await window.fwDb.client
        .from('notifications')
        .select('id,type,actor_id,is_read,created_at')
        .eq('user_id', me.id)
        .eq('is_read', false)
        .limit(300);

      if(notices.error) throw notices.error;

      var rows = notices.data || [];

      var echoCount = rows.filter(function(n){
        return isEchoType(n.type);
      }).length;

      var privateCount = rows.filter(function(n){
        return n.type === 'private_message';
      }).length;

      var friendNoticeCount = rows.filter(function(n){
        return n.type === 'friend_request' || n.type === 'friend_accept';
      }).length;

      var pending = await window.fwDb.client
        .from('friendships')
        .select('id', {count:'exact', head:true})
        .eq('receiver_id', me.id)
        .eq('status', 'pending');

      var pendingCount = pending.count || 0;

      // 搭子红点 = 私信未读 + 搭子申请/通过相关。
      // friend_request 通知和 pending 申请可能重复，所以这里取最大值，避免红点数字虚高。
      var buddyCount = privateCount + Math.max(friendNoticeCount, pendingCount);

      setKindBadge('echo', echoCount);
      setKindBadge('buddy', buddyCount);

    }catch(e){
      console.warn('[FW notification split] badge refresh failed', e);
    }
  }

  async function markEchoNotificationsRead(){
    var me = await getMe();

    if(!me || !me.id) return;

    try{
      var res = await window.fwDb.client
        .from('notifications')
        .select('id,type')
        .eq('user_id', me.id)
        .eq('is_read', false)
        .limit(300);

      if(res.error) throw res.error;

      var ids = (res.data || []).filter(function(n){
        return isEchoType(n.type);
      }).map(function(n){
        return n.id;
      });

      if(!ids.length) return;

      await window.fwDb.client
        .from('notifications')
        .update({is_read:true})
        .in('id', ids);
    }catch(e){
      console.warn('[FW notification split] echo mark read failed', e);
    }
  }

  function queueSplitRefresh(kind){
    quickBadgeDelays.forEach(function(ms){
      setTimeout(function(){
        refreshSplitBadges();
        if(kind === 'buddy') enhanceBuddyUnreadDots();
      }, ms);
    });
  }

  async function getPrivateUnreadMap(){
    var map = {};
    var me = await getMe();

    if(!me || !me.id) return map;

    try{
      var res = await window.fwDb.client
        .from('notifications')
        .select('id,actor_id,type,is_read,created_at')
        .eq('user_id', me.id)
        .eq('is_read', false)
        .eq('type', 'private_message')
        .order('created_at', {ascending:false})
        .limit(300);

      if(res.error) throw res.error;

      (res.data || []).forEach(function(n){
        if(!n.actor_id) return;
        map[n.actor_id] = (map[n.actor_id] || 0) + 1;
      });
    }catch(e){
      console.warn('[FW notification split] unread map failed', e);
    }

    return map;
  }

  async function enhanceBuddyUnreadDots(){
    var modal = $('[data-fw-wx-buddy-modal].show, .fw-wx-modal.show');
    var list = $('[data-fw-wx-list]');

    if(!modal || !list) return;

    var rows = $$('.fw-wx-item[data-fw-wx-chat-user]').filter(function(row){
      return list.contains(row);
    });

    if(!rows.length) return;

    var unreadMap = await getPrivateUnreadMap();

    rows.forEach(function(row){
      var userId = row.dataset.fwWxChatUser;
      var count = Number(unreadMap[userId] || 0);
      var avatar = row.querySelector('.fw-wx-avatar');

      row.classList.toggle('fw-wx-unread', count > 0);

      if(!avatar) return;

      var badge = avatar.querySelector('.fw-wx-unread-badge');

      if(!badge){
        badge = document.createElement('span');
        badge.className = 'fw-wx-unread-badge';
        avatar.appendChild(badge);
      }

      if(count > 0){
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = 'grid';
      }else{
        badge.textContent = '';
        badge.style.display = 'none';
      }
    });
  }

  async function markPrivateReadFrom(userId){
    var me = await getMe();

    if(!me || !me.id || !userId) return;

    try{
      await window.fwDb.client
        .from('notifications')
        .update({is_read:true})
        .eq('user_id', me.id)
        .eq('is_read', false)
        .eq('type', 'private_message')
        .eq('actor_id', userId);

      setTimeout(function(){
        refreshSplitBadges();
        enhanceBuddyUnreadDots();
      }, 260);
    }catch(e){}
  }

  // 防止私聊区每 4-5 秒相同内容重复 innerHTML，导致肉眼看到闪一下。
  function installInnerHtmlDedupe(){
    if(patchInnerHtmlInstalled) return;
    patchInnerHtmlInstalled = true;

    var proto = Element.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'innerHTML');

    if(!desc || !desc.set || !desc.get) return;

    Object.defineProperty(proto, 'innerHTML', {
      get:function(){
        return desc.get.call(this);
      },
      set:function(value){
        try{
          if(this.matches && this.matches('[data-fw-wx-messages]')){
            var next = String(value || '');

            if(this.dataset.fwLastWxMessagesHtml === next){
              return;
            }

            this.dataset.fwLastWxMessagesHtml = next;
          }
        }catch(e){}

        return desc.set.call(this, value);
      }
    });
  }

  function bind(){
    document.addEventListener('click', function(e){
      var echoBtn = e.target.closest && e.target.closest('[data-fw-open-echo]');

      if(echoBtn){
        setKindBadge('echo', 0);
        markEchoNotificationsRead().then(refreshSplitBadges).catch(refreshSplitBadges);
        queueSplitRefresh('echo');
        return;
      }

      var buddyBtn = e.target.closest && e.target.closest('[data-fw-open-buddy], [data-fw-wx-tab], [data-fw-wx-reset]');

      if(buddyBtn){
        setKindBadge('buddy', 0);
        queueSplitRefresh('buddy');
        return;
      }

      var chatUser = e.target.closest && e.target.closest('[data-fw-wx-chat-user], [data-fw-wx-chat-direct], [data-fw-start-chat]');

      if(chatUser){
        var userId = chatUser.dataset.fwWxChatUser || chatUser.dataset.fwWxChatDirect || chatUser.dataset.fwStartChat || '';
        if(userId){
          // 点进某个搭子的私聊后，只把这个人的私信标记已读，不动回声。
          setTimeout(function(){
            markPrivateReadFrom(userId);
          }, 800);
        }
      }
    }, true);

    document.addEventListener('visibilitychange', function(){
      if(!document.hidden){
        refreshSplitBadges();
        enhanceBuddyUnreadDots();
      }
    });
  }

  function observeBuddy(){
    var observer = new MutationObserver(function(){
      clearTimeout(window.__fwNotificationSplitBuddyTimer);
      window.__fwNotificationSplitBuddyTimer = setTimeout(function(){
        enhanceBuddyUnreadDots();
      }, 160);
    });

    observer.observe(document.body, {
      childList:true,
      subtree:true
    });
  }

  window.fwRefreshSplitBadges = refreshSplitBadges;
  window.fwEnhanceBuddyUnreadDots = enhanceBuddyUnreadDots;

  function boot(){
    injectStyle();
    installInnerHtmlDedupe();
    bind();
    observeBuddy();

    refreshSplitBadges();
    enhanceBuddyUnreadDots();

    clearInterval(badgeTimer);
    clearInterval(buddyTimer);

    badgeTimer = setInterval(refreshSplitBadges, 12000);
    buddyTimer = setInterval(enhanceBuddyUnreadDots, 5000);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }else{
    boot();
  }
})();
