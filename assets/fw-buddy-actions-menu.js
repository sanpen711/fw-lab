// F.w 研究所：搭子中心三点菜单增强
// 作用：把“解除”从明显按钮收进右上角三点菜单，降低误点风险。
(function(){
  if(window.__FW_BUDDY_ACTIONS_MENU__) return;
  window.__FW_BUDDY_ACTIONS_MENU__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function toast(msg){
    let t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwBuddyMenuToast);
    window.__fwBuddyMenuToast = setTimeout(() => t.classList.remove('show'), 3000);
  }

  function tempClick(attr, value){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.display = 'none';
    btn.setAttribute(attr, value);
    document.body.appendChild(btn);
    btn.click();
    setTimeout(() => btn.remove(), 200);
  }

  function refreshBuddyList(){
    const active = document.querySelector('.fw-wx-tab.active[data-fw-wx-tab]');
    if(active){
      active.click();
      return;
    }
    document.querySelector('[data-fw-open-buddy]')?.click();
  }

  async function blockUser(userId){
    if(!userId) return;
    if(!window.confirm('确定要拉黑这个搭子吗？拉黑后将不能继续正常互动。')) return;
    try{
      const {error} = await window.fwDb.client.rpc('fw_block_user', {target_user_id:userId});
      if(error) throw error;
      toast('已拉黑。');
      refreshBuddyList();
    }catch(err){
      toast(err.message || '拉黑失败。');
    }
  }

  function injectStyle(){
    if($('#fw-buddy-actions-menu-style')) return;
    const style = document.createElement('style');
    style.id = 'fw-buddy-actions-menu-style';
    style.textContent = `
      .fw-wx-item.fw-wx-accepted-item{position:relative; padding-right:46px;}
      .fw-wx-item.fw-wx-accepted-item .fw-wx-actions .fw-wx-mini.danger[data-fw-wx-remove]{display:none!important;}
      .fw-wx-more-wrap{position:absolute; right:10px; top:10px; z-index:6;}
      .fw-wx-more-btn{width:30px;height:30px;border:1px solid rgba(28,28,24,.14);border-radius:999px;background:#fffdf7;color:#1d1d1a;font-size:20px;line-height:1;font-weight:1000;cursor:pointer;display:grid;place-items:center;padding:0 0 4px;}
      .fw-wx-more-btn:hover{border-color:rgba(217,121,121,.55);color:#9d4a4a;}
      .fw-wx-more-menu{display:none;position:absolute;right:0;top:36px;min-width:138px;background:#fffdf7;border:1px solid rgba(28,28,24,.16);box-shadow:0 14px 36px rgba(0,0,0,.16);padding:6px;border-radius:12px;}
      .fw-wx-more-wrap.open .fw-wx-more-menu{display:block;}
      .fw-wx-more-menu button{display:block;width:100%;height:34px;border:0;background:transparent;text-align:left;padding:0 10px;border-radius:8px;color:#1d1d1a;font-size:12px;font-weight:950;cursor:pointer;white-space:nowrap;}
      .fw-wx-more-menu button:hover{background:#f3efe6;}
      .fw-wx-more-menu button.danger{color:#b35353;}
      .fw-wx-more-menu .line{height:1px;background:rgba(28,28,24,.1);margin:5px 4px;}
    `;
    document.head.appendChild(style);
  }

  function isAcceptedItem(item){
    const sub = item.querySelector('.fw-wx-sub')?.textContent || '';
    return sub.includes('点击进入私聊') || sub.includes('已是搭子');
  }

  function enhanceOne(item){
    if(!item || item.dataset.fwMenuReady === '1') return;
    if(!item.matches('[data-fw-wx-chat-user]')) return;
    if(!isAcceptedItem(item)) return;

    const userId = item.dataset.fwWxChatUser;
    const removeBtn = item.querySelector('[data-fw-wx-remove]');
    const friendshipId = removeBtn ? removeBtn.dataset.fwWxRemove : '';

    item.classList.add('fw-wx-accepted-item');
    item.dataset.fwMenuReady = '1';

    const wrap = document.createElement('div');
    wrap.className = 'fw-wx-more-wrap';
    wrap.innerHTML = `
      <button class="fw-wx-more-btn" type="button" title="更多操作" aria-label="更多操作">…</button>
      <div class="fw-wx-more-menu">
        <button type="button" data-fw-menu-chat>打开私聊</button>
        <button type="button" data-fw-menu-profile>查看资料</button>
        <button type="button" data-fw-menu-mute>消息免打扰</button>
        <div class="line"></div>
        <button type="button" class="danger" data-fw-menu-block>拉黑</button>
        ${friendshipId ? `<button type="button" class="danger" data-fw-menu-remove="${friendshipId}">解除搭子</button>` : ''}
      </div>
    `;
    item.appendChild(wrap);

    const moreBtn = wrap.querySelector('.fw-wx-more-btn');
    moreBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      $$('.fw-wx-more-wrap.open').forEach(x => { if(x !== wrap) x.classList.remove('open'); });
      wrap.classList.toggle('open');
    });

    wrap.querySelector('[data-fw-menu-chat]')?.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.remove('open');
      item.click();
    });

    wrap.querySelector('[data-fw-menu-profile]')?.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.remove('open');
      tempClick('data-fw-profile-user', userId);
    });

    wrap.querySelector('[data-fw-menu-mute]')?.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.remove('open');
      toast('已先做成前端入口，后面可以接入“消息免打扰”数据库开关。');
    });

    wrap.querySelector('[data-fw-menu-block]')?.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.remove('open');
      blockUser(userId);
    });

    wrap.querySelector('[data-fw-menu-remove]')?.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.remove('open');
      if(!window.confirm('确定要解除这个搭子关系吗？')) return;
      tempClick('data-fw-wx-remove', friendshipId);
    });
  }

  function enhance(){
    $$('.fw-wx-item[data-fw-wx-chat-user]').forEach(enhanceOne);
  }

  function boot(){
    injectStyle();
    enhance();

    const observer = new MutationObserver(() => {
      clearTimeout(window.__fwBuddyMenuEnhanceTimer);
      window.__fwBuddyMenuEnhanceTimer = setTimeout(enhance, 80);
    });
    observer.observe(document.body, {childList:true, subtree:true});

    document.addEventListener('click', e => {
      if(!e.target.closest('.fw-wx-more-wrap')){
        $$('.fw-wx-more-wrap.open').forEach(x => x.classList.remove('open'));
      }
    }, true);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
