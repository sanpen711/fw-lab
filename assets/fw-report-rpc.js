// F.w 研究所：统一举报桥接
// 作用：电脑端搭子 / 广场帖子 / 评论举报统一写入 Supabase site_reports。
(function(){
  if(window.__FW_REPORT_RPC__) return;
  window.__FW_REPORT_RPC__ = true;

  function $(s, root){ return (root || document).querySelector(s); }
  function $$(s, root){ return Array.prototype.slice.call((root || document).querySelectorAll(s)); }

  function toast(msg){
    var t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwReportRpcToast);
    window.__fwReportRpcToast = setTimeout(function(){ t.classList.remove('show'); }, 2800);
  }

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function waitDb(){
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

  async function ensureUser(){
    var ok = await waitDb();
    if(!ok){ toast('数据库连接未就绪，请稍后再试。'); return null; }
    try{
      var me = await window.fwDb.getCurrentUser();
      if(!me){ toast('请先登录后再举报。'); return null; }
      return me;
    }catch(e){
      toast('请先登录后再举报。');
      return null;
    }
  }

  async function submitReport(targetType, targetId, defaultReason){
    targetId = String(targetId || '').trim();
    if(!targetType || !targetId){ toast('没有找到举报对象。'); return; }
    var me = await ensureUser();
    if(!me) return;

    var reason = window.prompt('请输入举报原因：', defaultReason || '不适当内容 / 骚扰 / 恶意攻击 / 其他');
    if(reason === null) return;
    reason = String(reason || '').trim();
    if(reason.length < 2){ toast('举报原因至少 2 个字。'); return; }

    try{
      var res;
      if(window.fwDb.client && window.fwDb.client.rpc){
        res = await window.fwDb.client.rpc('fw_submit_report', {
          p_target_type:targetType,
          p_target_id:targetId,
          p_reason:reason
        });
      }
      if(res && res.error) throw res.error;
      toast('举报已提交，管理员会在后台处理。');
    }catch(e){
      toast(e.message || '举报提交失败。');
    }
  }

  function cardPostId(node){
    var card = node && node.closest && node.closest('[data-id], [data-post-id]');
    return card && (card.dataset.id || card.dataset.postId) || '';
  }

  function commentId(node){
    var row = node && node.closest && node.closest('[data-comment-id]');
    return row && row.dataset.commentId || '';
  }

  function ensureSquareReportButtons(){
    if(!document.querySelector('[data-feed]')) return;
    $$('.post-card').forEach(function(card){
      if(card.dataset.fwReportReady === '1') return;
      var postId = card.dataset.id || card.dataset.postId || '';
      if(!postId) return;
      var actions = $('.interactions', card) || $('.post-actions', card);
      if(!actions) return;
      if(!$('[data-fw-report-post]', actions)){
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fw-report-mini';
        btn.dataset.fwReportPost = postId;
        btn.textContent = '举报';
        actions.appendChild(btn);
      }
      card.dataset.fwReportReady = '1';
    });

    $$('[data-comment-id]').forEach(function(row){
      if(row.dataset.fwCommentReportReady === '1') return;
      var id = row.dataset.commentId || '';
      if(!id) return;
      var holder = row.querySelector('div') || row;
      if(!$('[data-fw-report-comment]', holder)){
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fw-square-reply-action fw-report-comment';
        btn.dataset.fwReportComment = id;
        btn.textContent = '举报';
        holder.appendChild(btn);
      }
      row.dataset.fwCommentReportReady = '1';
    });
  }

  function injectStyle(){
    if($('#fwReportRpcStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwReportRpcStyle';
    style.textContent = [
      '.fw-report-mini{margin-left:8px;border:0;background:transparent;color:#9d4a4a;font-size:12px;font-weight:900;cursor:pointer;padding:4px 6px}',
      '.fw-report-mini:hover,.fw-report-comment:hover{color:#7d3434}',
      '.fw-report-comment{margin-left:8px;color:#9d4a4a}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function observeSquare(){
    if(!window.MutationObserver) return;
    var timer = 0;
    var obs = new MutationObserver(function(){
      clearTimeout(timer);
      timer = setTimeout(ensureSquareReportButtons, 120);
    });
    obs.observe(document.body, {childList:true, subtree:true});
  }

  function intercept(e){
    var buddyBtn = e.target.closest && e.target.closest('[data-fw-menu-report]');
    if(buddyBtn){
      var item = buddyBtn.closest('[data-fw-wx-chat-user]');
      var userId = item && item.dataset.fwWxChatUser;
      if(!userId) return;
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      submitReport('user', userId, '搭子骚扰 / 不适当内容 / 其他');
      return;
    }

    var postBtn = e.target.closest && e.target.closest('[data-fw-report-post]');
    if(postBtn){
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      submitReport('post', postBtn.dataset.fwReportPost || cardPostId(postBtn), '帖子内容不适当 / 隐私泄露 / 攻击他人 / 其他');
      return;
    }

    var commentBtn = e.target.closest && e.target.closest('[data-fw-report-comment]');
    if(commentBtn){
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      submitReport('comment', commentBtn.dataset.fwReportComment || commentId(commentBtn), '评论内容不适当 / 骚扰 / 攻击他人 / 其他');
    }
  }

  function boot(){
    injectStyle();
    ensureSquareReportButtons();
    observeSquare();
    window.addEventListener('click', intercept, true);
    setInterval(ensureSquareReportButtons, 1800);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();