(()=>{
  if(window.__FW_ADMIN_UPDATE_RENDER__)return;
  const style=document.createElement('style');
  style.textContent=`
  #fw-admin-update-overlay{position:fixed;z-index:2147483000;inset:0;display:none;place-items:center;padding:24px;background:rgba(20,23,28,.38);backdrop-filter:blur(4px)}
  #fw-admin-update-overlay.show{display:grid}
  #fw-admin-update-card{width:min(520px,calc(100vw - 48px));padding:26px;border:1px solid #dfe2e7;border-radius:16px;background:#fff;color:#202328;box-shadow:0 28px 80px rgba(20,23,28,.25);font-family:"Microsoft YaHei UI","PingFang SC",system-ui,sans-serif}
  #fw-admin-update-card h2{margin:0;font-size:21px}#fw-admin-update-card p{margin:9px 0 0;color:#737880;font-size:13px;line-height:1.7}
  #fw-admin-update-track{height:9px;margin:22px 0 10px;overflow:hidden;border-radius:999px;background:#e8eaed}
  #fw-admin-update-bar{height:100%;width:8%;border-radius:inherit;background:#272a2f;transition:width .18s ease}
  #fw-admin-update-bar.indeterminate{width:32%;animation:fwAdminUpdateSlide 1.1s ease-in-out infinite}
  @keyframes fwAdminUpdateSlide{0%{transform:translateX(-110%)}100%{transform:translateX(330%)}}
  #fw-admin-update-meta{display:flex;justify-content:space-between;gap:12px;color:#737880;font-size:11px;font-weight:800}
  #fw-admin-update-error{display:none;margin-top:17px;padding:11px 13px;border-radius:10px;background:#fff0ed;color:#944c4c;font-size:12px;line-height:1.6}
  #fw-admin-update-overlay.error #fw-admin-update-error{display:block}
  #fw-admin-update-close{display:none;margin-top:16px;padding:9px 14px;border:1px solid #dfe2e7;border-radius:9px;background:#fff;color:#202328;font:800 12px inherit;cursor:pointer}
  #fw-admin-update-overlay.error #fw-admin-update-close{display:inline-block}`;
  document.head.appendChild(style);
  const overlay=document.createElement('div');
  overlay.id='fw-admin-update-overlay';
  overlay.innerHTML=`<section id="fw-admin-update-card" role="dialog" aria-modal="true" aria-live="polite"><h2 id="fw-admin-update-title">正在准备更新…</h2><p id="fw-admin-update-detail">请稍候</p><div id="fw-admin-update-track"><div id="fw-admin-update-bar" class="indeterminate"></div></div><div id="fw-admin-update-meta"><span id="fw-admin-update-bytes">正在连接…</span><span id="fw-admin-update-speed"></span></div><div id="fw-admin-update-error">自动更新失败不会影响当前版本，可以重新尝试。</div><button id="fw-admin-update-close" type="button">关闭</button></section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#fw-admin-update-close').addEventListener('click',()=>overlay.classList.remove('show'));
  const fmt=n=>{const v=Number(n||0);if(v>=1048576)return`${(v/1048576).toFixed(1)} MB`;if(v>=1024)return`${(v/1024).toFixed(0)} KB`;return`${v} B`};
  window.__FW_ADMIN_UPDATE_RENDER__=state=>{
    overlay.classList.add('show');
    overlay.classList.toggle('error',state.phase==='error');
    overlay.querySelector('#fw-admin-update-title').textContent=state.title||'正在更新…';
    overlay.querySelector('#fw-admin-update-detail').textContent=state.detail||'';
    const bar=overlay.querySelector('#fw-admin-update-bar');
    if(Number.isFinite(state.percent)){bar.classList.remove('indeterminate');bar.style.width=`${Math.max(0,Math.min(100,state.percent))}%`;}
    else{bar.classList.add('indeterminate');bar.style.width='32%';}
    const total=Number(state.total||0),down=Number(state.downloaded||0),speed=Number(state.speedBps||0);
    overlay.querySelector('#fw-admin-update-bytes').textContent=total?`${fmt(down)} / ${fmt(total)}`:(down?fmt(down):'正在连接…');
    overlay.querySelector('#fw-admin-update-speed').textContent=speed?`${fmt(speed)}/s`:'';
  };
})();
