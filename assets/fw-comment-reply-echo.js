// F.w 研究所：评论回复回声兜底。
// notifications 写入受限时，直接从 comments 中识别“别人回复了我”；正式通知存在时按评论 ID 去重。
(function(){
  if(window.FWCommentReplyEcho) return;

  var PREFIX = 'reply-comment:';
  var READ_KEY = 'fw_comment_reply_echo_read_v1_';
  var RECENT_UNREAD_MS = 3 * 24 * 60 * 60 * 1000;
  var CACHE_MS = 15000;
  var cache = {};

  function text(value){ return String(value == null ? '' : value); }
  function virtualId(commentId){ return PREFIX + text(commentId); }
  function commentIdFromVirtual(value){
    var match = /^reply-comment:(\d+)$/.exec(text(value));
    return match ? match[1] : '';
  }
  function readKey(userId){ return READ_KEY + text(userId); }

  function readSet(userId){
    try{
      var raw = window.localStorage && localStorage.getItem(readKey(userId));
      var rows = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(rows) ? rows.map(text).filter(Boolean) : []);
    }catch(e){ return new Set(); }
  }

  function writeSet(userId, values){
    try{
      var rows = Array.from(values || []).map(text).filter(Boolean).slice(-600);
      if(window.localStorage) localStorage.setItem(readKey(userId), JSON.stringify(rows));
    }catch(e){}
  }

  function markRead(userId, noticeIds){
    if(!userId) return;
    var seen = readSet(userId);
    (noticeIds || []).forEach(function(id){
      var commentId = commentIdFromVirtual(id);
      if(commentId) seen.add(commentId);
    });
    writeSet(userId, seen);
  }

  function databaseNoticeIds(noticeIds){
    return Array.from(new Set((noticeIds || []).map(text).filter(function(id){
      return id && !commentIdFromVirtual(id);
    })));
  }

  function formalReplyTargets(notices){
    var ids = new Set();
    (notices || []).forEach(function(row){
      if(row && row.type === 'comment_reply' && row.target_id != null) ids.add(text(row.target_id));
    });
    return ids;
  }

  async function fetchReplyComments(client, userId, force){
    var key = text(userId);
    var saved = cache[key];
    if(!force && saved && Date.now() - saved.at < CACHE_MS) return saved.rows;
    if(!client || !userId) return [];

    try{
      var own = await client
        .from('comments')
        .select('id')
        .eq('user_id', userId)
        .or('is_deleted.eq.false,is_deleted.is.null')
        .order('created_at', {ascending:false})
        .limit(220);
      if(own && own.error) throw own.error;
      var ownIds = (own && own.data || []).map(function(row){ return row && row.id; }).filter(Boolean);
      var targetFilter = 'reply_to_user_id.eq.' + userId;
      if(ownIds.length) targetFilter += ',parent_comment_id.in.(' + ownIds.join(',') + ')';

      var replies = await client
        .from('comments')
        .select('id,post_id,user_id,parent_comment_id,reply_to_user_id,content,is_deleted,created_at')
        .or(targetFilter)
        .neq('user_id', userId)
        .or('is_deleted.eq.false,is_deleted.is.null')
        .order('created_at', {ascending:false})
        .limit(160);
      if(replies && replies.error) throw replies.error;

      var ownSet = new Set(ownIds.map(text));
      var rows = (replies && replies.data || []).filter(function(row){
        if(!row || row.is_deleted === true || text(row.user_id) === key) return false;
        var direct = text(row.reply_to_user_id) === key;
        var legacyParent = !row.reply_to_user_id && ownSet.has(text(row.parent_comment_id));
        return direct || legacyParent;
      });
      cache[key] = {at:Date.now(), rows:rows};
      return rows;
    }catch(e){
      console.warn('[FW comment reply echo] fallback query failed', e);
      return saved ? saved.rows : [];
    }
  }

  async function merge(client, userId, notices, options){
    options = options || {};
    var formal = Array.isArray(notices) ? notices.slice() : [];
    var targets = formalReplyTargets(formal);
    var read = readSet(userId);
    var comments = await fetchReplyComments(client, userId, !!options.force);
    var fallback = [];

    comments.forEach(function(comment){
      var commentId = text(comment.id);
      if(!commentId || targets.has(commentId)) return;
      var created = new Date(comment.created_at || 0).getTime();
      var old = !created || Date.now() - created > RECENT_UNREAD_MS;
      fallback.push({
        id:virtualId(commentId),
        actor_id:comment.user_id,
        type:'comment_reply',
        target_type:'comment',
        target_id:comment.id,
        content:comment.content || '回复了你的评论',
        is_read:read.has(commentId) || old,
        created_at:comment.created_at,
        __post_id:comment.post_id,
        __reply_fallback:true
      });
    });

    var rows = formal.concat(fallback);
    rows.sort(function(a,b){
      return new Date(b && b.created_at || 0).getTime() - new Date(a && a.created_at || 0).getTime();
    });
    return rows.slice(0, Number(options.limit || 100));
  }

  function invalidate(userId){
    if(userId) delete cache[text(userId)];
    else cache = {};
  }

  window.FWCommentReplyEcho = {
    merge:merge,
    markRead:markRead,
    databaseNoticeIds:databaseNoticeIds,
    invalidate:invalidate,
    virtualId:virtualId
  };
})();
