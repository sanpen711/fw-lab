(function(){
  if(window.FWAppPublish) return;

  var selectedStatus = '已疲惫';
  var bound = false;
  var squareScrollTop = 0;

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
      '.square-publish-view .view-head{padding-bottom:14px}',
      '.square-publish-subtitle{display:block;margin-top:10px;color:var(--muted);font-size:14px;line-height:1.55;font-weight:850}',
      '.square-publish-view .publish-card[data-publish-form]{display:grid;gap:12px;margin:0 0 18px;padding:15px;border-radius:16px}',
      '.square-publish-view .publish-card[data-publish-form] label{color:var(--deep);font-size:13px;font-weight:1000}',
      '.square-publish-view .publish-card[data-publish-form] textarea{min-height:240px;font-size:16px;line-height:1.6;resize:none}',
      '.square-publish-view .publish-card[data-publish-form] .form-row{gap:8px;align-items:center}',
      '.square-publish-view .publish-card[data-publish-form] .form-row .app-btn{padding:0 14px;min-width:74px}',
      '.square-publish-view .publish-card[data-publish-form] .form-row span{margin-right:auto;color:var(--muted);font-size:12px;font-weight:900}'
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

  function getMain(){
    return $('#appMain') || $('.app-main');
  }

  function cleanupLegacySheet(){
    $$('[data-publish-backdrop]').forEach(function(node){
      if(node.parentNode) node.parentNode.removeChild(node);
    });
    var shell = $('.app-shell');
    if(shell) shell.classList.remove('publish-open');
    var form = publishForm();
    if(!form) return;
    form.classList.remove('is-open');
    $$('[data-publish-sheet-title],[data-publish-close]', form).forEach(function(node){
      if(node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function ensurePublishView(){
    var main = getMain();
    var form = publishForm();
    if(!main || !form) return null;

    var view = $('[data-app-view="square-publish"]');
    if(!view){
      view = document.createElement('section');
      view.className = 'app-view square-publish-view';
      view.dataset.appView = 'square-publish';
      view.setAttribute('aria-label', '发布牢骚');
      view.innerHTML = [
        '<div class="view-head compact">',
          '<button class="back-btn" type="button" data-publish-back-square>‹ 精神广场</button>',
          '<p>精神广场</p>',
          '<h1>发一句牢骚</h1>',
          '<span class="square-publish-subtitle">把今天不想处理的情绪先放在这里</span>',
        '</div>',
        '<div data-publish-page-slot></div>'
      ].join('');
      main.appendChild(view);
    }

    var slot = $('[data-publish-page-slot]', view);
    if(slot && form.parentNode !== slot) slot.appendChild(form);
    return view;
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
    var form = publishForm();
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

  function rememberSquareScroll(){
    var main = getMain();
    if(app().state.view === 'square' && main) squareScrollTop = main.scrollTop || 0;
  }

  function restoreSquareScroll(){
    var main = getMain();
    if(!main) return;
    requestAnimationFrame(function(){
      main.scrollTop = squareScrollTop || 0;
      requestAnimationFrame(function(){ main.scrollTop = squareScrollTop || 0; });
    });
  }

  function returnToSquare(options){
    options = options || {};
    cleanupLegacySheet();
    app().setView('square');
    if(options.restoreScroll) restoreSquareScroll();
  }

  function openPublishPage(){
    cleanupLegacySheet();
    rememberSquareScroll();
    ensurePublishView();
    ensureCancelButton();
    updateCount();
    app().setView('square-publish');
    if(!app().state.user){
      app().refreshUser().then(function(user){
        if(!user) app().toast('登录后才能发牢骚。');
      });
    }
  }

  function bind(){
    if(bound) return;
    bound = true;

    document.addEventListener('click', function(e){
      var open = e.target.closest && e.target.closest('[data-publish-open]');
      if(open){
        e.preventDefault();
        openPublishPage();
        return;
      }

      var back = e.target.closest && e.target.closest('[data-publish-back-square]');
      if(back){
        e.preventDefault();
        returnToSquare({restoreScroll:true});
        return;
      }

      var cancel = e.target.closest && e.target.closest('[data-publish-cancel]');
      if(cancel){
        e.preventDefault();
        clearForm();
        returnToSquare({restoreScroll:true});
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
        clearForm();
        app().state.postsLoaded = false;
        if(window.FWAppFeed) await window.FWAppFeed.load(true);
        app().toast('已记录');
        app().setView('square');
        var main = getMain();
        if(main) main.scrollTop = 0;
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
    cleanupLegacySheet();
    ensurePublishTrigger();
    ensurePublishView();
    ensureCancelButton();
    bind();
    updateCount();
  }

  window.FWAppPublish = {init:init, open:openPublishPage, close:returnToSquare};
})();
