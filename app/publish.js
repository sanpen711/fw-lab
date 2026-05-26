(function(){
  if(window.FWAppPublish) return;

  var selectedStatus = '已疲惫';
  var bound = false;

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function $$(selector, root){ return app().$$(selector, root); }

  function injectStyle(){
    if(document.getElementById('fwAppSquarePublishStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwAppSquarePublishStyle';
    style.textContent = [
      '.view-head.square-head{position:relative;padding-right:58px}',
      '.square-publish-trigger{position:absolute;right:4px;bottom:12px;width:44px;height:44px;border:0;border-radius:16px;background:var(--accent);color:#fff;font-size:27px;font-weight:1000;line-height:1;box-shadow:0 10px 24px rgba(152,77,77,.22)}',
      '.publish-sheet-backdrop{display:none;position:fixed;left:0;right:0;top:0;bottom:var(--tabbar-total-h);z-index:1000;background:rgba(16,23,15,.34);pointer-events:auto}',
      '.publish-sheet-backdrop.show{display:block}',
      '.publish-card[data-publish-form]{display:none;pointer-events:auto}',
      '.publish-card[data-publish-form].is-open{display:block;position:fixed;left:50%;right:auto;bottom:calc(var(--tabbar-total-h) + 12px);z-index:1001;width:min(406px,calc(100vw - 24px));max-height:calc(100dvh - var(--tabbar-total-h) - env(safe-area-inset-top,0px) - 100px);overflow:auto;transform:translateX(-50%);padding-top:50px;box-shadow:0 22px 58px rgba(16,23,15,.24);touch-action:auto}',
      '.publish-sheet-title{position:absolute;left:16px;top:15px;color:var(--deep);font-size:15px;font-weight:1000;line-height:1.2}',
      '.publish-sheet-close{position:absolute;right:12px;top:9px;width:34px;height:34px;border:1px solid rgba(30,30,28,.12);border-radius:999px;background:var(--panel-2);color:var(--deep);font-size:22px;font-weight:1000;line-height:1}',
      '.publish-card[data-publish-form].is-open textarea{min-height:148px}',
      '.publish-card[data-publish-form] .form-row{gap:8px}',
      '.publish-card[data-publish-form] .form-row .app-btn{padding:0 14px;min-width:74px}',
      '.app-shell.publish-open .app-tabbar{z-index:50}'
    ].join('\n');
    document.head.appendChild(style);
  }

  async function requireUser(){
    if(app().state.user) return app().state.user;
    await app().refreshUser();
    if(app().state.user) return app().state.user;
    app().toast('登录后才能发牢骚。');
    return null;
  }

  function publishForm(){
    return $('[data-publish-form]');
  }

  function mountSheetToBody(){
    var form = publishForm();
    if(form && form.parentNode !== document.body){
      document.body.appendChild(form);
    }
    return form;
  }

  function updateCount(){
    var textarea = $('[data-publish-form] textarea[name="content"]');
    var counter = $('[data-publish-count]');
    if(counter && textarea) counter.textContent = String((textarea.value || '').length) + '/500';
  }

  function clearForm(){
    var form = publishForm();
    var textarea = form && form.querySelector('textarea[name="content"]');
    if(textarea){
      textarea.value = '';
      textarea.blur();
    }
    selectedStatus = '已疲惫';
    $$('[data-publish-status] [data-status]').forEach(function(item){
      item.classList.toggle('active', item.dataset.status === selectedStatus);
    });
    updateCount();
  }

  function backdrop(){
    var node = $('[data-publish-backdrop]');
    if(node) return node;
    node = document.createElement('div');
    node.className = 'publish-sheet-backdrop';
    node.dataset.publishBackdrop = 'true';
    document.body.appendChild(node);
    return node;
  }

  function ensurePublishTrigger(){
    var square = $('[data-app-view="square"]');
    var head = square && $('.view-head', square);
    if(!head) return;
    head.classList.add('square-head');
    if(head.querySelector('[data-publish-open]')) return;
    var trigger = document.createElement('button');
    trigger.className = 'square-publish-trigger';
    trigger.type = 'button';
    trigger.dataset.publishOpen = 'true';
    trigger.setAttribute('aria-label', '发牢骚');
    trigger.textContent = '+';
    head.appendChild(trigger);
  }

  function ensureCancelButton(){
    var form = mountSheetToBody();
    var row = form && form.querySelector('.form-row');
    if(!row || row.querySelector('[data-publish-cancel]')) return;
    var submit = row.querySelector('button[type="submit"]');
    if(!submit) return;
    var cancel = document.createElement('button');
    cancel.className = 'app-btn';
    cancel.type = 'button';
    cancel.dataset.publishCancel = 'true';
    cancel.textContent = '取消';
    row.insertBefore(cancel, submit);
  }

  function ensureSheetChrome(){
    var form = mountSheetToBody();
    if(!form) return;
    if(!form.querySelector('[data-publish-sheet-title]')){
      var title = document.createElement('div');
      title.className = 'publish-sheet-title';
      title.dataset.publishSheetTitle = 'true';
      title.textContent = '发一句牢骚';
      form.insertBefore(title, form.firstChild);
    }
    if(!form.querySelector('[data-publish-close]')){
      var close = document.createElement('button');
      close.className = 'publish-sheet-close';
      close.type = 'button';
      close.dataset.publishClose = 'true';
      close.setAttribute('aria-label', '关闭发布框');
      close.textContent = '×';
      form.insertBefore(close, form.firstChild);
    }
  }

  async function openSheet(){
    var user = await requireUser();
    if(!user) return;
    var form = mountSheetToBody();
    if(!form) return;
    ensureSheetChrome();
    form.classList.add('is-open');
    backdrop().classList.add('show');
    var shell = $('.app-shell');
    if(shell) shell.classList.add('publish-open');
  }

  function closeSheet(){
    var form = publishForm();
    if(form) form.classList.remove('is-open');
    var shade = $('[data-publish-backdrop]');
    if(shade) shade.classList.remove('show');
    var shell = $('.app-shell');
    if(shell) shell.classList.remove('publish-open');
  }

  function bind(){
    if(bound) return;
    bound = true;

    document.addEventListener('click', async function(e){
      var open = e.target.closest && e.target.closest('[data-publish-open]');
      if(open){
        e.preventDefault();
        await openSheet();
        return;
      }

      var insideSheet = e.target.closest && e.target.closest('[data-publish-form]');
      if(insideSheet) e.stopPropagation();

      var shade = e.target.closest && e.target.closest('[data-publish-backdrop]');
      if(shade){
        e.preventDefault();
        return;
      }

      var close = e.target.closest && e.target.closest('[data-publish-close]');
      if(close){
        e.preventDefault();
        closeSheet();
        return;
      }

      var cancel = e.target.closest && e.target.closest('[data-publish-cancel]');
      if(cancel){
        e.preventDefault();
        clearForm();
        closeSheet();
        return;
      }

      var btn = e.target.closest && e.target.closest('[data-status]');
      if(!btn || !btn.closest('[data-publish-status]')) return;
      selectedStatus = btn.dataset.status || '已疲惫';
      $$('[data-publish-status] [data-status]').forEach(function(item){
        item.classList.toggle('active', item === btn);
      });
    });

    document.addEventListener('input', function(e){
      if(e.target.closest && e.target.closest('[data-publish-form]')) updateCount();
    });

    document.addEventListener('submit', async function(e){
      var form = e.target.closest && e.target.closest('[data-publish-form]');
      if(!form) return;
      e.preventDefault();

      var user = await requireUser();
      if(!user) return;

      var textarea = form.querySelector('textarea[name="content"]');
      var content = (textarea.value || '').trim();
      if(!content){
        textarea.focus();
        app().toast('先写点什么再发布。');
        return;
      }

      var submit = form.querySelector('button[type="submit"]');
      var oldText = submit.textContent;
      submit.disabled = true;
      submit.textContent = '发布中...';

      try{
        await window.fwDb.createPost({content:content, status:selectedStatus});
        textarea.value = '';
        updateCount();
        closeSheet();
        app().state.postsLoaded = false;
        if(window.FWAppFeed) await window.FWAppFeed.load(true);
        var main = $('#appMain');
        if(main) main.scrollTop = 0;
        app().toast('已发布');
        app().setView('square');
      }catch(err){
        console.warn('[FW mobile app] publish failed', err);
        app().toast('发布失败，请稍后再试。');
      }finally{
        submit.disabled = false;
        submit.textContent = oldText;
      }
    });
  }

  function init(){
    injectStyle();
    ensurePublishTrigger();
    mountSheetToBody();
    ensureCancelButton();
    ensureSheetChrome();
    backdrop();
    bind();
    updateCount();
  }

  window.FWAppPublish = {init:init, open:openSheet, close:closeSheet};
})();
