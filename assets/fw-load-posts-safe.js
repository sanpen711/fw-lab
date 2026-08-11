// F.w 研究所：帖子读取安全补丁
// 目的：前台以 posts 为主读取，profiles / comments / reactions 任一辅助查询失败时，不影响帖子本身显示。
(function(){
  if(window.__FW_LOAD_POSTS_SAFE__) return;
  window.__FW_LOAD_POSTS_SAFE__ = true;

  function timeText(v){
    if(!v) return '刚刚';
    var d = new Date(v);
    if(isNaN(d.getTime())) return '刚刚';
    var m = Math.floor(Math.max(0, Date.now() - d.getTime()) / 60000);
    if(m < 1) return '刚刚';
    if(m < 60) return m + '分钟前';
    var h = Math.floor(m / 60);
    if(h < 24) return h + '小时前';
    var day = Math.floor(h / 24);
    return day < 7 ? day + '天前' : d.toLocaleDateString('zh-CN');
  }

  function uniq(arr){
    var m = {};
    return (arr || []).filter(function(v){
      if(!v || m[v]) return false;
      m[v] = true;
      return true;
    });
  }

  async function selectSafe(query){
    try{
      var r = await query;
      if(r && r.error) throw r.error;
      return r && r.data || [];
    }catch(e){
      console.warn('[FW safe posts] auxiliary query failed:', e && (e.message || e));
      return [];
    }
  }

  async function currentUserId(client){
    try{
      var sessionResult = await client.auth.getSession();
      return sessionResult && sessionResult.data && sessionResult.data.session && sessionResult.data.session.user && sessionResult.data.session.user.id || null;
    }catch(e){
      console.warn('[FW safe posts] session query failed:', e && (e.message || e));
      return null;
    }
  }

  async function selectActive(client, table, columns, postIds){
    var query = client.from(table).select(columns).or('is_deleted.eq.false,is_deleted.is.null');
    if(postIds) query = query.in('post_id', postIds);
    if(table === 'posts') query = query.order('created_at', {ascending:false}).limit(100);
    var result = await query;
    if(!result.error) return result.data || [];
    if(/is_deleted|schema cache|column/i.test(String(result.error.message || ''))){
      var fallback = client.from(table).select(columns.replace(/,?is_deleted/g, ''));
      if(postIds) fallback = fallback.in('post_id', postIds);
      if(table === 'posts') fallback = fallback.order('created_at', {ascending:false}).limit(100);
      var fallbackResult = await fallback;
      if(!fallbackResult.error) return fallbackResult.data || [];
      throw fallbackResult.error;
    }
    throw result.error;
  }

  async function profilesFor(client, ids){
    ids = uniq(ids);
    if(!ids.length) return {};
    var rows = await selectSafe(client.from('profiles').select('id,nickname,avatar_url').in('id', ids));
    var map = {};
    rows.forEach(function(profile){ map[profile.id] = profile || {}; });
    return map;
  }

  function reactionState(reactions, meId){
    var counts = {}, mine = {};
    (reactions || []).forEach(function(reaction){
      var type = reaction.type === 'like' ? 'resonance' : reaction.type;
      counts[reaction.post_id] = counts[reaction.post_id] || {resonance:0, same:0, tissue:0};
      mine[reaction.post_id] = mine[reaction.post_id] || {resonance:false, same:false, tissue:false};
      if(type === 'resonance') counts[reaction.post_id].resonance += 1;
      if(type === 'same') counts[reaction.post_id].same += 1;
      if(type === 'tissue') counts[reaction.post_id].tissue += 1;
      if(meId && reaction.user_id === meId && /^(resonance|same|tissue)$/.test(type || '')) mine[reaction.post_id][type] = true;
    });
    return {counts:counts, mine:mine};
  }

  function mappedComment(comment, profile, meId){
    return {
      id:comment.id,
      userId:comment.user_id,
      parentCommentId:comment.parent_comment_id || null,
      authorName:profile.nickname || '匿名回声',
      authorAvatar:profile.avatar_url || '',
      content:comment.content || '',
      time:timeText(comment.created_at),
      createdAt:comment.created_at,
      canDelete:!!meId && comment.user_id === meId
    };
  }

  function sortCreated(left, right){
    return new Date(right.createdAt || right.created_at || 0).getTime() - new Date(left.createdAt || left.created_at || 0).getTime();
  }

  async function loadFull(client, meId){
    var posts = await selectActive(client, 'posts', 'id,user_id,content,status_tag,is_deleted,created_at');
    posts.sort(sortCreated);
    posts = posts.slice(0, 100);
    var postIds = posts.map(function(post){ return post.id; });
    if(!postIds.length) return {posts:[], reactions:[]};

    var comments = await selectSafe(
      client.from('comments')
        .select('id,post_id,user_id,parent_comment_id,content,created_at,is_deleted')
        .in('post_id', postIds)
        .or('is_deleted.eq.false,is_deleted.is.null')
        .order('created_at', {ascending:true})
    );
    var reactions = await selectSafe(
      client.from('reactions').select('id,post_id,user_id,type,created_at').in('post_id', postIds)
    );
    var profileMap = await profilesFor(client, posts.map(function(post){ return post.user_id; }).concat(comments.map(function(comment){ return comment.user_id; })));
    var commentMap = {};
    comments.forEach(function(comment){
      (commentMap[comment.post_id] = commentMap[comment.post_id] || []).push(mappedComment(comment, profileMap[comment.user_id] || {}, meId));
    });
    var reactionsMapped = reactionState(reactions, meId);
    return {
      reactions:reactions,
      posts:posts.map(function(post){
        var profile = profileMap[post.user_id] || {};
        var counts = reactionsMapped.counts[post.id] || {resonance:0, same:0, tissue:0};
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
          resonance:counts.resonance,
          same:counts.same,
          tissue:counts.tissue,
          comments:commentMap[post.id] || [],
          canDelete:!!meId && post.user_id === meId,
          myReactions:reactionsMapped.mine[post.id] || {resonance:false, same:false, tissue:false}
        };
      })
    };
  }

  async function loadIncremental(client, meId, cache){
    var cachedPosts = Array.isArray(cache.posts) ? cache.posts : [];
    var cachedReactions = Array.isArray(cache.reactions) ? cache.reactions : [];
    if(!cachedPosts.length || !Array.isArray(cache.reactions)) return loadFull(client, meId);

    var postMeta = await selectActive(client, 'posts', 'id,created_at,is_deleted');
    postMeta.sort(sortCreated);
    postMeta = postMeta.slice(0, 100);
    var postIds = postMeta.map(function(post){ return post.id; });
    if(!postIds.length) return {posts:[], reactions:[]};

    var activePost = {};
    postIds.forEach(function(id){ activePost[String(id)] = true; });
    var cachedByPost = {};
    cachedPosts.forEach(function(post){
      if(post && activePost[String(post.id)]) cachedByPost[String(post.id)] = post;
    });
    var missingPostIds = postIds.filter(function(id){ return !cachedByPost[String(id)]; });
    var newPosts = missingPostIds.length ? await selectSafe(
      client.from('posts').select('id,user_id,content,status_tag,created_at').in('id', missingPostIds)
    ) : [];
    var newPostMap = {};
    newPosts.forEach(function(post){ newPostMap[String(post.id)] = post; });

    var commentMeta = await selectActive(client, 'comments', 'id,post_id,is_deleted', postIds);
    var activeComment = {};
    commentMeta.forEach(function(comment){ activeComment[String(comment.id)] = comment.post_id; });
    var cachedCommentMap = {};
    cachedPosts.forEach(function(post){
      if(!activePost[String(post.id)]) return;
      (post.comments || []).forEach(function(comment){
        if(comment && activeComment[String(comment.id)]) cachedCommentMap[String(comment.id)] = comment;
      });
    });
    var missingCommentIds = commentMeta
      .map(function(comment){ return comment.id; })
      .filter(function(id){ return !cachedCommentMap[String(id)]; });
    var newComments = missingCommentIds.length ? await selectSafe(
      client.from('comments').select('id,post_id,user_id,parent_comment_id,content,created_at').in('id', missingCommentIds)
    ) : [];

    var profiles = await profilesFor(client,
      newPosts.map(function(post){ return post.user_id; }).concat(newComments.map(function(comment){ return comment.user_id; }))
    );
    newComments.forEach(function(comment){
      cachedCommentMap[String(comment.id)] = mappedComment(comment, profiles[comment.user_id] || {}, meId);
    });
    var commentsByPost = {};
    commentMeta.forEach(function(meta){
      var comment = cachedCommentMap[String(meta.id)];
      if(!comment) return;
      comment.canDelete = !!meId && comment.userId === meId;
      (commentsByPost[meta.post_id] = commentsByPost[meta.post_id] || []).push(comment);
    });
    Object.keys(commentsByPost).forEach(function(postId){ commentsByPost[postId].sort(sortCreated).reverse(); });

    var reactions = cachedReactions.filter(function(reaction){ return reaction && activePost[String(reaction.post_id)]; });
    var reactionIds = {};
    var maxReactionId = 0;
    reactions.forEach(function(reaction){
      reactionIds[String(reaction.id)] = true;
      maxReactionId = Math.max(maxReactionId, Number(reaction.id) || 0);
    });
    var reactionQuery = client.from('reactions').select('id,post_id,user_id,type,created_at').in('post_id', postIds);
    if(maxReactionId) reactionQuery = reactionQuery.gt('id', maxReactionId);
    var freshReactions = await selectSafe(reactionQuery);
    freshReactions.forEach(function(reaction){
      if(!reactionIds[String(reaction.id)]) reactions.push(reaction);
    });
    var reactionMapped = reactionState(reactions, meId);

    var mappedPosts = postMeta.map(function(meta){
      var cached = cachedByPost[String(meta.id)];
      var raw = newPostMap[String(meta.id)];
      var post = cached ? Object.assign({}, cached) : {
        id:raw && raw.id,
        userId:raw && raw.user_id,
        authorId:raw && raw.user_id,
        authorName:(profiles[raw && raw.user_id] || {}).nickname || '匿名研究员',
        authorAvatar:(profiles[raw && raw.user_id] || {}).avatar_url || '',
        status:raw && raw.status_tag || '今日无效',
        content:raw && raw.content || '',
        createdAt:raw && raw.created_at || meta.created_at
      };
      var counts = reactionMapped.counts[meta.id] || {resonance:0, same:0, tissue:0};
      post.time = timeText(post.createdAt);
      post.comments = commentsByPost[meta.id] || [];
      post.resonance = counts.resonance;
      post.same = counts.same;
      post.tissue = counts.tissue;
      post.canDelete = !!meId && post.userId === meId;
      post.myReactions = reactionMapped.mine[meta.id] || {resonance:false, same:false, tissue:false};
      return post;
    }).filter(function(post){ return post && post.id != null; });

    return {posts:mappedPosts, reactions:reactions};
  }

  async function install(){
    if(!window.fwDb || !window.fwDb.enabled || !window.fwDb.client) return false;
    if(window.fwDb.__safeLoadPostsInstalled) return true;

    var client = window.fwDb.client;

    window.fwDb.loadPosts = async function(options){
      options = options || {};
      var meId = await currentUserId(client);
      var canIncrement = !!(
        window.fwDesktopCache && window.fwDesktopCache.enabled &&
        Array.isArray(options.cachedPosts) && options.cachedPosts.length &&
        options.cacheVersion === 1 && options.cacheReady === true &&
        Array.isArray(options.cachedReactions)
      );
      var loaded = canIncrement
        ? await loadIncremental(client, meId, {posts:options.cachedPosts, reactions:options.cachedReactions})
        : await loadFull(client, meId);
      window.fwDb.__lastPostCacheMeta = {
        version:1,
        syncedAt:Date.now(),
        mode:canIncrement ? 'incremental' : 'full',
        reactions:loaded.reactions || []
      };
      return loaded.posts || [];
    };

    window.fwDb.__safeLoadPostsInstalled = true;
    return true;
  }

  function waitForDb(attempt){
    install().then(function(ok){
      if(ok || attempt >= 22) return;
      setTimeout(function(){ waitForDb(attempt + 1); }, Math.min(1000, 80 * Math.pow(1.3, attempt)));
    });
  }

  waitForDb(0);
})();
