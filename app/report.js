// F.w 研究所：手机端统一举报桥接
// 作用：接管手机端帖子 / 评论 / 搭子举报入口，统一提交到 Supabase site_reports。
(function(){
  if(window.__FW_MOBILE_REPORT_BRIDGE__) return;
  window.__FW_MOBILE_REPORT_BRIDGE__ = true;

  var buddyReportTargetId = '';
  var buddyReportTargetName = '';

  function app(){ return window.FWApp || null; }
  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function toast(message){ var fw = app(); if(fw && fw.toast) fw.toast(message); else alert(message); }
  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function client(){ return window.fwDb && window.fwDb.client; }

  async function waitDb(){
    var fw = app();
    if(fw && fw.waitForDb) return await fw.waitForDb();
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      var n = 0;
      var timer = setInterval(function(){
        n += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(timer); resolve(true); }
        if(n > 80){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  async function requireUser(){
    var fw = app();
    if(fw && fw.state && fw.state.user) return fw.state.user;
    if(fw && fw.refreshUser){
      var user = await fw.refreshUser();
      if(user) return user;
    }
    if(window.fwDb && window.fwDb.getCurrentUser){
      try{ return await window.fwDb.getCurrentUser(); }catch(e){}
    }
    return null;
  }

  async function submitReport(targetType, targetId, defaultReason){
    targetId = String(targetId || '').trim();
    if(!targetType || !targetId){ toast('没有找到举报对象。'); return false; }
    if(!(await waitDb())){ toast('暂时无法连接数据服务。'); return false; }
    var user = await requireUser();
    if(!user){ toast('请先登录后再举报。'); if(app()) app().setView && app().setView('profile'); return false; }
    var hint = defaultReason ? '可写：' + defaultReason : '请简单说明原因';
    var reason = window.prompt('请输入举报原因（' + hint + '）：', '');
    if(reason === null) return false;
    reason = String(reason || '').trim();
    if(reason.length < 2){ toast('举报原因至少 2 个字。'); return false; }
    try{
      var c = client();
      if(!c) throw new Error('暂时无法连接数据服务。');
      var result = await c.rpc('fw_submit_report', {
        p_target_type:targetType,
        p_target_id:targetId,
        p_reason:reason
      });
      if(result && result.error) throw result.error;
      toast('举报已提交，管理员会在后台处理。');
      closeBuddySheet();
      closeCommentMenu();
      return true;
    }catch(e){
      console.warn('[FW mobile app] report submit failed', e);
      toast(e.message || '举报提交失败。');
      return false;
    }
  }

  function closeBuddySheet(){
    $$('.buddy-contact-menu-mask,.buddy-contact-menu').forEach(function(node){ node.classList.remove('show'); });
    buddyReportTargetId = '';
    buddyReportTargetName = '';
  }
  function closeCommentMenu(){
    $$('.comment-more-toggle.active').forEach(function(node){ node.classList.remove('active'); });
    $$('.comment-action-menu').forEach(function(node){ node.remove(); });
  }
  function findCommentId(node){
    var comment = node && node.closest && node.closest('[data-comment-id]');
    return comment && comment.dataset.commentId || '';
  }
  function findPostId(node){
    var post = node && node.closest && node.closest('[data-post-id]');
    return post && post.dataset.postId || '';
  }

  function injectStyle(){
    if($('#fwMobileReportStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileReportStyle';
    style.textContent = [
      '.post-tools .mobile-post-report{min-height:28px;border:0;border-radius:999px;background:rgba(157,74,74,.08);color:var(--accent-dark);font-size:12px;font-weight:1000;padding:0 9px}',
      '.post-tools .mobile-post-report:active{background:rgba(157,74,74,.16)}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function enhancePostReports(){
    if(!app() || !app().state || (app().state.view !== 'square' && app().state.view !== 'square-detail')) return;
    $$('[data-post-id]').forEach(function(card){
      if(card.dataset.fwMobileReportReady === '1') return;
      var postId = card.dataset.postId || '';
      if(!postId) return;
      var tools = $('.post-tools', card);
      if(!tools) return;
      if(!$('[data-mobile-post-report]', tools)){
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mobile-post-report';
        btn.dataset.mobilePostReport = postId;
        btn.textContent = '举报';
        tools.appendChild(btn);
      }
      card.dataset.fwMobileReportReady = '1';
    });
  }

  function enhanceAdminReportActions(){}

  function bind(){
    document.addEventListener('click', function(e){
      var more = e.target.closest && e.target.closest('[data-buddy-contact-more]');
      if(more){
        buddyReportTargetId = more.dataset.buddyContactMore || '';
        buddyReportTargetName = more.dataset.buddyContactName || '这个搭子';
      }

      var buddy = e.target.closest && e.target.closest('[data-buddy-contact-report]');
      if(buddy){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        submitReport('user', buddyReportTargetId, '搭子骚扰 / 不适当内容 / 其他');
        return;
      }

      var comment = e.target.closest && e.target.closest('[data-comment-report]');
      if(comment){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        submitReport('comment', comment.dataset.commentId || findCommentId(comment), '评论内容不适当 / 骚扰 / 攻击他人 / 其他');
        return;
      }

      var post = e.target.closest && e.target.closest('[data-mobile-post-report]');
      if(post){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        submitReport('post', post.dataset.mobilePostReport || findPostId(post), '帖子内容不适当 / 隐私泄露 / 攻击他人 / 其他');
      }
    }, true);

    var timer = 0;
    if(window.MutationObserver){
      var observer = new MutationObserver(function(){
        clearTimeout(timer);
        timer = setTimeout(enhancePostReports, 120);
      });
      observer.observe(document.body, {childList:true, subtree:true});
    }
    document.addEventListener('click', function(){
      setTimeout(enhancePostReports, 90);
    });
    setInterval(enhancePostReports, 1600);
  }

  function boot(){
    injectStyle();
    bind();
    enhancePostReports();
    window.FWAppReport = {
      submit:submitReport,
      enhancePostReports:enhancePostReports,
      enhanceAdminReportActions:enhanceAdminReportActions
    };
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
