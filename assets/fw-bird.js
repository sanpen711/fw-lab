(function(){
  if(window.__FW_BIRD_ZONE__) return;
  window.__FW_BIRD_ZONE__ = true;

  var MAX_TITLE = 80;
  var MAX_CONTENT = 5000;
  var MAX_COMMENT = 500;
  var MAX_IMAGES = 20;
  var MAX_IMAGE_SIZE = 800 * 1024;
  var MAX_IMAGE_EDGE = 1280;
  var BUCKET = 'chat-media';
  var pendingFiles = [];
  var openComments = {};
  var expandedPosts = {};
  var feedCache = [];
  var lastComposeTrigger = null;
  var previousBodyPaddingRight = '';

  function $(s, root){ return (root || document).querySelector(s); }
  function $$(s, root){ return Array.from((root || document).querySelectorAll(s)); }
  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function toast(msg, ms){
    var t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwBirdToastTimer);
    window.__fwBirdToastTimer = setTimeout(function(){ t.classList.remove('show'); }, ms || 2400);
  }
  function notice(msg){
    var n = $('[data-bird-notice]');
    if(n) n.textContent = msg || '';
  }
  function openComposeModal(trigger){
    var modal = $('[data-bird-compose-modal]');
    if(!modal) return;
    lastComposeTrigger = trigger || document.activeElement || null;
    previousBodyPaddingRight = document.body.style.paddingRight || '';
    var scrollbarGap = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    if(scrollbarGap) document.body.style.paddingRight = scrollbarGap + 'px';
    document.body.classList.add('bird-modal-open');
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(function(){
      var title = $('#bird-title', modal);
      if(title) title.focus();
    }, 0);
  }
  function closeComposeModal(){
    var modal = $('[data-bird-compose-modal]');
    if(!modal || !modal.classList.contains('show')) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('bird-modal-open');
    document.body.style.paddingRight = previousBodyPaddingRight;
    if(lastComposeTrigger && typeof lastComposeTrigger.focus === 'function'){
      lastComposeTrigger.focus();
    }
  }
  function pad(n){ return n < 10 ? '0' + n : String(n); }
  function relativeTime(v){
    var d = new Date(v || '');
    if(isNaN(d.getTime())) return '刚刚';
    var m = Math.floor(Math.max(0, Date.now() - d.getTime()) / 60000);
    if(m < 1) return '刚刚';
    if(m < 60) return m + '分钟前';
    var h = Math.floor(m / 60);
    if(h < 24) return h + '小时前';
    var day = Math.floor(h / 24);
    return day < 7 ? day + '天前' : d.toLocaleDateString('zh-CN');
  }
  function exactTime(v){
    var d = new Date(v || '');
    if(isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      var n = 0;
      var timer = setInterval(function(){
        n += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(timer); resolve(true); }
        if(n > 120){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }
  async function currentUser(){
    if(!(await waitDb())) return null;
    try{ return await window.fwDb.getCurrentUser(); }
    catch(e){ return null; }
  }
  function openLogin(){
    var btn = $('[data-fw-open], [data-login-cta], [data-sb-open]');
    if(btn) btn.click();
  }
  function uniq(arr){
    var seen = {};
    return (arr || []).filter(function(v){
      if(!v || seen[v]) return false;
      seen[v] = true;
      return true;
    });
  }
  function profileMap(rows){
    var map = {};
    (rows || []).forEach(function(p){ map[p.id] = p || {}; });
    return map;
  }
  function avatarHtml(name, url){
    return url
      ? '<span class="bird-avatar"><img src="' + esc(url) + '" alt="' + esc(name || '观察员') + '"></span>'
      : '<span class="bird-avatar">' + esc(String(name || '观').trim().slice(0,2) || '观') + '</span>';
  }
  function displayAuthor(post, prof){
    if(post.display_mode === 'anonymous'){
      return {name:'匿名观察员', avatar:''};
    }
    if(post.display_mode === 'pen_name'){
      return {name:post.pen_name || '临时观察员', avatar:''};
    }
    return {
      name:(prof && prof.nickname) || '观察员',
      avatar:(prof && prof.avatar_url) || ''
    };
  }
  function plainSummary(text, expanded){
    var value = String(text || '');
    if(expanded || value.length <= 220) return value;
    return value.slice(0, 220) + '…';
  }

  function emptyReactionStats(){
    return {validCount:0, seenCount:0, tissueCount:0, myReactions:{valid:false, seen:false, tissue:false}};
  }
  function reactionLabel(type){
    return {valid:'标本有效', seen:'我也见过', tissue:'递纸巾'}[type] || type;
  }
  function reactionCountKey(type){
    return type === 'valid' ? 'validCount' : (type === 'seen' ? 'seenCount' : 'tissueCount');
  }
  function renderReactionButton(post, type, label, count){
    var active = !!(post.myReactions && post.myReactions[type]);
    return '<button type="button" data-bird-react="' + esc(type) + '" data-post-id="' + esc(post.id) + '" class="' + (active ? 'active' : '') + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + esc(label) + ' ' + (count || 0) + '</button>';
  }
  function localPostById(id){
    id = String(id);
    for(var i = 0; i < feedCache.length; i += 1){
      if(String(feedCache[i].id) === id) return feedCache[i];
    }
    return null;
  }

  async function loadBirdPosts(){
    if(!(await waitDb())) throw new Error('数据库还没准备好。');
    var db = window.fwDb.client;
    var postsResult = await db
      .from('bird_posts')
      .select('id,user_id,title,content,display_mode,pen_name,images,is_deleted,created_at,updated_at')
      .or('is_deleted.eq.false,is_deleted.is.null')
      .order('created_at', {ascending:false})
      .limit(100);
    if(postsResult.error) throw new Error('读取观鸟台失败：' + postsResult.error.message);

    var posts = postsResult.data || [];
    if(!posts.length) return [];

    var meId = null;
    try{
      var session = await db.auth.getSession();
      meId = session && session.data && session.data.session && session.data.session.user && session.data.session.user.id || null;
    }catch(e){}

    var postIds = posts.map(function(p){ return p.id; });
    var commentsResult = await db
      .from('bird_comments')
      .select('id,post_id,user_id,content,is_deleted,created_at')
      .in('post_id', postIds)
      .or('is_deleted.eq.false,is_deleted.is.null')
      .order('created_at', {ascending:true});
    if(commentsResult.error) throw new Error('读取观鸟评论失败：' + commentsResult.error.message);
    var comments = commentsResult.data || [];

    var reactions = [];
    var reactionResult = await db
      .from('bird_reactions')
      .select('post_id,user_id,type')
      .in('post_id', postIds);
    if(reactionResult.error){
      var reactionMsg = String(reactionResult.error.message || '');
      if(/bird_reactions|does not exist|schema cache|Could not find/i.test(reactionMsg)){
        console.warn('bird_reactions table is not ready yet:', reactionResult.error);
      }else{
        throw new Error('读取观鸟台互动失败：' + reactionResult.error.message);
      }
    }else{
      reactions = reactionResult.data || [];
    }
    var reactionStats = {};
    reactions.forEach(function(r){
      if(!r || !r.post_id || !/^(valid|seen|tissue)$/.test(String(r.type || ''))) return;
      var stat = reactionStats[r.post_id] || (reactionStats[r.post_id] = emptyReactionStats());
      stat[reactionCountKey(r.type)] += 1;
      if(meId && r.user_id === meId) stat.myReactions[r.type] = true;
    });

    var ids = uniq(
      posts
        .filter(function(p){ return p.display_mode === 'profile'; })
        .map(function(p){ return p.user_id; })
        .concat(comments.map(function(c){ return c.user_id; }))
    );
    var profiles = [];
    if(ids.length){
      var profileResult = await db.from('profiles').select('id,nickname,avatar_url').in('id', ids);
      if(profileResult.error) throw new Error('读取观察员资料失败：' + profileResult.error.message);
      profiles = profileResult.data || [];
    }
    var profilesById = profileMap(profiles);
    var commentsByPost = {};
    comments.forEach(function(c){
      var prof = profilesById[c.user_id] || {};
      (commentsByPost[c.post_id] = commentsByPost[c.post_id] || []).push({
        id:c.id,
        postId:c.post_id,
        userId:c.user_id,
        authorName:prof.nickname || '匿名回声',
        authorAvatar:prof.avatar_url || '',
        content:c.content || '',
        createdAt:c.created_at,
        time:relativeTime(c.created_at),
        canDelete:!!meId && c.user_id === meId
      });
    });

    return posts.map(function(p){
      var prof = profilesById[p.user_id] || {};
      var author = displayAuthor(p, prof);
      var stat = reactionStats[p.id] || emptyReactionStats();
      return {
        id:p.id,
        userId:p.user_id,
        title:p.title || '',
        content:p.content || '',
        displayMode:p.display_mode || 'profile',
        penName:p.pen_name || '',
        images:Array.isArray(p.images) ? p.images : [],
        createdAt:p.created_at,
        time:relativeTime(p.created_at),
        exactTime:exactTime(p.created_at),
        authorName:author.name,
        authorAvatar:author.avatar,
        comments:commentsByPost[p.id] || [],
        validCount:stat.validCount || 0,
        seenCount:stat.seenCount || 0,
        tissueCount:stat.tissueCount || 0,
        myReactions:stat.myReactions || {valid:false, seen:false, tissue:false},
        canDelete:!!meId && p.user_id === meId
      };
    });
  }

  async function createBirdPost(payload){
    var user = await currentUser();
    if(!user) throw new Error('请先登录再发布。');
    if(user.disabled) throw new Error('这个账号已被停用。');
    if(user.muted_until && new Date(user.muted_until).getTime() > Date.now()) throw new Error('这个账号正在禁言中。');
    var result = await window.fwDb.client
      .from('bird_posts')
      .insert({
        user_id:user.id,
        title:payload.title,
        content:payload.content,
        display_mode:payload.displayMode,
        pen_name:payload.penName || null,
        images:payload.images || [],
        is_deleted:false
      })
      .select('id')
      .single();
    if(result.error) throw new Error('发布失败：' + result.error.message);
    return result.data;
  }

  async function deleteOwnBirdPost(payload){
    var result = await window.fwDb.client.rpc('fw_delete_own_bird_post', {p_post_id:payload.postId});
    if(result.error) throw new Error('删除观察记录失败：' + result.error.message);
    return result.data;
  }

  async function createBirdComment(payload){
    var user = await currentUser();
    if(!user) throw new Error('请先登录再评论。');
    if(user.disabled) throw new Error('这个账号已被停用。');
    if(user.muted_until && new Date(user.muted_until).getTime() > Date.now()) throw new Error('这个账号正在禁言中。');
    var result = await window.fwDb.client
      .from('bird_comments')
      .insert({
        post_id:payload.postId,
        user_id:user.id,
        content:payload.content,
        is_deleted:false
      })
      .select('id')
      .single();
    if(result.error) throw new Error('评论失败：' + result.error.message);
    return result.data;
  }

  async function deleteOwnBirdComment(payload){
    var result = await window.fwDb.client.rpc('fw_delete_own_bird_comment', {p_comment_id:payload.commentId});
    if(result.error) throw new Error('删除评论失败：' + result.error.message);
    return result.data;
  }

  async function createBirdReaction(payload){
    var type = String(payload && payload.type || '');
    if(!/^(valid|seen|tissue)$/.test(type)) throw new Error('未知的观鸟台互动类型。');
    var user = payload.user || await currentUser();
    if(!user) throw new Error('请先登录再互动。');
    if(user.disabled) throw new Error('这个账号已被停用。');
    if(user.muted_until && new Date(user.muted_until).getTime() > Date.now()) throw new Error('这个账号正在禁言中。');
    var result = await window.fwDb.client
      .from('bird_reactions')
      .insert({
        post_id:payload.postId,
        user_id:user.id,
        type:type
      })
      .select('id')
      .single();
    if(result.error){
      if(result.error.code === '23505' || /duplicate|unique/i.test(String(result.error.message || ''))){
        throw new Error('你已经标记过这个品种了。');
      }
      throw new Error('互动失败：' + result.error.message);
    }
    return result.data;
  }

  async function exposeBirdDb(){
    if(!(await waitDb())) return;
    window.fwDb.loadBirdPosts = loadBirdPosts;
    window.fwDb.createBirdPost = createBirdPost;
    window.fwDb.deleteOwnBirdPost = deleteOwnBirdPost;
    window.fwDb.createBirdComment = createBirdComment;
    window.fwDb.deleteOwnBirdComment = deleteOwnBirdComment;
    window.fwDb.createBirdReaction = createBirdReaction;
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
  function canvasToBlob(canvas, type, quality){
    return new Promise(function(resolve, reject){
      canvas.toBlob(function(blob){
        if(blob) resolve(blob);
        else reject(new Error('图片压缩失败，请换一张。'));
      }, type, quality);
    });
  }
  function makeFile(blob, name, type){
    try{ return new File([blob], name, {type:type || blob.type, lastModified:Date.now()}); }
    catch(e){ blob.name = name; return blob; }
  }
  async function compressImage(file){
    var img = await loadImage(file);
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if(!w || !h) throw new Error('无法读取图片尺寸。');
    var scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(w, h));
    var tw = Math.max(1, Math.round(w * scale));
    var th = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    var ctx = canvas.getContext('2d', {alpha:true});
    if(!ctx) throw new Error('当前浏览器无法处理这张图片。');
    ctx.drawImage(img, 0, 0, tw, th);
    var type = 'image/webp';
    var quality = 0.84;
    var blob = await canvasToBlob(canvas, type, quality);
    if(!blob || String(blob.type).indexOf('webp') < 0){
      type = 'image/jpeg';
      quality = 0.84;
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#fffdf7';
      ctx.fillRect(0, 0, tw, th);
      blob = await canvasToBlob(canvas, type, quality);
    }
    while(blob.size > MAX_IMAGE_SIZE && quality > 0.42){
      quality = Math.max(0.42, quality - 0.08);
      blob = await canvasToBlob(canvas, type, quality);
    }
    if(blob.size > MAX_IMAGE_SIZE) throw new Error('图片压缩后仍超过 800KB，请换一张。');
    var ext = type.indexOf('webp') >= 0 ? 'webp' : 'jpg';
    return {
      file:makeFile(blob, 'fw_bird_' + Date.now().toString(36) + '.' + ext, type),
      width:tw,
      height:th,
      mime:type,
      ext:ext
    };
  }
  async function uploadBirdImages(){
    if(!pendingFiles.length) return [];
    var user = await currentUser();
    if(!user) throw new Error('请先登录再发布。');
    var uploaded = [];
    for(var i = 0; i < pendingFiles.length; i += 1){
      notice('正在上传图片 ' + (i + 1) + ' / ' + pendingFiles.length + '...');
      var prepared = await compressImage(pendingFiles[i].file);
      var path = user.id + '/bird/image/' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8) + '.' + prepared.ext;
      var up = await window.fwDb.client.storage.from(BUCKET).upload(path, prepared.file, {
        upsert:false,
        cacheControl:'3600',
        contentType:prepared.mime
      });
      if(up.error) throw new Error('图片上传失败：' + up.error.message);
      var url = (window.fwDb.client.storage.from(BUCKET).getPublicUrl(path).data || {}).publicUrl || '';
      uploaded.push({url:url,path:path,width:prepared.width,height:prepared.height});
    }
    return uploaded;
  }

  function updatePreview(){
    var grid = $('[data-bird-preview-grid]');
    var count = $('[data-bird-image-count]');
    if(count) count.textContent = pendingFiles.length + ' / ' + MAX_IMAGES;
    if(!grid) return;
    grid.innerHTML = pendingFiles.map(function(item, idx){
      return '<div class="bird-preview"><img src="' + esc(item.url) + '" alt="待发布图片"><button type="button" data-bird-remove-image="' + idx + '">×</button></div>';
    }).join('');
  }
  function clearPendingFiles(){
    pendingFiles.forEach(function(item){ try{ URL.revokeObjectURL(item.url); }catch(e){} });
    pendingFiles = [];
    updatePreview();
  }
  function addFiles(files){
    var incoming = Array.from(files || []).filter(function(f){ return String(f.type || '').indexOf('image/') === 0; });
    if(pendingFiles.length + incoming.length > MAX_IMAGES){
      notice('最多上传 20 张图片。');
      toast('最多上传 20 张图片。');
      incoming = incoming.slice(0, MAX_IMAGES - pendingFiles.length);
    }
    incoming.forEach(function(file){
      pendingFiles.push({file:file, url:URL.createObjectURL(file)});
    });
    updatePreview();
  }

  function renderImages(images){
    images = Array.isArray(images) ? images.filter(function(x){ return x && x.url; }) : [];
    if(!images.length) return '';
    var visible = images.slice(0, 6);
    var html = visible.map(function(img, idx){
      if(idx === 5 && images.length > 6){
        return '<a class="bird-more" href="' + esc(img.url) + '" target="_blank" rel="noopener">+' + (images.length - 5) + '</a>';
      }
      return '<a href="' + esc(img.url) + '" target="_blank" rel="noopener"><img src="' + esc(img.url) + '" alt="观察图片"></a>';
    }).join('');
    return '<div class="bird-post-images">' + html + '</div>';
  }
  function renderComments(post){
    var items = (post.comments || []).map(function(c){
      var del = c.canDelete ? '<button type="button" class="bird-comment-delete" data-bird-delete-comment="' + esc(c.id) + '">删除</button>' : '';
      return '<li class="bird-comment" data-comment-id="' + esc(c.id) + '">'
        + avatarHtml(c.authorName, c.authorAvatar)
        + '<div class="bird-comment-body"><b>' + esc(c.authorName) + '</b><time>' + esc(c.time) + '</time>' + del
        + '<p>' + esc(c.content) + '</p></div></li>';
    }).join('');
    return '<div class="bird-comments ' + (openComments[String(post.id)] ? 'show' : '') + '">'
      + '<ul class="bird-comment-list">' + (items || '<li class="bird-empty">还没有评论，可以先留一句。</li>') + '</ul>'
      + '<form class="bird-comment-form" data-bird-comment-form data-post-id="' + esc(post.id) + '">'
      + '<input maxlength="' + MAX_COMMENT + '" placeholder="留一句观察补充，最多 500 字" />'
      + '<button class="btn dark" type="submit">发送评论</button></form></div>';
  }
  function renderCard(post){
    var expanded = !!expandedPosts[String(post.id)];
    var toggle = String(post.content || '').length > 220
      ? '<button type="button" class="bird-expand" data-bird-toggle-expand="' + esc(post.id) + '">' + (expanded ? '收起观察记�y' : '展开观察记录') + '</button>'
      : '';
    var del = post.canDelete ? '<button type="button" class="danger" data-bird-delete-post="' + esc(post.id) + '">删除</button>' : '';
    return '<article class="bird-card" data-post-id="' + esc(post.id) + '">'
      + '<div class="bird-top"><div><div class="bird-label">这是什么品种：</div><h3 class="bird-title">' + esc(post.title) + '</h3></div>'
      + '<span class="bird-time">' + esc(post.time + (post.exactTime ? ' · ' + post.exactTime : '')) + '</span></div>'
      + '<div class="bird-author">' + avatarHtml(post.authorName, post.authorAvatar) + '<span>' + esc(post.authorName) + '</span></div>'
      + '<p class="bird-summary">' + esc(plainSummary(post.content, expanded)) + '</p>'
      + toggle
      + renderImages(post.images)
      + '<div class="bird-controls">'
      + renderReactionButton(post, 'valid', '标本有效', post.validCount)
      + renderReactionButton(post, 'seen', '我也见过', post.seenCount)
      + renderReactionButton(post, 'tissue', '递纸巾', post.tissueCount)
      + '<button type="button" data-bird-toggle-comments="' + esc(post.id) + '">评论 ' + (post.comments || []).length + '</button>' + del + '</div>'
      + renderComments(post)
      + '</article>';
  }
  function renderFeed(){
    var box = $('[data-bird-feed]');
    if(!box) return;
    box.innerHTML = feedCache.length
      ? feedCache.map(renderCard).join('')
      : '<div class="bird-empty">还没有收录新的品种。你可以先放下一条观察记录。</div>';
  }
  async function syncFeed(){
    try{
      feedCache = await loadBirdPosts();
      renderFeed();
    }catch(e){
      var box = $('[data-bird-feed]');
      if(box) box.innerHTML = '<div class="bird-empty">' + esc(e.message || '读取失败。') + '</div>';
    }
  }
  function validatePost(form){
    var titleInput = form.querySelector('[name="title"]');
    var contentInput = form.querySelector('[name="content"]');
    var penInput = form.querySelector('[name="pen_name"]');
    var title = String(titleInput && titleInput.value || '').trim();
    var content = String(contentInput && contentInput.value || '').trim();
    var mode = String((form.querySelector('input[name="display_mode"]:checked') || {}).value || 'profile');
    var penName = String(penInput && penInput.value || '').trim();
    if(!title) return '标题不能为空。';
    if(title.length < 2) return '品种名至少 2 个字。';
    if(title.length > MAX_TITLE) return '标题太长了，品种名不宜超过 80 字。';
    if(!content) return '观察记录不能为空。';
    if(content.length > MAX_CONTENT) return '观察记录最多 5000 字。';
    if(pendingFiles.length > MAX_IMAGES) return '最多上传 20 张图片。';
    if(mode === 'pen_name' && !penName) return '临时笔名不能为空。';
    if(mode === 'pen_name' && (penName.length < 2 || penName.length > 20)) return '临时笔名建议 2 到 20 字。';
    return '';
  }
  async function submitPost(form){
    var user = await currentUser();
    if(!user){
      notice('请先登录再发布。');
      toast('请先登录再发布。');
      openLogin();
      return;
    }
    var err = validatePost(form);
    if(err){
      notice(err);
      toast(err);
      return;
    }
    var btn = form.querySelector('button[type="submit"]');
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '收录中...';
    try{
      var mode = String((form.querySelector('input[name="display_mode"]:checked') || {}).value || 'profile');
      var titleInput = form.querySelector('[name="title"]');
      var contentInput = form.querySelector('[name="content"]');
      var penInput = form.querySelector('[name="pen_name"]');
      var images = await uploadBirdImages();
      await createBirdPost({
        title:String(titleInput && titleInput.value || '').trim(),
        content:String(contentInput && contentInput.value || '').trim(),
        displayMode:mode,
        penName:mode === 'pen_name' ? String(penInput && penInput.value || '').trim() : null,
        images:images
      });
      form.reset();
      $('[data-bird-pen-wrap]').classList.remove('show');
      clearPendingFiles();
      notice('观察记录已收录。');
      toast('观察记录已收录。');
      closeComposeModal();
      await syncFeed();
    }catch(e){
      notice(e.message || '发布失败。');
      toast(e.message || '发布失败。', 3600);
    }finally{
      btn.disabled = false;
      btn.textContent = old;
    }
  }
  async function submitComment(form){
    var input = form.querySelector('input');
    var content = String(input && input.value || '').trim();
    if(!content) return;
    if(content.length > MAX_COMMENT){
      toast('评论最多 500 字。');
      return;
    }
    var user = await currentUser();
    if(!user){
      toast('请先登录再评论。');
      openLogin();
      return;
    }
    var btn = form.querySelector('button');
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '发送中...';
    try{
      await createBirdComment({postId:form.dataset.postId, content:content});
      input.value = '';
      openComments[String(form.dataset.postId)] = true;
      toast('评论已发送。');
      await syncFeed();
    }catch(e){
      toast(e.message || '评论失败。', 3200);
    }finally{
      btn.disabled = false;
      btn.textContent = old;
    }
  }
  async function handleReaction(btn){
    if(!btn || btn.dataset.birdReacting === '1') return;
    var type = String(btn.dataset.birdReact || '');
    var postId = String(btn.dataset.postId || '');
    if(!/^(valid|seen|tissue)$/.test(type) || !postId) return;
    var post = localPostById(postId);
    if(post && post.myReactions && post.myReactions[type]){
      toast('你已经标记过这个品种了。');
      return;
    }
    btn.dataset.birdReacting = '1';
    btn.disabled = true;
    try{
      var user = await currentUser();
      if(!user){
        toast('请先登录再互动。');
        openLogin();
        return;
      }
      await createBirdReaction({postId:postId, type:type, user:user});
      if(post){
        post.myReactions = post.myReactions || {valid:false, seen:false, tissue:false};
        post.myReactions[type] = true;
        var countKey = reactionCountKey(type);
        post[countKey] = (post[countKey] || 0) + 1;
        renderFeed();
      }
      toast('已标记：' + reactionLabel(type) + '。');
      await syncFeed();
    }catch(e){
      toast(e.message || '互动失败。', 3200);
      if(/已经标记过/.test(String(e.message || ''))) await syncFeed();
    }finally{
      delete btn.dataset.birdReacting;
      btn.disabled = false;
    }
  }
  async function deletePost(id){
    if(!window.confirm('确定删除这条观察记录吗？')) return;
    try{
      await deleteOwnBirdPost({postId:id});
      toast('观察记录已删除。');
      await syncFeed();
    }catch(e){
      toast(e.message || '删除失败。', 3200);
    }
  }
  async function deleteComment(id){
    if(!window.confirm('确定删除这条评论吗？')) return;
    try{
      await deleteOwnBirdComment({commentId:id});
      toast('评论已删除。');
      await syncFeed();
    }catch(e){
      toast(e.message || '删除失败。', 3200);
    }
  }
  function bind(){
    document.addEventListener('change', function(e){
      if(e.target.matches('input[name="display_mode"]')){
        $('[data-bird-pen-wrap]').classList.toggle('show', e.target.value === 'pen_name');
      }
      if(e.target.matches('[data-bird-file]')){
        addFiles(e.target.files);
        e.target.value = '';
      }
    });
    document.addEventListener('click', function(e){
      var openCompose = e.target.closest('[data-bird-open-compose]');
      if(openCompose){
        e.preventDefault();
        openComposeModal(openCompose);
        return;
      }
      var closeCompose = e.target.closest('[data-bird-close-compose]');
      if(closeCompose){
        closeComposeModal();
        return;
      }
      if(e.target.matches('[data-bird-compose-modal]')){
        closeComposeModal();
        return;
      }
      var remove = e.target.closest('[data-bird-remove-image]');
      if(remove){
        var idx = Number(remove.dataset.birdRemoveImage);
        var item = pendingFiles[idx];
        if(item){ try{ URL.revokeObjectURL(item.url); }catch(err){} }
        pendingFiles.splice(idx, 1);
        updatePreview();
        return;
      }
      var reaction = e.target.closest('[data-bird-react]');
      if(reaction){
        e.preventDefault();
        handleReaction(reaction);
        return;
      }
      var comments = e.target.closest('[data-bird-toggle-comments]');
      if(comments){
        openComments[String(comments.dataset.birdToggleComments)] = !openComments[String(comments.dataset.birdToggleComments)];
        renderFeed();
        return;
      }
      var expand = e.target.closest('[data-bird-toggle-expand]');
      if(expand){
        expandedPosts[String(expand.dataset.birdToggleExpand)] = !expandedPosts[String(expand.dataset.birdToggleExpand)];
        renderFeed();
        return;
      }
      var postDelete = e.target.closest('[data-bird-delete-post]');
      if(postDelete){
        deletePost(postDelete.dataset.birdDeletePost);
        return;
      }
      var commentDelete = e.target.closest('[data-bird-delete-comment]');
      if(commentDelete){
        deleteComment(commentDelete.dataset.birdDeleteComment);
      }
    });
    document.addEventListener('submit', function(e){
      var form = e.target.closest('[data-bird-form]');
      if(form){
        e.preventDefault();
        submitPost(form);
        return;
      }
      var commentForm = e.target.closest('[data-bird-comment-form]');
      if(commentForm){
        e.preventDefault();
        submitComment(commentForm);
      }
    });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && $('[data-bird-compose-modal].show')){
        closeComposeModal();
      }
    });
  }
  function boot(){
    exposeBirdDb();
    bind();
    updatePreview();
    syncFeed();
    if(window.location.hash === '#bird-compose') openComposeModal();
    window.addEventListener('hashchange', function(){
      if(window.location.hash === '#bird-compose') openComposeModal();
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
