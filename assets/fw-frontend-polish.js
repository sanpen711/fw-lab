// F.w 研究所：全站前台收口补丁（轻量版）
// 之前版本会监听全站 DOM 变化并频繁刷新红点，容易造成点击卡顿。
// 当前版本只保留必要交互：发帖按钮状态、ESC 关闭、少量层级兜底。
(function(){
  if(window.__FW_FRONTEND_POLISH__) return;
  window.__FW_FRONTEND_POLISH__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function fixLayering(){
    const auth = $('[data-sb-auth].show, .sb-auth.show, .auth-modal.show');
    if(auth) auth.style.zIndex = '10200';
    $$('.fw-wx-modal.show').forEach(m => m.style.zIndex = '10080');
    $$('.fw-social-modal.show, [data-fw-social-modal].show, [data-fw-private-modal].show').forEach(m => {
      m.style.zIndex = '10120';
    });
  }

  function patchPostSubmitButtons(){
    document.addEventListener('submit', e => {
      const form = e.target.closest('[data-post-form]');
      if(!form) return;
      const btn = form.querySelector('button[type="submit"]');
      if(!btn || btn.dataset.fwSubmitting === '1') return;
      const old = btn.dataset.oldText || btn.textContent;
      btn.dataset.oldText = old;
      btn.dataset.fwSubmitting = '1';
      btn.disabled = true;
      btn.textContent = '发布中...';
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = old;
        btn.dataset.fwSubmitting = '0';
      }, 900);
    }, true);
  }

  function closeMenusOnEsc(){
    document.addEventListener('keydown', e => {
      if(e.key !== 'Escape') return;
      $$('.fw-wx-more-wrap.open').forEach(x => x.classList.remove('open'));
      const stableEcho = $('[data-fw-stable-echo-modal].show');
      if(stableEcho){ stableEcho.classList.remove('show'); return; }
      const topModal = $$('.fw-social-modal.show, .fw-wx-modal.show').pop();
      const close = topModal?.querySelector('.fw-social-close, .fw-wx-close, [data-fw-dual-close]');
      if(close) close.click();
    });
  }

  function bindLightRefresh(){
    document.addEventListener('click', e => {
      if(e.target.closest('[data-fw-open-echo], [data-fw-open-buddy], [data-fw-menu-profile], [data-fw-wx-tab]')){
        requestAnimationFrame(fixLayering);
      }
    }, true);
  }

  function boot(){
    patchPostSubmitButtons();
    closeMenusOnEsc();
    bindLightRefresh();
    fixLayering();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
