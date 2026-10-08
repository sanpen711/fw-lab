(function(){
  if(window.FWAppEcho) return;

  var bound = false;
  var loaded = false;
  var lastLoadAt = 0;
  var badgeTimer = 0;
  var pendingEchoFocus = null;
  var squareMode = 'feed';
  var FEED_RETURN_KEY = 'fw_mobile_feed_detail_return_view';
  var PROFILE_CACHE_KEY = 'fw_mobile_echo_profile_cache_v1';
  var PROFILE_CACHE_LIMIT = 260;
  var ECHO_TYPES = ['like','comment','comment_reply'];
  var PAGE_SIZE = 100;
  var echoRows = [];
  var hasMore = false;
  var pageLoading = false;
  var loadGeneration = 0;
  var badgeGeneration = 0;
  var globalUnread = false;

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function esc(value){ return app().esc(value); }
  function client(){ return app().db() && app().db().client; }
  function fail(result, message){ if(result && result.error) throw new Error(message || result.error.message || '读取失败'); return result ? result.data : null; }
  function isEchoType(type){ return ECHO_TYPES.indexOf(String(type || '')) >= 0; }
  function postTargetId(notice){ return String((notice && (notice.__post_id || notice.target_id)) || ''); }
  function isPostNotice(notice){
    if(!notice) return false;
    if(notice.type === 'comment_reply') return !!notice.__post_id;
    return !!(notice.target_id && (notice.target_type === 'post' || ['like','comment'].indexOf(notice.type) >= 0));
  }
  function writeFeedReturnView(value){ try{ if(value) sessionStorage.setItem(FEED_RETURN_KEY, value); else sessionStorage.removeItem(FEED_RETURN_KEY); }catch(e){} }

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
    return ({like:'点赞了你的帖子',comment:'评论了你的帖子',comment_reply:'回复了你的评论',chat_agree:'赞同了你的房间消息',system:'系统通知'})[type] || '给你发来一条回声';
  }

  function noticePreview(value){
    return String(value || '')
      .replace(/\[\[FW_USER_STICKER:[A-Za-z0-9+/=]+\]\]/g, '动画表情')
      .replace(/\[\[FW_MEDIA_IMAGE:[A-Za-z0-9+/=]+\]\]/g, '图片')
      .replace(/\[\[FW_MEDIA_VIDEO:[A-Za-z0-9+/=]+\]\]/g, '视频')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function injectStyle(){
    if(document.getElementById('fwMobileEchoCoreStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileEchoCoreStyle';
    style.textContent = [
      '.app-tabbar button{position:relative}',
      '[data-mobile-square-mode="echo"] .mobile-echo-badge{position:absolute;right:12px;top:8px;width:10px!important;min-width:10px!important;height:10px!important;padding:0!important;border-radius:999px;background:#d95353;color:transparent!important;border:2px solid #f4f4f2;display:none;font-size:0!important;line-height:0!important;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.2);box-sizing:border-box}',
      '[data-mobile-square-mode="echo"] .mobile-echo-badge.show{display:block}',
      '.mobile-echo-toolbar{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:0 0 10px;flex-wrap:wrap}',
      '.mobile-echo-toolbar b{font-size:14px;color:var(--deep);font-weight:1000}',
      '.mobile-echo-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.mobile-echo-refresh,.mobile-echo-mark-all{min-height:34px;border:1px solid rgba(16,23,15,.13);border-radius:999px;background:#fffdf7;color:var(--deep);padding:0 12px;font-size:12px;font-weight:1000}',
      '.mobile-echo-mark-all{background:var(--deep);border-color:var(--deep);color:#fff}',
      '.mobile-echo-item{cursor:pointer;align-items:flex-start;position:relative}',
      '.mobile-echo-item.unread{background:linear-gradient(135deg,#fffdf7,#fff3ef);border-color:rgba(217,121,121,.5)}',
      '.mobile-echo-item.unread:before{content:"";position:absolute;left:10px;top:10px;width:10px;height:10px;border-radius:999px;background:#d95353;border:2px solid #fffdf7;box-shadow:0 3px 10px rgba(217,83,83,.28)}',
      '.mobile-echo-item .list-main small{display:block;margin-top:5px;color:var(--accent-dark);font-size:11px;font-weight:1000}',
      '.mobile-echo-item .notice-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center;justify-content:flex-start;margin-top:8px}',
      '.mobile-echo-mini{min-height:30px;border:1px solid rgba(16,23,15,.13);border-radius:999px;background:#fffdf7;color:var(--deep);padding:0 10px;font-size:12px;font-weight:1000}',
      '.mobile-echo-mini.dark{background:var(--deep);border-color:var(--deep);color:#fff}',
      '.mobile-echo-target{animation:mobileEchoTarget 2.6s ease both}',
      '.mobile-echo-target-comment{animation:mobileEchoTarget 3s ease both;border-radius:14px}',
      '@keyframes mobileEchoTarget{0%{box-shadow:0 0 0 0 rgba(217,121,121,.7);transform:translateY(-2px)}40%{box-shadow:0 0 0 8px rgba(217,121,121,.18)}100%{box-shadow:0 0 0 0 rgba(217,121,121,0);transform:none}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function readProfileCache(){
    try{
      var raw = window.localStorage && localStorage.getItem(PROFILE_CACHE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    }catch(e){ return {}; }
  }

  function writeProfileCache(cache){
    try{
      var rows = Object.keys(cache || {}).map(function(id){ return cache[id]; }).filter(function(row){ return row && row.id; });
      rows.sort(function(a,b){ return Number(b.cached_at || 0) - Number(a.cached_at || 0); });
      var kept = {};
      rows.slice(0, PROFILE_CACHE_LIMIT).forEach(function(row){ kept[row.id] = row; });
      if(window.localStorage) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(kept));
    }catch(e){}
  }

  function profileFromCache(id, cache){
    id = String(id || '');
    if(!id) return null;
    var row = (cache || readProfileCache())[id];
    if(!row) return null;
    return {id:row.id, nickname:row.nickname || '', avatar_url:row.avatar_url || '', lab_code:row.lab_code || ''};
  }

  function mergeProfileCache(rows){
    var cache = readProfileCache();
    var changed = false;
    (rows || []).forEach(function(row){
      if(!row || !row.id) return;
      cache[row.id] = {id:row.id,nickname:row.nickname || '',avatar_url:row.avatar_url || '',lab_code:row.lab_code || '',cached_at:Date.now()};
      changed = true;
    });
    if(changed) writeProfileCache(cache);
  }

  function avatar(profile){
    var name = profile && profile.nickname || '研究员';
    var url = profile && profile.avatar_url || '';
    if(url) return '<span class="list-avatar"><img src="' + esc(url) + '" alt="' + esc(name) + '" loading="eager" decoding="async" data-echo-avatar></span>';
    return '<span class="list-avatar">' + esc(app().initials(name)) + '</span>';
  }

  function prefetchProfileAvatars(profiles){
    if(!window.FWMobileMediaCache || typeof window.FWMobileMediaCache.prefetch !== 'function') return;
    try{
      var urls = [];
      Object.keys(profiles || {}).forEach(function(id){ var url = profiles[id] && profiles[id].avatar_url || ''; if(url) urls.push(url); });
      if(urls.length) window.FWMobileMediaCache.prefetch(urls, 'avatar');
    }catch(e){}
  }

  function scanMediaSoon(){
    if(window.FWMobileMediaCache && typeof window.FWMobileMediaCache.scan === 'function'){
      setTimeout(function(){ try{ window.FWMobileMediaCache.scan(); }catch(e){} }, 0);
      setTimeout(function(){ try{ window.FWMobileMediaCache.scan(); }catch(e){} }, 220);
      setTimeout(function(){ try{ window.FWMobileMediaCache.scan(); }catch(e){} }, 800);
    }
  }

  async function fetchProfiles(ids){
    var unique = Array.from(new Set((ids || []).filter(Boolean)));
    if(!unique.length) return {};
    var local = readProfileCache();
    var map = {};
    unique.forEach(function(id){ var cached = profileFromCache(id, local); if(cached) map[id] = cached; });
    try{
      var rows = fail(await client().from('profiles').select('id,nickname,avatar_url,lab_code').in('id', unique), '资料读取失败') || [];
      rows.forEach(function(row){ map[row.id] = row; });
      mergeProfileCache(rows);
      prefetchProfileAvatars(map);
      return map;
    }catch(e){
      prefetchProfileAvatars(map);
      return map;
    }
  }

  async function resolveReplyPostIds(rows){
    var commentIds = Array.from(new Set((rows || []).filter(function(row){ return row && row.type === 'comment_reply' && row.target_id; }).map(function(row){ return row.target_id; })));
    if(!commentIds.length) return rows || [];
    var map = {};
    try{
      var comments = fail(await client().from('comments').select('id,post_id').in('id', commentIds), '回复目标读取失败') || [];
      comments.forEach(function(comment){ if(comment && comment.id && comment.post_id) map[comment.id] = comment.post_id; });
    }catch(e){ console.warn('[FW mobile app] echo reply target resolve failed', e); }
    (rows || []).forEach(function(row){ if(row && row.type === 'comment_reply' && row.target_id && map[row.target_id]) row.__post_id = map[row.target_id]; });
    return rows || [];
  }

  function setEchoBadge(count){
    var button = document.querySelector('[data-mobile-square-mode="echo"]');
    var navDot = document.querySelector('[data-mobile-square-dot]');
    var n = Number(count || 0);
    if(navDot) navDot.hidden = n <= 0;
    if(!button) return;
    var badge = button.querySelector('.mobile-echo-badge');
    if(!badge){ badge = document.createElement('span'); badge.className = 'mobile-echo-badge'; button.appendChild(badge); }
    if(n > 0){
      badge.textContent = '';
      badge.setAttribute('aria-hidden', 'true');
      badge.classList.add('show');
      button.classList.add('has-mobile-echo-badge');
    }else{
      badge.textContent = '';
      badge.setAttribute('aria-hidden', 'true');
      badge.classList.remove('show');
      button.classList.remove('has-mobile-echo-badge');
    }
  }

  function setSquareMode(mode){
    squareMode = mode === 'echo' ? 'echo' : 'feed';
    var buttons = app().$$('[data-mobile-square-mode]');
    var panels = app().$$('[data-mobile-square-panel]');
    buttons.forEach(function(button){
      var active = button.dataset.mobileSquareMode === squareMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach(function(panel){ panel.hidden = panel.dataset.mobileSquarePanel !== squareMode; });
    var title = document.querySelector('[data-mobile-square-title]');
    if(title) title.textContent = squareMode === 'echo' ? '回声通知' : '发牢骚、评论、互动';
    var main = document.getElementById('appMain');
    if(main && app().state && app().state.view === 'square') main.scrollTop = 0;
    if(squareMode === 'echo') load(true);
    else if(window.FWAppFeed && window.FWAppFeed.ensureLoaded) window.FWAppFeed.ensureLoaded();
  }

  function isSquareMode(mode){ return squareMode === mode; }

  function echoVisible(){
    return !document.hidden && squareMode === 'echo' && app().state && app().state.view === 'square';
  }
  function sameUser(uid){ return app().state && app().state.user && app().state.user.id === uid; }
  function syncReadUi(ids){
    var seen = new Set(ids.map(String));
    echoRows.forEach(function(row){ if(seen.has(String(row.id))) row.is_read = true; });
    ids.forEach(function(id){
      var item = document.querySelector('[data-mobile-echo-item="' + String(id).replace(/"/g, '') + '"]');
      if(item) item.classList.remove('unread');
    });
  }
  function syncMarkAllButton(){
    var button = document.querySelector('[data-mobile-echo-mark-all]');
    if(button) button.hidden = !globalUnread;
  }

  async function currentUser(){
    if(app().state && app().state.user) return app().state.user;
    try{ return app().refreshUser ? await app().refreshUser() : null; }catch(e){ return null; }
  }

  async function refreshBadges(){
    var generation = ++badgeGeneration;
    if(!(await app().waitForDb())) return;
    var me = await currentUser();
    if(generation !== badgeGeneration) return;
    if(!me || !me.id){ globalUnread = false; setEchoBadge(0); syncMarkAllButton(); return; }
    try{
      // Query unread records directly: old unread notifications must not disappear beyond a page limit.
      var rows = fail(await client().from('notifications').select('id').eq('user_id', me.id).in('type', ECHO_TYPES).eq('is_read', false).limit(1), '回声角标读取失败') || [];
      if(generation !== badgeGeneration || !sameUser(me.id)) return;
      globalUnread = rows.length > 0;
      setEchoBadge(globalUnread ? 1 : 0);
      syncMarkAllButton();
    }catch(e){ console.warn('[FW mobile app] echo badge refresh failed', e); }
  }

  async function markRead(ids){
    ids = Array.from(new Set((ids || []).map(function(id){ return String(id || '').trim(); }).filter(function(id){ return /^\d+$/.test(id); })));
    if(!ids.length) return false;
    var me = await currentUser();
    if(!me || !me.id) return false;
    try{
      if(!(await app().waitForDb()) || !sameUser(me.id)) return false;
      var result = await client().from('notifications').update({is_read:true}).eq('user_id', me.id).in('type', ECHO_TYPES).in('id', ids).select('id');
      var updated = fail(result, '已读状态保存失败') || [];
      if(!sameUser(me.id)) return false;
      var savedIds = updated.map(function(row){ return String(row.id); });
      syncReadUi(savedIds);
      await refreshBadges();
      if(ids.some(function(id){ return savedIds.indexOf(id) < 0; })) throw new Error('部分已读状态未保存');
      return true;
    }catch(e){
      console.warn('[FW mobile app] echo mark read failed', e);
      if(sameUser(me.id)) app().toast('已读状态未能保存，请稍后重试。');
      refreshBadges();
      return false;
    }
  }

  async function markAllRead(button){
    var me = await currentUser();
    if(!me || !me.id) return;
    var cutoff = new Date().toISOString();
    if(button) button.disabled = true;
    try{
      if(!(await app().waitForDb()) || !sameUser(me.id)) return;
      fail(await client().from('notifications').update({is_read:true}).eq('user_id', me.id).in('type', ECHO_TYPES).eq('is_read', false).lte('created_at', cutoff), '已读状态保存失败');
      var remaining = fail(await client().from('notifications').select('id').eq('user_id', me.id).in('type', ECHO_TYPES).eq('is_read', false).lte('created_at', cutoff).limit(1), '已读状态核对失败') || [];
      if(remaining.length) throw new Error('已读状态未保存');
      if(!sameUser(me.id)) return;
      syncReadUi(echoRows.filter(function(row){ return row.created_at <= cutoff; }).map(function(row){ return row.id; }));
      await refreshBadges();
    }catch(e){
      console.warn('[FW mobile app] echo mark all failed', e);
      if(sameUser(me.id)) app().toast('已读状态未能保存，请稍后重试。');
    }finally{ if(button) button.disabled = false; }
  }

  function noticeHtml(notice, profile){
    var action = typeText(notice.type);
    var content = noticePreview(notice.content || '对你的低功耗发言产生了回应。') || '对你的低功耗发言产生了回应。';
    var actions = '';
    var targetPost = postTargetId(notice);
    if(isPostNotice(notice)){
      actions += '<button class="mobile-echo-mini dark" type="button" data-mobile-echo-post="' + esc(targetPost) + '" data-mobile-echo-notice="' + esc(notice.id) + '" data-mobile-echo-type="' + esc(notice.type || '') + '" data-mobile-echo-actor="' + esc(notice.actor_id || '') + '" data-mobile-echo-time="' + esc(notice.created_at || '') + '" data-open-comments="' + ((notice.type === 'comment' || notice.type === 'comment_reply') ? '1' : '0') + '">查看帖子</button>';
    }
    if(notice.type === 'chat_agree') actions += '<button class="mobile-echo-mini dark" type="button" data-mobile-echo-rooms data-mobile-echo-notice="' + esc(notice.id) + '">去学术研讨</button>';
    var actorAvatar = notice.actor_id ? '<span data-profile-user="' + esc(notice.actor_id) + '" role="button" tabindex="0">' + avatar(profile) + '</span>' : avatar(profile);
    return '<article class="notice-item mobile-echo-item ' + (notice.is_read ? '' : 'unread') + '" data-mobile-echo-item="' + esc(notice.id) + '">' + actorAvatar + '<div class="list-main"><b>' + esc((profile && profile.nickname || '某位研究员') + ' ' + action) + '</b><span>' + esc(content) + '</span><small>' + esc(timeText(notice.created_at)) + '</small>' + (actions ? '<div class="notice-actions">' + actions + '</div>' : '') + '</div></article>';
  }

  async function load(force, append){
    var list = $('[data-echo-list]');
    if(!list || (append && (pageLoading || !hasMore))) return;
    if(!force && !append && loaded && Date.now() - lastLoadAt < 15000){ refreshBadges(); scanMediaSoon(); return; }
    var generation = append ? loadGeneration : ++loadGeneration;
    pageLoading = true;
    var moreButton = list.querySelector('[data-mobile-echo-more]');
    if(append){ if(moreButton) moreButton.disabled = true; }
    else list.innerHTML = '<div class="loading">正在读取回声...</div>';
    try{
      if(!(await app().waitForDb())) throw new Error('暂时无法连接数据服务。');
      var me = await currentUser();
      if(generation !== loadGeneration) return;
      if(!me || !me.id){ echoRows = []; hasMore = false; list.innerHTML = '<div class="empty">请先登录后查看回声。</div>'; loaded = true; lastLoadAt = Date.now(); refreshBadges(); return; }
      var query = client().from('notifications').select('id,actor_id,type,target_type,target_id,content,is_read,created_at').eq('user_id', me.id).in('type', ECHO_TYPES).order('created_at', {ascending:false}).order('id', {ascending:false});
      var cursor = append && echoRows[echoRows.length - 1];
      if(cursor) query = query.or('created_at.lt.' + cursor.created_at + ',and(created_at.eq.' + cursor.created_at + ',id.lt.' + cursor.id + ')');
      var rows = fail(await query.limit(PAGE_SIZE + 1), '回声读取失败') || [];
      var nextHasMore = rows.length > PAGE_SIZE;
      rows = await resolveReplyPostIds(rows.slice(0, PAGE_SIZE));
      var profiles = await fetchProfiles(rows.map(function(row){ return row.actor_id; }));
      if(generation !== loadGeneration || !sameUser(me.id)) return;
      hasMore = nextHasMore;
      echoRows = append ? echoRows.concat(rows) : rows;
      var toolbar = '<div class="mobile-echo-toolbar"><b>回声通知</b><div class="mobile-echo-actions"><button class="mobile-echo-mark-all" type="button" data-mobile-echo-mark-all hidden>全部已读</button><button class="mobile-echo-refresh" type="button" data-mobile-echo-refresh>刷新</button></div></div>';
      if(append){
        if(moreButton) moreButton.remove();
        list.insertAdjacentHTML('beforeend', rows.map(function(row){ return noticeHtml(row, profiles[row.actor_id] || {}); }).join(''));
      }else list.innerHTML = toolbar + (rows.length ? rows.map(function(row){ return noticeHtml(row, profiles[row.actor_id] || {}); }).join('') : '<div class="empty">暂时没有新的回声。安静也是一种运行状态。</div>');
      if(hasMore) list.insertAdjacentHTML('beforeend', '<button class="mobile-echo-refresh" type="button" data-mobile-echo-more>查看更早回声</button>');
      scanMediaSoon();
      loaded = true;
      lastLoadAt = Date.now();
      var unreadIds = rows.filter(function(row){ return !row.is_read; }).map(function(row){ return row.id; });
      // Only acknowledge the displayed snapshot while the user is still viewing echo.
      if(echoVisible() && unreadIds.length) await markRead(unreadIds);
      else await refreshBadges();
    }catch(e){
      console.warn('[FW mobile app] echo load failed', e);
      if(generation !== loadGeneration) return;
      if(append) app().toast('历史回声读取失败，请重试。');
      else list.innerHTML = '<div class="error">回声暂时读取失败，请稍后再试。</div>';
    }finally{
      if(generation === loadGeneration) pageLoading = false;
      if(moreButton) moreButton.disabled = false;
    }
  }

  function flattenComments(rows){
    var out = [];
    (rows || []).forEach(function(c){ if(!c) return; out.push(c); if(Array.isArray(c.replies)) out = out.concat(flattenComments(c.replies)); });
    return out;
  }

  function findEchoComment(postId, actorId, createdAt){
    var posts = app().state.posts || [];
    var post = posts.find(function(row){ return String(row.id) === String(postId); });
    if(!post || !actorId) return null;
    var rows = flattenComments(post.comments || []).filter(function(c){ return String(c.userId || c.authorId || '') === String(actorId); });
    if(!rows.length) return null;
    var ts = new Date(createdAt || '').getTime();
    rows.sort(function(a,b){
      var at = new Date(a.createdAt || '').getTime();
      var bt = new Date(b.createdAt || '').getTime();
      if(!isNaN(ts) && !isNaN(at) && !isNaN(bt)) return Math.abs(at - ts) - Math.abs(bt - ts);
      return (bt || 0) - (at || 0);
    });
    return rows[0];
  }

  function focusEchoTarget(){
    var focus = pendingEchoFocus;
    if(!focus) return;
    var target = null;
    if(focus.openComments){
      var comment = findEchoComment(focus.postId, focus.actorId, focus.createdAt);
      if(comment && comment.id) target = document.querySelector('[data-comment-id="' + String(comment.id).replace(/"/g, '') + '"]');
      if(!target) target = document.querySelector('.detail-comments-card[data-post-id="' + String(focus.postId).replace(/"/g, '') + '"]') || document.querySelector('.detail-comments-card');
    }
    if(!target) target = document.querySelector('[data-post-id="' + String(focus.postId).replace(/"/g, '') + '"]');
    if(target){
      target.classList.add('mobile-echo-target-comment');
      target.scrollIntoView({block:'center', behavior:'smooth'});
      setTimeout(function(){ target.classList.remove('mobile-echo-target-comment'); }, 3200);
    }
  }

  async function openPost(postId, options){
    options = options || {};
    if(!postId){ app().toast('这条回声暂时没有对应帖子。'); return; }
    if(options.noticeId) markRead([options.noticeId]);
    writeFeedReturnView('echo');
    pendingEchoFocus = {postId:String(postId), actorId:options.actorId || '', createdAt:options.createdAt || '', openComments:!!options.openComments};
    app().setView('square');
    try{
      if(window.FWAppFeed && window.FWAppFeed.load) await window.FWAppFeed.load(false, {silent:true});
      if(window.FWAppFeed && window.FWAppFeed.openDetail){
        window.FWAppFeed.openDetail(postId, {openComments:!!options.openComments, from:'echo', returnView:'echo'});
        setTimeout(focusEchoTarget, 220);
        setTimeout(focusEchoTarget, 700);
      }else app().toast('帖子可能还在加载中，请稍后再试。');
    }catch(e){ console.warn('[FW mobile app] open echo post failed', e); app().toast('帖子打开失败，请稍后再试。'); }
  }

  function bind(){
    if(bound) return;
    bound = true;
    document.addEventListener('click', function(e){
      var mode = e.target.closest && e.target.closest('[data-mobile-square-mode]');
      if(mode){
        e.preventDefault();
        app().setView(mode.dataset.mobileSquareMode === 'echo' ? 'echo' : 'square');
        return;
      }
      var refresh = e.target.closest && e.target.closest('[data-mobile-echo-refresh]');
      if(refresh){ e.preventDefault(); loaded = false; load(true); return; }
      var more = e.target.closest && e.target.closest('[data-mobile-echo-more]');
      if(more){ e.preventDefault(); load(true, true); return; }
      var markAll = e.target.closest && e.target.closest('[data-mobile-echo-mark-all]');
      if(markAll){ e.preventDefault(); markAllRead(markAll); return; }
      var post = e.target.closest && e.target.closest('[data-mobile-echo-post]');
      if(post){
        e.preventDefault();
        e.stopPropagation();
        openPost(post.dataset.mobileEchoPost, {noticeId:post.dataset.mobileEchoNotice || '', openComments:post.dataset.openComments === '1', actorId:post.dataset.mobileEchoActor || '', createdAt:post.dataset.mobileEchoTime || ''});
        return;
      }
      var rooms = e.target.closest && e.target.closest('[data-mobile-echo-rooms]');
      if(rooms){ e.preventDefault(); e.stopPropagation(); markRead([rooms.dataset.mobileEchoNotice || '']); app().setView('rooms'); return; }
      var item = e.target.closest && e.target.closest('[data-mobile-echo-item]');
      if(item && item.classList.contains('unread')) markRead([item.dataset.mobileEchoItem]);
    });
    window.addEventListener('focus', function(){ if(echoVisible()) load(true); else refreshBadges(); scanMediaSoon(); });
    document.addEventListener('visibilitychange', function(){ if(!document.hidden){ if(echoVisible()) load(true); else refreshBadges(); scanMediaSoon(); } });
  }

  function stopBadgeTimer(){ clearTimeout(badgeTimer); badgeTimer = null; }
  function scheduleBadgeTimer(delay){
    stopBadgeTimer();
    if(document.hidden) return;
    badgeTimer = setTimeout(function(){ Promise.resolve(refreshBadges()).finally(function(){ scheduleBadgeTimer(45000); }); }, delay == null ? 45000 : delay);
  }
  function init(){
    injectStyle();
    bind();
    document.addEventListener('fw:app-userchange', function(){
      ++loadGeneration; ++badgeGeneration; loaded = false; pageLoading = false; echoRows = []; hasMore = false; globalUnread = false;
      var list = $('[data-echo-list]'); if(list) list.innerHTML = '';
      setEchoBadge(0); if(echoVisible()) load(true); else refreshBadges();
    });
    setSquareMode('feed');
    refreshBadges();
    scheduleBadgeTimer();
    document.addEventListener('fw:app-visibility', function(event){ if(!(event && event.detail && event.detail.visible)) stopBadgeTimer(); else scheduleBadgeTimer(300); });
  }
  function ensureLoaded(){ load(true); }
  window.FWAppEcho = {init:init, load:load, ensureLoaded:ensureLoaded, refreshBadges:refreshBadges, openPost:openPost, markRead:markRead, setSquareMode:setSquareMode, isSquareMode:isSquareMode};
})();
