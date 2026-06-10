(function(){
  if(window.FWAppEcho) return;

  var bound = false;
  var loaded = false;
  var lastLoadAt = 0;
  var badgeTimer = 0;
  var echoDetailReturn = false;
  var pendingEchoFocus = null;
  var ECHO_TYPES = ['like','same','tissue','comment','chat_agree','system'];

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function esc(value){ return app().esc(value); }
  function client(){ return app().db() && app().db().client; }
  function fail(result, message){ if(result && result.error) throw new Error(message || result.error.message || '读取失败'); return result ? result.data : null; }
  function isEchoType(type){ return ECHO_TYPES.indexOf(String(type || '')) >= 0; }
  function isPostNotice(notice){ return !!(notice && notice.target_id && (notice.target_type === 'post' || ['like','same','tissue','comment'].indexOf(notice.type) >= 0)); }

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
    return ({like:'点赞了你的帖子',same:'对你说：俺也一样',tissue:'给你递了纸巾',comment:'评论了你的帖子',chat_agree:'赞同了你的房间消息',system:'系统通知'})[type] || '给你发来一条回声';
  }

  function injectStyle(){
    if(document.getElementById('fwMobileEchoCoreStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileEchoCoreStyle';
    style.textContent = [
      '.app-tabbar button{position:relative}',
      '[data-app-nav="echo"] .mobile-echo-badge{position:absolute;right:16px;top:5px;min-width:17px;height:17px;padding:0 5px;border-radius:999px;background:#d95353;color:#fff;border:2px solid #10170f;display:none;place-items:center;font-size:10px;line-height:13px;font-weight:1000;box-shadow:0 4px 12px rgba(0,0,0,.22);box-sizing:border-box}',
      '[data-app-nav="echo"] .mobile-echo-badge.show{display:grid}',
      '.mobile-echo-toolbar{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:0 0 10px}',
      '.mobile-echo-toolbar b{font-size:14px;color:var(--deep);font-weight:1000}',
      '.mobile-echo-refresh{min-height:34px;border:1px solid rgba(16,23,15,.13);border-radius:999px;background:#fffdf7;color:var(--deep);padding:0 12px;font-size:12px;font-weight:1000}',
      '.mobile-echo-item{cursor:pointer;align-items:flex-start}',
      '.mobile-echo-item.unread{background:linear-gradient(135deg,#fffdf7,#fff3ef);border-color:rgba(217,121,121,.5)}',
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

  function avatar(profile){
    var name = profile && profile.nickname || '研究员';
    if(profile && profile.avatar_url) return '<span class="list-avatar"><img src="' + esc(profile.avatar_url) + '" alt="' + esc(name) + '"></span>';
    return '<span class="list-avatar">' + esc(app().initials(name)) + '</span>';
  }

  async function fetchProfiles(ids){
    var unique = Array.from(new Set((ids || []).filter(Boolean)));
    if(!unique.length) return {};
    try{
      var rows = fail(await client().from('profiles').select('id,nickname,avatar_url,lab_code').in('id', unique), '资料读取失败') || [];
      var map = {};
      rows.forEach(function(row){ map[row.id] = row; });
      return map;
    }catch(e){ return {}; }
  }

  function setEchoBadge(count){
    var button = document.querySelector('[data-app-nav="echo"]');
    if(!button) return;
    var badge = button.querySelector('.mobile-echo-badge');
    if(!badge){ badge = document.createElement('span'); badge.className = 'mobile-echo-badge'; button.appendChild(badge); }
    var n = Number(count || 0);
    if(n > 0){ badge.textContent = n > 99 ? '99+' : String(n); badge.setAttribute('aria-hidden', 'false'); badge.classList.add('show'); button.classList.add('has-mobile-echo-badge'); }
    else{ badge.textContent = ''; badge.setAttribute('aria-hidden', 'true'); badge.classList.remove('show'); button.classList.remove('has-mobile-echo-badge'); }
  }

  async function currentUser(){
    if(app().state && app().state.user) return app().state.user;
    try{ return app().refreshUser ? await app().refreshUser() : null; }catch(e){ return null; }
  }

  async function refreshBadges(){
    if(!(await app().waitForDb())){ setEchoBadge(0); return; }
    var me = await currentUser();
    if(!me || !me.id){ setEchoBadge(0); return; }
    try{
      var rows = fail(await client().from('notifications').select('id,type').eq('user_id', me.id).eq('is_read', false).in('type', ECHO_TYPES).limit(300), '回声角标读取失败') || [];
      setEchoBadge(rows.filter(function(row){ return isEchoType(row.type); }).length);
    }catch(e){ console.warn('[FW mobile app] echo badge refresh failed', e); }
  }

  function noticeHtml(notice, profile){
    var action = typeText(notice.type);
    var content = notice.content || '对你的低功耗发言产生了回应。';
    var actions = '';
    if(isPostNotice(notice)) actions += '<button class="mobile-echo-mini dark" type="button" data-mobile-echo-post="' + esc(notice.target_id) + '" data-mobile-echo-type="' + esc(notice.type || '') + '" data-mobile-echo-actor="' + esc(notice.actor_id || '') + '" data-mobile-echo-time="' + esc(notice.created_at || '') + '" data-open-comments="' + (notice.type === 'comment' ? '1' : '0') + '">查看帖子</button>';
    if(notice.type === 'chat_agree') actions += '<button class="mobile-echo-mini dark" type="button" data-mobile-echo-rooms>去学术研讨</button>';
    return '<article class="notice-item mobile-echo-item ' + (notice.is_read ? '' : 'unread') + '" data-mobile-echo-item="' + esc(notice.id) + '">' + avatar(profile) + '<div class="list-main"><b>' + esc((profile && profile.nickname || '某位研究员') + ' ' + action) + '</b><span>' + esc(content) + '</span><small>' + esc(timeText(notice.created_at)) + '</small>' + (actions ? '<div class="notice-actions">' + actions + '</div>' : '') + '</div></article>';
  }

  async function load(force){
    var list = $('[data-echo-list]');
    if(!list) return;
    if(!force && loaded && Date.now() - lastLoadAt < 15000){ refreshBadges(); return; }
    list.innerHTML = '<div class="loading">正在读取回声...</div>';
    try{
      if(!(await app().waitForDb())) throw new Error('暂时无法连接数据服务。');
      var me = await currentUser();
      if(!me || !me.id){ list.innerHTML = '<div class="empty">请先登录后查看回声。</div>'; loaded = true; lastLoadAt = Date.now(); refreshBadges(); return; }
      var rows = fail(await client().from('notifications').select('id,actor_id,type,target_type,target_id,content,is_read,created_at').eq('user_id', me.id).in('type', ECHO_TYPES).order('created_at', {ascending:false}).limit(100), '回声读取失败') || [];
      rows = rows.filter(function(row){ return isEchoType(row.type); });
      var profiles = await fetchProfiles(rows.map(function(row){ return row.actor_id; }));
      var toolbar = '<div class="mobile-echo-toolbar"><b>回声通知</b><button class="mobile-echo-refresh" type="button" data-mobile-echo-refresh>刷新</button></div>';
      list.innerHTML = toolbar + (rows.length ? rows.map(function(row){ return noticeHtml(row, profiles[row.actor_id] || {}); }).join('') : '<div class="empty">暂时没有新的回声。安静也是一种运行状态。</div>');
      var unreadIds = rows.filter(function(row){ return !row.is_read; }).map(function(row){ return row.id; });
      if(unreadIds.length) client().from('notifications').update({is_read:true}).in('id', unreadIds).then(function(){ refreshBadges(); });
      else refreshBadges();
      loaded = true;
      lastLoadAt = Date.now();
    }catch(e){ console.warn('[FW mobile app] echo load failed', e); list.innerHTML = '<div class="error">回声暂时读取失败，请稍后再试。</div>'; }
  }

  function flattenComments(rows){
    var out = [];
    (rows || []).forEach(function(c){
      if(!c) return;
      out.push(c);
      if(Array.isArray(c.replies)) out = out.concat(flattenComments(c.replies));
    });
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
    echoDetailReturn = true;
    pendingEchoFocus = {postId:String(postId), actorId:options.actorId || '', createdAt:options.createdAt || '', openComments:!!options.openComments};
    app().setView('square');
    try{
      if(window.FWAppFeed && window.FWAppFeed.load) await window.FWAppFeed.load(false, {silent:true});
      if(window.FWAppFeed && window.FWAppFeed.openDetail){
        window.FWAppFeed.openDetail(postId, {openComments:!!options.openComments, from:'echo'});
        setTimeout(focusEchoTarget, 220);
        setTimeout(focusEchoTarget, 700);
      }else app().toast('帖子可能还在加载中，请稍后再试。');
    }catch(e){ console.warn('[FW mobile app] open echo post failed', e); app().toast('帖子打开失败，请稍后再试。'); }
  }

  function returnToEcho(){
    echoDetailReturn = false;
    app().setView('echo');
    if(window.FWAppEcho && typeof window.FWAppEcho.ensureLoaded === 'function') window.FWAppEcho.ensureLoaded();
  }

  function bind(){
    if(bound) return;
    bound = true;
    document.addEventListener('click', function(e){
      var detailBack = e.target.closest && e.target.closest('[data-square-detail-back]');
      if(detailBack && echoDetailReturn){ e.preventDefault(); e.stopPropagation(); returnToEcho(); return; }
    }, true);
    document.addEventListener('click', function(e){
      var refresh = e.target.closest && e.target.closest('[data-mobile-echo-refresh]');
      if(refresh){ e.preventDefault(); loaded = false; load(true); return; }
      var post = e.target.closest && e.target.closest('[data-mobile-echo-post]');
      if(post){
        e.preventDefault();
        e.stopPropagation();
        openPost(post.dataset.mobileEchoPost, {openComments:post.dataset.openComments === '1', actorId:post.dataset.mobileEchoActor || '', createdAt:post.dataset.mobileEchoTime || ''});
        return;
      }
      var rooms = e.target.closest && e.target.closest('[data-mobile-echo-rooms]');
      if(rooms){ e.preventDefault(); e.stopPropagation(); app().setView('rooms'); }
    });
    window.addEventListener('focus', function(){ refreshBadges(); });
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) refreshBadges(); });
  }

  function init(){ injectStyle(); bind(); refreshBadges(); clearInterval(badgeTimer); badgeTimer = setInterval(refreshBadges, 45000); }
  function ensureLoaded(){ load(false); }
  window.FWAppEcho = {init:init, load:load, ensureLoaded:ensureLoaded, refreshBadges:refreshBadges, openPost:openPost};
})();
