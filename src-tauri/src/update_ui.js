(()=>{
  if(window.__FW_UPDATE_RENDER__) return;
  const style=document.createElement('style');
  style.textContent=`
  #fw-update-overlay{position:fixed;z-index:2147483000;inset:0;display:none;place-items:center;padding:24px;background:rgba(15,15,14,.42);backdrop-filter:blur(4px)}
  #fw-update-overlay.show{display:grid}
  #fw-update-card{width:min(520px,calc(100vw - 48px));padding:26px;border:1px solid rgba(27,27,24,.13);border-radius:20px;background:#fffdf7;color:#1b1b18;box-shadow:0 28px 80px rgba(15,15,14,.25);font-family:"Microsoft YaHei UI","PingFang SC",system-ui,sans-serif}
  #fw-update-card h2{margin:0;font-size:22px}#fw-update-card p{margin:9px 0 0;color:#756f64;font-size:13px;line-height:1.7}
  #fw-update-track{height:10px;margin:22px 0 10px;overflow:hidden;border-radius:999px;background:#e8e1d6}
  #fw-update-bar{height:100%;width:8%;border-radius:inherit;background:#d97979;transition:width .18s ease}
  #fw-update-bar.indeterminate{width:32%;animation:fwUpdateSlide 1.1s ease-in-out infinite}
  @keyframes fwUpdateSlide{0%{transform:translateX(-110%)}100%{transform:translateX(330%)}}
  #fw-update-meta{display:flex;justify-content:space-between;gap:12px;color:#756f64;font-size:11px;font-weight:800}
  #fw-update-error{display:none;margin-top:17px;padding:11px 13px;border-radius:12px;background:#fff0ed;color:#944c4c;font-size:12px;line-height:1.6}
  #fw-update-overlay.error #fw-update-error{display:block}
  #fw-update-close{display:none;margin-top:16px;padding:9px 14px;border:1px solid rgba(27,27,24,.14);border-radius:999px;background:#fffdf7;color:#1b1b18;font:800 12px inherit;cursor:pointer}
  #fw-update-overlay.error #fw-update-close{display:inline-block}`;
  document.head.appendChild(style);
  const overlay=document.createElement('div');
  overlay.id='fw-update-overlay';
  overlay.innerHTML=`<section id="fw-update-card" role="dialog" aria-modal="true" aria-live="polite"><h2 id="fw-update-title">正在准备更新…</h2><p id="fw-update-detail">请稍候</p><div id="fw-update-track"><div id="fw-update-bar" class="indeterminate"></div></div><div id="fw-update-meta"><span id="fw-update-bytes">正在连接…</span><span id="fw-update-speed"></span></div><div id="fw-update-error">自动更新失败时不会影响当前版本。可重新尝试；如果仍失败，请从官网手动下载最新版。</div><button id="fw-update-close" type="button">关闭</button></section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#fw-update-close').addEventListener('click',()=>overlay.classList.remove('show'));
  const fmt=n=>{const v=Number(n||0);if(v>=1048576)return`${(v/1048576).toFixed(1)} MB`;if(v>=1024)return`${(v/1024).toFixed(0)} KB`;return`${v} B`};
  window.__FW_UPDATE_RENDER__=state=>{
    overlay.classList.add('show');
    overlay.classList.toggle('error',state.phase==='error');
    overlay.querySelector('#fw-update-title').textContent=state.title||'正在更新…';
    overlay.querySelector('#fw-update-detail').textContent=state.detail||'';
    const bar=overlay.querySelector('#fw-update-bar');
    if(Number.isFinite(state.percent)){
      bar.classList.remove('indeterminate');bar.style.width=`${Math.max(0,Math.min(100,state.percent))}%`;
    }else{bar.classList.add('indeterminate');bar.style.width='32%';}
    const total=Number(state.total||0),down=Number(state.downloaded||0),speed=Number(state.speedBps||0);
    overlay.querySelector('#fw-update-bytes').textContent=total?`${fmt(down)} / ${fmt(total)}`:(down?fmt(down):'正在连接…');
    overlay.querySelector('#fw-update-speed').textContent=speed?`${fmt(speed)}/s`:'';
  };
})();
