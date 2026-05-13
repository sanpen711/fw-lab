// F.w 研究所：后台试运营增强
// 作用：
// 1. 给后台增加处理原因模板提示。
// 2. 兼容用户举报 user_reports 的处理闭环。
// 3. 给举报列表补充“用户举报 / 房间消息举报”识别。
(function(){
  if(window.__FW_ADMIN_POLISH__) return;
  window.__FW_ADMIN_POLISH__ = true;

  var reportKindMap = {};

  var templates = [
    '恶意攻击他人',
    '重复刷屏影响交流',
    '发布不适当内容',
    '涉嫌违法违规内容',
    '引战 / 骚扰他人',
    '举报属实，已处理',
    '举报信息不足，暂不处理',
    '其他违反研究所公约的行为'
  ];

  function $(s){
    return document.querySelector(s);
  }

  function $$(s){
    return Array.from(document.querySelectorAll(s));
  }

  function toast(msg){
    var t = $('.trial-toast') || $('.fw-toast');

    if(!t){
      t = document.createElement('div');
      t.className = 'trial-toast';
      document.body.appendChild(t);
    }

    t.textContent = msg;
    t.classList.add('show');

    clearTimeout(window.__fwAdminPolishToast);
    window.__fwAdminPolishToast = setTimeout(function(){
      t.classList.remove('show');
    }, 2600);
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

  function reasonPicker(defaultText){
    var text = '请选择或填写处理原因：\n\n';

    templates.forEach(function(t, i){
      text += (i + 1) + '. ' + t + '\n';
    });

    text += '\n输入数字可快速选择模板，也可以直接输入自定义原因。';

    var r = window.prompt(text, defaultText || '违反研究所公约');

    if(r === null) return null;

    r = String(r || '').trim();

    if(/^[1-8]$/.test(r)){
      return templates[Number(r) - 1];
    }

    return r || defaultText || '违反研究所公约';
  }

  function askPublic(){
    return window.confirm('是否公开到“公开处刑”公告栏？\n确定 = 公开；取消 = 仅管理员后台记录');
  }

  async function rpc(name, args){
    var res = await window.fwDb.client.rpc(name, args);
    if(res.error) throw res.error;
    return res.data;
  }

  async function refreshReportsMap(){
    var ok = await waitDb();

    if(!ok) return;

    try{
      var res = await window.fwDb.client.rpc('admin_list_chat_reports');

      if(res.error) throw res.error;

      reportKindMap = {};

      (res.data || []).forEach(function(r){
        reportKindMap[String(r.id)] = r.report_kind || 'chat_message';
      });
    }catch(e){
      console.warn('[FW admin polish] reports map failed', e);
    }
  }

  function decorateReportRows(){
    var rows = $$('[data-report-act]');

    rows.forEach(function(btn){
      var id = String(btn.dataset.id || '');
      var kind = reportKindMap[id] || '';

      if(kind){
        btn.dataset.reportKind = kind;
      }

      var row = btn.closest('.trial-row');

      if(row && kind && !row.querySelector('[data-report-kind-badge]')){
        var badge = document.createElement('span');
        badge.dataset.reportKindBadge = '1';
        badge.className = 'trial-chip soft';
        badge.textContent = kind === 'user' ? '用户举报' : '房间消息举报';
        badge.style.marginLeft = '8px';

        var main = row.querySelector('.trial-row-main b');

        if(main){
          main.appendChild(badge);
        }
      }
    });
  }

  function injectTemplateBox(){
    var panel = $('[data-admin-panel]');

    if(!panel || $('#fw-admin-template-box')) return;

    var box = document.createElement('div');
    box.id = 'fw-admin-template-box';
    box.className = 'trial-public-card';
    box.style.marginBottom = '18px';

    box.innerHTML = `
      <div class="trial-card-head">
        <div>
          <h2 style="font-size:22px;margin:0">处理原因模板</h2>
          <p style="margin:6px 0 0;color:#77736b;font-weight:800">后台处理时可输入数字快速选择模板。</p>
        </div>
        <span class="trial-badge">管理员可见</span>
      </div>
      <div class="trial-list" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
        ${templates.map(function(t, i){
          return `<button type="button" class="trial-chip soft" data-fw-copy-reason="${i + 1}. ${t}">${i + 1}. ${t}</button>`;
        }).join('')}
      </div>
    `;

    var body = $('[data-admin-body]');

    if(body && body.parentNode){
      body.parentNode.insertBefore(box, body);
    }else{
      panel.prepend(box);
    }
  }

  function patchPrompt(){
    if(window.__FW_ADMIN_REASON_PROMPT_PATCHED__) return;
    window.__FW_ADMIN_REASON_PROMPT_PATCHED__ = true;

    var oldPrompt = window.prompt;

    window.prompt = function(message, defaultValue){
      if(String(message || '').includes('填写公开处刑原因')){
        return reasonPicker(defaultValue);
      }

      return oldPrompt.apply(window, arguments);
    };
  }

  function handleCopy(e){
    var btn = e.target.closest && e.target.closest('[data-fw-copy-reason]');

    if(!btn) return;

    var text = btn.dataset.fwCopyReason || '';

    try{
      navigator.clipboard.writeText(text.replace(/^\d+\.\s*/, ''));
      toast('模板已复制。');
    }catch(err){
      toast(text);
    }
  }

  async function handleReportAction(e){
    var btn = e.target.closest && e.target.closest('[data-report-act]');

    if(!btn) return;

    var kind = btn.dataset.reportKind || reportKindMap[String(btn.dataset.id)] || 'chat_message';

    if(kind !== 'user') return;

    e.preventDefault();
    e.stopPropagation();

    if(e.stopImmediatePropagation){
      e.stopImmediatePropagation();
    }

    try{
      var status = btn.dataset.reportAct || 'resolved';
      var reason = reasonPicker(status === 'resolved' ? '举报已处理' : '举报已忽略');

      if(reason === null) return;

      await rpc('admin_resolve_chat_report', {
        p_report_id:Number(btn.dataset.id),
        p_status:status,
        p_reason:reason,
        p_public_visible:askPublic(),
        p_report_kind:'user'
      });

      toast('用户举报状态已更新。');

      var active = document.querySelector('.trial-tab.active[data-admin-tab]');

      if(active){
        active.click();
      }
    }catch(err){
      toast(err.message || '处理失败。');
    }
  }

  function observe(){
    var observer = new MutationObserver(function(){
      clearTimeout(window.__fwAdminPolishTimer);
      window.__fwAdminPolishTimer = setTimeout(function(){
        injectTemplateBox();
        decorateReportRows();
      }, 80);
    });

    observer.observe(document.body, {
      childList:true,
      subtree:true
    });
  }

  async function boot(){
    patchPrompt();
    injectTemplateBox();
    await refreshReportsMap();
    decorateReportRows();
    observe();

    document.addEventListener('click', handleCopy, true);
    document.addEventListener('click', handleReportAction, true);

    document.addEventListener('click', function(e){
      if(e.target.closest('[data-admin-tab="reports"]') || e.target.closest('[data-admin-refresh]')){
        setTimeout(async function(){
          await refreshReportsMap();
          decorateReportRows();
        }, 500);
      }
    }, true);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }else{
    boot();
  }
})();
