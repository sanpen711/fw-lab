// F.w 研究所：手机端处理公告与站长处理面板
(function(){
  if(window.FWAppAdmin) return;

  var loadedPublic = false;
  var loading = false;
  var wrapped = false;
  var state = {
    tab:'users',
    rows:{users:[], posts:[], comments:[], reports:[], chats:[], logs:[]}
  };

  var actionText = {
    ban:'封号', unban:'解封', mute:'禁言', unmute:'解除禁言',
    delete_post:'删帖', restore_post:'恢复帖子',
    delete_comment:'删评论', restore_comment:'恢复评论',
    delete_chat_message:'删除房间消息', restore_chat_message:'恢复房间消息',
    resolve_report:'处理举报', ignore_report:'忽略举报', system_note:'系统记录'
  };
  var targetText = {user:'账号', post:'帖子', comment:'评论', chat_message:'房间消息', report:'举报', system:'系统'};

  function app(){ return window.FWApp || null; }
  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function esc(value){
    var fw = app();
    if(fw && fw.esc) return fw.esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function short(value, max){
    max = max || 90;
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max) + '...' : text;
  }
  function fmt(value){
    if(!value) return '刚刚';
    try{
      return new Date(value).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
    }catch(e){
      return '刚刚';
    }
  }
  function toast(message){
    var fw = app();
    if(fw && fw.toast) fw.toast(message);
  }
  function client(){
    var fw = app();
    var db = fw && fw.db && fw.db();
    return db && db.client;
  }
  function fail(result, message){
    if(result && result.error) throw new Error(message || result.error.message || '操作失败');
    return result ? result.data : null;
  }

  function injectStyle(){
    if($('#fwMobileAdminStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileAdminStyle';
    style.textContent = [
      '.mobile-admin-public{display:grid;gap:10px;margin-top:12px}',
      '.mobile-admin-log{display:grid;gap:8px;padding:13px;border:1px solid rgba(16,23,15,.1);border-radius:16px;background:#fffdf7}',
      '.mobile-admin-log-time{color:var(--accent-dark);font-size:12px;font-weight:1000}',
      '.mobile-admin-log b{display:block;color:var(--deep);font-size:15px;line-height:1.35;font-weight:1000}',
      '.mobile-admin-log span{display:block;color:var(--muted);font-size:13px;line-height:1.55;font-weight:850}',
      '.mobile-admin-chip{display:inline-grid;place-items:center;min-height:26px;border-radius:999px;padding:0 9px;background:var(--green);color:#fff;font-size:12px;font-weight:1000;width:max-content}',
      '.mobile-admin-chip.warn{background:var(--accent-dark)}',
      '.mobile-admin-chip.soft{background:#796f62}',
      '.mobile-admin-card{margin-top:14px;border:1px solid rgba(16,23,15,.12);border-radius:20px;background:#fffdf7;overflow:hidden;box-shadow:0 12px 34px rgba(16,23,15,.08)}',
      '.mobile-admin-card[hidden]{display:none!important}',
      '.mobile-admin-head{display:grid;gap:10px;padding:16px;background:#10170f;color:#fffdf7}',
      '.mobile-admin-head h2{margin:0;font-size:24px;line-height:1.1;font-weight:1000;letter-spacing:-.05em}',
      '.mobile-admin-head p{margin:0;color:rgba(255,253,247,.68);font-size:13px;line-height:1.55;font-weight:850}',
      '.mobile-admin-refresh{min-height:36px;border:1px solid rgba(255,253,247,.22);border-radius:999px;background:#fffdf7;color:#10170f;font-size:13px;font-weight:1000;padding:0 13px;justify-self:start}',
      '.mobile-admin-tabs{display:flex;gap:8px;overflow:auto;padding:12px;border-bottom:1px solid rgba(16,23,15,.1);background:rgba(16,23,15,.03);-webkit-overflow-scrolling:touch}',
      '.mobile-admin-tabs button{flex:0 0 auto;min-height:34px;border:1px solid rgba(16,23,15,.14);border-radius:999px;background:transparent;color:#10170f;padding:0 12px;font-size:13px;font-weight:1000}',
      '.mobile-admin-tabs button.active{background:#10170f;color:#fffdf7;border-color:#10170f}',
      '.mobile-admin-body{display:grid;gap:12px;padding:13px}',
      '.mobile-admin-toolbar{display:grid;gap:9px}',
      '.mobile-admin-toolbar b{font-size:16px;color:var(--deep)}',
      '.mobile-admin-toolbar input{width:100%;min-height:40px;border:1px solid rgba(16,23,15,.14);border-radius:12px;background:#fff;padding:0 12px;color:#10170f;font-size:14px;font-weight:850;box-sizing:border-box}',
      '.mobile-admin-table{display:grid;gap:10px}',
      '.mobile-admin-row{display:grid;gap:12px;padding:13px;border:1px solid rgba(16,23,15,.1);border-radius:16px;background:#fffaf1}',
      '.mobile-admin-row-main b{display:block;margin-bottom:5px;color:var(--deep);font-size:15px;line-height:1.35;font-weight:1000;word-break:break-word}',
      '.mobile-admin-row-main p{margin:0;color:var(--muted);font-size:13px;line-height:1.55;font-weight:820;word-break:break-word}',
      '.mobile-admin-actions{display:flex;gap:7px;flex-wrap:wrap}',
      '.mobile-admin-actions button{min-height:33px;border:1px solid rgba(16,23,15,.14);border-radius:999px;background:#fffdf7;color:#10170f;padding:0 11px;font-size:12px;font-weight:1000}',
      '.mobile-admin-actions button.danger{background:#8f3636;color:#fff;border-color:#8f3636}',
      '.mobile-admin-actions button.dark{background:#10170f;color:#fffdf7;border-color:#10170f}',
      '.mobile-admin-empty{padding:17px;border:1px dashed rgba(16,23,15,.18);border-radius:16px;background:rgba(255,253,247,.7);color:var(--muted);text-align:center;font-size:13px;font-weight:900;line-height:1.55}',
      '.mobile-admin-gate{margin:12px 0 0;color:var(--muted);font-size:13px;line-height:1.55;font-weight:850}',
      '.mobile-admin-gate[hidden]{display:none!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function renderPublicError(message){
    var box = $('[data-mobile-admin-public-list]');
    if(box) box.innerHTML = '<div class="mobile-admin-empty">' + esc(message) + '</div>';
  }

  function renderLogs(rows){
    if(!rows || !rows.length) return '<div class="mobile-admin-empty">暂时没有处理公告。说明大家今天还算体面。</div>';
    return rows.map(function(row){
      var action = actionText[row.action] || row.action || '处理';
      var danger = ['ban','mute','delete_post','delete_comment','delete_chat_message','resolve_report'].indexOf(row.action) >= 0;
      var desc = [
        '对象：' + (targetText[row.target_type] || row.target_type || '对象'),
        row.duration_text ? '时长：' + row.duration_text : '',
        row.reason ? '原因：' + row.reason : ''
      ].filter(Boolean).join(' · ');
      return '<article class="mobile-admin-log">' +
        '<div class="mobile-admin-log-time">' + esc(fmt(row.created_at)) + '</div>' +
        '<div><b>' + esc(row.target_display_name || '某位研究员') + ' 处理：' + esc(action) + '</b><span>' + esc(desc) + '</span></div>' +
        '<span class="mobile-admin-chip ' + (danger ? 'warn' : 'soft') + '">' + esc(action) + '</span>' +
      '</article>';
    }).join('');
  }

  async function loadPublicLogs(force){
    if(loadedPublic && !force) return;
    var box = $('[data-mobile-admin-public-list]');
    if(!box) return;
    box.innerHTML = '<div class="mobile-admin-empty">正在读取违规处理公告...</div>';
    try{
      var c = client();
      if(!c) throw new Error('暂时无法连接数据服务。');
      var rows = fail(await c.from('moderation_logs')
        .select('id,target_type,target_display_name,action,reason,duration_text,created_at,expires_at')
        .eq('public_visible', true)
        .eq('is_revoked', false)
        .order('created_at', {ascending:false})
        .limit(50), '公告读取失败') || [];
      box.innerHTML = renderLogs(rows);
      loadedPublic = true;
    }catch(e){
      renderPublicError('处理公告暂时读取失败，请稍后刷新。');
    }
  }

  function showAdminGate(message){
    var gate = $('[data-mobile-admin-gate]');
    var panel = $('[data-mobile-admin-panel]');
    if(panel) panel.hidden = true;
    if(gate){
      gate.hidden = false;
      gate.textContent = message || '管理员登录后显示站长处理面板。';
    }
  }

  async function refreshAdminAccess(){
    var fw = app();
    if(!fw) return false;
    var user = fw.state && fw.state.user;
    if(!user && fw.refreshUser) user = await fw.refreshUser();
    if(!user){
      showAdminGate('登录管理员账号后显示站长处理面板。');
      return false;
    }
    if(!user.isAdmin){
      showAdminGate('当前账号不是管理员，仅显示公开处理公告。');
      return false;
    }
    var gate = $('[data-mobile-admin-gate]');
    var panel = $('[data-mobile-admin-panel]');
    if(gate) gate.hidden = true;
    if(panel) panel.hidden = false;
    return true;
  }

  async function loadUsers(){
    var c = client();
    try{
      state.rows.users = fail(await c.rpc('admin_list_profiles'), '用户读取失败') || [];
    }catch(e){
      state.rows.users = fail(await c.from('profiles').select('id,nickname,avatar_url,role,is_banned,lab_code,muted_until,created_at').order('created_at', {ascending:false}).limit(200), '用户读取失败') || [];
    }
  }
  async function loadPosts(){
    state.rows.posts = fail(await client().from('posts').select('id,user_id,content,status_tag,is_deleted,created_at,profiles(nickname,avatar_url)').order('created_at', {ascending:false}).limit(120), '帖子读取失败') || [];
  }
  async function loadComments(){
    state.rows.comments = fail(await client().from('comments').select('id,post_id,user_id,content,is_deleted,created_at,profiles!comments_user_id_fkey(nickname,avatar_url),posts(content)').order('created_at', {ascending:false}).limit(120), '评论读取失败') || [];
  }
  async function loadReports(){
    var c = client();
    try{
      state.rows.reports = fail(await c.rpc('admin_list_chat_reports'), '举报读取失败') || [];
    }catch(e){
      state.rows.reports = fail(await c.from('chat_message_reports').select('id,message_id,reporter_id,report_reason,status,created_at').order('created_at', {ascending:false}).limit(120), '举报读取失败') || [];
    }
  }
  async function loadChats(){
    var c = client();
    try{
      state.rows.chats = fail(await c.rpc('admin_list_chat_messages'), '房间消息读取失败') || [];
    }catch(e){
      var data = fail(await c.from('chat_messages').select('id,room_key,user_id,content,is_deleted,created_at,profiles(nickname,avatar_url)').order('created_at', {ascending:false}).limit(160), '房间消息读取失败') || [];
      state.rows.chats = data.map(function(row){
        var profile = Array.isArray(row.profiles) ? row.profiles[0] : (row.profiles || {});
        return {id:row.id, room_key:row.room_key, user_id:row.user_id, nickname:profile.nickname || '匿名研究员', avatar_url:'', content:row.content, is_deleted:row.is_deleted, created_at:row.created_at};
      });
    }
  }
  async function loadAdminLogs(){
    state.rows.logs = fail(await client().from('moderation_logs').select('id,target_type,target_display_name,action,reason,duration_text,public_visible,is_revoked,created_at').order('created_at', {ascending:false}).limit(120), '记录读取失败') || [];
  }

  async function loadTab(tab){
    if(loading) return;
    if(!(await refreshAdminAccess())) return;
    state.tab = tab || state.tab;
    $$('.mobile-admin-tabs [data-mobile-admin-tab]').forEach(function(button){
      button.classList.toggle('active', button.dataset.mobileAdminTab === state.tab);
    });
    var body = $('[data-mobile-admin-body]');
    if(body) body.innerHTML = '<div class="mobile-admin-empty">正在读取记录...</div>';
    loading = true;
    try{
      if(state.tab === 'users') await loadUsers();
      if(state.tab === 'posts') await loadPosts();
      if(state.tab === 'comments') await loadComments();
      if(state.tab === 'reports') await loadReports();
      if(state.tab === 'chats') await loadChats();
      if(state.tab === 'logs') await loadAdminLogs();
      renderAdminBody();
    }catch(e){
      if(body) body.innerHTML = '<div class="mobile-admin-empty">记录读取失败：' + esc(e.message || '请稍后再试') + '</div>';
    }finally{
      loading = false;
    }
  }

  function toolbar(label){
    return '<div class="mobile-admin-toolbar"><b>' + esc(label) + '</b><input data-mobile-admin-search placeholder="搜索昵称、编号、房间或内容"></div>';
  }
  function row(main, actions, searchText){
    return '<article class="mobile-admin-row" data-mobile-admin-row data-search="' + esc(String(searchText || '').toLowerCase()) + '"><div class="mobile-admin-row-main">' + main + '</div><div class="mobile-admin-actions">' + actions + '</div></article>';
  }

  function profileOf(value){ return Array.isArray(value) ? (value[0] || {}) : (value || {}); }
  function renderUsers(){
    var rows = state.rows.users || [];
    if(!rows.length) return toolbar('用户管理') + '<div class="mobile-admin-empty">暂无用户。</div>';
    return toolbar('用户管理') + '<div class="mobile-admin-table">' + rows.map(function(user){
      var muted = user.muted_until && new Date(user.muted_until).getTime() > Date.now();
      var main = '<b>' + esc(user.nickname || '研究员') + (user.role === 'admin' ? '｜管理员' : '') + '</b><p>编号：' + esc(user.lab_code || '未设置') + ' · 状态：' + esc(user.is_banned ? '已封号' : muted ? '禁言中' : '正常') + ' · 注册：' + esc(fmt(user.created_at)) + '</p>';
      var actions = user.role === 'admin'
        ? '<span class="mobile-admin-chip soft">管理员账号</span>'
        : '<button class="danger" data-mobile-user-act="ban" data-id="' + esc(user.id) + '">封号</button><button data-mobile-user-act="unban" data-id="' + esc(user.id) + '">解封</button><button class="dark" data-mobile-user-act="mute" data-min="60" data-id="' + esc(user.id) + '">禁言1h</button><button class="dark" data-mobile-user-act="mute" data-min="1440" data-id="' + esc(user.id) + '">禁言24h</button><button data-mobile-user-act="unmute" data-id="' + esc(user.id) + '">解禁言</button>';
      return row(main, actions, (user.nickname || '') + ' ' + (user.lab_code || ''));
    }).join('') + '</div>';
  }
  function renderPosts(){
    var rows = state.rows.posts || [];
    if(!rows.length) return toolbar('帖子管理') + '<div class="mobile-admin-empty">暂无帖子。</div>';
    return toolbar('帖子管理') + '<div class="mobile-admin-table">' + rows.map(function(post){
      var profile = profileOf(post.profiles);
      var main = '<b>' + esc(profile.nickname || '匿名研究员') + ' · ' + esc(post.status_tag || '无状态') + (post.is_deleted ? '｜已删除' : '') + '</b><p>' + esc(short(post.content, 150)) + '<br>发布：' + esc(fmt(post.created_at)) + '</p>';
      var actions = '<button class="danger" data-mobile-post-act="delete" data-id="' + esc(post.id) + '">删除</button><button data-mobile-post-act="restore" data-id="' + esc(post.id) + '">恢复</button>';
      return row(main, actions, (profile.nickname || '') + ' ' + (post.content || ''));
    }).join('') + '</div>';
  }
  function renderComments(){
    var rows = state.rows.comments || [];
    if(!rows.length) return toolbar('评论管理') + '<div class="mobile-admin-empty">暂无评论。</div>';
    return toolbar('评论管理') + '<div class="mobile-admin-table">' + rows.map(function(comment){
      var profile = profileOf(comment.profiles);
      var post = comment.posts || {};
      var main = '<b>' + esc(profile.nickname || '匿名研究员') + (comment.is_deleted ? '｜已删除' : '') + '</b><p>评论：' + esc(short(comment.content, 140)) + '<br>原帖：' + esc(short(post.content || '', 80)) + ' · ' + esc(fmt(comment.created_at)) + '</p>';
      var actions = '<button class="danger" data-mobile-comment-act="delete" data-id="' + esc(comment.id) + '">删除</button><button data-mobile-comment-act="restore" data-id="' + esc(comment.id) + '">恢复</button>';
      return row(main, actions, (profile.nickname || '') + ' ' + (comment.content || ''));
    }).join('') + '</div>';
  }
  function renderReports(){
    var rows = state.rows.reports || [];
    if(!rows.length) return toolbar('举报中心') + '<div class="mobile-admin-empty">暂无举报。</div>';
    return toolbar('举报中心') + '<div class="mobile-admin-table">' + rows.map(function(report){
      var main = '<b>举报 #' + esc(report.id) + ' · ' + esc(report.status || 'pending') + ' · 被举报：' + esc(report.target_name || '未知') + '</b><p>房间：' + esc(report.room_key || '未知') + ' · 消息：' + esc(short(report.message_content || ('消息ID：' + report.message_id), 120)) + '<br>举报人：' + esc(report.reporter_name || report.reporter_id || '未知') + ' · 原因：' + esc(report.report_reason || '用户举报') + ' · ' + esc(fmt(report.created_at)) + '</p>';
      var actions = '<button class="dark" data-mobile-report-act="resolved" data-id="' + esc(report.id) + '">标记处理</button><button data-mobile-report-act="ignored" data-id="' + esc(report.id) + '">忽略</button>' + (report.message_id ? '<button class="danger" data-mobile-chat-act="delete" data-id="' + esc(report.message_id) + '">删除消息</button>' : '');
      return row(main, actions, (report.report_reason || '') + ' ' + (report.status || '') + ' ' + (report.target_name || '') + ' ' + (report.message_content || ''));
    }).join('') + '</div>';
  }
  function renderChats(){
    var rows = state.rows.chats || [];
    if(!rows.length) return toolbar('房间消息管理') + '<div class="mobile-admin-empty">暂无房间消息。</div>';
    return toolbar('房间消息管理') + '<div class="mobile-admin-table">' + rows.map(function(message){
      var main = '<b>' + esc(message.nickname || '匿名研究员') + ' · ' + esc(message.room_key || '未知房间') + (message.is_deleted ? '｜已删除' : '') + '</b><p>' + esc(short(message.content, 160)) + '<br>发送：' + esc(fmt(message.created_at)) + '</p>';
      var actions = '<button class="danger" data-mobile-chat-act="delete" data-id="' + esc(message.id) + '">删除</button><button data-mobile-chat-act="restore" data-id="' + esc(message.id) + '">恢复</button>';
      return row(main, actions, (message.nickname || '') + ' ' + (message.room_key || '') + ' ' + (message.content || ''));
    }).join('') + '</div>';
  }

  function renderAdminBody(){
    var body = $('[data-mobile-admin-body]');
    if(!body) return;
    if(state.tab === 'users') body.innerHTML = renderUsers();
    if(state.tab === 'posts') body.innerHTML = renderPosts();
    if(state.tab === 'comments') body.innerHTML = renderComments();
    if(state.tab === 'reports') body.innerHTML = renderReports();
    if(state.tab === 'chats') body.innerHTML = renderChats();
    if(state.tab === 'logs') body.innerHTML = '<div class="mobile-admin-table">' + renderLogs(state.rows.logs) + '</div>';
  }

  function reason(defaultText){
    var value = window.prompt('填写处理原因：', defaultText || '违反研究所公约');
    if(value === null) return null;
    return String(value || '').trim() || defaultText || '违反研究所公约';
  }
  function visible(){
    return window.confirm('是否公开到“处理公告”公告栏？\n确定 = 公开；取消 = 仅后台记录');
  }
  async function rpc(name, args){
    var result = await client().rpc(name, args);
    if(result && result.error) throw result.error;
  }

  async function handleAction(e){
    var tab = e.target.closest && e.target.closest('[data-mobile-admin-tab]');
    if(tab){
      e.preventDefault();
      await loadTab(tab.dataset.mobileAdminTab || 'users');
      return;
    }
    var refresh = e.target.closest && e.target.closest('[data-mobile-admin-refresh]');
    if(refresh){
      e.preventDefault();
      loadedPublic = false;
      await loadPublicLogs(true);
      await loadTab(state.tab);
      toast('已刷新。');
      return;
    }

    var user = e.target.closest && e.target.closest('[data-mobile-user-act]');
    if(user){
      e.preventDefault();
      var act = user.dataset.mobileUserAct;
      var r = reason(act === 'ban' ? '账号违规，已封号' : act === 'mute' ? '扰乱交流秩序，已禁言' : '状态调整');
      if(r === null) return;
      await rpc('admin_moderate_user', {p_target_user_id:user.dataset.id, p_action:act, p_mute_minutes:Number(user.dataset.min || 0) || null, p_reason:r, p_public_visible:visible()});
      toast('用户处理完成。');
      loadedPublic = false;
      await loadPublicLogs(true);
      await loadTab('users');
      return;
    }

    var post = e.target.closest && e.target.closest('[data-mobile-post-act]');
    if(post){
      e.preventDefault();
      var deletePost = post.dataset.mobilePostAct === 'delete';
      var postReason = reason(deletePost ? '内容不适合公开展示' : '帖子恢复');
      if(postReason === null) return;
      await rpc('admin_moderate_post', {p_post_id:Number(post.dataset.id), p_delete:deletePost, p_reason:postReason, p_public_visible:visible()});
      toast('帖子处理完成。');
      loadedPublic = false;
      await loadPublicLogs(true);
      await loadTab('posts');
      return;
    }

    var comment = e.target.closest && e.target.closest('[data-mobile-comment-act]');
    if(comment){
      e.preventDefault();
      var deleteComment = comment.dataset.mobileCommentAct === 'delete';
      var commentReason = reason(deleteComment ? '评论不适合公开展示' : '评论恢复');
      if(commentReason === null) return;
      await rpc('admin_moderate_comment', {p_comment_id:Number(comment.dataset.id), p_delete:deleteComment, p_reason:commentReason, p_public_visible:visible()});
      toast('评论处理完成。');
      loadedPublic = false;
      await loadPublicLogs(true);
      await loadTab('comments');
      return;
    }

    var chat = e.target.closest && e.target.closest('[data-mobile-chat-act]');
    if(chat){
      e.preventDefault();
      var deleteChat = chat.dataset.mobileChatAct === 'delete';
      var chatReason = reason(deleteChat ? '房间消息不适合公开展示' : '房间消息恢复');
      if(chatReason === null) return;
      await rpc('admin_moderate_chat_message', {p_message_id:Number(chat.dataset.id), p_delete:deleteChat, p_reason:chatReason, p_public_visible:visible()});
      toast('房间消息处理完成。');
      loadedPublic = false;
      await loadPublicLogs(true);
      await loadTab(state.tab);
      return;
    }

    var report = e.target.closest && e.target.closest('[data-mobile-report-act]');
    if(report){
      e.preventDefault();
      var status = report.dataset.mobileReportAct;
      var reportReason = reason(status === 'resolved' ? '举报已处理' : '举报已忽略');
      if(reportReason === null) return;
      await rpc('admin_resolve_chat_report', {p_report_id:Number(report.dataset.id), p_status:status, p_reason:reportReason, p_public_visible:visible()});
      toast('举报状态已更新。');
      loadedPublic = false;
      await loadPublicLogs(true);
      await loadTab('reports');
    }
  }

  function bind(){
    document.addEventListener('click', function(e){
      handleAction(e).catch(function(err){
        console.warn('[FW mobile app] admin action failed', err);
        toast(err.message || '操作失败');
      });
    });
    document.addEventListener('input', function(e){
      var input = e.target.closest && e.target.closest('[data-mobile-admin-search]');
      if(!input) return;
      var q = String(input.value || '').trim().toLowerCase();
      $$('[data-mobile-admin-row]').forEach(function(row){
        row.style.display = !q || String(row.dataset.search || '').indexOf(q) >= 0 ? '' : 'none';
      });
    });
  }

  async function ensureLoaded(force){
    if(!(await app().waitForDb())){
      renderPublicError('处理公告暂时读取失败，请稍后刷新。');
      return;
    }
    await loadPublicLogs(force);
    if(await refreshAdminAccess()){
      await loadTab(state.tab || 'users');
    }
  }

  function wrapSetView(){
    var fw = app();
    if(!fw || wrapped) return;
    wrapped = true;
    var original = fw.setView;
    fw.setView = function(name){
      original.call(fw, name);
      if(name === 'moderation'){
        setTimeout(function(){ ensureLoaded(false); }, 30);
      }
    };
  }

  function init(){
    injectStyle();
    bind();
    wrapSetView();
    if(app() && app().state && app().state.view === 'moderation') ensureLoaded(false);
  }

  window.FWAppAdmin = {init:init, ensureLoaded:ensureLoaded, loadPublicLogs:loadPublicLogs, loadTab:loadTab};

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();