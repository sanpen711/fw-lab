// F.w 研究所：默认 Emoji + F.w 低功耗表情包
// 第一阶段：
// 1. 学术研讨房间、搭子私聊增加表情按钮。
// 2. 默认 Emoji 点击后插入输入框。
// 3. F.w 表情点击后直接发送为特殊文本码，再在前端渲染成表情卡片。
// 4. 不新增数据库表，不改现有消息结构，方便后续回滚和升级。
(function(){
  if(window.__FW_EMOJI_PANEL__) return;
  window.__FW_EMOJI_PANEL__ = true;

  var EMOJI_GROUPS = [
    {name:'常用', items:['😂','😭','😅','😡','😴','😵‍💫']},
    {name:'摸鱼', items:['🐟','🫠','🙃','🤔','👀','🫥']},
    {name:'反应', items:['👍','👎','🤝','🙏','👏','🫶']},
    {name:'研究所', items:['🧠','🧪','📉','🧻','☕','🛌']}
  ];

  var STICKERS = [
    {id:'lowpower', icon:'📉', title:'低功耗', sub:'运行中'},
    {id:'offline', icon:'🪑', title:'精神离岗', sub:'灵魂出走'},
    {id:'invalid', icon:'📅', title:'今日无效', sub:'已盖章'},
    {id:'fish', icon:'🐟', title:'摸鱼现场', sub:'装忙中'},
    {id:'meeting', icon:'🗂️', title:'会议幸存', sub:'还活着'},
    {id:'tissue', icon:'🧻', title:'递纸巾', sub:'撑住'},
    {id:'crash', icon:'⚠️', title:'已宕机', sub:'ERROR'},
    {id:'nowork', icon:'☕', title:'不想上班', sub:'放空'}
  ];

  var activeInput = null;
  var activeForm = null;
  var panelOpen = false;

  function $(s, root){ return (root || document).querySelector(s); }
  function $$(s, root){ return Array.from((root || document).querySelectorAll(s)); }

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function stickerCode(id){
    return '[[FW_STICKER:' + id + ']]';
  }

  function stickerById(id){
    return STICKERS.find(function(s){ return s.id === id; }) || null;
  }

  function parseStickerCode(text){
    var m = String(text || '').trim().match(/^\[\[FW_STICKER:([a-z0-9_-]+)\]\]$/i);
    if(!m) return null;
    return stickerById(m[1]);
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
    clearTimeout(window.__fwEmojiToastTimer);
    window.__fwEmojiToastTimer = setTimeout(function(){ t.classList.remove('show'); }, 2200);
  }

  function injectStyle(){
    if($('#fw-emoji-panel-style')) return;

    var style = document.createElement('style');
    style.id = 'fw-emoji-panel-style';
    style.textContent = `
      .fw-emoji-trigger{
        width:44px!important;
        min-width:44px!important;
        height:44px!important;
        border-radius:999px!important;
        border:1px solid rgba(28,28,24,.18)!important;
        background:#fffdf7!important;
        color:#1b1b18!important;
        font-size:19px!important;
        font-weight:1000!important;
        cursor:pointer!important;
        display:grid!important;
        place-items:center!important;
        padding:0!important;
      }

      [data-room-form].fw-emoji-enhanced,
      [data-fw-wx-compose].fw-emoji-enhanced{
        grid-template-columns:auto 1fr auto!important;
      }

      .fw-emoji-panel{
        position:fixed;
        z-index:13020;
        width:min(360px,calc(100vw - 24px));
        max-height:min(430px,calc(100vh - 30px));
        overflow:hidden;
        display:none;
        background:#fffdf7;
        color:#1d1d1a;
        border:1px solid rgba(217,121,121,.45);
        box-shadow:0 24px 90px rgba(0,0,0,.28);
      }

      .fw-emoji-panel.show{
        display:block;
      }

      .fw-emoji-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:12px 14px;
        border-bottom:1px solid rgba(28,28,24,.1);
      }

      .fw-emoji-title{
        display:flex;
        flex-direction:column;
        gap:2px;
      }

      .fw-emoji-title strong{
        font-size:16px;
        font-weight:1000;
        letter-spacing:-.04em;
      }

      .fw-emoji-title span{
        color:#b85e5e;
        font-size:10px;
        font-weight:1000;
        letter-spacing:.12em;
      }

      .fw-emoji-close{
        border:0;
        background:transparent;
        font-size:22px;
        font-weight:1000;
        cursor:pointer;
        color:#1b1b18;
      }

      .fw-emoji-tabs{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:8px;
        padding:10px 12px;
        border-bottom:1px solid rgba(28,28,24,.08);
      }

      .fw-emoji-tab{
        height:34px;
        border-radius:999px;
        border:1px solid rgba(28,28,24,.14);
        background:#fffdf7;
        color:#1b1b18;
        font-weight:1000;
        cursor:pointer;
      }

      .fw-emoji-tab.active{
        background:#1b1b18;
        color:#fffdf7;
        border-color:#1b1b18;
      }

      .fw-emoji-body{
        max-height:310px;
        overflow:auto;
        padding:12px;
      }

      .fw-emoji-section{
        margin-bottom:12px;
      }

      .fw-emoji-section-title{
        margin:0 0 8px;
        color:#9d4a4a;
        font-size:12px;
        font-weight:1000;
      }

      .fw-emoji-grid{
        display:grid;
        grid-template-columns:repeat(6,1fr);
        gap:8px;
      }

      .fw-emoji-item{
        height:42px;
        border:1px solid rgba(28,28,24,.1);
        background:#fffaf1;
        border-radius:12px;
        font-size:24px;
        display:grid;
        place-items:center;
        cursor:pointer;
      }

      .fw-emoji-item:hover{
        border-color:rgba(217,121,121,.5);
        background:#fff3ef;
      }

      .fw-sticker-grid{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
      }

      .fw-sticker-pick{
        min-height:76px;
        border:1px solid rgba(28,28,24,.12);
        background:linear-gradient(135deg,#1b1b18,#273426);
        color:#fffdf7;
        border-radius:18px;
        padding:10px;
        cursor:pointer;
        display:grid;
        grid-template-columns:36px 1fr;
        gap:8px;
        align-items:center;
        text-align:left;
      }

      .fw-sticker-pick:hover{
        border-color:rgba(217,121,121,.75);
      }

      .fw-sticker-pick-icon{
        width:36px;
        height:36px;
        border-radius:50%;
        display:grid;
        place-items:center;
        background:#fffdf7;
        color:#1b1b18;
        font-size:20px;
        box-shadow:0 8px 20px rgba(0,0,0,.18);
      }

      .fw-sticker-pick strong{
        display:block;
        font-size:14px;
        line-height:1.1;
        font-weight:1000;
        letter-spacing:-.04em;
      }

      .fw-sticker-pick span{
        display:block;
        margin-top:4px;
        color:#e1a1a1;
        font-size:11px;
        font-weight:900;
      }

      .fw-fw-sticker{
        display:inline-grid;
        grid-template-columns:42px 1fr;
        gap:10px;
        align-items:center;
        min-width:148px;
        max-width:230px;
        padding:12px 14px;
        border-radius:18px;
        background:linear-gradient(135deg,#171715,#283528);
        color:#fffdf7;
        border:1px solid rgba(217,121,121,.55);
        box-shadow:0 12px 28px rgba(0,0,0,.18);
        text-align:left;
      }

      .fw-fw-sticker-icon{
        width:42px;
        height:42px;
        border-radius:999px;
        display:grid;
        place-items:center;
        background:#fffdf7;
        color:#1d1d1a;
        font-size:23px;
      }

      .fw-fw-sticker-title{
        display:block;
        font-size:16px;
        line-height:1.05;
        font-weight:1000;
        letter-spacing:-.05em;
      }

      .fw-fw-sticker-sub{
        display:block;
        margin-top:5px;
        color:#e5a0a0;
        font-size:11px;
        font-weight:900;
        letter-spacing:.02em;
      }

      .fw-bubble .fw-fw-sticker,
      .fw-wx-pm-bubble .fw-fw-sticker{
        margin:0;
      }

      .fw-wx-pm.me .fw-fw-sticker{
        border-color:rgba(255,255,255,.42);
      }

      @media(max-width:760px){
        .fw-emoji-panel{
          width:calc(100vw - 24px);
          left:12px!important;
          right:12px!important;
        }
        .fw-emoji-grid{
          grid-template-columns:repeat(6,1fr);
        }
        .fw-sticker-grid{
          grid-template-columns:1fr 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensurePanel(){
    var panel = $('#fw-emoji-panel');
    if(panel) return panel;

    panel = document.createElement('div');
    panel.id = 'fw-emoji-panel';
    panel.className = 'fw-emoji-panel';
    panel.innerHTML = `
      <div class="fw-emoji-head">
        <div class="fw-emoji-title"><span>FW EMOJI</span><strong>表情</strong></div>
        <button type="button" class="fw-emoji-close" data-fw-emoji-close>×</button>
      </div>
      <div class="fw-emoji-tabs">
        <button type="button" class="fw-emoji-tab active" data-fw-emoji-tab="emoji">小表情</button>
        <button type="button" class="fw-emoji-tab" data-fw-emoji-tab="sticker">F.w表情</button>
      </div>
      <div class="fw-emoji-body" data-fw-emoji-body></div>
    `;
    document.body.appendChild(panel);
    renderPanelBody('emoji');
    return panel;
  }

  function renderPanelBody(tab){
    var body = $('[data-fw-emoji-body]');
    if(!body) return;

    $$('.fw-emoji-tab').forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.fwEmojiTab === tab);
    });

    if(tab === 'sticker'){
      body.innerHTML = '<div class="fw-sticker-grid">' + STICKERS.map(function(s){
        return '<button type="button" class="fw-sticker-pick" data-fw-sticker-send="' + esc(s.id) + '">'
          + '<span class="fw-sticker-pick-icon">' + esc(s.icon) + '</span>'
          + '<span><strong>' + esc(s.title) + '</strong><span>' + esc(s.sub) + '</span></span>'
          + '</button>';
      }).join('') + '</div>';
      return;
    }

    body.innerHTML = EMOJI_GROUPS.map(function(group){
      return '<section class="fw-emoji-section"><h4 class="fw-emoji-section-title">' + esc(group.name) + '</h4>'
        + '<div class="fw-emoji-grid">'
        + group.items.map(function(item){ return '<button type="button" class="fw-emoji-item" data-fw-emoji-insert="' + esc(item) + '">' + esc(item) + '</button>'; }).join('')
        + '</div></section>';
    }).join('');
  }

  function positionPanel(trigger){
    var panel = ensurePanel();
    var rect = trigger.getBoundingClientRect();
    var gap = 10;
    var left = Math.max(12, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 12));
    var top = rect.top - panel.offsetHeight - gap;

    if(top < 12){
      top = rect.bottom + gap;
    }

    panel.style.left = left + 'px';
    panel.style.top = Math.max(12, top) + 'px';
  }

  function openPanel(trigger, input, form){
    activeInput = input;
    activeForm = form;
    var panel = ensurePanel();
    renderPanelBody('emoji');
    panel.classList.add('show');
    panelOpen = true;
    requestAnimationFrame(function(){ positionPanel(trigger); });
  }

  function closePanel(){
    var panel = $('#fw-emoji-panel');
    if(panel) panel.classList.remove('show');
    panelOpen = false;
  }

  function insertAtCursor(input, text){
    if(!input) return;
    var start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    var end = typeof input.selectionEnd === 'number' ? input.selectionEnd : input.value.length;
    var before = input.value.slice(0, start);
    var after = input.value.slice(end);
    input.value = before + text + after;
    var next = start + text.length;
    input.focus();
    try{ input.setSelectionRange(next, next); }catch(e){}
    input.dispatchEvent(new Event('input', {bubbles:true}));
  }

  function submitSticker(id){
    if(!activeInput || !activeForm){
      toast('先打开一个输入框。');
      return;
    }

    activeInput.value = stickerCode(id);
    activeInput.dispatchEvent(new Event('input', {bubbles:true}));
    closePanel();

    var ev = new Event('submit', {bubbles:true, cancelable:true});
    activeForm.dispatchEvent(ev);
  }

  function enhanceForm(form, type){
    if(!form || form.dataset.fwEmojiEnhanced === '1') return;

    var input = form.querySelector('input[name="message"], input');
    if(!input) return;

    form.dataset.fwEmojiEnhanced = '1';
    form.classList.add('fw-emoji-enhanced');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fw-emoji-trigger';
    btn.dataset.fwEmojiTrigger = type;
    btn.setAttribute('aria-label', '打开表情面板');
    btn.textContent = '😊';

    form.insertBefore(btn, input);
  }

  function enhanceForms(){
    enhanceForm($('[data-room-form]'), 'room');
    enhanceForm($('[data-fw-wx-compose]'), 'buddy');
  }

  function stickerHtml(sticker){
    return '<span class="fw-fw-sticker" title="' + esc(sticker.title) + '">'
      + '<span class="fw-fw-sticker-icon">' + esc(sticker.icon) + '</span>'
      + '<span><span class="fw-fw-sticker-title">' + esc(sticker.title) + '</span><span class="fw-fw-sticker-sub">' + esc(sticker.sub) + '</span></span>'
      + '</span>';
  }

  function renderStickersInMessages(){
    $$('.fw-bubble p, .fw-wx-pm-bubble').forEach(function(el){
      if(el.dataset.fwStickerRendered === '1') return;
      var sticker = parseStickerCode(el.textContent);
      if(!sticker) return;
      el.dataset.fwStickerRendered = '1';
      el.innerHTML = stickerHtml(sticker);
    });
  }

  function bind(){
    document.addEventListener('click', function(e){
      var trigger = e.target.closest && e.target.closest('[data-fw-emoji-trigger]');
      if(trigger){
        e.preventDefault();
        e.stopPropagation();
        var form = trigger.closest('form');
        var input = form && form.querySelector('input[name="message"], input');
        if(input) openPanel(trigger, input, form);
        return;
      }

      var close = e.target.closest && e.target.closest('[data-fw-emoji-close]');
      if(close){
        e.preventDefault();
        closePanel();
        return;
      }

      var tab = e.target.closest && e.target.closest('[data-fw-emoji-tab]');
      if(tab){
        e.preventDefault();
        renderPanelBody(tab.dataset.fwEmojiTab || 'emoji');
        return;
      }

      var emoji = e.target.closest && e.target.closest('[data-fw-emoji-insert]');
      if(emoji){
        e.preventDefault();
        insertAtCursor(activeInput, emoji.dataset.fwEmojiInsert || '');
        return;
      }

      var sticker = e.target.closest && e.target.closest('[data-fw-sticker-send]');
      if(sticker){
        e.preventDefault();
        submitSticker(sticker.dataset.fwStickerSend);
        return;
      }

      if(panelOpen && !e.target.closest('#fw-emoji-panel')){
        closePanel();
      }
    }, true);

    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape') closePanel();
    });

    window.addEventListener('resize', function(){
      if(panelOpen && activeInput){
        var trigger = $('[data-fw-emoji-trigger]');
        if(trigger) positionPanel(trigger);
      }
    });
  }

  function observe(){
    var timer = 0;
    var observer = new MutationObserver(function(){
      clearTimeout(timer);
      timer = setTimeout(function(){
        enhanceForms();
        renderStickersInMessages();
      }, 120);
    });

    observer.observe(document.body, {childList:true, subtree:true});
  }

  function boot(){
    injectStyle();
    ensurePanel();
    enhanceForms();
    renderStickersInMessages();
    bind();
    observe();
    setInterval(renderStickersInMessages, 1500);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
