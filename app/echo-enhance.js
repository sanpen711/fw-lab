// F.w 研究所：手机端回声增强（分流、红点、跳转）
(function(){
  if(window.__FW_MOBILE_ECHO_ENHANCE__) return;
  window.__FW_MOBILE_ECHO_ENHANCE__ = true;

  var originalEcho = null;
  var bound = false;
  var loaded = false;
  var lastLoadAt = 0;
  var badgeTimer = 0;

  function app(){ return window.FWApp || null; }
  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function esc(value){
    var fw = app();
    if(fw && fw.esc) return fw.esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function initials(name){
    var fw = app();
    if(fw && fw.initials) return fw.initials(name);
    return String(name || 'FW').trim().slice(0, 2).toUpperCase() || 'FW';
  }
  function client(){
    var fw = app();
    var db = fw && fw.db && fw.db();
    return db && db.client;
  }
  function fail(result, message){
    if(result && result.error) throw new Error(message || result.error.message || '读取失败');
    return result ? result.data : null;
  }
  function timeText(value){
    if(!value) return '刚刚';
    var date = new Date(value);
    if(isNaN(date.getTime())) return '刚刚';
    var minutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60000);
    if(minutes < 1) return '刚刚';
    if(minutes < 60) return minutes + '分钟前';
    var hours = Math.floor(minutes / 60);
    if(hours < 24) return hours + '小时前';
    var days = Math.floor(hours / 24);
    return days < 7 ? days + '天前' : date.toLocaleDateString('zh-CN');
  }
  function typeText(type){
    return ({
      like:'点赞了你的帖子',
      same:'对你说：俺也一样',
      tissue:'给你递了纸巾',
      comment:'评论了你的帖子',
      chat_agree:'赞同了你的房间消息',
      system:'系统通知',
      private_message:'给你发来一条私聊',
      friend_request:'想加你为搭子',
      friend_accept:'通过了你的搭子申请'
    })[type] || '给你发来一条回声';
  }
  function isEchoType(type){
    return ['private_message','friend_request','friend_accept'].indexOf(String(type || '')) < 0;
  }
  function isPostNotice(notice){
    return !!(notice && notice.target_id && (notice.target_type === 'post' || ['like','same','tissue','comment'].indexOf(notice.type) >= 0));
  }
  function isBuddyNotice(type){
    return ['private_message','friend_request','friend_accept'].indexOf(String(type || '')) >= 0;
  }
  function avatar(profile){
    profile = profile || {};
    var name = profile.nickname || '研究员';
    if(profile.avatar_url){
      return '<span class="list-avatar"><img src="' + esc(profile.avatar_url) + '" alt="' + esc(name) + '"></span>';
    }
    return '<span class="list-avatar">' + esc(initials(name)) + '</span>';
  }

  function injectStyle(){
    if($('#fwMobileEchoEnhanceStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileEchoEnhanceStyle';
    style.textContent = [
      '.app-tabbar button{position:relative}',
      '.mobile-echo-badge{position:absolute;right:16px;top:5px;min-width:17px;height:17px;padding:0 5px;border-radius:999px;background:#d95353;color:#fff;border:2px solid #10170f;display:none;place-items:center;font-size:10px;line-height:13px;font-weight:1000;box-shadow:0 4px 12px rgba(0,0,0,.22);box-sizing:border-box}',
      '.mobile-echo-badge.show{display:grid}',
      '.mobile-echo-toolbar{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:0 0 10px}',
      '.mobile-echo-toolbar b{font-size:14px;color:var(--deep);font-weight:1000}',
      '.mobile-echo-refresh{min-height:34px;border:1px solid rgba(16,23,15,.13);border-radius:999px;background:#fffdf7;color:var(--deep);padding:0 12px;font-size:12px;font-weight:1000}',
      '.mobile-echo-item{cursor:pointer;align-items:flex-start}',
      '.mobile-echo-item.unread{background:linear-gradient(135deg,#fffdf7,#fff3ef);border-color:rgba(217,121,121,.5)}',
      '.mobile-echo-item .list-main small{display:block;margin-top:5px;color:var(--accent-dark);font-size:11px;font-weight:1000}',
      '.mobile-echo-item .notice-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center;justify-content:flex-start;margin-top:8px}',
      '.mobile-echo-mini{min-height:30px;border:1px solid rgba(16,23,15,.13);border-radius:999px;background:#fffdf7;color:var(--deep);padding:0 10px;font-size:12px;font-weight:1000}',
      '.mobile-echo-mini.dark{background:var(--deep);border-color:var(--deep);color:#fff}',
      '.mobile-echo-hint{margin:10px 0 0;color:var(--muted);font-size:12px;line-height:1.55;font-weight:850}',
      '.mobile-echo-target{animation:mobileEchoTarget 2.6s ease both}',
      '@keyframes mobileEchoTarget{0%{box-shadow:0 0 0 0 rgba(217,121,121,.7);transform:translateY(-2px)}40%{box-shadow:0 0 0 8px rgba(217,121,121,.18)}100%{box-shadow:0 0 0 0 rgba(217,121,121,0);transform:none}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  async function fetchProfiles(ids){
    var unique = Array.from(new Set((ids || []).filter(Boolean)));
    if(!unique.length) return {};
    try{
      var rows = fail(await client().from('profiles').select('id,nickname,avatar_url,lab_code').in('id', unique), '资料读取失败') || [];
      var map = {};
      rows.forEach(function(row){ map[row.id] = row; });
      return map;
    }catch(e){
      return {};
    }
  }

  function tabBadge(button){
    if(!button) return null;
    var badge = button.querySelector('.mobile-echo-badge');
    if(!badge){
      badge = document.createElement('span');
      badge.className = 'mobile-echo-badge';
      button.appendChild(badge);
    }
    return badge;
  }
  function setTabBadge(name, count){
    var button = $('[data-app-nav="' + name + '"]');
    var badge = tabBadge(button);
    if(!badge) return;
    var n = Number(count || 0);
    if(n > 0){
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.classList.add('show');
      button.classList.add('has-mobile-echo-badge');
    }else{
      badge.textContent = '';
      badge.classList.remove('show');
      button.classList.remove('has-mobile-echo-badge');
    }
  }

  async function getCurrentUser(){
    var fw = app();
    if(!fw) return null;
    if(fw.state && fw.state.user) return fw.state.user;
    try{
      return fw.refreshUser ? await fw.refreshUser() : null;
    }catch(e){
      return null;
    }
  }

  async function fetchNotifications(me, onlyUnread){
    var query = client()
      .from('notifications')
      .select('id,actor_id,type,target_type,target_id,content,is_read,created_at')
      .eq('user_id', me.id)
      .order('created_at', {ascending:false})
      .limit(onlyUnread ? 300 : 100);
    if(onlyUnread) query = query.eq('is_read', false);
    return fail(await query, '回声读取失败') || [];
  }

  async function refreshBadges(){
    var fw = app();
    if(!fw || !(await fw.waitForDb())){
      setTabBadge('echo', 0);
      setTabBadge('buddy', 0);
      return;
    }
    var me = await getCurrentUser();
    if(!me || !me.id){
      setTabBadge('echo', 0);
      setTabBadge('buddy', 0);
      return;
    }
    try{
      var rows = await fetchNotifications(me, true);
      var echoCount = rows.filter(function(row){ return isEchoType(row.type); }).length;
      var privateCount = rows.filter(function(row){ return row.type === 'private_message'; }).length;
      var friendNoticeCount = rows.filter(function(row){ return row.type === 'friend_request' || row.type === 'friend_accept'; }).length;
      var pending = await client().from('friendships').select('id', {count:'exact', head:true}).eq('receiver_id', me.id).eq('status', 'pending');
      var pendingCount = pending && !pending.error ? (pending.count || 0) : 0;
      setTabBadge('echo', echoCount);
      setTabBadge('buddy', privateCount + Math.max(friendNoticeCount, pendingCount));
    }catch(e){
      console.warn('[FW mobile app] echo badge refresh failed', e);
    }
  }

  function noticeHtml(notice, profile){
    var action = typeText(notice.type);
    var content = notice.content || '对你的低功耗发言产生了回应。';
    var canPost = isPostNotice(notice);
    var canRoom = notice.type === 'chat_agree';
    var actions = '';
    if(canPost){
      actions += '<button class="mobile-echo-mini dark" type="button" data-mobile-echo-post="' + esc(notice.target_id) + '" data-open-comments="' + (notice.type === 'comment' ? '1' : '0') + '">查看帖子</button>';
    }
    if(canRoom){
      actions += '<button class="mobile-echo-mini dark" type="button" data-mobile-echo-rooms>去学术研讨</button>';
    }
    return '<article class="notice-item mobile-echo-item ' + (notice.is_read ? '' : 'unread') + '" data-mobile-echo-item="' + esc(notice.id) + '" data-mobile-echo-type="' + esc(notice.type || '') + '" data-mobile-echo-target="' + esc(notice.target_id || '') + '">' +
      avatar(profile) +
      '<div class="list-main"><b>' + esc((profile && profile.nickname || '某位研究员') + ' ' + action) + '</b><span>' + esc(content) + '</span><small>' + esc(timeText(notice.created_at)) + '</small>' +
        (actions ? '<div class="notice-actions">' + actions + '</div>' : '') +
      '</div>' +
    '</article>';
  }

  async function load(force){
    var fw = app();
    var list = $('[data-echo-list]');
    if(!list) return;
    if(!force && loaded && Date.now() - lastLoadAt < 15000){
      refreshBadges();
      return;
    }
    list.innerHTML = '<div class="loading">正在读取回声...</div>';
    try{
      if(!fw || !(await fw.waitForDb())) throw new Error('暂时无法连接数据服务。');
      var me = await getCurrentUser();
      if(!me || !me.id){
        list.innerHTML = '<div class="empty">请先登录后查看回声。</div>';
        loaded = true;
        lastLoadAt = Date.now();
        refreshBadges();
        return;
      }
      var rows = await fetchNotifications(me, false);
      var echoRows = rows.filter(function(row){ return isEchoType(row.type); });
      var buddyRows = rows.filter(function(row){ return isBuddyNotice(row.type); });
      var profiles = await fetchProfiles(echoRows.map(function(row){ return row.actor_id; }));
      var toolbar = '<div class="mobile-echo-toolbar"><b>回声通知</b><button class="mobile-echo-refresh" type="button" data-mobile-echo-refresh>刷新</button></div>';
      if(!echoRows.length){
        list.innerHTML = toolbar + '<div class="empty">暂时没有新的回声。安静也是一种运行状态。</div>' + (buddyRows.length ? '<p class="mobile-echo-hint">私聊和搭子申请已经分流到“搭子”里处理。</p>' : '');
      }else{
        list.innerHTML = toolbar + echoRows.map(function(row){ return noticeHtml(row, profiles[row.actor_id] || {}); }).join('') + (buddyRows.length ? '<p class="mobile-echo-hint">私聊和搭子申请已分流到“搭子”，不在这里混排。</p>' : '');
      }
      var unreadEchoIds = echoRows.filter(function(row){ return !row.is_read; }).map(function(row){ return row.id; });
      if(unreadEchoIds.length){
        client().from('notifications').update({is_read:true}).in('id', unreadEchoIds).then(function(){ refreshBadges(); });
      }else{
        refreshBadges();
      }
      loaded = true;
      lastLoadAt = Date.now();
    }catch(e){
      console.warn('[FW mobile app] enhanced echo load failed', e);
      list.innerHTML = '<div class="error">回声暂时读取失败，请稍后再试。</div>';
    }
  }

  async function openPost(postId, openComments){
    if(!postId){
      app().toast('这条回声暂时没有对应帖子。');
      return;
    }
    app().setView('square');
    try{
      if(window.FWAppFeed && window.FWAppFeed.load){
        await window.FWAppFeed.load(false, {silent:true});
      }
      if(window.FWAppFeed && window.FWAppFeed.openDetail){
        window.FWAppFeed.openDetail(postId);
        setTimeout(function(){
          var card = document.querySelector('[data-post-id="' + String(postId).replace(/"/g, '') + '"]');
          if(card){
            card.classList.add('mobile-echo-target');
            card.scrollIntoView({block:'center', behavior:'smooth'});
            setTimeout(function(){ card.classList.remove('mobile-echo-target'); }, 2800);
          }
        }, 180);
      }else{
        app().toast('帖子可能还在加载中，请稍后再试。');
      }
    }catch(e){
      console.warn('[FW mobile app] open echo post failed', e);
      app().toast('帖子打开失败，请稍后再试。');
    }
  }

  function bind(){
    if(bound) return;
    bound = true;
    document.addEventListener('click', function(e){
      var refresh = e.target.closest && e.target.closest('[data-mobile-echo-refresh]');
      if(refresh){
        e.preventDefault();
        loaded = false;
        load(true);
        return;
      }
      var post = e.target.closest && e.target.closest('[data-mobile-echo-post]');
      if(post){
        e.preventDefault();
        e.stopPropagation();
        openPost(post.dataset.mobileEchoPost, post.dataset.openComments === '1');
        return;
      }
      var rooms = e.target.closest && e.target.closest('[data-mobile-echo-rooms]');
      if(rooms){
        e.preventDefault();
        e.stopPropagation();
        app().setView('rooms');
      }
    });
  }

  function installOverride(){
    if(!window.FWAppEcho){
      setTimeout(installOverride, 80);
      return;
    }
    if(window.FWAppEcho.__mobileEnhanced) return;
    originalEcho = {
      init:window.FWAppEcho.init,
      load:window.FWAppEcho.load,
      ensureLoaded:window.FWAppEcho.ensureLoaded
    };
    window.FWAppEcho.init = function(){
      if(originalEcho && originalEcho.init) originalEcho.init();
      initEnhance();
    };
    window.FWAppEcho.load = load;
    window.FWAppEcho.ensureLoaded = function(){ load(false); };
    window.FWAppEcho.refreshBadges = refreshBadges;
    window.FWAppEcho.__mobileEnhanced = true;
    initEnhance();
  }

  function initEnhance(){
    injectStyle();
    bind();
    refreshBadges();
    clearInterval(badgeTimer);
    badgeTimer = setInterval(refreshBadges, 45000);
    if(app() && app().state && app().state.view === 'echo') load(false);
  }

  window.FWAppEchoEnhance = {load:load, refreshBadges:refreshBadges, install:installOverride};

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installOverride);
  else installOverride();
})();