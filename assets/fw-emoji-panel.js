// F.w 研究所：默认 Emoji 面板
// 当前版本：
// 1. 学术研讨房间、搭子私聊增加表情按钮。
// 2. 只保留默认小表情，去掉 F.w 表情包。
// 3. 表情选用兼容性更高的常见 emoji，避免部分电脑/手机显示成方框。
// 4. 不新增数据库表，不改现有消息结构。
(function(){
  if(window.__FW_EMOJI_PANEL__) return;
  window.__FW_EMOJI_PANEL__ = true;

  var EMOJI_GROUPS = [
    {name:'常用', items:['😂','😭','😅','😡','😴','😵']},
    {name:'摸鱼', items:['🐟','😓','🙃','🤔','👀','😶']},
    {name:'反应', items:['👍','👎','🤝','🙏','👏','❤️']},
    {name:'研究所', items:['🧠','🔬','📉','🧻','☕','💤']}
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
        width:min(330px,calc(100vw - 24px));
        max-height:min(390px,calc(100vh - 30px));
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

      .fw-emoji-body{
        max-height:320px;
        overflow:auto;
        padding:12px;
      }

      .fw-emoji-section{
        margin-bottom:12px;
      }

      .fw-emoji-section:last-child{
        margin-bottom:0;
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
        font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;
      }

      .fw-emoji-item:hover{
        border-color:rgba(217,121,121,.5);
        background:#fff3ef;
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
        <div class="fw-emoji-title"><span>FW EMOJI</span><strong>小表情</strong></div>
        <button type="button" class="fw-emoji-close" data-fw-emoji-close>×</button>
      </div>
      <div class="fw-emoji-body" data-fw-emoji-body></div>
    `;
    document.body.appendChild(panel);
    renderPanelBody();
    return panel;
  }

  function renderPanelBody(){
    var body = $('[data-fw-emoji-body]');
    if(!body) return;

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
    renderPanelBody();
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

      var emoji = e.target.closest && e.target.closest('[data-fw-emoji-insert]');
      if(emoji){
        e.preventDefault();
        insertAtCursor(activeInput, emoji.dataset.fwEmojiInsert || '');
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
      if(panelOpen){
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
      }, 120);
    });

    observer.observe(document.body, {childList:true, subtree:true});
  }

  function boot(){
    injectStyle();
    ensurePanel();
    enhanceForms();
    bind();
    observe();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
