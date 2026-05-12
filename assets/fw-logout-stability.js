// F.w 研究所：退出登录稳定补丁
// 解决：Supabase signOut 偶发卡住，按钮一直显示“正在退出...”。
(function(){
  if(window.__FW_LOGOUT_STABILITY__) return;
  window.__FW_LOGOUT_STABILITY__ = true;

  function toast(msg){
    let t = document.querySelector('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwLogoutToast);
    window.__fwLogoutToast = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function setBtn(btn, loading){
    if(!btn) return;
    if(loading){
      btn.dataset.fwLogoutOldText = btn.dataset.fwLogoutOldText || btn.textContent || '退出登录';
      btn.textContent = '正在退出...';
      btn.disabled = true;
    }else{
      btn.textContent = btn.dataset.fwLogoutOldText || '退出登录';
      btn.disabled = false;
    }
  }

  function withTimeout(promise, ms){
    return Promise.race([
      promise,
      new Promise(resolve => setTimeout(resolve, ms || 3500))
    ]);
  }

  async function safeLogout(btn){
    setBtn(btn, true);
    toast('正在退出...');

    try{
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
        await withTimeout(window.fwDb.client.auth.signOut(), 3500);
      }
    }catch(e){}

    try{
      sessionStorage.removeItem('fw_register_state');
      localStorage.removeItem('supabase.auth.token');
    }catch(e){}

    setTimeout(() => {
      window.location.replace(window.location.href.split('#')[0]);
    }, 180);
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-sb-logout]');
    if(!btn) return;

    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();

    if(btn.dataset.fwLogoutRunning === '1') return;
    btn.dataset.fwLogoutRunning = '1';
    safeLogout(btn);
  }, true);
})();
