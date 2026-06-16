// F.w 研究所：手机端优先修复补丁
// 作用：补上评论回复回声显示、统一回声角标，优化发布登录门槛，并恢复私聊输入提示。
(function(){
  if(window.__FW_MOBILE_PRIORITY_FIXES__) return;
  window.__FW_MOBILE_PRIORITY_FIXES__ = true;

  var ECHO_TYPES = ['like','same','tissue','comment','comment_reply','chat_agree','system'];
  var echoPatched = false;
  var publishGateBound = false;
  var mergeTimer = 0;
  var badgeTimer = 0;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function app(){ return window.FWApp || null; }
  function client(){ return window.fwDb && window.fwDb.client; }
  function toast(message){ var fw = app(); if(fw && fw.toast) fw.toast(message); }

  async function waitDb(){
    var fw = app();
    if(fw && fw.waitForDb) return await fw.waitForDb();
    return !!client();
  }

  function storeUser(user){
    var fw = app();
    if(user && fw && fw.state && !fw.state.user) fw.state.user = user;
    return user;
  }

  async function currentUser(){
    var fw = app();
    if(fw && fw.state && fw.state.user) return fw.state.user;
    if(fw && fw.refreshUser){
      try{ return storeUser(await fw.refreshUser()); }catch(e){}
    }
    if(window.fwDb && window.fwDb.getCurrentUser){
      try{ return storeUser(await window.fwDb.getCurrentUser()); }catch(e){}
    }
    return null;
  }

  function openLoginProfile(){
    toast('登录后才能发布内容。');
    var fw = app();
    if(fw && fw.setView) fw.setView('profile');
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

  function cleanNoticeText(value){
    return String(value || '')
      .replace(/\[\[FW_USER_STICKER:[A-Za-z0-9+/=]+\]\]/g, '动画表情')
      .replace(/\[\[FW_MEDIA_IMAGE:[A-Za-z0-9+/=]+\]\]/g, '图片')
      .replace(/\[\[FW_MEDIA_VIDEO:[A-Za-z0-9+/=]+\]\]/g, '视频')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function fetchReplyRows(){
    if(!(await waitDb())) return {rows:[], profiles:{}, postByComment:{}};
    var user = await currentUser();
    var c = client();
    if(!user || !user.id || !c) return {rows:[], profiles:{}, postByComment:{}};

    var result = await c.from('notifications')
      .select('id,actor_id,type,target_type,target_id,content,is_read,created_at')
      .eq('user_id', user.id)
      .eq('type', 'comment_reply')
      .order('created_at', {ascending:false})
      .limit(80);
    if(result && result.error) throw result.error;

    var rows = result && result.data || [];
    var profiles = {};
    var postByComment = {};

    var actorIds = Array.from(new Set(rows.map(function(row){ return row.actor_id; }).filter(Boolean)));
    if(actorIds.length){
      try{
        var profileResult = await c.from('profiles').select('id,nickname,avatar_url,lab_code').in('id', actorIds);
        if(profileResult && !profileResult.error){
          (profileResult.data || []).forEach(function(profile){ profiles[profile.id] = profile; });
        }
      }catch(e){}
    }

    var commentIds = Array.from(new Set(rows.map(function(row){ return row.target_id; }).filter(Boolean)));
    if(commentIds.length){
      try{
        var commentResult = await c.from('comments').select('id,post_id').in('id', commentIds);
        if(commentResult && !commentResult.error){
          (commentResult.data || []).forEach(function(comment){ postByComment[comment.id] = comment.post_id; });
        }
      }catch(e){}
    }

    return {rows:rows, profiles:profiles, postByComment:postByComment};
  }

  function avatarHtml(profile){
    var fw = app();
    var name = profile && profile.nickname || '研究员';
    if(profile && profile.avatar_url) return '<span class="list-avatar"><img src="' + esc(profile.avatar_url) + '" alt="' + esc(name) + '"></span>';
    if(fw && fw.initials) return '<span class="list-avatar">' + esc(fw.initials(name)) + '</span>';
    return '<span class="list-avatar">研</span>';
  }

  function replyHtml(row, profile, postId){
    var content = cleanNoticeText(row.content || '回复了你的评论。') || '回复了你的评论。';
    var actions = postId ? '<div class="notice-actions"><button class="mobile-echo-mini dark" type="button" data-priority-reply-post="' + esc(postId) + '" data-priority-reply-notice="' + esc(row.id) + '" data-priority-reply-actor="' + esc(row.actor_id || '') + '" data-priority-reply-time="' + esc(row.created_at || '') + '">查看帖子</button></div>' : '';
    return '<article class="notice-item mobile-echo-item ' + (row.is_read ? '' : 'unread') + '" data-priority-reply-echo="1" data-mobile-echo-item="' + esc(row.id) + '">' + avatarHtml(profile) + '<div class="list-main"><b>' + esc((profile && profile.nickname || '某位研究员') + ' 回复了你的评论') + '</b><span>' + esc(content) + '</span><small>' + esc(timeText(row.created_at)) + '</small>' + actions + '</div></article>';
  }

  async function mergeReplyEchoes(){
    var list = $('[data-echo-list]');
    if(!list) return;
    var loading = $('.loading', list);
    if(loading && !$('.mobile-echo-item', list)) return;
    try{
      var data = await fetchReplyRows();
      $$('[data-priority-reply-echo]', list).forEach(function(node){ node.remove(); });
      if(!data.rows.length){ refreshBadge(); return; }
      var empty = $('.empty', list);
      if(empty) empty.remove();
      var html = data.rows.map(function(row){
        return replyHtml(row, data.profiles[row.actor_id] || {}, data.postByComment[row.target_id] || '');
      }).join('');
      var toolbar = $('.mobile-echo-toolbar', list);
      if(toolbar) toolbar.insertAdjacentHTML('afterend', html);
      else list.insertAdjacentHTML('afterbegin', '<div class="mobile-echo-toolbar"><b>回声通知</b><div class="mobile-echo-actions"><button class="mobile-echo-refresh" type="button" data-mobile-echo-refresh>刷新</button></div></div>' + html);
      refreshBadge();
    }catch(e){
      console.warn('[FW mobile priority fixes] merge comment_reply failed', e);
    }
  }

  function scheduleMerge(){
    clearTimeout(mergeTimer);
    mergeTimer = setTimeout(function(){
      mergeReplyEchoes();
      setTimeout(mergeReplyEchoes, 350);
      setTimeout(mergeReplyEchoes, 900);
    }, 80);
  }

  function setBadge(count){
    var button = document.querySelector('[data-app-nav="echo"]');
    if(!button) return;
    var badge = button.querySelector('.mobile-echo-badge');
    if(!badge){
      badge = document.createElement('span');
      badge.className = 'mobile-echo-badge';
      button.appendChild(badge);
    }
    if(Number(count || 0) > 0){
      badge.textContent = '';
      badge.setAttribute('aria-hidden', 'true');
      badge.classList.add('show');
      button.classList.add('has-mobile-echo-badge');
    }else{
      badge.textContent = '';
      badge.setAttribute('aria-hidden', 'true');
      badge.classList.remove('show');
      button.classList.remove('has-mobile-echo-badge');
    }
  }

  async function refreshBadge(){
    try{
      if(!(await waitDb())){ setBadge(0); return; }
      var user = await currentUser();
      var c = client();
      if(!user || !user.id || !c){ setBadge(0); return; }
      var result = await c.from('notifications')
        .select('id,type')
        .eq('user_id', user.id)
        .eq('is_read', false)
        .in('type', ECHO_TYPES)
        .limit(300);
      if(result && result.error) throw result.error;
      setBadge((result && result.data || []).length);
    }catch(e){
      console.warn('[FW mobile priority fixes] unified echo badge failed', e);
    }
  }

  function patchEcho(){
    if(echoPatched) return true;
    if(!window.FWAppEcho) return false;
    echoPatched = true;

    var originalLoad = window.FWAppEcho.load;
    if(typeof originalLoad === 'function'){
      window.FWAppEcho.load = function(){
        var result = originalLoad.apply(this, arguments);
        Promise.resolve(result).then(scheduleMerge).catch(scheduleMerge);
        return result;
      };
    }

    var originalEnsureLoaded = window.FWAppEcho.ensureLoaded;
    if(typeof originalEnsureLoaded === 'function'){
      window.FWAppEcho.ensureLoaded = function(){
        var result = originalEnsureLoaded.apply(this, arguments);
        scheduleMerge();
        return result;
      };
    }

    var originalRefreshBadges = window.FWAppEcho.refreshBadges;
    if(typeof originalRefreshBadges === 'function'){
      window.FWAppEcho.refreshBadges = function(){
        var result = originalRefreshBadges.apply(this, arguments);
        Promise.resolve(result).then(refreshBadge).catch(refreshBadge);
        return result;
      };
    }

    scheduleMerge();
    refreshBadge();
    clearInterval(badgeTimer);
    badgeTimer = setInterval(refreshBadge, 45000);
    return true;
  }

  function bindReplyAction(){
    document.addEventListener('click', function(e){
      var target = e.target && e.target.closest && e.target.closest('[data-priority-reply-post]');
      if(!target) return;
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      var noticeId = target.dataset.priorityReplyNotice || '';
      var postId = target.dataset.priorityReplyPost || '';
      if(window.FWAppEcho && window.FWAppEcho.markRead && noticeId) window.FWAppEcho.markRead([noticeId]);
      if(window.FWAppEcho && window.FWAppEcho.openPost){
        window.FWAppEcho.openPost(postId, {noticeId:noticeId, openComments:true, actorId:target.dataset.priorityReplyActor || '', createdAt:target.dataset.priorityReplyTime || ''});
      }else if(app() && app().setView){
        app().setView('square');
      }
      refreshBadge();
    }, true);
  }

  function patchEchoWhenReady(){
    if(patchEcho()) return;
    [0, 120, 360, 900, 1800].forEach(function(delay){ setTimeout(patchEcho, delay); });
  }

  function polishBuddyInput(){
    var input = $('.buddy-chat-input');
    if(input && !String(input.getAttribute('placeholder') || '').trim()) input.setAttribute('placeholder', '说点什么...');
  }

  function scheduleBuddyInputPolish(){
    [0, 180, 600].forEach(function(delay){ setTimeout(polishBuddyInput, delay); });
  }

  function injectPriorityStyle(){
    if(document.getElementById('fwMobilePriorityFixesStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobilePriorityFixesStyle';
    style.textContent = '.mobile-admin-gate{display:none!important}';
    document.head.appendChild(style);
  }

  function polishPublishCopy(){
    var back = $('[data-publish-back-square]');
    if(back) back.textContent = '‹ 返回广场';
    var cancel = $('[data-publish-cancel]');
    if(cancel) cancel.textContent = '放弃发布';
  }

  function schedulePublishCopyPolish(){
    [0, 120, 360, 900].forEach(function(delay){ setTimeout(polishPublishCopy, delay); });
  }

  function bindPublishLoginGate(){
    if(publishGateBound) return;
    publishGateBound = true;

    document.addEventListener('click', function(e){
      var open = e.target && e.target.closest && e.target.closest('[data-publish-open]');
      if(!open) return;
      var fw = app();
      if(fw && fw.state && fw.state.user) return;
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      currentUser().then(function(user){
        if(user && user.id){
          if(window.FWAppPublish && typeof window.FWAppPublish.open === 'function') window.FWAppPublish.open();
          return;
        }
        openLoginProfile();
      });
    }, true);

    document.addEventListener('submit', function(e){
      var form = e.target && e.target.closest && e.target.closest('[data-publish-form]');
      if(!form) return;
      var fw = app();
      if(fw && fw.state && fw.state.user) return;
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      currentUser().then(function(user){
        if(user && user.id){
          form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}));
          return;
        }
        openLoginProfile();
      });
    }, true);
  }

  function start(){
    injectPriorityStyle();
    bindReplyAction();
    bindPublishLoginGate();
    patchEchoWhenReady();
    scheduleBuddyInputPolish();
    schedulePublishCopyPolish();
    document.addEventListener('click', function(){ scheduleBuddyInputPolish(); schedulePublishCopyPolish(); }, true);
    document.addEventListener('visibilitychange', function(){ if(!document.hidden){ scheduleMerge(); refreshBadge(); } });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
