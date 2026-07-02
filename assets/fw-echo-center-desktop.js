// F.w 研究所：电脑端回声中心增强
// 只接管已有 [data-fw-open-echo] 按钮；不新增入口；不影响 /app/ 手机端。
(function(){
  if(window.__FW_DESKTOP_ECHO_CENTER_V3__) return;
  window.__FW_DESKTOP_ECHO_CENTER_V3__ = true;

  if(/\/app\//.test(window.location.pathname || '')) return;

  var POST_TYPES = ['like', 'same', 'tissue', 'comment', 'comment_reply'];
  var FRIEND_TYPES = ['friend_request', 'friend_accept'];
  var lastRows = [];
  var lastProfiles = {};

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function ini(value){
    return String(value || 'FW').trim().slice(0, 2).toUpperCase();
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
    try{ return await window.fwDb.getCurrentUser(); }catch(e){ return null; }
  }

  function toast(message){
    var t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(window.__fwDesktopEchoToast);
    window.__fwDesktopEchoToast = setTimeout(function(){ t.classList.remove('show'); }, 2600);
  }

  function timeText(value){
    if(!value) return '刚刚';
    var date = new Date(value);
    if(isNaN(date.getTime())) return '刚刚';
    var minutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60000);
    if(minutes < 1) return '刚刚';
    if(minutes < 60) return minutes + '分钟前';
    var hours = Math.floor(minutes / 60);
    if(hours < 24) return hours + '小时前';
    var days = Math.floor(hours / 24);
    return days < 7 ? days + '天前' : date.toLocaleDateString('zh-CN');
  }

  function typeText(type){
    return ({
      like:'点赞了你的帖子',
      same:'对你说：俺也一样',
      tissue:'给你递了纸巾',
      comment:'评论了你的帖子',
      comment_reply:'回复了你的评论',
      friend_request:'想加你为搭子',
      friend_accept:'通过了你的搭子申请',
      private_message:'给你发来一条私聊',
      chat_agree:'赞同了你的房间消息',
      system:'系统通知'
    })[type] || '给你发来一条回声';
  }

  function kindOf(row){
    var type = String(row && row.type || '');
    if(type === 'private_message') return 'message';
    if(FRIEND_TYPES.indexOf(type) >= 0) return 'friend';
    if(POST_TYPES.indexOf(type) >= 0) return 'post';
    return 'system';
  }

  function postIdOf(row){
    if(!row) return '';
    if(row.__post_id) return String(row.__post_id);
    if(row.target_type === 'post' && row.target_id) return String(row.target_id);
    if(POST_TYPES.indexOf(String(row.type || '')) >= 0 && row.target_id) return String(row.target_id);
    return '';
  }

  function previewText(value){
    return String(value || '对你的低功耗发言产生了回应。')
      .replace(/\[\[FW_USER_STICKER:[A-Za-z0-9+/=]+\]\]/g, '动画表情')
      .replace(/\[\[FW_MEDIA_IMAGE:[A-Za-z0-9+/=]+\]\]/g, '图片')
      .replace(/\[\[FW_MEDIA_VIDEO:[A-Za-z0-9+/=]+\]\]/g, '视频')
      .replace(/\s+/g, ' ')
      .trim() || '对你的低功耗发言产生了回应。';
  }

  function injectStyle(){
    if($('#fwDesktopEchoCenterStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwDesktopEchoCenterStyle';
    style.textContent = [
      '.fw-social-panel.fw-echo-center-panel{width:min(760px,calc(100vw - 72px));max-height:min(760px,calc(100dvh - 84px));}',
      '.fw-echo-center-wrap{display:grid;gap:14px;}',
      '.fw-echo-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:2px 2px 0;}',
      '.fw-echo-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:rgba(23,23,21,.72);font-size:13px;font-weight:900;}',
      '.fw-echo-pill{display:inline-flex;align-items:center;justify-content:center;min-height:28px;border-radius:999px;padding:0 11px;background:#f7f3eb;border:1px solid rgba(28,28,24,.1);font-weight:1000;color:#171715;}',
      '.fw-echo-pill.danger{background:#fff0ec;border-color:rgba(217,121,121,.38);color:#9d4a4a;}',
      '.fw-echo-toolbar-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',
      '.fw-echo-filter,.fw-echo-refresh{min-height:32px;border:1px solid rgba(28,28,24,.13);border-radius:999px;background:#fffdf7;color:#171715;padding:0 12px;font-size:12px;font-weight:1000;cursor:pointer;}',
      '.fw-echo-filter.active,.fw-echo-refresh:hover{background:#171715;border-color:#171715;color:#fff;}',
      '.fw-echo-list{display:grid;gap:10px;max-height:min(560px,calc(100dvh - 245px));overflow:auto;padding-right:4px;}',
      '.fw-echo-item{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:flex-start;padding:14px;border:1px solid rgba(28,28,24,.1);background:#fffdf7;position:relative;}',
      '.fw-echo-item.unread{background:linear-gradient(135deg,#fffdf7,#fff3ef);border-color:rgba(217,121,121,.48);}',
      '.fw-echo-item.unread:before{content:"";position:absolute;left:8px;top:8px;width:9px;height:9px;border-radius:999px;background:#d95353;border:2px solid #fffdf7;box-shadow:0 3px 10px rgba(217,83,83,.3);}',
      '.fw-echo-avatar{width:44px;height:44px;border-radius:999px;background:#171715;color:#fff;display:grid;place-items:center;overflow:hidden;font-size:13px;font-weight:1000;cursor:pointer;}',
      '.fw-echo-avatar img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.fw-echo-main{min-width:0;display:grid;gap:4px;}',
      '.fw-echo-main b{font-size:15px;line-height:1.25;font-weight:1000;color:#171715;}',
      '.fw-echo-main p{margin:0;color:rgba(23,23,21,.74);font-size:13px;line-height:1.55;font-weight:820;word-break:break-word;}',
      '.fw-echo-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;color:rgba(23,23,21,.52);font-size:12px;font-weight:900;}',
      '.fw-echo-kind{color:#9d4a4a;}',
      '.fw-echo-actions{display:flex;gap:7px;align-items:center;justify-content:flex-end;flex-wrap:wrap;min-width:108px;}',
      '.fw-echo-mini{min-height:31px;border:1px solid rgba(28,28,24,.14);border-radius:999px;background:#fffdf7;color:#171715;padding:0 10px;font-size:12px;font-weight:1000;cursor:pointer;white-space:nowrap;}',
      '.fw-echo-mini.dark{background:#171715;border-color:#171715;color:#fff;}',
      '.fw-echo-mini:hover{border-color:rgba(217,121,121,.7);color:#9d4a4a;}',
      '.fw-echo-mini.dark:hover{background:#9d4a4a;border-color:#9d4a4a;color:#fff;}',
      '.fw-echo-empty{padding:24px;border:1px dashed rgba(28,28,24,.16);background:#fffdf7;color:rgba(23,23,21,.62);font-weight:900;line-height:1.7;}',
      '.fw-echo-hidden{display:none!important;}',
      '@media(max-width:760px){.fw-social-panel.fw-echo-center-panel{width:min(100%,calc(100vw - 28px));}.fw-echo-item{grid-template-columns:40px minmax(0,1fr);}.fw-echo-actions{grid-column:2;justify-content:flex-start;}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureShell(){
    var modal = $('[data-fw-social-modal]');
    if(!modal){
      modal = document.createElement('div');
      modal.className = 'fw-social-modal';
      modal.dataset.fwSocialModal = '1';
      modal.innerHTML = '<div class="fw-social-panel" data-fw-social-panel><header class="fw-social-head"><div><small data-fw-social-kicker>ECHO CENTER</small><h2 data-fw-social-title>回声中心</h2></div><button class="fw-social-close" type="button" data-fw-social-close>×</button></header><div class="fw-social-body" data-fw-social-body></div></div>';
      document.body.appendChild(modal);
    }
    return modal;
  }

  function setBadge(count){
    $$('[data-fw-echo-count]').forEach(function(el){
      el.textContent = count > 99 ? '99+' : String(count || 0);
      el.classList.toggle('show', Number(count || 0) > 0);
    });
  }

  async function fetchProfiles(ids){
    ids = Array.from(new Set((ids || []).filter(Boolean)));
    if(!ids.length) return {};
    try{
      var result = await window.fwDb.client.from('profiles').select('id,nickname,avatar_url,lab_code').in('id', ids);
      if(result.error) throw result.error;
      var map = {};
      (result.data || []).forEach(function(row){ map[row.id] = row; });
      return map;
    }catch(e){ return {}; }
  }

  async function resolveReplyTargets(rows){
    var ids = Array.from(new Set((rows || []).filter(function(row){ return row && row.type === 'comment_reply' && row.target_id; }).map(function(row){ return row.target_id; })));
    if(!ids.length) return rows || [];
    try{
      var result = await window.fwDb.client.from('comments').select('id,post_id').in('id', ids);
      if(result.error) throw result.error;
      var map = {};
      (result.data || []).forEach(function(row){ if(row.id && row.post_id) map[row.id] = row.post_id; });
      (rows || []).forEach(function(row){ if(row.type === 'comment_reply' && row.target_id && map[row.target_id]) row.__post_id = map[row.target_id]; });
    }catch(e){}
    return rows || [];
  }

  async function loadData(){
    if(!(await waitDb())) throw new Error('数据连接失败，请刷新页面后重试。');
    var me = await currentUser();
    if(!me || !me.id) throw new Error('请先注册 / 登录。');
    var result = await window.fwDb.client
      .from('notifications')
      .select('id,actor_id,type,target_type,target_id,content,is_read,created_at')
      .eq('user_id', me.id)
      .order('created_at', {ascending:false})
      .limit(120);
    if(result.error) throw result.error;
    lastRows = await resolveReplyTargets(result.data || []);
    lastProfiles = await fetchProfiles(lastRows.map(function(row){ return row.actor_id; }));
    return {rows:lastRows, profiles:lastProfiles};
  }

  function avatar(profile){
    var name = profile && profile.nickname || '研究员';
    var url = profile && profile.avatar_url || '';
    var id = profile && profile.id || '';
    if(url) return '<span class="fw-echo-avatar" data-fw-profile-user="' + esc(id) + '"><img src="' + esc(url) + '" alt="' + esc(name) + '"></span>';
    return '<span class="fw-echo-avatar" data-fw-profile-user="' + esc(id) + '">' + esc(ini(name)) + '</span>';
  }

  function itemHtml(row){
    var p = lastProfiles[row.actor_id] || {id:row.actor_id, nickname:'某位研究员'};
    var name = p.nickname || '某位研究员';
    var kind = kindOf(row);
    var unread = !row.is_read;
    var postId = postIdOf(row);
    var actions = [];
    if(postId) actions.push('<button class="fw-echo-mini dark" type="button" data-fw-stable-post="' + esc(postId) + '">查看帖子</button>');
    if(row.type === 'private_message' && row.actor_id) actions.push('<button class="fw-echo-mini dark" type="button" data-fw-start-chat="' + esc(row.actor_id) + '">私聊</button>');
    if(row.type === 'friend_request') actions.push('<button class="fw-echo-mini dark" type="button" data-fw-open-buddy>处理申请</button>');
    if(row.actor_id) actions.push('<button class="fw-echo-mini" type="button" data-fw-profile-user="' + esc(row.actor_id) + '">资料</button>');
    return '<article class="fw-echo-item ' + (unread ? 'unread' : '') + '" data-fw-echo-item data-fw-echo-kind="' + esc(kind) + '" data-fw-echo-unread="' + (unread ? '1' : '0') + '">' + avatar(p) + '<div class="fw-echo-main"><b>' + esc(name) + ' ' + esc(typeText(row.type)) + '</b><p>' + esc(previewText(row.content)) + '</p><div class="fw-echo-meta"><span>' + esc(timeText(row.created_at)) + '</span><span class="fw-echo-kind">' + esc(kind === 'post' ? '帖子互动' : kind === 'friend' ? '搭子' : kind === 'message' ? '私聊' : '系统') + '</span>' + (unread ? '<span>未读</span>' : '<span>已读</span>') + '</div></div><div class="fw-echo-actions">' + actions.join('') + '</div></article>';
  }

  function render(){
    injectStyle();
    var modal = ensureShell();
    var panel = $('[data-fw-social-panel]', modal);
    var body = $('[data-fw-social-body]', modal);
    if(!panel || !body) return;
    panel.classList.remove('wide');
    panel.classList.add('fw-echo-center-panel');
    var kicker = $('[data-fw-social-kicker]', modal);
    var title = $('[data-fw-social-title]', modal);
    if(kicker) kicker.textContent = 'ECHO CENTER';
    if(title) title.textContent = '回声中心';
    modal.classList.add('show');
    var rows = lastRows || [];
    var unread = rows.filter(function(row){ return !row.is_read; }).length;
    var postCount = rows.filter(function(row){ return kindOf(row) === 'post'; }).length;
    var friendCount = rows.filter(function(row){ return kindOf(row) === 'friend'; }).length;
    var messageCount = rows.filter(function(row){ return kindOf(row) === 'message'; }).length;
    setBadge(unread);
    if(!rows.length){ body.innerHTML = '<div class="fw-echo-empty">暂时没有新的回声。安静也是一种运行状态。</div>'; return; }
    body.innerHTML = '<div class="fw-echo-center-wrap"><div class="fw-echo-toolbar"><div class="fw-echo-summary"><span class="fw-echo-pill">全部 ' + rows.length + '</span><span class="fw-echo-pill ' + (unread ? 'danger' : '') + '">未读 ' + unread + '</span><span class="fw-echo-pill">帖子 ' + postCount + '</span><span class="fw-echo-pill">搭子 ' + friendCount + '</span><span class="fw-echo-pill">私聊 ' + messageCount + '</span></div><div class="fw-echo-toolbar-actions"><button class="fw-echo-filter active" type="button" data-fw-echo-filter="all">全部</button><button class="fw-echo-filter" type="button" data-fw-echo-filter="unread">未读</button><button class="fw-echo-filter" type="button" data-fw-echo-filter="post">帖子</button><button class="fw-echo-filter" type="button" data-fw-echo-filter="friend">搭子</button><button class="fw-echo-filter" type="button" data-fw-echo-filter="message">私聊</button><button class="fw-echo-refresh" type="button" data-fw-echo-refresh>刷新</button></div></div><div class="fw-echo-list" data-fw-echo-list>' + rows.map(itemHtml).join('') + '</div></div>';
  }

  async function markRead(){
    try{
      var me = await currentUser();
      if(!me || !me.id) return;
      await window.fwDb.client.from('notifications').update({is_read:true}).eq('user_id', me.id).eq('is_read', false);
      setBadge(0);
    }catch(e){}
  }

  async function openCenter(){
    injectStyle();
    var modal = ensureShell();
    var panel = $('[data-fw-social-panel]', modal);
    var body = $('[data-fw-social-body]', modal);
    if(panel){ panel.classList.remove('wide'); panel.classList.add('fw-echo-center-panel'); }
    if(body){ body.innerHTML = '<div class="fw-echo-empty">正在读取回声中心...</div>'; }
    modal.classList.add('show');
    try{
      await loadData();
      render();
      markRead();
    }catch(e){
      if(body) body.innerHTML = '<div class="fw-echo-empty">' + esc(e.message || '回声读取失败，请刷新后重试。') + '</div>';
    }
  }

  function applyFilter(value){
    var list = $('[data-fw-echo-list]');
    if(!list) return;
    $$('.fw-echo-filter').forEach(function(btn){ btn.classList.toggle('active', btn.dataset.fwEchoFilter === value); });
    $$('[data-fw-echo-item]', list).forEach(function(item){
      var kind = item.dataset.fwEchoKind || 'system';
      var unread = item.dataset.fwEchoUnread === '1';
      var show = value === 'all' || (value === 'unread' && unread) || value === kind;
      item.classList.toggle('fw-echo-hidden', !show);
    });
  }

  function bind(){
    // 用 window 捕获阶段优先接管，避免原 fw-social.js 的旧 openEcho 抢先渲染。
    window.addEventListener('click', function(event){
      var open = event.target && event.target.closest && event.target.closest('[data-fw-open-echo]');
      if(open){
        event.preventDefault();
        event.stopPropagation();
        if(event.stopImmediatePropagation) event.stopImmediatePropagation();
        openCenter();
        return;
      }
      var filter = event.target && event.target.closest && event.target.closest('[data-fw-echo-filter]');
      if(filter){
        event.preventDefault();
        applyFilter(filter.dataset.fwEchoFilter || 'all');
        return;
      }
      var refresh = event.target && event.target.closest && event.target.closest('[data-fw-echo-refresh]');
      if(refresh){
        event.preventDefault();
        refresh.disabled = true;
        refresh.textContent = '刷新中...';
        openCenter().finally(function(){ refresh.disabled = false; refresh.textContent = '刷新'; });
        return;
      }
      var close = event.target && event.target.closest && event.target.closest('[data-fw-social-close]');
      if(close){
        var modal = $('[data-fw-social-modal]');
        if(modal) modal.classList.remove('show');
      }
    }, true);
  }

  function boot(){ injectStyle(); bind(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
