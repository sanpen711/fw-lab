(function(){
  if(window.__FW_HOME_FEED_PREVIEW__) return;
  window.__FW_HOME_FEED_PREVIEW__ = true;

  var KEY = 'fw_lab_posts_v1';
  var last = '';
  var rendering = false;
  var resolved = false;

  function q(selector, root){
    return (root || document).querySelector(selector);
  }

  function feed(){
    return q('#live [data-feed]');
  }

  function dbReady(){
    return window.fwDb && window.fwDb.enabled && window.fwDb.client && window.fwDb.loadPosts;
  }

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(character){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];
    });
  }

  function norm(post){
    post = post || {};
    return {
      id:post.id,
      status:post.status || post.status_tag || '今日无效',
      content:post.content || '',
      authorName:post.authorName || post.nickname || '匿名研究员',
      authorAvatar:post.authorAvatar || post.avatar_url || '',
      createdAt:post.createdAt || post.created_at || post.rawCreatedAt || '',
      time:post.time || '刚刚',
      resonance:Number(post.resonance || 0),
      same:Number(post.same || 0),
      tissue:Number(post.tissue || 0),
      comments:Array.isArray(post.comments) ? post.comments : []
    };
  }

  function read(){
    try{
      return (JSON.parse(localStorage.getItem(KEY) || '[]') || []).map(norm);
    }catch(e){
      return [];
    }
  }

  function save(posts){
    try{
      localStorage.setItem(KEY, JSON.stringify(posts || []));
    }catch(e){}
  }

  function avatar(name, url){
    var safeName = name || '匿名研究员';
    if(url){
      return '<span class="fw-avatar mini"><img src="' + esc(url) + '" alt="' + esc(safeName) + '"></span>';
    }
    return '<span class="fw-avatar mini">' + esc(String(safeName).slice(0, 2)) + '</span>';
  }

  function commentsHtml(comments){
    return comments.map(function(comment){
      var name = comment.authorName || '匿名回声';
      return '<li data-comment-id="' + esc(comment.id || '') + '">' +
        avatar(name, comment.authorAvatar || '') +
        '<strong>' + esc(name) + '</strong>' +
        '<span>' + esc(comment.content || '') + '</span>' +
      '</li>';
    }).join('');
  }

  function card(post){
    post = norm(post);
    var comments = commentsHtml(post.comments);
    return '<article class="post-card fw-home-feed-card" data-id="' + esc(post.id || '') + '" data-status="' + esc(post.status) + '">' +
      '<div class="post-top"><span class="time">' + esc(post.time) + '</span></div>' +
      '<p class="fw-author">' + avatar(post.authorName, post.authorAvatar) + '<span>' + esc(post.authorName) + '</span></p>' +
      '<p class="post-content">' + esc(post.content) + '</p>' +
      '<div class="interactions">' +
        '<button type="button" data-sb-action="resonance">点赞 ' + post.resonance + '</button>' +
        '<button type="button" data-sb-action="comment-toggle">评论 ' + post.comments.length + '</button>' +
        '<button type="button" data-sb-action="same">俺也一样 ' + post.same + '</button>' +
        '<button type="button" data-sb-action="tissue">递纸巾 ' + post.tissue + '</button>' +
      '</div>' +
      '<div class="comment-box"><ul class="comment-list">' + (comments || '<li><span>还没有回声，可以先留一句。</span></li>') + '</ul>' +
        '<input placeholder="留一句回声，评论不限量">' +
        '<button class="btn dark full" type="button" data-sb-action="comment-submit" style="margin-top:10px">发送回声</button>' +
      '</div>' +
    '</article>';
  }

  function loadingHtml(){
    return [0, 1, 2].map(function(){
      return '<div class="fw-home-feed-loading" aria-hidden="true"><span></span><span></span><span></span></div>';
    }).join('');
  }

  function render(posts, allowEmpty){
    var container = feed();
    if(!container || rendering) return;
    var list = (posts && posts.length ? posts : read()).map(norm).slice(0, 6);
    var html = list.length
      ? list.map(card).join('')
      : (allowEmpty
        ? '<div class="fw-home-feed-empty">还没有最新牢骚，<a href="square.html">去精神广场投递第一条 →</a></div>'
        : loadingHtml());

    if(html === last && container.children.length <= 6) return;

    rendering = true;
    container.classList.remove('fw-home-feed-preview');
    container.classList.add('fw-home-feed-classic');
    container.dataset.limit = '6';
    container.innerHTML = html;
    last = html;
    setTimeout(function(){ rendering = false; }, 0);
  }

  async function sync(){
    if(!feed()) return;
    if(!dbReady()){
      render(read(), false);
      return;
    }
    try{
      var posts = (await window.fwDb.loadPosts() || []).map(norm).slice(0, 6);
      save(posts);
      resolved = true;
      render(posts, true);
    }catch(e){
      resolved = true;
      render(read(), true);
    }
  }

  function css(){
    if(q('#fw-home-feed-preview-style')) return;
    var style = document.createElement('style');
    style.id = 'fw-home-feed-preview-style';
    style.textContent =
      '#live .feed-grid.fw-home-feed-classic{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:14px!important}' +
      '#live .feed-grid .post-card{position:relative;display:flex;flex-direction:column;min-height:200px;padding:20px}' +
      '#live .feed-grid .post-card .status{display:none!important}' +
      '#live .feed-grid .post-card .post-top{position:absolute;top:20px;right:20px;justify-content:flex-end}' +
      '#live .feed-grid .post-card .fw-author{margin-top:0;padding-right:78px}' +
      '#live .feed-grid .post-card .post-content{margin-top:16px}' +
      '#live .feed-grid .post-card .interactions{margin-top:auto}' +
      '#live .fw-home-feed-empty{grid-column:1/-1;padding:22px;border:1px solid rgba(255,255,255,.18);background:rgba(246,243,235,.78);font-weight:950;color:#151513}' +
      '#live .fw-home-feed-empty a{color:#8f3f3f;text-decoration:underline}' +
      '#live .fw-home-feed-loading{min-height:200px;padding:20px;border:1px solid rgba(255,255,255,.16);background:rgba(246,243,235,.72);overflow:hidden}' +
      '#live .fw-home-feed-loading span{display:block;height:14px;margin:13px 0;border-radius:999px;background:linear-gradient(90deg,rgba(30,30,28,.08),rgba(30,30,28,.18),rgba(30,30,28,.08));background-size:220% 100%;animation:fwHomeLoading 1.25s linear infinite}' +
      '#live .fw-home-feed-loading span:nth-child(1){width:38%}' +
      '#live .fw-home-feed-loading span:nth-child(2){width:72%;height:22px;margin-top:28px}' +
      '#live .fw-home-feed-loading span:nth-child(3){width:55%;margin-top:34px}' +
      '@keyframes fwHomeLoading{to{background-position:-220% 0}}' +
      '@media(max-width:1100px){#live .feed-grid.fw-home-feed-classic{grid-template-columns:repeat(2,minmax(0,1fr))!important}}' +
      '@media(max-width:720px){#live .feed-grid.fw-home-feed-classic{grid-template-columns:1fr!important}}';
    document.head.appendChild(style);
  }

  function boot(){
    css();
    render(read(), false);
    sync();

    var attempts = 0;
    var timer = setInterval(function(){
      attempts += 1;
      if(dbReady()){
        clearInterval(timer);
        sync();
      }
      if(attempts > 120) clearInterval(timer);
    }, 100);

    var container = feed();
    if(container){
      new MutationObserver(function(){
        if(rendering) return;
        clearTimeout(window.__fwHomeFeedPreviewTimer);
        window.__fwHomeFeedPreviewTimer = setTimeout(function(){ render(read(), resolved); }, 80);
      }).observe(container, {childList:true});
    }

    setInterval(sync, 20000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
