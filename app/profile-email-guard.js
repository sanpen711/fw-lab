(function(){
  if(window.__FW_MOBILE_PROFILE_EMAIL_GUARD__) return;
  window.__FW_MOBILE_PROFILE_EMAIL_GUARD__ = true;

  var busy = false;
  var pendingOtpEmail = '';
  var pendingOtpNickname = '';
  var pendingOtpSentAt = 0;

  function normEmail(value){ return String(value || '').trim().toLowerCase(); }
  function app(){ return window.FWApp || null; }
  function translateMessage(message){
    var text = String(message || '');
    if(/token has expired|token.*invalid|expired or is invalid|otp.*expired|otp.*invalid/i.test(text)){
      return '验证码错误或已失效';
    }
    return text;
  }
  function patchToast(){
    var fw = app();
    if(!fw || !fw.toast || fw.__fwOtpToastPatched) return;
    var original = fw.toast;
    fw.toast = function(message){
      return original.call(fw, translateMessage(message));
    };
    fw.__fwOtpToastPatched = true;
  }
  function toast(message){ patchToast(); if(app() && app().toast) app().toast(translateMessage(message)); }
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

  function markPending(email, nickname){
    pendingOtpEmail = normEmail(email);
    pendingOtpNickname = String(nickname || '').trim();
    pendingOtpSentAt = Date.now();
  }

  function hasPending(email){
    return !!pendingOtpEmail && pendingOtpEmail === normEmail(email);
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
    var nickname = form && form.nickname ? form.nickname.value : '';
    if(!email){
      if(form && form.email) form.email.focus();
      toast('先填写邮箱。');
      return;
    }
    busy = true;
    setBusy(button, true, '检查中...');
    try{
      if(!hasPending(email) && await emailAlreadyRegistered(email)){
        toast('这个邮箱已经注册过，请返回登录，使用邮箱和密码登录。');
        return;
      }
      setBusy(button, true, '发送中...');
      await window.fwDb.sendEmailOtp({email:email, nickname:nickname});
      markPending(email, nickname);
      toast('验证码已发送，请查收邮箱。');
    }catch(err){
      console.warn('[FW mobile app] register email check failed', err);
      toast('验证码发送失败，请稍后重试。');
    }finally{
      busy = false;
      setBusy(button, false);
    }
  }

  function blockSubmit(event, form, message, focusNode){
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(focusNode && focusNode.focus) focusNode.focus();
    toast(message);
  }

  patchToast();

  document.addEventListener('click', function(event){
    var send = event.target.closest && event.target.closest('[data-send-otp]');
    if(!send || !isMobileRegisterPanel(send)) return;
    var form = send.closest('[data-otp-form]');
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    handleSend(send, form);
  }, true);

  document.addEventListener('submit', function(event){
    patchToast();
    var form = event.target.closest && event.target.closest('[data-otp-form]');
    if(!form || !isMobileRegisterPanel(form)) return;

    var email = normEmail(form.email && form.email.value);
    var token = String(form.token && form.token.value || '').trim().replace(/\s/g, '');

    if(!email){
      blockSubmit(event, form, '先填写邮箱。', form.email);
      return;
    }

    if(!hasPending(email)){
      blockSubmit(event, form, '请先发送验证码，再验证进入。', form.email);
      return;
    }

    if(!token){
      blockSubmit(event, form, '请输入邮箱验证码。', form.token);
      return;
    }

    // 已经发送过验证码的同一邮箱：不再查重、不再二次派发 submit，直接交给 profile.js 原始验证逻辑处理。
  }, true);
})();
