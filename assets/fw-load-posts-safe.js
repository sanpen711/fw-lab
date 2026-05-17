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

  async function install(){
    if(!window.fwDb || !window.fwDb.enabled || !window.fwDb.client) return false;
    if(window.fwDb.__safeLoadPostsInstalled) return true;

    var client = window.fwDb.client;

    window.fwDb.loadPosts = async function(){
      var postsResult = await client
        .from('posts')
        .select('id,user_id,content,status_tag,is_deleted,created_at')
        .or('is_deleted.eq.false,is_deleted.is.null')
        .order('created_at', {ascending:false})
        .limit(100);

      if(postsResult.error){
        throw new Error('读取帖子失败：' + postsResult.error.message);
      }

      var posts = postsResult.data || [];
      if(!posts.length) return [];

      var postIds = posts.map(function(p){ return p.id; });
      var userIds = uniq(posts.map(function(p){ return p.user_id; }));

      var comments = await selectSafe(
        client
          .from('comments')
          .select('id,post_id,user_id,content,created_at,is_deleted')
          .in('post_id', postIds)
          .or('is_deleted.eq.false,is_deleted.is.null')
          .order('created_at', {ascending:true})
      );

      userIds = uniq(userIds.concat(comments.map(function(c){ return c.user_id; })));

      var profiles = userIds.length ? await selectSafe(
        client
          .from('profiles')
          .select('id,nickname,avatar_url')
          .in('id', userIds)
      ) : [];

      var reactions = await selectSafe(
        client
          .from('reactions')
          .select('post_id,user_id,type')
          .in('post_id', postIds)
      );

      var profileMap = {};
      profiles.forEach(function(p){ profileMap[p.id] = p || {}; });

      var commentMap = {};
      comments.forEach(function(c){
        var p = profileMap[c.user_id] || {};
        (commentMap[c.post_id] = commentMap[c.post_id] || []).push({
          id:c.id,
          userId:c.user_id,
          authorName:p.nickname || '匿名回声',
          authorAvatar:p.avatar_url || '',
          content:c.content || '',
          time:timeText(c.created_at),
          createdAt:c.created_at
        });
      });

      var counts = {};
      reactions.forEach(function(r){
        var type = r.type === 'like' ? 'resonance' : r.type;
        counts[r.post_id] = counts[r.post_id] || {resonance:0, same:0, tissue:0};
        if(type === 'resonance') counts[r.post_id].resonance += 1;
        if(type === 'same') counts[r.post_id].same += 1;
        if(type === 'tissue') counts[r.post_id].tissue += 1;
      });

      return posts.map(function(p){
        var prof = profileMap[p.user_id] || {};
        var c = counts[p.id] || {resonance:0, same:0, tissue:0};
        return {
          id:p.id,
          userId:p.user_id,
          authorId:p.user_id,
          authorName:prof.nickname || '匿名研究员',
          authorAvatar:prof.avatar_url || '',
          status:p.status_tag || '今日无效',
          content:p.content || '',
          time:timeText(p.created_at),
          createdAt:p.created_at,
          resonance:c.resonance,
          same:c.same,
          tissue:c.tissue,
          comments:commentMap[p.id] || []
        };
      });
    };

    window.fwDb.__safeLoadPostsInstalled = true;
    return true;
  }

  var tries = 0;
  var timer = setInterval(function(){
    tries += 1;
    install().then(function(ok){ if(ok) clearInterval(timer); });
    if(tries > 120) clearInterval(timer);
  }, 100);

  install();
})();
