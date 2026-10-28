import {authErrorMessage} from '../../assets/fw-auth-errors.mjs';

// Recovery stays inside the locked account dialog until the new password is saved.
export function installPasswordRecovery({authStore,showAuth,toast}){
  const $=selector=>document.querySelector(selector);
  const reset=$('[data-auth-view="reset"]'),verify=$('[data-auth-view="resetVerify"]'),password=$('[data-auth-view="resetNew"]');
  let email='',resendAt=0,timer=0;
  const status=text=>{$('[data-form-status]').textContent=text||'';};
  function updateResend(){
    clearTimeout(timer);timer=0;
    if(verify.hidden)return;
    const seconds=Math.max(0,Math.ceil((resendAt-Date.now())/1000)),button=$('[data-resend-reset-code]');
    button.disabled=authStore.state.busy||seconds>0;button.textContent=seconds?`${seconds} 秒后重新发送`:'重新发送验证码';
    if(seconds)timer=setTimeout(updateResend,1000);
  }
  async function run(action,success){
    if(authStore.state.busy)return;
    status('正在处理…');
    try{const result=await action();status('');success?.(result);}
    catch(error){status(authErrorMessage(error));}
  }
  function showCode(value){
    email=String(value||'').trim().toLowerCase();
    $('[data-reset-verify-tip]').textContent=`验证码已发送至 ${email}，请输入邮件中的验证码。`;
    verify.reset();showAuth('resetVerify');updateResend();
  }
  reset.addEventListener('submit',event=>{
    event.preventDefault();
    run(()=>authStore.sendPasswordReset(reset.elements.email.value),result=>{resendAt=Date.now()+60000;showCode(result.email);});
  });
  $('[data-reset-enter-code]').addEventListener('click',()=>{if(!authStore.state.busy&&reset.reportValidity())showCode(reset.elements.email.value);});
  $('[data-reset-back]').addEventListener('click',()=>{if(!authStore.state.busy){showAuth('reset');updateResend();}});
  $('[data-resend-reset-code]').addEventListener('click',()=>{
    if(Date.now()<resendAt)return;
    run(()=>authStore.sendPasswordReset(email),()=>{resendAt=Date.now()+60000;updateResend();status('验证码已重新发送，请查看邮箱。');});
  });
  verify.addEventListener('submit',event=>{
    event.preventDefault();
    run(()=>authStore.verifyPasswordReset(email,verify.elements.token.value),()=>{clearTimeout(timer);password.reset();showAuth('resetNew');});
  });
  password.addEventListener('submit',event=>{
    event.preventDefault();
    run(()=>authStore.updateRecoveredPassword(password.elements.password.value,password.elements.confirm.value),()=>{
      password.reset();verify.reset();email='';showAuth('login');toast('密码已修改成功，请用新密码登录。');
    });
  });
  $('[data-cancel-reset]').addEventListener('click',()=>run(()=>authStore.cancelPasswordRecovery(),()=>{password.reset();showAuth('login');}));
  document.addEventListener('click',event=>{if(event.target.closest('[data-show-auth]'))updateResend();});
  authStore.subscribe(()=>queueMicrotask(updateResend));
}
