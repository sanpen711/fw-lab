(()=>{
  if(window.__FW_UPDATE_RENDER__)return;
  const style=document.createElement('style');
  style.textContent=`
  #fw-update-overlay{position:fixed;z-index:2147483000;inset:0;display:none;align-items:end;justify-items:end;padding:20px;pointer-events:none}
  #fw-update-overlay.show{display:grid}
  #fw-update-card{box-sizing:border-box;width:min(390px,calc(100vw - 40px));max-height:calc(100vh - 40px);overflow:auto;padding:20px;border:1px solid #e4dfe0;border-radius:16px;background:#fff;color:#252326;box-shadow:0 12px 44px #24202424;font-family:"Microsoft YaHei UI","PingFang SC",system-ui,sans-serif;pointer-events:auto}
  #fw-update-card h2{margin:0;font-size:17px}#fw-update-card p{margin:9px 0 0;color:#716970;font-size:12px;line-height:1.7}
  #fw-update-track{height:7px;margin:18px 0 10px;overflow:hidden;border-radius:99px;background:#eee9eb}
  #fw-update-bar{height:100%;width:8%;border-radius:inherit;background:#d97989;transition:width .18s ease}
  #fw-update-bar.indeterminate{width:32%;animation:fwUpdateSlide 1.1s ease-in-out infinite}
  @keyframes fwUpdateSlide{0%{transform:translateX(-110%)}100%{transform:translateX(330%)}}
  #fw-update-meta{display:flex;justify-content:space-between;gap:12px;color:#716970;font-size:11px}
  #fw-update-error{display:none;margin-top:12px;color:#964e62;font-size:12px;line-height:1.6}
  #fw-update-overlay.error #fw-update-error{display:block}
  #fw-update-card button{margin:15px 8px 0 0;padding:8px 13px;border:1px solid #e1d9de;border-radius:9px;background:#fff;color:#282127;font-family:inherit;font-size:12px;cursor:pointer}
  #fw-update-install,#fw-update-retry{background:#ffe4ea!important}
  #fw-update-install,#fw-update-retry{display:none}
  #fw-update-overlay.ready #fw-update-install,#fw-update-overlay.error #fw-update-retry{display:inline-block}
  #fw-update-overlay.ready #fw-update-track,#fw-update-overlay.ready #fw-update-meta,#fw-update-overlay.error #fw-update-track,#fw-update-overlay.error #fw-update-meta{display:none}
  #fw-update-overlay.installing{place-items:center;pointer-events:auto;background:#25202550}
  #fw-update-overlay.installing #fw-update-close{display:none}
  #fw-update-card button:focus-visible{outline:2px solid #b14b6c;outline-offset:3px}
  @media(prefers-reduced-motion:reduce){#fw-update-bar{transition:none}#fw-update-bar.indeterminate{animation:none}}`;
  document.head.append(style);
  const overlay=document.createElement('div');overlay.id='fw-update-overlay';
  overlay.innerHTML=`<section id="fw-update-card" role="dialog" aria-modal="false" aria-labelledby="fw-update-title"><h2 id="fw-update-title">正在准备更新…</h2><p id="fw-update-detail" role="status" aria-live="polite"></p><div id="fw-update-track"><div id="fw-update-bar" class="indeterminate"></div></div><div id="fw-update-meta"><span id="fw-update-bytes"></span><span id="fw-update-speed"></span></div><div id="fw-update-error">当前版本可继续使用，也可以稍后重新检查更新。</div><button id="fw-update-install" type="button">重启安装</button><button id="fw-update-retry" type="button">重新尝试</button><button id="fw-update-close" type="button">收起</button></section>`;
  document.body.append(overlay);
  let dismissed=false,lastState=null,returnFocus=null,installLocked=false,appWasInert=false;
  const $=selector=>overlay.querySelector(selector);
  $('#fw-update-close').addEventListener('click',()=>{dismissed=true;overlay.classList.remove('show');returnFocus?.focus?.({preventScroll:true});});
  $('#fw-update-retry').addEventListener('click',async()=>{
    const button=$('#fw-update-retry');if(button.disabled)return;button.disabled=true;dismissed=false;
    try{const result=await window.__TAURI__.core.invoke('desktop_check_for_updates');if(result?.status==='latest'||result?.status==='available')overlay.classList.remove('show');}
    catch{window.__FW_UPDATE_RENDER__({phase:'error',title:'暂时无法检查更新',detail:'更新服务暂时无法连接，请稍后重试。当前版本可以继续使用。'});}
    finally{button.disabled=false;}
  });
  $('#fw-update-install').addEventListener('click',async()=>{
    const button=$('#fw-update-install');if(button.disabled)return;button.disabled=true;
    try{await window.__FW_FLUSH_DRAFTS__?.();await window.__TAURI__.core.invoke('desktop_install_ready_update');}
    catch{window.__FW_UPDATE_RENDER__({phase:'error',title:'更新暂未完成',detail:'请稍后重新检查更新。当前版本可以继续使用。'});}
    finally{button.disabled=false;}
  });
  const fmt=n=>{const v=Number(n||0);return v>=1048576?`${(v/1048576).toFixed(1)} MB`:v>=1024?`${(v/1024).toFixed(0)} KB`:`${v} B`;};
  window.__FW_UPDATE_REOPEN__=()=>{if(lastState){dismissed=false;overlay.classList.add('show');}};
  window.__FW_UPDATE_RENDER__=state=>{
    const changedPhase=lastState?.phase!==state.phase;lastState=state;
    const important=['ready','error','installing'].includes(state.phase);if(important&&changedPhase)dismissed=false;
    if(!dismissed){if(!overlay.classList.contains('show'))returnFocus=document.activeElement;overlay.classList.add('show');}
    overlay.classList.toggle('error',state.phase==='error');overlay.classList.toggle('ready',state.phase==='ready');overlay.classList.toggle('installing',state.phase==='installing');
    $('#fw-update-card').setAttribute('aria-modal',String(state.phase==='installing'));
    $('#fw-update-title').textContent=state.title||'正在更新…';$('#fw-update-detail').textContent=state.detail||'';
    $('#fw-update-close').textContent=state.phase==='error'?'关闭':state.phase==='ready'?'稍后':'收起';
    const bar=$('#fw-update-bar');bar.classList.toggle('indeterminate',!Number.isFinite(state.percent));bar.style.width=Number.isFinite(state.percent)?`${Math.max(0,Math.min(100,state.percent))}%`:'32%';
    const total=Number(state.total||0),down=Number(state.downloaded||0),speed=Number(state.speedBps||0);
    $('#fw-update-bytes').textContent=total?`${fmt(down)} / ${fmt(total)}`:down?fmt(down):'正在连接…';$('#fw-update-speed').textContent=speed?`${fmt(speed)}/s`:'';
    if(state.phase==='installing'){if(!installLocked){appWasInert=Boolean(document.querySelector('#app')?.inert);installLocked=true;}document.querySelector('#app')?.setAttribute('inert','');$('#fw-update-card').setAttribute('tabindex','-1');$('#fw-update-card').focus();}
    else if(installLocked){if(!appWasInert)document.querySelector('#app')?.removeAttribute('inert');installLocked=false;}
    window.dispatchEvent(new CustomEvent('fw:update-status',{detail:{phase:state.phase,title:state.title}}));
  };
})();
