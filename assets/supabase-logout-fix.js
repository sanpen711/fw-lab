// F.w 研究所：退出登录兜底补丁
(function(){
  function toast(msg){
    let t=document.querySelector('.fw-toast');
    if(!t){
      t=document.createElement('div');
      t.className='fw-toast';
      document.body.appendChild(t);
    }
    t.textContent=msg;
    t.classList.add('show');
    clearTimeout(window.__fwLogoutToast);
    window.__fwLogoutToast=setTimeout(()=>t.classList.remove('show'),2600);
  }

  async function doLogout(btn){
    if(!window.fwDb || !window.fwDb.enabled){
      toast('数据库连接未就绪，请刷新后再试。');
      return;
    }
    const old=btn ? btn.textContent : '';
    try{
      if(btn){
        btn.textContent='退出中...';
        btn.disabled=true;
        btn.style.opacity='.65';
      }
      await window.fwDb.signOut();
      document.querySelector('[data-sb-auth]')?.classList.remove('show');
      document.querySelectorAll('[data-fw-current]').forEach(x=>x.textContent='注册 / 登录');
      document.querySelectorAll('[data-fw-avatar-slot]').forEach(x=>x.innerHTML='');
      toast('已退出登录。');
      setTimeout(()=>window.location.reload(),450);
    }catch(e){
      toast(e.message || '退出失败，请刷新后再试。');
    }finally{
      if(btn){
        btn.textContent=old || '退出登录';
        btn.disabled=false;
        btn.style.opacity='';
      }
    }
  }

  document.addEventListener('click',function(e){
    const btn=e.target.closest('[data-sb-logout]');
    if(!btn) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    doLogout(btn);
  },true);
})();
