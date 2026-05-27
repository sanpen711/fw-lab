(function(){
  if(window.FWAppBird) return;

  var MAX_TITLE = 80;
  var MAX_CONTENT = 5000;
  var MAX_COMMENT = 500;
  var MAX_IMAGES = 20;
  var MAX_IMAGE_SIZE = 800 * 1024;
  var MAX_IMAGE_EDGE = 1280;
  var BUCKET = 'chat-media';
  var posts = [];
  var loaded = false;
  var loading = false;
  var pendingFiles = [];
  var detailPostId = null;

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function $$(selector, root){ return app().$$(selector, root); }
  function esc(value){ return app().esc(value); }
  function db(){ return app().db(); }
  function client(){ return db() && db().client; }
  function toast(message){ app().toast(message); }

  function fail(result, message){ if(result && result.error) throw new Error(message || result.error.message || '操作失败'); return result ? result.data : null; }
  function relativeTime(value){
    var date = new Date(value || '');
    if(isNaN(date.getTime())) return '刚刚';
    var minutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60000);
    if(minutes < 1) return '刚刚';
    if(minutes < 60) return minutes + '分钟前';
    var hours = Math.floor(minutes / 60);
    if(hours < 24) return hours + '小时前';
    var days = Math.floor(hours / 24);
    return days < 7 ? days + '天前' : date.toLocaleDateString('zh-CN');
  }
  function pad(n){ return n < 10 ? '0' + n : String(n); }
  function exactTime(value){
    var date = new Date(value || '');
    if(isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }
  function uniq(arr){ var seen = {}; return (arr || []).filter(function(v){ if(!v || seen[v]) return false; seen[v] = true; return true; }); }
  function profileMap(rows){ var map = {}; (rows || []).forEach(function(row){ map[row.id] = row || {}; }); return map; }
  function avatarHtml(name, url){
    return url ? '<span class="mobile-bird-avatar"><img src="' + esc(url) + '" alt="' + esc(name || '观察员') + '"></span>' : '<span class="mobile-bird-avatar">' + esc(String(name || '观').trim().slice(0, 2) || '观') + '</span>';
  }
  function displayAuthor(post, profile){
    if(post.display_mode === 'anonymous') return {name:'匿名观察员', avatar:''};
    if(post.display_mode === 'pen_name') return {name:post.pen_name || '临时观察员', avatar:''};
    return {name:(profile && profile.nickname) || '观察员', avatar:(profile && profile.avatar_url) || ''};
  }
  function emptyStats(){ return {validCount:0, seenCount:0, tissueCount:0, myReactions:{valid:false, seen:false, tissue:false}}; }
  function countKey(type){ return type === 'valid' ? 'validCount' : type === 'seen' ? 'seenCount' : 'tissueCount'; }
  function reactionLabel(type){ return {valid:'标本有效', seen:'我也见过', tissue:'递纸巾'}[type] || type; }
  function imageList(images){ return Array.isArray(images) ? images.filter(function(image){ return image && image.url; }) : []; }
  function postById(id){ id = String(id); return posts.find(function(post){ return String(post.id) === id; }) || null; }

  async function currentUser(){
    if(!(await app().waitForDb())) return null;
    try{ return await window.fwDb.getCurrentUser(); }
    catch(e){ return null; }
  }

  async function loadPosts(){
    if(!(await app().waitForDb())) throw new Error('暂时无法连接数据服务。');
    var c = client();
    var postRows = fail(await c.from('bird_posts').select('id,user_id,title,content,display_mode,pen_name,images,is_deleted,created_at,updated_at').or('is_deleted.eq.false,is_deleted.is.null').order('created_at', {ascending:false}).limit(100), '读取观鸟台失败') || [];
    if(!postRows.length) return [];
    var meId = null;
    try{ var session = await c.auth.getSession(); meId = session && session.data && session.data.session && session.data.session.user && session.data.session.user.id || null; }catch(e){}
    var postIds = postRows.map(function(post){ return post.id; });
    var comments = fail(await c.from('bird_comments').select('id,post_id,user_id,content,is_deleted,created_at').in('post_id', postIds).or('is_deleted.eq.false,is_deleted.is.null').order('created_at', {ascending:true}), '读取观鸟评论失败') || [];
    var reactions = [];
    try{
      reactions = fail(await c.from('bird_reactions').select('post_id,user_id,type').in('post_id', postIds), '读取观鸟互动失败') || [];
    }catch(e){
      console.warn('[FW mobile app] bird reactions load skipped', e);
      reactions = [];
    }
    var stats = {};
    reactions.forEach(function(reaction){
      if(!reaction || !reaction.post_id || !/^(valid|seen|tissue)$/.test(String(reaction.type || ''))) return;
      var stat = stats[reaction.post_id] || (stats[reaction.post_id] = emptyStats());
      stat[countKey(reaction.type)] += 1;
      if(meId && reaction.user_id === meId) stat.myReactions[reaction.type] = true;
    });
    var profileIds = uniq(postRows.filter(function(post){ return post.display_mode === 'profile'; }).map(function(post){ return post.user_id; }).concat(comments.map(function(comment){ return comment.user_id; })));
    var profiles = [];
    if(profileIds.length) profiles = fail(await c.from('profiles').select('id,nickname,avatar_url').in('id', profileIds), '读取观察员资料失败') || [];
    var profilesById = profileMap(profiles);
    var commentsByPost = {};
    comments.forEach(function(comment){
      var profile = profilesById[comment.user_id] || {};
      (commentsByPost[comment.post_id] = commentsByPost[comment.post_id] || []).push({
        id:comment.id,
        postId:comment.post_id,
        userId:comment.user_id,
        authorName:profile.nickname || '匿名回声',
        authorAvatar:profile.avatar_url || '',
        content:comment.content || '',
        createdAt:comment.created_at,
        time:relativeTime(comment.created_at),
        canDelete:!!meId && comment.user_id === meId
      });
    });
    return postRows.map(function(post){
      var profile = profilesById[post.user_id] || {};
      var author = displayAuthor(post, profile);
      var stat = stats[post.id] || emptyStats();
      return {
        id:post.id,
        userId:post.user_id,
        title:post.title || '',
        content:post.content || '',
        displayMode:post.display_mode || 'profile',
        penName:post.pen_name || '',
        images:imageList(post.images),
        createdAt:post.created_at,
        time:relativeTime(post.created_at),
        exactTime:exactTime(post.created_at),
        authorName:author.name,
        authorAvatar:author.avatar,
        comments:commentsByPost[post.id] || [],
        validCount:stat.validCount || 0,
        seenCount:stat.seenCount || 0,
        tissueCount:stat.tissueCount || 0,
        myReactions:stat.myReactions || {valid:false, seen:false, tissue:false},
        canDelete:!!meId && post.user_id === meId
      };
    });
  }

  function renderCover(post){
    var images = imageList(post.images);
    var badge = images.length > 1 ? '<span class="mobile-bird-cover-badge">共 ' + images.length + ' 张图</span>' : '';
    if(images.length) return '<div class="mobile-bird-cover"><img src="' + esc(images[0].url) + '" alt="观察图片">' + badge + '</div>';
    return '<div class="mobile-bird-cover mobile-bird-cover-empty"><span>暂无观察图</span></div>';
  }
  function renderCard(post){
    return '<article class="mobile-bird-card" data-mobile-bird-card data-post-id="' + esc(post.id) + '">' +
      '<button type="button" data-mobile-bird-open="' + esc(post.id) + '" aria-label="查看完整观察记录" style="display:block;width:100%;border:0;background:transparent;padding:0;text-align:left;color:inherit">' +
        renderCover(post) + '<div class="mobile-bird-info"><h2>' + esc(post.title) + '</h2><div class="mobile-bird-meta">' + avatarHtml(post.authorName, post.authorAvatar) + '<span>' + esc(post.authorName) + '</span></div><div class="mobile-bird-time">' + esc(post.time + (post.exactTime ? ' · ' + post.exactTime : '')) + '</div></div>' +
      '</button></article>';
  }
  function renderFeed(){
    var node = $('[data-mobile-bird-feed]');
    if(!node) return;
    node.innerHTML = posts.length ? posts.map(renderCard).join('') : '<div class="mobile-bird-empty">还没有收录新的品种。你可以先放下一条观察记录。</div>';
  }

  function renderImages(images){
    images = imageList(images);
    if(!images.length) return '';
    return '<div class="mobile-bird-images">' + images.map(function(image){ return '<a href="' + esc(image.url) + '" target="_blank" rel="noopener"><img src="' + esc(image.url) + '" alt="观察图片"></a>'; }).join('') + '</div>';
  }
  function reactionButton(post, type, label, count){
    var active = !!(post.myReactions && post.myReactions[type]);
    return '<button type="button" data-mobile-bird-react="' + esc(type) + '" data-post-id="' + esc(post.id) + '" class="' + (active ? 'active' : '') + '">' + esc(label) + ' ' + Number(count || 0) + '</button>';
  }
  function renderComments(post){
    var comments = (post.comments || []).map(function(comment){
      var del = comment.canDelete ? '<button type="button" class="mobile-bird-comment-delete" data-mobile-bird-delete-comment="' + esc(comment.id) + '">删除</button>' : '';
      return '<li class="mobile-bird-comment">' + avatarHtml(comment.authorName, comment.authorAvatar) + '<div class="mobile-bird-comment-body"><b>' + esc(comment.authorName) + '</b><time>' + esc(comment.time) + '</time>' + del + '<p>' + esc(comment.content) + '</p></div></li>';
    }).join('');
    return '<section class="mobile-bird-comments"><ul class="mobile-bird-comment-list">' + (comments || '<li class="mobile-bird-empty">还没有评论，可以先留一句。</li>') + '</ul><form class="mobile-bird-comment-form" data-mobile-bird-comment-form data-post-id="' + esc(post.id) + '"><input maxlength="500" placeholder="留一句观察补充"><button type="submit">发送</button></form></section>';
  }
  function renderDetail(post){
    var node = $('[data-mobile-bird-detail-body]');
    if(!node) return;
    if(!post){ node.innerHTML = '<div class="mobile-bird-empty">这条观察记录暂时读取失败。</div>'; return; }
    node.innerHTML = '<article class="mobile-bird-detail-card" data-post-id="' + esc(post.id) + '"><div class="mobile-bird-label">这是什么品种：</div><h2 class="mobile-bird-detail-title">' + esc(post.title) + '</h2><div class="mobile-bird-author">' + avatarHtml(post.authorName, post.authorAvatar) + '<span>' + esc(post.authorName) + '</span><span>' + esc(post.time) + '</span></div><p class="mobile-bird-content">' + esc(post.content) + '</p>' + renderImages(post.images) + '<div class="mobile-bird-controls">' + reactionButton(post, 'valid', '标本有效', post.validCount) + reactionButton(post, 'seen', '我也见过', post.seenCount) + reactionButton(post, 'tissue', '递纸巾', post.tissueCount) + (post.canDelete ? '<button type="button" class="danger" data-mobile-bird-delete-post="' + esc(post.id) + '">删除</button>' : '<button type="button" disabled>评论 ' + (post.comments || []).length + '</button>') + '</div>' + renderComments(post) + '</article>';
  }
  function openDetail(postId){
    detailPostId = String(postId);
    renderDetail(postById(postId));
    app().setView('bird-detail');
  }
  function backToBird(){
    detailPostId = null;
    app().setView('bird');
    renderFeed();
  }

  async function load(force){
    if(loading) return;
    if(loaded && !force){ renderFeed(); return; }
    loading = true;
    var node = $('[data-mobile-bird-feed]');
    if(node) node.innerHTML = '<div class="mobile-bird-empty">正在打开观鸟镜...</div>';
    try{
      posts = await loadPosts();
      loaded = true;
      renderFeed();
      if(detailPostId) renderDetail(postById(detailPostId));
    }catch(e){
      console.warn('[FW mobile app] bird load failed', e);
      if(node) node.innerHTML = '<div class="mobile-bird-empty">' + esc(e.message || '观鸟台暂时读取失败。') + '</div>';
    }finally{ loading = false; }
  }

  function loadImage(file){
    return new Promise(function(resolve, reject){
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function(){ try{ URL.revokeObjectURL(url); }catch(e){} resolve(img); };
      img.onerror = function(){ try{ URL.revokeObjectURL(url); }catch(e){} reject(new Error('图片读取失败，请换一张。')); };
      img.src = url;
    });
  }
  function canvasToBlob(canvas, type, quality){ return new Promise(function(resolve, reject){ canvas.toBlob(function(blob){ blob ? resolve(blob) : reject(new Error('图片压缩失败，请换一张。')); }, type, quality); }); }
  function makeFile(blob, name, type){ try{ return new File([blob], name, {type:type || blob.type, lastModified:Date.now()}); }catch(e){ blob.name = name; return blob; } }
  async function compressImage(file){
    var img = await loadImage(file);
    var width = img.naturalWidth || img.width;
    var height = img.naturalHeight || img.height;
    if(!width || !height) throw new Error('无法读取图片尺寸。');
    var scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
    var targetWidth = Math.max(1, Math.round(width * scale));
    var targetHeight = Math.max(1, Math.round(height * scale));
    var canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    var ctx = canvas.getContext('2d', {alpha:true});
    if(!ctx) throw new Error('当前浏览器无法处理这张图片。');
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    var type = 'image/webp';
    var quality = 0.84;
    var blob = await canvasToBlob(canvas, type, quality);
    if(!blob || String(blob.type).indexOf('webp') < 0){
      type = 'image/jpeg';
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#fffdf7';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      blob = await canvasToBlob(canvas, type, quality);
    }
    while(blob.size > MAX_IMAGE_SIZE && quality > 0.42){
      quality = Math.max(0.42, quality - 0.08);
      blob = await canvasToBlob(canvas, type, quality);
    }
    if(blob.size > MAX_IMAGE_SIZE) throw new Error('图片压缩后仍超过 800KB，请换一张。');
    var ext = type.indexOf('webp') >= 0 ? 'webp' : 'jpg';
    return {file:makeFile(blob, 'fw_bird_' + Date.now().toString(36) + '.' + ext, type), width:targetWidth, height:targetHeight, mime:type, ext:ext};
  }
  function updatePreview(){
    var grid = $('[data-mobile-bird-preview]');
    var count = $('[data-mobile-bird-image-count]');
    if(count) count.textContent = pendingFiles.length + ' / ' + MAX_IMAGES;
    if(!grid) return;
    grid.innerHTML = pendingFiles.map(function(item, index){ return '<div class="mobile-bird-preview"><img src="' + esc(item.url) + '" alt="待发布图片"><button type="button" data-mobile-bird-remove-image="' + index + '">×</button></div>'; }).join('');
  }
  function clearPending(){
    pendingFiles.forEach(function(item){ try{ URL.revokeObjectURL(item.url); }catch(e){} });
    pendingFiles = [];
    updatePreview();
  }
  function addFiles(files){
    var incoming = Array.from(files || []).filter(function(file){ return String(file.type || '').indexOf('image/') === 0; });
    if(pendingFiles.length + incoming.length > MAX_IMAGES){
      toast('最多上传 20 张图片。');
      incoming = incoming.slice(0, MAX_IMAGES - pendingFiles.length);
    }
    incoming.forEach(function(file){ pendingFiles.push({file:file, url:URL.createObjectURL(file)}); });
    updatePreview();
  }
  async function uploadImages(){
    if(!pendingFiles.length) return [];
    var user = await currentUser();
    if(!user) throw new Error('请先登录再发布。');
    var uploaded = [];
    for(var i = 0; i < pendingFiles.length; i++){
      setNotice('正在上传图片 ' + (i + 1) + ' / ' + pendingFiles.length + '...');
      var prepared = await compressImage(pendingFiles[i].file);
      var path = user.id + '/bird/image/' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8) + '.' + prepared.ext;
      var up = await client().storage.from(BUCKET).upload(path, prepared.file, {upsert:false, cacheControl:'3600', contentType:prepared.mime});
      if(up.error) throw new Error('图片上传失败：' + up.error.message);
      var publicUrl = (client().storage.from(BUCKET).getPublicUrl(path).data || {}).publicUrl || '';
      uploaded.push({url:publicUrl, path:path, width:prepared.width, height:prepared.height});
    }
    return uploaded;
  }
  function setNotice(message){ var node = $('[data-mobile-bird-notice]'); if(node) node.textContent = message || ''; }
  function validateForm(form){
    var title = String(form.title && form.title.value || '').trim();
    var content = String(form.content && form.content.value || '').trim();
    var mode = String((form.querySelector('input[name="display_mode"]:checked') || {}).value || 'profile');
    var penName = String(form.pen_name && form.pen_name.value || '').trim();
    if(!title) return '标题不能为空。';
    if(title.length < 2) return '品种名至少 2 个字。';
    if(title.length > MAX_TITLE) return '标题太长了，品种名不宜超过 80 字。';
    if(!content) return '观察记录不能为空。';
    if(content.length > MAX_CONTENT) return '观察记录最多 5000 字。';
    if(mode === 'pen_name' && !penName) return '临时笔名不能为空。';
    if(mode === 'pen_name' && penName.length < 2) return '临时笔名至少 2 个字。';
    if(mode === 'pen_name' && penName.length > 20) return '临时笔名不宜超过 20 字。';
    return '';
  }
  async function submitPost(form){
    var user = await currentUser();
    if(!user){ toast('请先登录再发布。'); app().setView('profile'); return; }
    var error = validateForm(form);
    if(error){ setNotice(error); toast(error); return; }
    var button = form.querySelector('button[type="submit"]');
    var old = button.textContent;
    button.disabled = true;
    button.textContent = '收录中...';
    try{
      var mode = String((form.querySelector('input[name="display_mode"]:checked') || {}).value || 'profile');
      var images = await uploadImages();
      fail(await client().from('bird_posts').insert({user_id:user.id, title:String(form.title.value || '').trim(), content:String(form.content.value || '').trim(), display_mode:mode, pen_name:mode === 'pen_name' ? String(form.pen_name.value || '').trim() : null, images:images, is_deleted:false}).select('id').single(), '发布失败');
      form.reset();
      clearPending();
      setNotice('观察记录已收录。');
      toast('观察记录已收录。');
      loaded = false;
      await load(true);
      app().setView('bird');
    }catch(e){ setNotice(e.message || '发布失败。'); toast(e.message || '发布失败。'); }
    finally{ button.disabled = false; button.textContent = old; }
  }
  async function submitComment(form){
    var content = String((form.querySelector('input') || {}).value || '').trim();
    if(!content) return;
    if(content.length > MAX_COMMENT){ toast('评论最多 500 字。'); return; }
    var user = await currentUser();
    if(!user){ toast('请先登录再评论。'); app().setView('profile'); return; }
    var button = form.querySelector('button');
    var old = button.textContent;
    button.disabled = true;
    button.textContent = '发送中...';
    try{
      fail(await client().from('bird_comments').insert({post_id:form.dataset.postId, user_id:user.id, content:content, is_deleted:false}).select('id').single(), '评论失败');
      toast('评论已发送。');
      form.querySelector('input').value = '';
      loaded = false;
      await load(true);
      renderDetail(postById(form.dataset.postId));
    }catch(e){ toast(e.message || '评论失败。'); }
    finally{ button.disabled = false; button.textContent = old; }
  }
  async function react(button){
    var type = String(button.dataset.mobileBirdReact || '');
    var postId = String(button.dataset.postId || '');
    if(!/^(valid|seen|tissue)$/.test(type) || !postId) return;
    var post = postById(postId);
    if(post && post.myReactions && post.myReactions[type]){ toast('你已经标记过这个品种了。'); return; }
    var user = await currentUser();
    if(!user){ toast('请先登录再互动。'); app().setView('profile'); return; }
    button.disabled = true;
    try{
      var result = await client().from('bird_reactions').insert({post_id:postId, user_id:user.id, type:type}).select('id').single();
      if(result.error){
        if(result.error.code === '23505' || /duplicate|unique/i.test(String(result.error.message || ''))) throw new Error('你已经标记过这个品种了。');
        throw new Error('互动失败：' + result.error.message);
      }
      if(post){
        post.myReactions = post.myReactions || {valid:false, seen:false, tissue:false};
        post.myReactions[type] = true;
        post[countKey(type)] = Number(post[countKey(type)] || 0) + 1;
        renderFeed();
        renderDetail(post);
      }
      toast('已标记：' + reactionLabel(type) + '。');
      loaded = false;
      await load(true);
      if(detailPostId) renderDetail(postById(detailPostId));
    }catch(e){ toast(e.message || '互动失败。'); }
    finally{ button.disabled = false; }
  }
  async function deletePost(postId){
    if(!window.confirm('确定删除这条观察记录吗？')) return;
    try{
      fail(await client().rpc('fw_delete_own_bird_post', {p_post_id:postId}), '删除观察记录失败');
      toast('观察记录已删除。');
      loaded = false;
      await load(true);
      app().setView('bird');
    }catch(e){ toast(e.message || '删除失败。'); }
  }
  async function deleteComment(commentId){
    if(!window.confirm('确定删除这条评论吗？')) return;
    try{
      fail(await client().rpc('fw_delete_own_bird_comment', {p_comment_id:commentId}), '删除评论失败');
      toast('评论已删除。');
      loaded = false;
      await load(true);
      if(detailPostId) renderDetail(postById(detailPostId));
    }catch(e){ toast(e.message || '删除失败。'); }
  }

  function bind(){
    document.addEventListener('click', function(e){
      var open = e.target.closest && e.target.closest('[data-mobile-bird-open]');
      if(open){ e.preventDefault(); openDetail(open.dataset.mobileBirdOpen); return; }
      var compose = e.target.closest && e.target.closest('[data-mobile-bird-compose]');
      if(compose){ e.preventDefault(); currentUser().then(function(user){ if(!user){ toast('请先登录再发布。'); app().setView('profile'); return; } app().setView('bird-compose'); }); return; }
      var back = e.target.closest && e.target.closest('[data-mobile-bird-back]');
      if(back){ e.preventDefault(); backToBird(); return; }
      var refresh = e.target.closest && e.target.closest('[data-mobile-bird-refresh]');
      if(refresh){ e.preventDefault(); loaded = false; load(true); return; }
      var remove = e.target.closest && e.target.closest('[data-mobile-bird-remove-image]');
      if(remove){ var index = Number(remove.dataset.mobileBirdRemoveImage); var item = pendingFiles[index]; if(item){ try{ URL.revokeObjectURL(item.url); }catch(err){} } pendingFiles.splice(index, 1); updatePreview(); return; }
      var reaction = e.target.closest && e.target.closest('[data-mobile-bird-react]');
      if(reaction){ e.preventDefault(); react(reaction); return; }
      var delPost = e.target.closest && e.target.closest('[data-mobile-bird-delete-post]');
      if(delPost){ e.preventDefault(); deletePost(delPost.dataset.mobileBirdDeletePost); return; }
      var delComment = e.target.closest && e.target.closest('[data-mobile-bird-delete-comment]');
      if(delComment){ e.preventDefault(); deleteComment(delComment.dataset.mobileBirdDeleteComment); }
    });
    document.addEventListener('change', function(e){
      if(e.target.matches('[data-mobile-bird-file]')){ addFiles(e.target.files); e.target.value = ''; return; }
      if(e.target.matches('input[name="display_mode"]')){ var wrap = $('[data-mobile-bird-pen]'); if(wrap) wrap.hidden = e.target.value !== 'pen_name'; }
    });
    document.addEventListener('submit', function(e){
      var postForm = e.target.closest && e.target.closest('[data-mobile-bird-form]');
      if(postForm){ e.preventDefault(); submitPost(postForm); return; }
      var commentForm = e.target.closest && e.target.closest('[data-mobile-bird-comment-form]');
      if(commentForm){ e.preventDefault(); submitComment(commentForm); }
    });
  }

  function init(){ bind(); updatePreview(); }
  function ensureLoaded(){ load(false); }

  window.FWAppBird = {init:init, load:load, ensureLoaded:ensureLoaded, backToBird:backToBird};
})();
