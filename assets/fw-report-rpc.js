// F.w 研究所：用户举报入库补丁
// 作用：把搭子三点菜单里的“举报”从 localStorage 改成写入 Supabase user_reports。
(function(){
  if(window.__FW_REPORT_RPC__) return;
  window.__FW_REPORT_RPC__ = true;

  function $(s){
    return document.querySelector(s);
  }

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
    window.__fwReportRpcToast = setTimeout(function(){
      t.classList.remove('show');
    }, 2800);
  }

  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
        resolve(true);
        return;
      }

      var n = 0;
      var timer = setInterval(function(){
        n += 1;

        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
          clearInterval(timer);
          resolve(true);
        }

        if(n > 80){
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  async function reportUser(userId){
    var ok = await waitDb();

    if(!ok){
      toast('数据库连接未就绪，请稍后再试。');
      return;
    }

    if(!userId){
      toast('没有找到被举报用户。');
      return;
    }

    var reason = window.prompt('请输入举报原因：', '不适当内容 / 骚扰 / 恶意攻击 / 其他');

    if(reason === null) return;

    reason = String(reason || '').trim();

    if(reason.length < 2){
      toast('举报原因至少 2 个字。');
      return;
    }

    try{
      var res = await window.fwDb.client.rpc('fw_report_user', {
        target_user_id:userId,
        report_reason:reason
      });

      if(res.error) throw res.error;

      toast('举报已提交，管理员会在后台处理。');
    }catch(e){
      toast(e.message || '举报提交失败。');
    }
  }

  function intercept(e){
    var btn = e.target.closest && e.target.closest('[data-fw-menu-report]');

    if(!btn) return;

    var item = btn.closest('[data-fw-wx-chat-user]');

    if(!item) return;

    var userId = item.dataset.fwWxChatUser;

    e.preventDefault();
    e.stopPropagation();

    if(e.stopImmediatePropagation){
      e.stopImmediatePropagation();
    }

    reportUser(userId);
  }

  window.addEventListener('click', intercept, true);
})();
