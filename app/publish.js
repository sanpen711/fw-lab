(function(){
  if(window.FWAppPublish) return;

  var selectedStatus = '已疲惫';
  var bound = false;

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function $$(selector, root){ return app().$$(selector, root); }

  async function requireUser(){
    if(app().state.user) return app().state.user;
    await app().refreshUser();
    if(app().state.user) return app().state.user;
    app().toast('登录后才能发牢骚。');
    return null;
  }

  function updateCount(){
    var textarea = $('[data-publish-form] textarea[name="content"]');
    var counter = $('[data-publish-count]');
    if(counter && textarea) counter.textContent = String((textarea.value || '').length) + '/500';
  }

  function clearForm(){
    var form = $('[data-publish-form]');
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

  function ensureCancelButton(){
    var row = $('[data-publish-form] .form-row');
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

  function bind(){
    if(bound) return;
    bound = true;

    document.addEventListener('click', function(e){
      var cancel = e.target.closest && e.target.closest('[data-publish-cancel]');
      if(cancel){
        e.preventDefault();
        clearForm();
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
        app().state.postsLoaded = false;
        if(window.FWAppFeed) await window.FWAppFeed.load(true);
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
    ensureCancelButton();
    bind();
    updateCount();
  }

  window.FWAppPublish = {init:init};
})();
