// F.w 研究所：手机端全局稳定性补丁
// 不改底部安全区；不恢复非管理员后台提示。
(function(){
  if(window.__FW_MOBILE_GLOBAL_FIXES_20260617__) return;
  window.__FW_MOBILE_GLOBAL_FIXES_20260617__ = true;

  var FEED_LIMIT = 40;
  var feedLoading = false;
  var feedPatched = false;
  var navPatched = false;
  var echoObserver = null;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function app(){ return window.FWApp || null; }
  function client(){ return window.fwDb && window.fwDb.client; }
  function toast(message){ var fw = app(); if(fw && fw.toast) fw.toast(message); }
  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function fail(result, message){
    if(result && result.error) throw new Error(message || result.error.message || '操作失败');
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
  function schedule(fn, delays){
    (delays || [0, 120, 360, 900]).forEach(function(delay){ setTimeout(fn, delay); });
  }

  async function currentUser(){
    var fw = app();
    if(fw && fw.state && fw.state.user) return fw.state.user;
    if(fw && fw.refreshUser){
      try{ return await fw.refreshUser(); }catch(e){}
    }
    if(window.fwDb && window.fwDb.getCurrentUser){
      try{ return await window.fwDb.getCurrentUser(); }catch(e){}
    }
    return null;
  }

  async function waitDb(){
    var fw = app();
    if(fw && fw.waitForDb) return await fw.waitForDb();
    return !!(window.fwDb && window.fwDb.enabled && window.fwDb.client);
  }

  function patchChildHistory(){
    var fw = app();
    if(!fw || navPatched || typeof fw.setView !== 'function') return false;
    navPatched = true;

    var originalSetView = fw.setView;
    var suppressPush = false;
    var childParents = {
      'square-detail':'square',
      'square-publish':'square',
      'rooms-compose':'rooms',
      'bird-detail':'bird',
      'bird-compose':'bird'
    };

    function hasView(view){ return !!document.querySelector('[data-app-view="' + String(view).replace(/"/g, '') + '"]'); }
    function urlForHash(hash){ return window.location.pathname + window.location.search + (hash ? '#' + hash : ''); }
    function pushChild(view){
      if(!childParents[view] || !window.history || !window.history.pushState || !hasView(view)) return;
      var next = urlForHash(view);
      var current = window.location.pathname + window.location.search + window.location.hash;
      if(next !== current){
        try{ window.history.pushState({fwMobileChild:view}, document.title, next); }catch(e){}
      }
    }
    function openWithoutPush(view){
      suppressPush = true;
      try{ originalSetView.call(fw, view); }
      finally{ setTimeout(function(){ suppressPush = false; }, 0); }
    }

    fw.setView = function(name){
      var before = fw.state && fw.state.view || '';
      var result = originalSetView.apply(fw, arguments);
      var after = fw.state && fw.state.view || name || 'nav';
      if(!suppressPush && after !== before && childParents[after]) pushChild(after);
      return result;
    };

    window.addEventListener('popstate', function(){
      var hash = String(window.location.hash || '').replace(/^#/, '');
      var current = fw.state && fw.state.view || '';
      if(childParents[hash] && hasView(hash)){
        openWithoutPush(hash);
        return;
      }
      if(childParents[current]){
        openWithoutPush(childParents[current] || 'nav');
      }
    });
    return true;
  }

  function patchReportFallback(){
    async function submitFallback(targetType, targetId, defaultReason){
      targetId = String(targetId || '').trim();
      if(!targetType || !targetId){ toast('没有找到举报对象。'); return; }
      if(window.FWAppReport && typeof window.FWAppReport.submit === 'function'){
        window.FWAppReport.submit(targetType, targetId, defaultReason);
        return;
      }
      if(!(await waitDb())){ toast('暂时无法连接数据服务。'); return; }
      var user = await currentUser();
      if(!user){ toast('请先登录后再举报。'); var fw = app(); if(fw && fw.setView) fw.setView('profile'); return; }
      var reason = window.prompt('请输入举报原因（可写：' + (defaultReason || '请简单说明原因') + '）：', '');
      if(reason === null) return;
      reason = String(reason || '').trim();
      if(reason.length < 2){ toast('举报原因至少 2 个字。'); return; }
      try{
        var c = client();
        if(!c) throw new Error('暂时无法连接数据服务。');
        fail(await c.rpc('fw_submit_report', {p_target_type:targetType, p_target_id:targetId, p_reason:reason}), '举报提交失败');
        toast('举报已提交，管理员会在后台处理。');
      }catch(e){
        console.warn('[FW mobile global fixes] report fallback failed', e);
        toast(e.message || '举报提交失败。');
      }
    }

    document.addEventListener('click', function(e){
      var target = e.target;
      if(!target || !target.closest) return;
      var comment = target.closest('[data-comment-report]');
      if(comment){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        var commentId = comment.dataset.commentId || (comment.closest('[data-comment-id]') || {}).dataset.commentId || '';
        submitFallback('comment', commentId, '评论内容不适当 / 骚扰 / 攻击他人 / 其他');
        return;
      }
      var post = target.closest('[data-mobile-post-report]');
      if(post){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        var postId = post.dataset.mobilePostReport || (post.closest('[data-post-id]') || {}).dataset.postId || '';
        submitFallback('post', postId, '帖子内容不适当 / 隐私泄露 / 攻击他人 / 其他');
      }
    }, true);
  }

  function ensurePollTodayCountNode(){
    var form = $('[data-mobile-poll-form]');
    if(!form || $('[data-mobile-today-count]', form)) return;
    var card = $('.rooms-create-card', form) || form;
    var intro = card.querySelector('p');
    var line = document.createElement('p');
    line.className = 'rooms-form-notice mobile-poll-quota-line';
    line.innerHTML = '今日已发起：<strong data-mobile-today-count>登录后可见</strong>';
    if(intro && intro.parentNode) intro.insertAdjacentElement('afterend', line);
    else card.insertBefore(line, card.firstChild || null);
  }

  async function syncPollTodayCount(){
    ensurePollTodayCountNode();
    var node = $('[data-mobile-today-count]');
    if(!node) return;
    var user = await currentUser();
    if(!user){ node.textContent = '登录后可见'; return; }
    try{
      if(!(await waitDb())){ node.textContent = '读取失败'; return; }
      var c = client();
      var count = fail(await c.rpc('fw_my_poll_daily_count'), '今日次数读取失败') || 0;
      node.textContent = String(count) + '/3';
    }catch(e){
      node.textContent = '读取失败';
    }
  }

  async function fetchProfileMap(c, ids){
    ids = Array.from(new Set((ids || []).filter(Boolean)));
    if(!ids.length) return {};
    try{
      var rows = fail(await c.from('profiles').select('id,nickname,avatar_url,lab_code').in('id', ids), '资料读取失败') || [];
      var map = {};
      rows.forEach(function(row){ map[row.id] = row; });
      return map;
    }catch(e){
      console.warn('[FW mobile global fixes] profile map failed', e);
      return {};
    }
  }

  async function loadLitePosts(){
    var fw = app();
    var c = client();
    if(!fw || !c) throw new Error('暂时无法连接数据服务。');
    await fw.refreshUser();
    var user = fw.state && fw.state.user || null;
    var meId = user && user.id || null;
    var isAdmin = !!(user && user.isAdmin);

    var posts = fail(await c.from('posts')
      .select('id,user_id,content,status_tag,created_at')
      .or('is_deleted.eq.false,is_deleted.is.null')
      .order('created_at', {ascending:false})
      .limit(FEED_LIMIT), '帖子读取失败') || [];

    var postIds = posts.map(function(post){ return post.id; }).filter(Boolean);
    if(!postIds.length) return [];

    var comments = fail(await c.from('comments')
      .select('id,post_id,user_id,parent_comment_id,content,created_at')
      .in('post_id', postIds)
      .or('is_deleted.eq.false,is_deleted.is.null')
      .order('created_at', {ascending:true}), '评论读取失败') || [];

    var reactions = fail(await c.from('reactions')
      .select('post_id,user_id,type')
      .in('post_id', postIds), '互动读取失败') || [];

    var profileIds = [];
    posts.forEach(function(post){ profileIds.push(post.user_id); });
    comments.forEach(function(comment){ profileIds.push(comment.user_id); });
    var profiles = await fetchProfileMap(c, profileIds);

    var commentsByPost = {};
    comments.forEach(function(comment){
      var profile = profiles[comment.user_id] || {};
      (commentsByPost[comment.post_id] = commentsByPost[comment.post_id] || []).push({
        id:comment.id,
        userId:comment.user_id,
        parentCommentId:comment.parent_comment_id || null,
        authorName:profile.nickname || '匿名回声',
        authorAvatar:profile.avatar_url || '',
        content:comment.content || '',
        time:timeText(comment.created_at),
        createdAt:comment.created_at,
        canDelete:!!meId && (String(comment.user_id) === String(meId) || isAdmin)
      });
    });

    var counts = {};
    var mine = {};
    reactions.forEach(function(reaction){
      var type = reaction.type === 'like' ? 'resonance' : reaction.type;
      counts[reaction.post_id] = counts[reaction.post_id] || {resonance:0, same:0, tissue:0};
      mine[reaction.post_id] = mine[reaction.post_id] || {resonance:false, same:false, tissue:false};
      if(type === 'resonance') counts[reaction.post_id].resonance += 1;
      if(type === 'same') counts[reaction.post_id].same += 1;
      if(type === 'tissue') counts[reaction.post_id].tissue += 1;
      if(meId && String(reaction.user_id) === String(meId) && mine[reaction.post_id][type] !== undefined){
        mine[reaction.post_id][type] = true;
      }
    });

    return posts.map(function(post){
      var profile = profiles[post.user_id] || {};
      var count = counts[post.id] || {resonance:0, same:0, tissue:0};
      return {
        id:post.id,
        userId:post.user_id,
        authorId:post.user_id,
        authorName:profile.nickname || '匿名研究员',
        authorAvatar:profile.avatar_url || '',
        status:post.status_tag || '今日无效',
        content:post.content || '',
        time:timeText(post.created_at),
        createdAt:post.created_at,
        resonance:count.resonance,
        same:count.same,
        tissue:count.tissue,
        comments:commentsByPost[post.id] || [],
        canDelete:!!meId && String(post.user_id) === String(meId),
        myReactions:mine[post.id] || {resonance:false, same:false, tissue:false}
      };
    });
  }

  function patchFeedLiteLoad(){
    if(feedPatched || !window.FWAppFeed || !app()) return false;
    if(typeof window.FWAppFeed.load !== 'function') return false;
    feedPatched = true;

    var originalLoad = window.FWAppFeed.load;
    var originalEnsure = window.FWAppFeed.ensureLoaded;

    function scroller(){ return $('#appMain') || $('.app-main'); }
    function render(){ if(window.FWAppFeed && typeof window.FWAppFeed.renderAll === 'function') window.FWAppFeed.renderAll(); }
    function setLoading(){ var node = $('[data-feed-list="square"]'); if(node) node.innerHTML = '<div class="loading">正在读取精神广场...</div>'; }
    function setError(){ var node = $('[data-feed-list="square"]'); if(node) node.innerHTML = '<div class="error">帖子暂时读取失败，请稍后刷新。</div>'; }

    async function liteLoad(force, options){
      options = options || {};
      var fw = app();
      if(!fw) return originalLoad.apply(window.FWAppFeed, arguments);
      if(fw.state && (fw.state.view === 'square-detail' || options.detailPostId)){
        return originalLoad.apply(window.FWAppFeed, arguments);
      }
      if(feedLoading) return;
      if(fw.state.postsLoaded && !force){ render(); return; }

      feedLoading = true;
      var node = scroller();
      var oldTop = options.preserveScroll && node ? node.scrollTop : 0;
      if(!options.silent) setLoading();
      try{
        if(!(await waitDb())) throw new Error('暂时无法连接数据服务。');
        fw.state.posts = await loadLitePosts();
        fw.state.postsLoaded = true;
        render();
        if(options.preserveScroll && node){
          requestAnimationFrame(function(){ node.scrollTop = oldTop; requestAnimationFrame(function(){ node.scrollTop = oldTop; }); });
        }
      }catch(e){
        console.warn('[FW mobile global fixes] lite feed load failed', e);
        setError();
      }finally{
        feedLoading = false;
      }
    }

    window.FWAppFeed.load = liteLoad;
    window.FWAppFeed.ensureLoaded = function(){ return liteLoad(false); };
    window.FWAppFeed.__originalLoad = originalLoad;
    window.FWAppFeed.__originalEnsureLoaded = originalEnsure;
    return true;
  }

  function tidyEchoList(){
    var list = $('[data-echo-list]');
    if(!list) return;
    var seen = {};
    $$('[data-mobile-echo-item]', list).forEach(function(item){
      var id = item.dataset.mobileEchoItem || '';
      if(!id) return;
      if(seen[id]) item.remove();
      else seen[id] = true;
    });
    var badge = $('[data-app-nav="echo"] .mobile-echo-badge');
    var count = $$('[data-mobile-echo-item].unread', list).filter(function(item){ return item.offsetParent !== null || item.classList.contains('unread'); }).length;
    if(badge){
      if(count > 0) badge.classList.add('show');
      else badge.classList.remove('show');
    }
  }

  function patchEchoTidy(){
    var list = $('[data-echo-list]');
    if(!list || echoObserver) return;
    echoObserver = new MutationObserver(function(){ clearTimeout(window.__fwEchoTidyTimer); window.__fwEchoTidyTimer = setTimeout(tidyEchoList, 80); });
    echoObserver.observe(list, {childList:true, subtree:true});
    tidyEchoList();
  }

  function retryPatches(){
    if(!navPatched) patchChildHistory();
    if(!feedPatched) patchFeedLiteLoad();
    patchEchoTidy();
    ensurePollTodayCountNode();
  }

  function start(){
    patchReportFallback();
    retryPatches();
    if(!navPatched || !feedPatched) schedule(retryPatches, [120, 360, 900, 1800]);
    schedule(syncPollTodayCount, [0, 600, 1600]);
    document.addEventListener('click', function(){
      var view = app() && app().state && app().state.view || '';
      if(!navPatched || !feedPatched) setTimeout(retryPatches, 60);
      if(view === 'rooms' || view === 'rooms-compose') setTimeout(syncPollTodayCount, 180);
      if(view === 'echo') setTimeout(tidyEchoList, 220);
    }, true);
    document.addEventListener('visibilitychange', function(){
      if(!document.hidden){
        retryPatches();
        syncPollTodayCount();
        tidyEchoList();
      }
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
