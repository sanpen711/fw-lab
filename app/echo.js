(function(){
  if(window.FWAppEcho) return;

  var bound = false;
  var loaded = false;

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function esc(value){ return app().esc(value); }

  function fail(result, message){
    if(result && result.error) throw new Error(message || '读取失败');
    return result ? result.data : null;
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

  function typeText(type){
    return ({
      like:'点赞了你的帖子',
      same:'对你说俺也一样',
      tissue:'给你递了纸巾',
      comment:'评论了你的帖子',
      friend_request:'想加你为搭子',
      friend_accept:'通过了你的搭子申请',
      chat_agree:'赞同了你的房间消息',
      system:'发来一条系统通知'
    })[type] || '给你发来一条回声';
  }

  function avatar(profile){
    var name = profile && profile.nickname || '研究员';
    if(profile && profile.avatar_url){
      return '<span class="list-avatar"><img src="' + esc(profile.avatar_url) + '" alt="' + esc(name) + '"></span>';
    }
    return '<span class="list-avatar">' + esc(app().initials(name)) + '</span>';
  }

  async function fetchProfiles(client, ids){
    var unique = Array.from(new Set((ids || []).filter(Boolean)));
    if(!unique.length) return {};
    var rows = fail(await client.from('profiles').select('id,nickname,avatar_url,lab_code').in('id', unique), '资料读取失败') || [];
    var map = {};
    rows.forEach(function(row){ map[row.id] = row; });
    return map;
  }

  function noticeHtml(notice, profile){
    var action = typeText(notice.type);
    var content = notice.content || '对你的低功耗发言产生了回应。';
    var isBuddy = notice.type === 'friend_request' || notice.type === 'friend_accept';
    var canOpenPost = (notice.target_type === 'post' || ['like','same','tissue','comment'].indexOf(notice.type) >= 0) && notice.target_id;
    return '<article class="notice-item ' + (notice.is_read ? '' : 'unread') + '">' +
      avatar(profile) +
      '<div class="list-main"><b>' + esc((profile && profile.nickname || '某位研究员') + ' ' + action) + '</b><span>' + esc(content) + '</span><small>' + esc(timeText(notice.created_at)) + '</small></div>' +
      '<div class="notice-actions">' +
        (canOpenPost ? '<button type="button" data-echo-post="' + esc(notice.target_id) + '">查看帖子</button>' : '') +
        (isBuddy ? '<button type="button" data-app-open="buddy">去搭子</button>' : '') +
      '</div>' +
    '</article>';
  }

  async function load(force){
    if(loaded && !force) return;
    var list = $('[data-echo-list]');
    if(list) list.innerHTML = '<div class="loading">正在读取回声...</div>';

    try{
      await app().refreshUser();
      var me = app().state.user;
      if(!me){
        if(list) list.innerHTML = '<div class="empty">请先登录后查看回声。</div>';
        loaded = true;
        return;
      }
      if(!(await app().waitForDb())) throw new Error('暂时无法连接数据服务。');
      var client = app().db().client;
      var rows = fail(
        await client
          .from('notifications')
          .select('id,actor_id,type,target_type,target_id,content,is_read,created_at')
          .eq('user_id', me.id)
          .neq('type', 'private_message')
          .order('created_at', {ascending:false})
          .limit(80),
        '回声读取失败'
      ) || [];
      var profiles = await fetchProfiles(client, rows.map(function(row){ return row.actor_id; }));
      if(!rows.length){
        list.innerHTML = '<div class="empty">暂时没有新的回声。安静也是一种运行状态。</div>';
        loaded = true;
        return;
      }
      list.innerHTML = rows.map(function(row){ return noticeHtml(row, profiles[row.actor_id] || {}); }).join('');
      loaded = true;
      client.from('notifications').update({is_read:true}).eq('user_id', me.id).eq('is_read', false).neq('type', 'private_message').then(function(){});
    }catch(e){
      console.warn('[FW mobile app] echo load failed', e);
      if(list) list.innerHTML = '<div class="error">回声暂时读取失败，请稍后再试。</div>';
    }
  }

  function bind(){
    if(bound) return;
    bound = true;

    document.addEventListener('click', function(e){
      var post = e.target.closest && e.target.closest('[data-echo-post]');
      if(post){
        app().setView('square');
        setTimeout(function(){
          var card = document.querySelector('[data-post-id="' + post.dataset.echoPost + '"]');
          if(card) card.scrollIntoView({block:'center', behavior:'smooth'});
          else app().toast('帖子可能还在加载中，请稍后再试。');
        }, 350);
      }
    });
  }

  function init(){ bind(); }
  function ensureLoaded(){ load(false); }

  window.FWAppEcho = {init:init, load:load, ensureLoaded:ensureLoaded};
})();
