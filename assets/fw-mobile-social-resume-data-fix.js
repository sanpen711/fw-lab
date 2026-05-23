// F.w 研究所：手机端 PWA 后台恢复后的搭子 / 回声数据恢复
(function(){
  if(window.__FW_MOBILE_SOCIAL_RESUME_DATA_FIX__) return;
  window.__FW_MOBILE_SOCIAL_RESUME_DATA_FIX__ = true;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.from((root || document).querySelectorAll(selector)); }
  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function ini(value){ return String(value || 'FW').trim().slice(0, 2).toUpperCase(); }
  function debug(label, data){
    try{ console.debug('[FWMobileSocialResume]', label, data || ''); }catch(e){}
  }
  function isMobile(){
    try{ return window.matchMedia && window.matchMedia('(max-width:760px)').matches; }
    catch(e){ return window.innerWidth <= 760; }
  }

  var AUTH_TIMEOUT_MS = 4500;
  var QUERY_TIMEOUT_MS = 9000;

  var state = {
    buddyTab: 'friends',
    buddySeq: 0,
    echoSeq: 0,
    resumeTimer: 0,
    authStatus: 'unknown',
    me: null,
    authPromise: null,
    enrichTimer: 0
  };

  function withTimeout(promise, ms, message){
    var timer;
    var task = Promise.resolve().then(function(){
      return typeof promise === 'function' ? promise() : promise;
    });
    var timeout = new Promise(function(resolve, reject){
      timer = setTimeout(function(){ reject(new Error(message || '读取超时，请稍后重试。')); }, ms || QUERY_TIMEOUT_MS);
    });
    return Promise.race([task, timeout]).finally(function(){ clearTimeout(timer); });
  }

  function waitDb(ms){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      var started = Date.now();
      var timer = setInterval(function(){
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(timer); resolve(true); return; }
        if(Date.now() - started > (ms || AUTH_TIMEOUT_MS)){ clearInterval(timer); resolve(false); }
      }, 80);
    });
  }

  function closeAuthPanels(){
    $$('[data-sb-auth].show, .sb-auth.show, .fw-auth.show').forEach(function(modal){
      modal.classList.remove('show');
    });
  }

  function closeBuddyPanels(){
    $$('[data-fw-wx-buddy-modal].show, .fw-wx-modal.show').forEach(function(modal){
      modal.classList.remove('show', 'fw-wx-mobile-chatting');
    });
    if(document.body) document.body.classList.remove('fw-wx-modal-open');
  }

  function closeEchoPanels(){
    $$('[data-fw-stable-echo-modal].show, .fw-stable-echo-modal.show, [data-fw-mobile-echo-modal].show, .fw-mobile-echo-modal.show').forEach(function(modal){
      modal.classList.remove('show');
    });
  }

  function closeMobilePanels(target){
    if(target !== 'buddy') closeBuddyPanels();
    if(target !== 'echo') closeEchoPanels();
    if(target !== 'auth') closeAuthPanels();
    debug('close panels', {target:target || 'none'});
  }

  function textOf(selector){
    var el = $(selector);
    return el ? String(el.textContent || '').trim() : '';
  }

  function readDomProfile(){
    var name = textOf('[data-fw-card-name]') || textOf('[data-fw-current]');
    var status = textOf('[data-fw-card-status]');
    var email = textOf('[data-fw-card-email]');
    var labCode = textOf('[data-fw-card-code]');
    var avatar = $('[data-fw-card-avatar] img, [data-fw-avatar-slot] img');
    var logged = status.indexOf('已进入') >= 0 || (!!email && email !== '未绑定' && email.indexOf('@') > 0);

    if(!logged) return null;

    return {
      nickname: (!name || name === '未登录' || name === '注册 / 登录') ? '临时研究员' : name,
      email: email && email !== '未绑定' ? email : '',
      lab_code: labCode && labCode !== '未设置' ? labCode : '',
      avatar_url: avatar ? avatar.src : '',
      source: 'userbar-dom'
    };
  }

  function userFromObject(obj, depth){
    if(!obj || typeof obj !== 'object' || depth > 4) return null;

    var direct = obj.user || obj.currentUser || obj.current_user;
    if(direct && direct.id) return direct;

    var sessionUser = obj.session && obj.session.user || obj.currentSession && obj.currentSession.user || obj.data && obj.data.session && obj.data.session.user;
    if(sessionUser && sessionUser.id) return sessionUser;

    if(obj.id && (obj.email || obj.aud === 'authenticated' || obj.role || obj.app_metadata || obj.user_metadata)) return obj;

    var keys = ['data', 'session', 'currentSession', 'value', 'state'];
    for(var i = 0; i < keys.length; i += 1){
      var found = userFromObject(obj[keys[i]], depth + 1);
      if(found) return found;
    }

    return null;
  }

  function readStoredSessionUser(){
    var stores = [];
    try{ stores.push(window.localStorage); }catch(e){}
    try{ stores.push(window.sessionStorage); }catch(e){}

    for(var s = 0; s < stores.length; s += 1){
      var store = stores[s];
      if(!store) continue;
      for(var i = 0; i < store.length; i += 1){
        var key = '';
        try{ key = store.key(i) || ''; }catch(e){ continue; }
        if(key.indexOf('auth-token') < 0 && key.indexOf('supabase.auth') < 0 && key.indexOf('sb-') !== 0) continue;

        try{
          var raw = store.getItem(key);
          if(!raw) continue;
          var parsed = JSON.parse(raw);
          var user = userFromObject(parsed, 0);
          if(user && user.id){
            return {
              id:user.id,
              email:user.email || '',
              nickname:user.user_metadata && user.user_metadata.nickname || '',
              source:'stored-session'
            };
          }
        }catch(e){}
      }
    }

    return null;
  }

  function readGlobalUser(){
    var fw = window.FW || {};
    var candidates = [
      window.fwCurrentUser,
      window.currentUser,
      fw.currentUser,
      fw.currentProfile,
      fw.me
    ];

    for(var i = 0; i < candidates.length; i += 1){
      var user = candidates[i];
      if(user && user.id) return Object.assign({source:'global-cache'}, user);
    }

    return null;
  }

  function mergeUser(base, extra){
    var next = Object.assign({}, base || {}, extra || {});
    var sources = [];
    if(base && base.source) sources.push(base.source);
    if(extra && extra.source) sources.push(extra.source);
    next.source = sources.length ? Array.from(new Set(sources)).join('+') : (next.source || 'unknown');
    return next;
  }

  function readCachedActiveUser(){
    var user = state.me && state.me.id ? mergeUser(state.me, {source:'resume-cache'}) : null;
    var globalUser = readGlobalUser();
    var sessionUser = readStoredSessionUser();
    var domProfile = readDomProfile();

    if(globalUser) user = mergeUser(user, globalUser);
    if(sessionUser) user = mergeUser(user, sessionUser);
    if(user && domProfile) user = mergeUser(user, domProfile);

    if(user && user.id){
      state.me = user;
      state.authStatus = 'logged-in';
      return user;
    }

    return null;
  }

  function enrichActiveUser(base){
    clearTimeout(state.enrichTimer);
    state.enrichTimer = setTimeout(function(){
      if(!window.fwDb || typeof window.fwDb.getCurrentUser !== 'function') return;
      withTimeout(window.fwDb.getCurrentUser(), 3200, '个人资料读取超时').then(function(profile){
        if(profile && profile.id){
          state.me = mergeUser(base, Object.assign({source:'fwDb-profile'}, profile));
          state.authStatus = 'logged-in';
          debug('auth enrich success', {source:state.me.source});
        }
      }).catch(function(err){
        debug('auth enrich skipped', err && err.message ? err.message : err);
      });
    }, 0);
  }

  async function resolveActiveUser(){
    var cached = readCachedActiveUser();
    if(cached){
      enrichActiveUser(cached);
      debug('auth from cache', {source:cached.source});
      return {status:'logged-in', me:cached, source:cached.source};
    }

    if(!(await waitDb(AUTH_TIMEOUT_MS))){
      state.authStatus = 'unavailable';
      state.me = null;
      return {status:'unavailable', me:null, source:'db-unavailable'};
    }

    var client = window.fwDb && window.fwDb.client;
    var sessionUser = null;

    try{
      if(client && client.auth && typeof client.auth.getSession === 'function'){
        var sessionResult = await withTimeout(function(){ return client.auth.getSession(); }, AUTH_TIMEOUT_MS, '登录状态恢复超时');
        sessionUser = sessionResult && sessionResult.data && sessionResult.data.session && sessionResult.data.session.user;
        if(sessionResult && sessionResult.error) debug('auth session warning', sessionResult.error.message || sessionResult.error);
      }
    }catch(err){
      debug('auth session failed', err && err.message ? err.message : err);
    }

    if(!sessionUser){
      try{
        if(client && client.auth && typeof client.auth.getUser === 'function'){
          var userResult = await withTimeout(function(){ return client.auth.getUser(); }, AUTH_TIMEOUT_MS, '登录状态恢复超时');
          sessionUser = userResult && userResult.data && userResult.data.user;
          if(userResult && userResult.error) debug('auth user warning', userResult.error.message || userResult.error);
        }
      }catch(err){
        debug('auth user failed', err && err.message ? err.message : err);
      }
    }

    if(sessionUser && sessionUser.id){
      var sessionMe = mergeUser({
        id:sessionUser.id,
        email:sessionUser.email || '',
        nickname:sessionUser.user_metadata && sessionUser.user_metadata.nickname || '',
        source:'supabase-session'
      }, readDomProfile() || null);
      state.me = sessionMe;
      state.authStatus = 'logged-in';
      enrichActiveUser(sessionMe);
      debug('auth from session', {source:sessionMe.source});
      return {status:'logged-in', me:sessionMe, source:sessionMe.source};
    }

    try{
      if(window.fwDb && typeof window.fwDb.getCurrentUser === 'function'){
        var profile = await withTimeout(function(){ return window.fwDb.getCurrentUser(); }, AUTH_TIMEOUT_MS, '登录状态恢复超时');
        if(profile && profile.id){
          state.me = mergeUser(Object.assign({source:'fwDb-current-user'}, profile), readDomProfile() || null);
          state.authStatus = 'logged-in';
          debug('auth from fwDb', {source:state.me.source});
          return {status:'logged-in', me:state.me, source:state.me.source};
        }
      }
    }catch(err){
      debug('auth fwDb failed', err && err.message ? err.message : err);
    }

    state.authStatus = 'logged-out';
    state.me = null;
    return {status:'logged-out', me:null, source:'none'};
  }

  async function ensureActiveUser(force){
    var cached = readCachedActiveUser();
    if(cached){
      enrichActiveUser(cached);
      return {status:'logged-in', me:cached, source:cached.source};
    }

    if(state.authPromise && !force) return state.authPromise;

    state.authStatus = 'recovering';
    state.authPromise = withTimeout(resolveActiveUser(), AUTH_TIMEOUT_MS + 700, '登录状态恢复失败，请重新加载后再试。')
      .catch(function(err){
        var fallback = readCachedActiveUser();
        if(fallback){
          debug('auth timeout fallback cache', {source:fallback.source});
          return {status:'logged-in', me:fallback, source:fallback.source};
        }
        state.authStatus = 'unavailable';
        state.me = null;
        return {status:'unavailable', me:null, source:'timeout', message:err && err.message ? err.message : '登录状态恢复失败，请重新加载后再试。'};
      })
      .finally(function(){ state.authPromise = null; });

    return state.authPromise;
  }

  function avatar(name, url, cls){
    var c = cls || 'fw-social-avatar';
    if(url) return '<span class="' + c + '"><img src="' + esc(url) + '" alt="' + esc(name || '') + '"></span>';
    return '<span class="' + c + '">' + esc(ini(name)) + '</span>';
  }

  function ensureBuddyPanel(){
    var modal = $('[data-fw-wx-buddy-modal], .fw-wx-modal');
    if(modal && modal.querySelector('[data-fw-wx-panel], .fw-wx-panel')) return modal;
    if(!document.body) return null;

    modal = document.createElement('div');
    modal.className = 'fw-wx-modal';
    modal.dataset.fwWxBuddyModal = '1';
    modal.innerHTML = '\n      <div class="fw-wx-panel" data-fw-wx-panel>\n        <header class="fw-wx-head">\n          <div class="fw-wx-title"><small>BUDDY CENTER</small><h2>搭子中心</h2></div>\n          <div class="fw-wx-tools"><button class="fw-wx-tool" data-fw-wx-reset type="button">复位</button><button class="fw-wx-close" data-fw-wx-close type="button">×</button></div>\n        </header>\n        <div class="fw-wx-shell">\n          <aside class="fw-wx-left">\n            <div class="fw-wx-search"><form data-fw-wx-search><input name="q" placeholder="搜索实验品编号 / 昵称 / 完整邮箱"><button type="submit">搜索</button></form></div>\n            <div class="fw-wx-tabs"><button class="fw-wx-tab active" data-fw-wx-tab="friends">我的搭子</button><button class="fw-wx-tab" data-fw-wx-tab="incoming">收到申请</button><button class="fw-wx-tab" data-fw-wx-tab="outgoing">发出申请</button></div>\n            <div class="fw-wx-list" data-fw-wx-list></div>\n          </aside>\n          <section class="fw-wx-right">\n            <div class="fw-wx-chat-head"><div><button class="fw-wx-back-list" data-fw-wx-back-list type="button">← 返回搭子列表</button><h3 data-fw-wx-chat-title>选择一个搭子</h3><span data-fw-wx-chat-sub>左侧点一个搭子，右侧开始低功耗私聊。</span></div></div>\n            <div class="fw-wx-messages" data-fw-wx-messages><div class="fw-wx-empty">还没有选择聊天对象。</div></div>\n            <form class="fw-wx-compose" data-fw-wx-compose><input name="message" maxlength="300" autocomplete="off" placeholder="说一句只给搭子看的话，最多 300 字..."><button type="submit">发送</button></form>\n          </section>\n        </div>\n      </div>\n    ';
    document.body.appendChild(modal);
    return modal;
  }

  function showBuddyPanel(){
    var modal = ensureBuddyPanel();
    if(!modal) return null;
    modal.classList.add('show');
    modal.classList.remove('fw-wx-mobile-chatting');
    if(document.body) document.body.classList.add('fw-wx-modal-open');
    return modal;
  }

  function setBuddyTabs(){
    $$('[data-fw-wx-tab]').forEach(function(btn){
      btn.classList.toggle('active', (btn.dataset.fwWxTab || 'friends') === state.buddyTab);
    });
  }

  function buddyOtherId(friendship, meId){
    return friendship.requester_id === meId ? friendship.receiver_id : friendship.requester_id;
  }

  async function fetchProfiles(ids){
    var unique = Array.from(new Set((ids || []).filter(Boolean)));
    if(!unique.length) return {};
    var result = await withTimeout(
      function(){ return window.fwDb.client.from('profiles').select('id,nickname,avatar_url,lab_code').in('id', unique); },
      QUERY_TIMEOUT_MS,
      '资料读取超时，请稍后重试。'
    );
    if(result.error) throw result.error;
    var map = {};
    (result.data || []).forEach(function(profile){ map[profile.id] = profile; });
    return map;
  }

  async function getFriendships(meId){
    var result = await withTimeout(
      function(){
        return window.fwDb.client
          .from('friendships')
          .select('id,requester_id,receiver_id,status,created_at,updated_at')
          .or('requester_id.eq.' + meId + ',receiver_id.eq.' + meId)
          .order('updated_at', {ascending:false});
      },
      QUERY_TIMEOUT_MS,
      '搭子列表读取超时，请稍后重试。'
    );
    if(result.error) throw result.error;
    var rows = result.data || [];
    var ids = [];
    rows.forEach(function(row){ ids.push(row.requester_id, row.receiver_id); });
    return {rows:rows, profiles:await fetchProfiles(ids)};
  }

  function renderBuddyRows(rows, profiles, meId){
    var list = $('[data-fw-wx-list]');
    if(!list) return;
    if(!rows.length){
      var empty = state.buddyTab === 'friends'
        ? '暂时还没有搭子。可以先搜索实验品。'
        : state.buddyTab === 'incoming'
          ? '暂无收到的搭子申请。'
          : '暂无发出的搭子申请。';
      list.innerHTML = '<div class="fw-wx-empty">' + empty + '</div>';
      return;
    }

    list.innerHTML = rows.map(function(friendship){
      var other = buddyOtherId(friendship, meId);
      var profile = profiles[other] || {};
      var name = profile.nickname || '低功耗研究员';
      var incoming = friendship.receiver_id === meId && friendship.status === 'pending';
      var outgoing = friendship.requester_id === meId && friendship.status === 'pending';
      var accepted = friendship.status === 'accepted';
      var sub = accepted ? '点击进入私聊' : incoming ? '对方想加你为搭子' : outgoing ? '等待对方低功耗处理' : '关系已失效';
      var actions = '';

      if(incoming){
        actions = '<div class="fw-wx-actions"><button class="fw-wx-mini dark" data-fw-wx-accept="' + friendship.id + '">同意</button><button class="fw-wx-mini danger" data-fw-wx-reject="' + friendship.id + '">拒绝</button></div>';
      }else if(outgoing){
        actions = '<div class="fw-wx-actions"><button class="fw-wx-mini danger" data-fw-wx-remove="' + friendship.id + '">撤回</button></div>';
      }else if(accepted){
        actions = '<div class="fw-wx-actions"><button class="fw-wx-mini danger" data-fw-wx-remove="' + friendship.id + '">解除</button></div>';
      }

      return '<div class="fw-wx-item" data-fw-wx-chat-user="' + esc(other) + '">'
        + avatar(name, profile.avatar_url, 'fw-wx-avatar')
        + '<div><div class="fw-wx-name">' + esc(name) + '</div><div class="fw-wx-sub">实验品编号：' + esc(profile.lab_code || '未设置') + ' · ' + esc(sub) + '</div>' + actions + '</div>'
        + '</div>';
    }).join('');
  }

  function authMessage(kind, auth){
    if(auth && (auth.status === 'unavailable' || auth.source === 'timeout')) return '登录状态恢复失败，请点“导航 → 重新加载”后再试。';
    return kind === 'buddy' ? '请先点底部「我的」注册 / 登录后再查看搭子。' : '请先点底部「我的」注册 / 登录后再查看回声。';
  }

  async function reloadBuddyCenter(selectId){
    var seq = ++state.buddySeq;
    closeMobilePanels('buddy');
    var modal = showBuddyPanel();
    var list = $('[data-fw-wx-list]', modal || document);
    setBuddyTabs();
    if(list) list.innerHTML = '<div class="fw-wx-empty">正在恢复登录状态...</div>';

    try{
      var auth = await ensureActiveUser(true);
      if(seq !== state.buddySeq) return false;
      var me = auth && auth.me;
      if(!me || !me.id || me.disabled){
        if(list) list.innerHTML = '<div class="fw-wx-empty">' + esc(me && me.disabled ? '账号已停用，暂时无法查看搭子。' : authMessage('buddy', auth)) + '</div>';
        debug('buddy auth blocked', {status:auth && auth.status, source:auth && auth.source});
        return false;
      }

      if(list) list.innerHTML = '<div class="fw-wx-empty">正在读取搭子列表...</div>';
      debug('buddy load start', {tab:state.buddyTab, auth:state.authStatus, source:auth.source});
      var result = await getFriendships(me.id);
      if(seq !== state.buddySeq) return false;
      var accepted = result.rows.filter(function(row){ return row.status === 'accepted'; });
      var incoming = result.rows.filter(function(row){ return row.status === 'pending' && row.receiver_id === me.id; });
      var outgoing = result.rows.filter(function(row){ return row.status === 'pending' && row.requester_id === me.id; });
      var show = state.buddyTab === 'incoming' ? incoming : state.buddyTab === 'outgoing' ? outgoing : accepted;
      renderBuddyRows(show, result.profiles, me.id);
      debug('buddy load success', {count:show.length});

      if(selectId){
        var target = document.querySelector('[data-fw-wx-chat-user="' + String(selectId).replace(/"/g, '\\"') + '"]');
        if(target) setTimeout(function(){ target.click(); }, 0);
      }
      if(typeof window.fwRenderStickerMessages === 'function') window.fwRenderStickerMessages();
      return true;
    }catch(err){
      if(seq === state.buddySeq && list){
        list.innerHTML = '<div class="fw-wx-empty">搭子读取失败：' + esc(err && err.message ? err.message : '请稍后重试。') + '</div>';
      }
      debug('buddy load failed', err && err.message ? err.message : err);
      return false;
    }
  }

  function openBuddyCenter(selectId){
    closeMobilePanels('buddy');
    showBuddyPanel();
    reloadBuddyCenter(selectId || '');
    return true;
  }

  function ensureEchoPanel(){
    var modal = $('[data-fw-stable-echo-modal], .fw-stable-echo-modal, [data-fw-mobile-echo-modal], .fw-mobile-echo-modal');
    if(modal) return modal;
    if(!document.body) return null;
    modal = document.createElement('div');
    modal.className = 'fw-stable-echo-modal';
    modal.dataset.fwStableEchoModal = '1';
    modal.innerHTML = '<section class="fw-stable-echo-panel" role="dialog" aria-modal="false" aria-label="回声"><header class="fw-stable-echo-head"><div><small>ECHO CENTER</small><h2>回声</h2></div><button class="fw-stable-echo-close" type="button" data-fw-stable-echo-close>×</button></header><div class="fw-stable-echo-body" data-fw-stable-echo-body><div class="fw-stable-echo-empty">正在读取回声...</div></div></section>';
    document.body.appendChild(modal);
    return modal;
  }

  function typeText(type){
    return ({like:'点赞了你的帖子',same:'对你说：俺也一样',tissue:'给你递了纸巾',comment:'评论了你的帖子',friend_request:'想加你为搭子',friend_accept:'通过了你的搭子申请',chat_agree:'赞同了你的房间消息',system:'系统通知'})[type] || '给你发来一条回声';
  }

  function echoAvatar(profile){
    var name = profile && profile.nickname || '研究员';
    var url = profile && profile.avatar_url || '';
    if(url) return '<span class="fw-stable-echo-avatar"><img src="' + esc(url) + '" alt="' + esc(name) + '"></span>';
    return '<span class="fw-stable-echo-avatar">' + esc(ini(name)) + '</span>';
  }

  async function reloadEchoCenter(){
    var seq = ++state.echoSeq;
    closeMobilePanels('echo');
    var modal = ensureEchoPanel();
    var body = modal && (modal.querySelector('[data-fw-stable-echo-body]') || modal.querySelector('[data-fw-mobile-echo-body]'));
    if(modal) modal.classList.add('show');
    if(body) body.innerHTML = '<div class="fw-stable-echo-empty">正在恢复登录状态...</div>';

    try{
      var auth = await ensureActiveUser(true);
      if(seq !== state.echoSeq) return false;
      var me = auth && auth.me;
      if(!me || !me.id){
        if(body) body.innerHTML = '<div class="fw-stable-echo-empty">' + esc(authMessage('echo', auth)) + '</div>';
        debug('echo auth blocked', {status:auth && auth.status, source:auth && auth.source});
        return false;
      }

      if(body) body.innerHTML = '<div class="fw-stable-echo-empty">正在读取回声...</div>';
      debug('echo load start', {auth:state.authStatus, source:auth.source});
      var result = await withTimeout(
        function(){
          return window.fwDb.client
            .from('notifications')
            .select('id,actor_id,type,target_type,target_id,content,is_read,created_at')
            .eq('user_id', me.id)
            .neq('type', 'private_message')
            .order('created_at', {ascending:false})
            .limit(80);
        },
        QUERY_TIMEOUT_MS,
        '回声读取超时，请稍后重试。'
      );
      if(result.error) throw result.error;
      if(seq !== state.echoSeq) return false;

      var rows = result.data || [];
      var profiles = await fetchProfiles(rows.map(function(row){ return row.actor_id; }));
      if(seq !== state.echoSeq) return false;
      if(!body) return true;
      if(!rows.length){
        body.innerHTML = '<div class="fw-stable-echo-empty">暂时没有新的回声。私聊消息已经移到“搭子”里了。</div>';
        return true;
      }

      body.innerHTML = rows.map(function(row){
        var profile = profiles[row.actor_id] || {};
        var name = profile.nickname || '某位研究员';
        var isPost = (row.target_type === 'post' || ['like','same','tissue','comment'].indexOf(row.type) >= 0) && row.target_id;
        var actions = '';
        if(isPost) actions += '<button type="button" data-fw-stable-post="' + esc(row.target_id) + '" data-open-comments="' + (row.type === 'comment' ? '1' : '0') + '">查看帖子</button>';
        if(row.type === 'friend_request' || row.type === 'friend_accept') actions += '<button type="button" data-fw-stable-buddy>去搭子</button>';
        return '<article class="fw-stable-echo-item ' + (row.is_read ? '' : 'unread') + '"><span data-fw-profile-user="' + esc(row.actor_id || '') + '">' + echoAvatar(profile) + '</span><div class="fw-stable-echo-main"><b>' + esc(name) + ' ' + esc(typeText(row.type)) + '</b><span>' + esc(row.content || '对你的低功耗发言产生了回应。') + '</span></div><div class="fw-stable-echo-actions">' + actions + '</div></article>';
      }).join('');

      await window.fwDb.client.from('notifications').update({is_read:true}).eq('user_id', me.id).eq('is_read', false).neq('type', 'private_message');
      if(typeof window.fwRefreshStableBadges === 'function') window.fwRefreshStableBadges();
      debug('echo load success', {count:rows.length});
      return true;
    }catch(err){
      if(seq === state.echoSeq && body){
        body.innerHTML = '<div class="fw-stable-echo-empty">回声读取失败：' + esc(err && err.message ? err.message : '请稍后重试。') + '</div>';
      }
      debug('echo load failed', err && err.message ? err.message : err);
      return false;
    }
  }

  function openEchoCenter(){
    closeMobilePanels('echo');
    var modal = ensureEchoPanel();
    if(modal) modal.classList.add('show');
    reloadEchoCenter();
    return true;
  }

  function expose(){
    var fw = window.FW = window.FW || {};
    fw.openBuddyCenter = openBuddyCenter;
    fw.reloadBuddyCenter = reloadBuddyCenter;
    fw.openEchoCenter = openEchoCenter;
    fw.reloadEchoCenter = reloadEchoCenter;
    fw.closeMobilePanels = closeMobilePanels;
    fw.getActiveUser = function(){ return readCachedActiveUser(); };
    fw.ensureActiveUser = function(){ return ensureActiveUser(true); };
    fw.syncMobileAuth = fw.ensureActiveUser;
    window.fwOpenStableEcho = openEchoCenter;

    var api = window.FWMobileActions = window.FWMobileActions || {};
    api.openBuddy = function(){ debug('mobile nav openBuddy real function'); return openBuddyCenter(); };
    api.openEcho = function(){ debug('mobile nav openEcho real function'); return openEchoCenter(); };
  }

  function refreshOpenPanels(reason){
    clearTimeout(state.resumeTimer);
    state.resumeTimer = setTimeout(function(){
      expose();
      debug('resume check', reason || 'manual');
      ensureActiveUser(false).catch(function(err){ debug('resume auth failed', err && err.message ? err.message : err); });
      if($('[data-fw-wx-buddy-modal].show, .fw-wx-modal.show')) reloadBuddyCenter();
      if($('[data-fw-stable-echo-modal].show, .fw-stable-echo-modal.show, [data-fw-mobile-echo-modal].show, .fw-mobile-echo-modal.show')) reloadEchoCenter();
    }, 80);
  }

  function bind(){
    if(window.__FW_MOBILE_SOCIAL_RESUME_DATA_BOUND__) return;
    window.__FW_MOBILE_SOCIAL_RESUME_DATA_BOUND__ = true;

    window.addEventListener('click', function(e){
      var tab = e.target.closest && e.target.closest('[data-fw-mobile-tab]');
      if(!tab) return;
      var kind = tab.dataset.fwMobileTab || '';
      if(kind === 'buddy') closeMobilePanels('buddy');
      else if(kind === 'echo') closeMobilePanels('echo');
      else if(kind === 'me') closeMobilePanels('auth');
    }, true);

    document.addEventListener('click', function(e){
      var tab = e.target.closest && e.target.closest('[data-fw-wx-tab]');
      if(tab && $('[data-fw-wx-buddy-modal].show, .fw-wx-modal.show')){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        state.buddyTab = tab.dataset.fwWxTab || 'friends';
        reloadBuddyCenter();
      }

      if(e.target.closest && e.target.closest('[data-fw-stable-buddy]')){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        openBuddyCenter();
      }
    }, true);

    window.addEventListener('pageshow', function(event){ refreshOpenPanels(event && event.persisted ? 'pageshow-bfcache' : 'pageshow'); });
    document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'visible') refreshOpenPanels('visible'); });
    window.addEventListener('focus', function(){ refreshOpenPanels('focus'); });
    window.addEventListener('online', function(){ refreshOpenPanels('online'); });
  }

  function boot(){
    expose();
    bind();
    refreshOpenPanels('boot');
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
