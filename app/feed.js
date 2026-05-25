(function(){
  if(window.FWAppFeed) return;

  var bound = false;
  var loading = false;

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function $$(selector, root){ return app().$$(selector, root); }
  function esc(value){ return app().esc(value); }

  function avatar(profile){
    var name = profile.authorName || profile.nickname || '研究员';
    var url = profile.authorAvatar || profile.avatar_url || '';
    if(url) return '<span class="post-avatar"><img src="' + esc(url) + '" alt="' + esc(name) + '"></span>';
    return '<span class="post-avatar">' + esc(app().initials(name)) + '</span>';
  }

  function timeText(value){
    if(!value) return '刚刚';
    var minutes = Math.floor(Math.max(0, Date.now() - new Date(value).getTime()) / 60000);
    if(minutes < 1) return '刚刚';
    if(minutes < 60) return minutes + '分钟前';
    var hours = Math.floor(minutes / 60);
    if(hours < 24) return hours + '小时前';
    var days = Math.floor(hours / 24);
    return days < 7 ? days + '天前' : new Date(value).toLocaleDateString('zh-CN');
  }

  function fail(result, message){
    if(result && result.error) throw new Error(message || '读取失败');
    return result ? result.data : null;
  }

  async function currentUserId(client){
    try{
      var res = await client.auth.getSession();
      return res && res.data && res.data.session && res.data.session.user ? res.data.session.user.id : null;
    }catch(e){
      return null;
    }
  }

  async function fetchProfileMap(client, ids){
    var unique = Array.from(new Set((ids || []).filter(Boolean)));
    if(!unique.length) return {};

    try{
      var rows = fail(
        await client.from('profiles').select('id,nickname,avatar_url,lab_code').in('id', unique),
        '资料读取失败'
      ) || [];
      var map = {};
      rows.forEach(function(profile){ map[profile.id] = profile; });
      return map;
    }catch(e){
      console.warn('[FW mobile app] profile load failed', e);
      return {};
    }
  }

  async function loadPostsFromSupabase(){
    var db = app().db();
    var client = db && db.client;
    if(!client) throw new Error('暂时无法连接数据服务。');

    var meId = await currentUserId(client);
    var posts = fail(
      await client
        .from('posts')
        .select('id,user_id,content,status_tag,created_at')
        .or('is_deleted.eq.false,is_deleted.is.null')
        .order('created_at', {ascending:false})
        .limit(100),
      '帖子读取失败'
    ) || [];

    var postIds = posts.map(function(post){ return post.id; }).filter(Boolean);
    if(!postIds.length) return [];

    var comments = fail(
      await client
        .from('comments')
        .select('id,post_id,user_id,parent_comment_id,content,created_at')
        .in('post_id', postIds)
        .or('is_deleted.eq.false,is_deleted.is.null')
        .order('created_at', {ascending:true}),
      '评论读取失败'
    ) || [];

    var reactions = fail(
      await client
        .from('reactions')
        .select('post_id,user_id,type')
        .in('post_id', postIds),
      '互动读取失败'
    ) || [];

    var profileIds = [];
    posts.forEach(function(post){ profileIds.push(post.user_id); });
    comments.forEach(function(comment){ profileIds.push(comment.user_id); });
    var profiles = await fetchProfileMap(client, profileIds);

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
        canDelete:!!meId && comment.user_id === meId
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
      if(meId && reaction.user_id === meId && mine[reaction.post_id][type] !== undefined){
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
        canDelete:!!meId && post.user_id === meId,
        myReactions:mine[post.id] || {resonance:false, same:false, tissue:false}
      };
    });
  }

  function renderComments(post){
    var rows = post.comments || [];
    if(!rows.length){
      return '<div class="empty">还没有评论，可以轻轻放下一句。</div>';
    }
    return rows.slice(-8).map(function(c){
      return '<div class="comment"><b>' + esc(c.authorName || '匿名回声') + '</b> <span>' + esc(c.time || '') + '</span><br>' + esc(c.content || '') + '</div>';
    }).join('');
  }

  function renderPost(post){
    var mine = post.myReactions || {};
    return '<article class="post-card" data-post-id="' + esc(post.id) + '">' +
      '<div class="post-top"><div class="post-author">' + avatar(post) + '<div class="post-name"><b>' + esc(post.authorName || '匿名研究员') + '</b><span>' + esc(post.time || '刚刚') + '</span></div></div><span class="status-tag">' + esc(post.status || '今日无效') + '</span></div>' +
      '<div class="post-content">' + esc(post.content || '') + '</div>' +
      '<div class="post-actions">' +
        '<button class="' + (mine.resonance ? 'active' : '') + '" type="button" data-app-react="resonance">点赞 ' + Number(post.resonance || 0) + '</button>' +
        '<button type="button" data-app-comments>评论 ' + (post.comments || []).length + '</button>' +
        '<button class="' + (mine.same ? 'active' : '') + '" type="button" data-app-react="same">一样 ' + Number(post.same || 0) + '</button>' +
        '<button class="' + (mine.tissue ? 'active' : '') + '" type="button" data-app-react="tissue">纸巾 ' + Number(post.tissue || 0) + '</button>' +
      '</div>' +
      '<div class="comments"><div>' + renderComments(post) + '</div><form class="comment-form" data-comment-form><input name="content" maxlength="180" placeholder="留一句回声"><button type="submit">发送</button></form></div>' +
    '</article>';
  }

  function visiblePosts(kind){
    var posts = app().state.posts || [];
    if(kind === 'home') return posts.slice(0, 20);
    var filter = app().state.filterStatus || '全部';
    if(filter !== '全部') posts = posts.filter(function(p){ return p.status === filter; });
    return posts;
  }

  function renderList(kind){
    var node = $('[data-feed-list="' + kind + '"]');
    if(!node) return;
    var posts = visiblePosts(kind);
    if(!posts.length){
      node.innerHTML = '<div class="empty">暂时还没有内容。可以先去发布一条低功耗状态。</div>';
      return;
    }
    node.innerHTML = posts.map(renderPost).join('');
  }

  function renderAll(){
    renderList('home');
    renderList('square');
  }

  function setLoading(){
    $$('[data-feed-list]').forEach(function(node){
      node.innerHTML = '<div class="loading">正在整理废话流...</div>';
    });
  }

  async function load(force){
    if(loading) return;
    if(app().state.postsLoaded && !force){
      renderAll();
      return;
    }

    loading = true;
    setLoading();

    try{
      if(!(await app().waitForDb())) throw new Error('暂时无法连接数据服务。');
      app().state.posts = await loadPostsFromSupabase();
      app().state.postsLoaded = true;
      renderAll();
    }catch(e){
      console.warn('[FW mobile app] feed load failed', e);
      $$('[data-feed-list]').forEach(function(node){
        node.innerHTML = '<div class="error">帖子暂时读取失败，请稍后刷新。</div>';
      });
    }finally{
      loading = false;
    }
  }

  function ensureLoaded(){
    load(false);
  }

  async function requireUser(){
    if(app().state.user) return app().state.user;
    await app().refreshUser();
    if(app().state.user) return app().state.user;
    app().toast('请先登录后再互动。');
    app().setView('profile');
    return null;
  }

  function bind(){
    if(bound) return;
    bound = true;

    document.addEventListener('click', async function(e){
      var filter = e.target.closest && e.target.closest('[data-filter-status]');
      if(filter){
        app().state.filterStatus = filter.dataset.filterStatus || '全部';
        $$('[data-filter-status]').forEach(function(btn){ btn.classList.toggle('active', btn === filter); });
        renderList('square');
        return;
      }

      var toggle = e.target.closest && e.target.closest('[data-app-comments]');
      if(toggle){
        var card = toggle.closest('[data-post-id]');
        var comments = $('.comments', card);
        if(comments) comments.classList.toggle('show');
        return;
      }

      var react = e.target.closest && e.target.closest('[data-app-react]');
      if(react){
        var user = await requireUser();
        if(!user) return;
        var postCard = react.closest('[data-post-id]');
        try{
          react.disabled = true;
          await window.fwDb.react({postId:postCard.dataset.postId, type:react.dataset.appReact});
          app().toast('已记录');
          await load(true);
        }catch(err){
          app().toast(err.message || '互动失败，请稍后再试。');
        }finally{
          react.disabled = false;
        }
      }
    });

    document.addEventListener('submit', async function(e){
      var form = e.target.closest && e.target.closest('[data-comment-form]');
      if(!form) return;
      e.preventDefault();
      var user = await requireUser();
      if(!user) return;
      var card = form.closest('[data-post-id]');
      var input = form.querySelector('input[name="content"]');
      var content = (input.value || '').trim();
      if(!content){ input.focus(); return; }
      try{
        form.querySelector('button').disabled = true;
        await window.fwDb.createComment({postId:card.dataset.postId, content:content});
        input.value = '';
        app().toast('评论已发送');
        await load(true);
        var next = $('[data-post-id="' + card.dataset.postId + '"] .comments');
        if(next) next.classList.add('show');
      }catch(err){
        app().toast(err.message || '评论失败，请稍后再试。');
      }finally{
        form.querySelector('button').disabled = false;
      }
    });
  }

  function init(){
    bind();
    load(false);
  }

  window.FWAppFeed = {init:init, load:load, ensureLoaded:ensureLoaded, renderAll:renderAll};
})();
