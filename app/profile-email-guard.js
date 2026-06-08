(function(){
  if(window.__FW_MOBILE_PROFILE_EMAIL_GUARD__) return;
  window.__FW_MOBILE_PROFILE_EMAIL_GUARD__ = true;

  var busy = false;

  function normEmail(value){ return String(value || '').trim().toLowerCase(); }
  function app(){ return window.FWApp || null; }
  function toast(message){ if(app() && app().toast) app().toast(message); }
  function db(){ return window.fwDb && window.fwDb.enabled ? window.fwDb : null; }

  function setBusy(button, loading, text){
    if(!button) return;
    if(loading){
      button.dataset.oldText = button.textContent;
      button.textContent = text || '处理中...';
      button.disabled = true;
    }else{
      button.textContent = button.dataset.oldText || button.textContent;
      button.disabled = false;
    }
  }

  async function ensureDb(){
    if(app() && app().waitForDb){
      var ok = await app().waitForDb(10000);
      if(ok && db()) return true;
    }
    if(db()) return true;
    throw new Error('数据库连接未就绪，请刷新页面后重试。');
  }

  async function emailAlreadyRegistered(email){
    await ensureDb();
    var client = db().client;

    var rpc = await client.rpc('fw_email_registered', {check_email:email});
    if(!rpc.error){
      return !!rpc.data;
    }

    console.warn('[FW mobile app] email check rpc unavailable, fallback to profiles query', rpc.error);

    var res = await client
      .from('profiles')
      .select('id')
      .eq('email_search', email)
      .limit(1);
    if(res.error) throw res.error;
    return !!(res.data && res.data.length);
  }

  function isMobileRegisterPanel(node){
    var panel = node && node.closest && node.closest('[data-mobile-login-panel="register"]');
    return !!(panel && panel.classList.contains('show'));
  }

  async function handleSend(button, form){
    if(busy) return;
    var email = normEmail(form && form.email && form.email.value);
    if(!email){
      if(form && form.email) form.email.focus();
      toast('先填写邮箱。');
      return;
    }
    busy = true;
    setBusy(button, true, '检查中...');
    try{
      if(await emailAlreadyRegistered(email)){
        toast('这个邮箱已经注册过，请返回登录，使用邮箱和密码登录。');
        return;
      }
      setBusy(button, true, '发送中...');
      await window.fwDb.sendEmailOtp({email:email, nickname:form.nickname && form.nickname.value});
      toast('验证码已发送，请查收邮箱。');
    }catch(err){
      console.warn('[FW mobile app] register email check failed', err);
      toast('邮箱查重未初始化，请先运行邮箱查重 SQL。');
    }finally{
      busy = false;
      setBusy(button, false);
    }
  }

  async function shouldBlockSubmit(form){
    if(busy) return true;
    var email = normEmail(form && form.email && form.email.value);
    if(!email) return false;
    busy = true;
    try{
      if(await emailAlreadyRegistered(email)){
        toast('这个邮箱已经注册过，请返回登录，使用邮箱和密码登录。');
        return true;
      }
      return false;
    }catch(err){
      console.warn('[FW mobile app] register email check failed', err);
      toast('邮箱查重未初始化，请先运行邮箱查重 SQL。');
      return true;
    }finally{
      busy = false;
    }
  }

  document.addEventListener('click', function(event){
    var send = event.target.closest && event.target.closest('[data-send-otp]');
    if(!send || !isMobileRegisterPanel(send)) return;
    var form = send.closest('[data-otp-form]');
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    handleSend(send, form);
  }, true);

  document.addEventListener('submit', async function(event){
    var form = event.target.closest && event.target.closest('[data-otp-form]');
    if(!form || !isMobileRegisterPanel(form)) return;
    if(form.dataset.emailGuardPassed === '1'){
      delete form.dataset.emailGuardPassed;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    var blocked = await shouldBlockSubmit(form);
    if(blocked) return;
    form.dataset.emailGuardPassed = '1';
    form.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}));
  }, true);
})();
