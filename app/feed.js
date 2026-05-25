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
      var posts = await window.fwDb.loadPosts();
      app().state.posts = posts || [];
      app().state.postsLoaded = true;
      renderAll();
    }catch(e){
      $$('[data-feed-list]').forEach(function(node){
        node.innerHTML = '<div class="error">帖子暂时读取失败，请稍后刷新。' + (e && e.message ? '<br>' + esc(e.message) : '') + '</div>';
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
