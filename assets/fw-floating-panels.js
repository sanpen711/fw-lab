// F.w 研究所：回声 / 搭子 / 私聊浮动面板增强 v2
// 修复点：去掉会造成页面卡死的 class 属性循环监听，只在打开面板、DOM 新增、窗口变化时轻量处理。
(function(){
  if(window.__FW_FLOATING_PANELS_V2__) return;
  window.__FW_FLOATING_PANELS_V2__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const CONFIG = {
    echo: {w:420, h:560, top:92, right:28, minW:340, minH:360},
    buddy: {w:620, h:660, top:92, right:28, minW:420, minH:430},
    profile: {w:520, h:500, top:112, right:36, minW:360, minH:340},
    chat: {w:620, h:620, top:112, right:44, minW:360, minH:420},
    default: {w:480, h:540, top:100, right:32, minW:340, minH:360}
  };

  let drag = null;
  let scheduleId = 0;
  const resizeObservers = new WeakMap();

  function injectStyle(){
    if($('#fw-floating-panels-style')) return;

    const style = document.createElement('style');
    style.id = 'fw-floating-panels-style';
    style.textContent = `
      @media (min-width: 761px){
        .fw-social-modal[data-fw-social-modal],
        .fw-social-modal[data-fw-private-modal]{
          inset:0!important;
          padding:0!important;
          background:transparent!important;
          backdrop-filter:none!important;
          -webkit-backdrop-filter:none!important;
          align-items:stretch!important;
          justify-content:flex-start!important;
          pointer-events:none!important;
        }

        .fw-social-modal[data-fw-social-modal].show,
        .fw-social-modal[data-fw-private-modal].show{
          display:block!important;
        }

        .fw-social-modal[data-fw-social-modal] .fw-social-panel,
        .fw-social-modal[data-fw-private-modal] .fw-private-window{
          position:fixed!important;
          pointer-events:auto!important;
          max-height:none!important;
          max-width:none!important;
          resize:both;
          overflow:hidden!important;
          z-index:10010;
          box-shadow:0 20px 72px rgba(0,0,0,.28), 0 0 0 1px rgba(217,121,121,.28);
        }

        .fw-social-modal[data-fw-social-modal] .fw-social-panel{
          display:grid!important;
          grid-template-rows:auto 1fr;
        }

        .fw-social-modal[data-fw-private-modal] .fw-private-window{
          display:grid!important;
          grid-template-rows:auto 1fr auto;
        }

        .fw-social-modal[data-fw-social-modal] .fw-social-head,
        .fw-social-modal[data-fw-private-modal] .fw-social-head{
          cursor:move;
          user-select:none;
        }

        .fw-social-modal[data-fw-social-modal] .fw-social-head button,
        .fw-social-modal[data-fw-private-modal] .fw-social-head button{
          cursor:pointer;
        }

        .fw-floating-tools{
          display:flex;
          align-items:center;
          gap:8px;
          margin-left:auto;
          margin-right:4px;
        }

        .fw-floating-tool-btn{
          height:30px;
          min-width:30px;
          padding:0 10px;
          border:1px solid rgba(28,28,24,.16);
          border-radius:999px;
          background:rgba(255,253,247,.8);
          color:#171715;
          font-size:12px;
          font-weight:950;
          cursor:pointer;
        }

        .fw-floating-tool-btn:hover{
          border-color:rgba(217,121,121,.6);
          color:#9d4a4a;
        }

        .fw-social-modal[data-fw-social-modal] .fw-social-body,
        .fw-social-modal[data-fw-private-modal] .fw-private-messages{
          min-height:0;
        }

        .fw-social-modal.fw-float-echo .fw-social-panel .fw-social-head h2{
          font-size:28px;
        }

        .fw-social-modal.fw-float-echo .fw-social-item{
          grid-template-columns:auto 1fr;
        }

        .fw-social-modal.fw-float-echo .fw-social-item-actions{
          grid-column:1/-1;
          justify-content:flex-start;
          padding-left:50px;
        }
      }

      @media (max-width: 760px){
        .fw-floating-tools{display:none!important;}
      }
    `;

    document.head.appendChild(style);
  }

  function viewport(){
    return {
      w: Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0),
      h: Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)
    };
  }

  function clamp(n, min, max){
    return Math.min(Math.max(n, min), max);
  }

  function getType(modal){
    if(!modal) return 'default';
    if(modal.matches('[data-fw-private-modal]')) return 'chat';

    const title = modal.querySelector('[data-fw-social-title]')?.textContent || '';
    const kicker = modal.querySelector('[data-fw-social-kicker]')?.textContent || '';
    const text = title + ' ' + kicker;

    if(/回声|ECHO/i.test(text)) return 'echo';
    if(/搭子|BUDDY/i.test(text)) return 'buddy';
    if(/资料|CARD|RESEARCHER/i.test(text)) return 'profile';
    return 'default';
  }

  function panelOf(modal){
    return modal?.querySelector('.fw-social-panel, .fw-private-window') || null;
  }

  function storageKey(type){
    return 'fw_float_panel_' + type + '_v2';
  }

  function defaultRect(type){
    const cfg = CONFIG[type] || CONFIG.default;
    const vp = viewport();
    const w = Math.min(cfg.w, Math.max(cfg.minW, vp.w - 32));
    const h = Math.min(cfg.h, Math.max(cfg.minH, vp.h - 32));
    return {
      left: Math.max(12, vp.w - w - cfg.right),
      top: Math.max(12, cfg.top),
      width: w,
      height: Math.min(h, vp.h - Math.max(12, cfg.top) - 12)
    };
  }

  function readRect(type){
    try{
      const raw = localStorage.getItem(storageKey(type));
      if(!raw) return null;
      const rect = JSON.parse(raw);
      if(!Number.isFinite(rect.left) || !Number.isFinite(rect.top) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
      return rect;
    }catch(e){
      return null;
    }
  }

  function saveRect(type, panel){
    if(!panel || !type) return;
    const r = panel.getBoundingClientRect();
    try{
      localStorage.setItem(storageKey(type), JSON.stringify({
        left: Math.round(r.left),
        top: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height)
      }));
    }catch(e){}
  }

  function applyRect(panel, type, rect){
    const cfg = CONFIG[type] || CONFIG.default;
    const vp = viewport();
    const minW = Math.min(cfg.minW, vp.w - 24);
    const minH = Math.min(cfg.minH, vp.h - 24);
    const width = clamp(rect.width, minW, Math.max(minW, vp.w - 24));
    const height = clamp(rect.height, minH, Math.max(minH, vp.h - 24));
    const left = clamp(rect.left, 8, Math.max(8, vp.w - width - 8));
    const top = clamp(rect.top, 8, Math.max(8, vp.h - height - 8));

    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.width = width + 'px';
    panel.style.height = height + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function setTypeClass(modal, type){
    const current = modal.dataset.fwFloatType;
    if(current === type) return;
    modal.classList.remove('fw-float-echo','fw-float-buddy','fw-float-profile','fw-float-chat','fw-float-default');
    modal.classList.add('fw-float-' + type);
    modal.dataset.fwFloatType = type;
  }

  function addTools(panel){
    const head = panel.querySelector('.fw-social-head');
    if(!head || head.querySelector('.fw-floating-tools')) return;

    const tools = document.createElement('div');
    tools.className = 'fw-floating-tools';
    tools.innerHTML = '<button class="fw-floating-tool-btn" type="button" data-fw-float-reset>复位</button>';

    const close = head.querySelector('.fw-social-close');
    if(close){
      head.insertBefore(tools, close);
    }else{
      head.appendChild(tools);
    }
  }

  function observeResize(panel){
    if(resizeObservers.has(panel)) return;
    if(!('ResizeObserver' in window)) return;

    let timer = 0;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if(panel.dataset.fwFloatReady === '1'){
          saveRect(panel.dataset.fwFloatType || 'default', panel);
        }
      }, 250);
    });

    ro.observe(panel);
    resizeObservers.set(panel, ro);
  }

  function prepareModal(modal){
    if(!modal || window.innerWidth <= 760) return;
    if(!modal.classList.contains('show')) return;

    const panel = panelOf(modal);
    if(!panel) return;

    const type = getType(modal);
    setTypeClass(modal, type);
    panel.dataset.fwFloatType = type;
    addTools(panel);

    const lastType = panel.dataset.fwLastType;
    const firstReady = panel.dataset.fwFloatReady !== '1';

    if(firstReady || lastType !== type){
      const rect = readRect(type) || defaultRect(type);
      applyRect(panel, type, rect);
      panel.dataset.fwFloatReady = '1';
      panel.dataset.fwLastType = type;
      saveRect(type, panel);
    }else{
      const r = panel.getBoundingClientRect();
      applyRect(panel, type, {left:r.left, top:r.top, width:r.width, height:r.height});
    }

    observeResize(panel);
  }

  function prepareAll(){
    if(window.innerWidth <= 760) return;
    $$('[data-fw-social-modal].show, [data-fw-private-modal].show').forEach(prepareModal);
  }

  function schedulePrepare(delay){
    clearTimeout(scheduleId);
    scheduleId = setTimeout(prepareAll, delay || 80);
  }

  function startDrag(e, panel){
    if(window.innerWidth <= 760) return;
    if(e.target.closest('button,input,textarea,a,select,[data-fw-profile-user],[data-fw-start-chat]')) return;

    const rect = panel.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;

    drag = {
      panel,
      type: panel.dataset.fwFloatType || 'default',
      startX: point.clientX,
      startY: point.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };

    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  function moveDrag(e){
    if(!drag) return;
    const point = e.touches ? e.touches[0] : e;
    const dx = point.clientX - drag.startX;
    const dy = point.clientY - drag.startY;
    applyRect(drag.panel, drag.type, {
      left: drag.left + dx,
      top: drag.top + dy,
      width: drag.width,
      height: drag.height
    });
  }

  function endDrag(){
    if(!drag) return;
    saveRect(drag.type, drag.panel);
    drag = null;
    document.body.style.userSelect = '';
  }

  function resetPanel(panel){
    const type = panel.dataset.fwFloatType || 'default';
    localStorage.removeItem(storageKey(type));
    applyRect(panel, type, defaultRect(type));
    saveRect(type, panel);
  }

  function boot(){
    injectStyle();

    document.addEventListener('click', e => {
      if(e.target.closest('[data-fw-open-echo], [data-fw-open-buddy], [data-fw-start-chat], [data-fw-profile-user]')){
        schedulePrepare(160);
        schedulePrepare(700);
      }

      const reset = e.target.closest('[data-fw-float-reset]');
      if(reset){
        const panel = reset.closest('.fw-social-panel, .fw-private-window');
        if(panel) resetPanel(panel);
      }
    }, true);

    document.addEventListener('mousedown', e => {
      const head = e.target.closest('.fw-social-head');
      if(!head) return;
      const panel = e.target.closest('.fw-social-panel, .fw-private-window');
      if(panel) startDrag(e, panel);
    }, true);

    document.addEventListener('touchstart', e => {
      const head = e.target.closest('.fw-social-head');
      if(!head) return;
      const panel = e.target.closest('.fw-social-panel, .fw-private-window');
      if(panel) startDrag(e, panel);
    }, {capture:true, passive:false});

    document.addEventListener('mousemove', moveDrag, true);
    document.addEventListener('touchmove', moveDrag, {capture:true, passive:false});
    document.addEventListener('mouseup', endDrag, true);
    document.addEventListener('touchend', endDrag, true);

    window.addEventListener('resize', () => schedulePrepare(120));

    const observer = new MutationObserver(mutations => {
      for(const m of mutations){
        if(m.addedNodes && m.addedNodes.length){
          schedulePrepare(80);
          return;
        }
      }
    });

    observer.observe(document.body, {childList:true, subtree:true});
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }else{
    boot();
  }
})();
