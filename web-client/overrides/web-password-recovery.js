import {authStore} from './auth-store.js';

let email='',verifiedUserId='',busy=false,verifying=false,resendAt=0,timer=0,previousFocus=null;
const client=authStore.client;
const $=selector=>document.querySelector(selector);
const normalizeEmail=value=>String(value||'').trim().toLowerCase();
function message(error){
  const text=String(error?.message||error||'操作失败，请重试。');
  if(/otp|token/i.test(text)&&/invalid|expired/i.test(text))return '验证码不正确或已过期，请检查或重新发送。';
  if(/rate.limit|too.many|seconds/i.test(text))return '验证码发送太频繁，请稍后重试。';
  return text;
}
function notify(text){window.__FW_WEB_APP__?.notify(text);}
function status(text){const node=$('[data-web-password-recovery] [role="status"]');if(node)node.textContent=text||'';}
function updateResend(){
  const button=$('[data-web-recovery-resend]');if(!button)return;
  const seconds=Math.max(0,Math.ceil((resendAt-Date.now())/1000));
  button.disabled=busy||seconds>0;button.textContent=seconds?`${seconds} 秒后重新发送`:'重新发送验证码';
}
function setBusy(value){
  busy=value;const modal=$('[data-web-password-recovery]');
  modal?.querySelectorAll('input,button').forEach(node=>node.disabled=value);
  modal?.setAttribute('aria-busy',String(value));updateResend();
}
function remove(){
  clearInterval(timer);timer=0;$('[data-web-password-recovery]')?.remove();
  if($('[data-account-modal]')?.hidden)document.body.classList.remove('modal-open');
}
async function cancel(back=false){
  if(busy)return;
  if(verifiedUserId){
    setBusy(true);
    const result=await client.auth.signOut().catch(error=>({error}));
    if(result.error){setBusy(false);status(message(result.error));return;}
    verifiedUserId='';busy=false;
  }
  remove();
  const account=$('[data-account-modal]');
  if(back&&account){account.hidden=false;document.body.classList.add('modal-open');account.querySelector('[data-auth-view="reset"] input')?.focus();}
  else if(previousFocus?.isConnected)previousFocus.focus();
}
function dialog(title,copy,fields,actions){
  remove();previousFocus=document.activeElement;
  const modal=document.createElement('div');modal.className='web-recovery';modal.dataset.webPasswordRecovery='';
  modal.innerHTML=`<form role="dialog" aria-modal="true" aria-labelledby="web-recovery-title"><div class="web-recovery-heading"><h2 id="web-recovery-title"></h2><button type="button" class="web-recovery-close" data-web-recovery-cancel aria-label="关闭找回密码">×</button></div><p class="web-recovery-copy"></p>${fields}<p role="status" aria-live="polite"></p>${actions}</form>`;
  modal.querySelector('h2').textContent=title;modal.querySelector('.web-recovery-copy').textContent=copy;
  document.body.append(modal);document.body.classList.add('modal-open');
  modal.querySelector('[data-web-recovery-cancel]').addEventListener('click',()=>cancel());
  modal.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancel();return;}
    if(event.key!=='Tab')return;
    const nodes=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled])')];
    if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1)?.focus();}
    else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0]?.focus();}
  });
  requestAnimationFrame(()=>modal.querySelector('input')?.focus());
  return modal;
}
async function send(value){
  const next=normalizeEmail(value);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next))throw new Error('请填写有效的注册邮箱。');
  await authStore.sendPasswordReset(next);
  email=next;verifiedUserId='';resendAt=Date.now()+60000;
  return {email};
}
function showCode(value=email){
  email=normalizeEmail(value);verifiedUserId='';
  const modal=dialog('验证邮箱验证码',`验证码已发送至 ${email}，请输入邮件中的验证码。`,
    '<label>验证码<input name="token" type="text" inputmode="numeric" autocomplete="one-time-code" minlength="6" maxlength="10" pattern="[0-9]{6,10}" placeholder="输入邮件中的验证码" required></label>',
    '<button class="primary" type="submit">验证验证码</button><div class="web-recovery-actions"><button type="button" class="secondary" data-web-recovery-resend>重新发送验证码</button><button type="button" class="secondary" data-web-recovery-back>返回填写邮箱</button></div>');
  updateResend();timer=setInterval(updateResend,1000);
  modal.querySelector('[data-web-recovery-back]').addEventListener('click',()=>cancel(true));
  modal.querySelector('[data-web-recovery-resend]').addEventListener('click',async()=>{
    if(busy||Date.now()<resendAt)return;
    setBusy(true);status('正在重新发送…');
    try{await send(email);status('验证码已重新发送，请查看邮箱。');}
    catch(error){status(message(error));}
    finally{setBusy(false);}
  });
  modal.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const token=String(new FormData(event.currentTarget).get('token')||'').replace(/\s/g,'');
    if(!/^\d{6,10}$/.test(token)){status('请输入邮件中的数字验证码。');return;}
    setBusy(true);status('正在验证…');verifying=true;
    try{
      const result=await client.auth.verifyOtp({email,token,type:'recovery'});
      if(result.error)throw result.error;
      const user=result.data?.session?.user;
      if(!user?.id)throw new Error('验证状态已失效，请重新获取验证码。');
      verifiedUserId=user.id;verifying=false;setBusy(false);showPassword();
    }catch(error){status(message(error));}
    finally{verifying=false;setBusy(false);}
  });
}
function showPassword(){
  if(!verifiedUserId)return;
  const modal=dialog('设置新密码','邮箱验证成功，设置新密码后请重新登录。',
    '<label>新密码<input name="password" type="password" autocomplete="new-password" minlength="8" placeholder="至少 8 位" required></label><label>确认新密码<input name="confirm" type="password" autocomplete="new-password" minlength="8" placeholder="再输入一次新密码" required></label>',
    '<button class="primary" type="submit">保存新密码</button>');
  modal.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const data=new FormData(event.currentTarget),password=String(data.get('password')||'');
    if(password.length<8){status('新密码至少 8 位。');return;}
    if(password!==data.get('confirm')){status('两次密码不一致。');return;}
    setBusy(true);status('正在保存…');
    try{
      const current=await client.auth.getSession();if(current.error)throw current.error;
      if(!verifiedUserId||current.data?.session?.user?.id!==verifiedUserId)throw new Error('找回密码状态已失效，请重新验证邮箱。');
      const result=await client.auth.updateUser({password});if(result.error)throw result.error;
      const signedOut=await client.auth.signOut();if(signedOut.error)throw signedOut.error;
      verifiedUserId='';email='';remove();notify('密码已修改成功，请用新密码登录。');
    }catch(error){status(message(error));}
    finally{setBusy(false);}
  });
}
function acceptSession(session){
  // Only called for the SDK's verified PASSWORD_RECOVERY event, never URL text.
  if(verifying||!session?.user?.id)return;
  verifiedUserId=session.user.id;email=normalizeEmail(session.user.email);showPassword();
}
function install(){
  $('[data-web-recovery-enter-code]')?.addEventListener('click',()=>{
    const form=$('[data-auth-view="reset"]');if(!form.reportValidity())return;
    email=normalizeEmail(form.elements.email.value);$('[data-account-modal]').hidden=true;showCode(email);
  });
}
export const webRecovery={send,showCode,acceptSession,install};
