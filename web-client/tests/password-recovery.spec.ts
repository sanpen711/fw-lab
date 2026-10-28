import {test,expect} from '../../desktop-v11/node_modules/@playwright/test';
import {mock,session,user} from './fixtures';

async function recoveryMock(page,{failSend=false,failUpdate=false,saveError=null}={}){
  await mock(page);
  const calls={send:[],verify:[],update:[]};
  await page.route('**/auth/v1/recover*',route=>{
    calls.send.push(route.request().postDataJSON());
    return route.fulfill({status:failSend?503:200,contentType:'application/json',body:JSON.stringify(failSend?{message:'邮件发送失败，请重试。'}:{})});
  });
  await page.route('**/auth/v1/verify',route=>{
    const body=route.request().postDataJSON();calls.verify.push(body);
    return route.fulfill({status:body.token==='012345'?200:403,contentType:'application/json',body:JSON.stringify(body.token==='012345'?session:{code:'otp_expired',message:'Token has expired or is invalid'})});
  });
  await page.route('**/auth/v1/user',route=>{
    if(route.request().method()!=='PUT')return route.fallback();
    calls.update.push(route.request().postDataJSON());
    return route.fulfill({status:saveError?422:(failUpdate?503:200),contentType:'application/json',body:JSON.stringify(saveError||(failUpdate?{message:'密码保存失败，请重试。'}:user))});
  });
  return calls;
}
async function openReset(page){
  await page.goto('/');await page.locator('[data-open-account]').first().click();
  await page.locator('[data-show-auth="reset"]').click();
  const form=page.locator('[data-auth-view="reset"]');
  await form.locator('[name="email"]').fill('web-test@example.com');return form;
}

test('发送成功后立即显示验证码框，验证通过后才能设置密码并退出',async({page})=>{
  const calls=await recoveryMock(page);const form=await openReset(page);
  await form.locator('[type="submit"]').click();
  const recovery=page.locator('[data-web-password-recovery]');
  await expect(recovery.locator('[name="token"]')).toBeVisible();
  await expect(recovery).toContainText('web-test@example.com');
  await expect(recovery.locator('[name="password"]')).toHaveCount(0);
  await expect(recovery.locator('[data-web-recovery-resend]')).toBeDisabled();
  await recovery.locator('[name="token"]').fill('999999');await recovery.locator('[type="submit"]').click();
  await expect(recovery).toContainText('验证码不正确或已过期');
  expect(calls.update).toHaveLength(0);
  await recovery.locator('[name="token"]').fill('012345');await recovery.locator('[type="submit"]').click();
  await expect(recovery.locator('[name="password"]')).toBeVisible();
  expect(calls.verify.at(-1)).toMatchObject({type:'recovery',email:'web-test@example.com',token:'012345'});
  await recovery.locator('[name="password"]').fill('new-test-password');await recovery.locator('[name="confirm"]').fill('different-password');
  await recovery.locator('[type="submit"]').click();await expect(recovery).toContainText('两次密码不一致');expect(calls.update).toHaveLength(0);
  await recovery.locator('[name="confirm"]').fill('new-test-password');await recovery.locator('[type="submit"]').click();
  await expect(recovery).toHaveCount(0);await expect(page.locator('[data-toast]')).toContainText('密码已修改成功');
  expect(calls.update).toHaveLength(1);expect(calls.update[0]).toMatchObject({password:'new-test-password'});
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('sb-ekbovsmxbiplhyrzxoyw-auth-token'))).toBeNull();
  await expect(page.locator('[data-account-label]')).toHaveText('注册 / 登录');
});

test('发信失败保留原邮箱表单，避免误显示验证码已发送',async({page})=>{
  const calls=await recoveryMock(page,{failSend:true});const form=await openReset(page);
  await form.locator('[type="submit"]').click();
  await expect(page.locator('[data-form-status]')).toContainText('邮件发送失败');
  await expect(form).toBeVisible();await expect(form.locator('[name="email"]')).toHaveValue('web-test@example.com');
  await expect(page.locator('[data-web-password-recovery]')).toHaveCount(0);expect(calls.send).toHaveLength(1);
});

test('已收到验证码入口可直接填写，重发仅使用同一邮箱',async({page})=>{
  const calls=await recoveryMock(page);const form=await openReset(page);
  await form.locator('[data-web-recovery-enter-code]').click();
  const recovery=page.locator('[data-web-password-recovery]');await expect(recovery.locator('[name="token"]')).toBeVisible();
  expect(calls.send).toHaveLength(0);await recovery.locator('[data-web-recovery-resend]').click();
  await expect(recovery).toContainText('验证码已重新发送');expect(calls.send[0]).toMatchObject({email:'web-test@example.com'});
  await recovery.locator('[data-web-recovery-back]').click();await expect(form).toBeVisible();
  await expect(form.locator('[name="email"]')).toHaveValue('web-test@example.com');
});

test('恢复会话丢失时禁止提交新密码',async({page})=>{
  const calls=await recoveryMock(page);const form=await openReset(page);await form.locator('[data-web-recovery-enter-code]').click();
  const recovery=page.locator('[data-web-password-recovery]');await recovery.locator('[name="token"]').fill('012345');await recovery.locator('[type="submit"]').click();
  await expect(recovery.locator('[name="password"]')).toBeVisible();
  await page.evaluate(()=>localStorage.removeItem('sb-ekbovsmxbiplhyrzxoyw-auth-token'));
  await recovery.locator('[name="password"]').fill('new-test-password');await recovery.locator('[name="confirm"]').fill('new-test-password');
  await recovery.locator('[type="submit"]').click();await expect(recovery).toContainText('找回密码状态已失效');expect(calls.update).toHaveLength(0);
});

test('保存失败保留密码表单并允许重试',async({page})=>{
  const calls=await recoveryMock(page,{failUpdate:true});const form=await openReset(page);await form.locator('[data-web-recovery-enter-code]').click();
  const recovery=page.locator('[data-web-password-recovery]');await recovery.locator('[name="token"]').fill('012345');await recovery.locator('[type="submit"]').click();
  await recovery.locator('[name="password"]').fill('new-test-password');await recovery.locator('[name="confirm"]').fill('new-test-password');
  await recovery.locator('[type="submit"]').click();await expect(recovery).toContainText('密码保存失败');
  await expect(recovery.locator('[type="submit"]')).toBeEnabled();expect(calls.update).toHaveLength(1);
});

test('网页版新旧密码相同时显示中文原因',async({page})=>{
  await recoveryMock(page,{saveError:{code:'same_password',message:'New password should be different from the old password.'}});const form=await openReset(page);await form.locator('[data-web-recovery-enter-code]').click();
  const recovery=page.locator('[data-web-password-recovery]');await recovery.locator('[name="token"]').fill('012345');await recovery.locator('[type="submit"]').click();
  await recovery.locator('[name="password"]').fill('unchanged-test-password');await recovery.locator('[name="confirm"]').fill('unchanged-test-password');await recovery.locator('[type="submit"]').click();
  await expect(recovery.locator('[role="status"]')).toHaveText('新密码不能与原密码相同，请换一个新密码。');await expect(recovery.locator('[type="submit"]')).toBeEnabled();
});

test('验证码表单在窄屏可见，关闭和返回不触发密码更新',async({page})=>{
  const calls=await recoveryMock(page);await page.setViewportSize({width:390,height:650});
  const form=await openReset(page);await form.locator('[data-web-recovery-enter-code]').click();
  const recovery=page.locator('[data-web-password-recovery]');await expect(recovery.locator('[name="token"]')).toBeInViewport();
  await expect(recovery.getByRole('button',{name:'验证验证码',exact:true})).toBeInViewport();
  const bounds=await recovery.locator('form').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');await expect(recovery).toHaveCount(0);expect(calls.update).toHaveLength(0);
});

test('手机账号页完整显示并执行验证码找回流程',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('**/mobile-recovery-harness',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/app.css"><main class="app-shell"><div data-app-view="profile" class="is-active"><div data-profile-panel></div></div></main><div data-test-toast></div><script>
    const calls={send:[],verify:[],update:[]};window.testCalls=calls;let currentSession=null;const authListeners=[];
    window.FWApp={state:{user:null},$: (s,r)=>(r||document).querySelector(s),esc:v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),toast:t=>document.querySelector('[data-test-toast]').textContent=t,waitForDb:async()=>true,refreshUser:async()=>{},setView:()=>{}};
    window.fwDb={enabled:true,sendPasswordReset:async data=>calls.send.push(data),updatePassword:async data=>calls.update.push(data),signOut:async()=>{currentSession=null;},onAuthChange:fn=>authListeners.push(fn),client:{auth:{getSession:async()=>({data:{session:currentSession}}),verifyOtp:async data=>{calls.verify.push(data);if(data.token!=='012345')return{error:{message:'Token has expired or is invalid'}};currentSession={user:{id:'test-user',email:data.email}};authListeners.forEach(fn=>fn('PASSWORD_RECOVERY',currentSession));return{data:{session:currentSession}};}}}};
    </script><script src="/app/profile.js"></script><script>FWAppProfile.init();</script>`}));
  await page.goto('/mobile-recovery-harness');await page.locator('[data-profile-mode="login"]').first().click();await page.locator('[data-auth-view="reset"]').click();
  const form=page.locator('[data-reset-form]');await form.locator('[name="email"]').fill('mobile-test@example.com');await form.locator('[type="submit"]').click();
  const code=page.locator('[data-reset-code-form]');await expect(code.locator('[name="token"]')).toBeVisible();await expect(code).toContainText('mobile-test@example.com');
  await code.locator('[name="token"]').fill('999999');await code.locator('[type="submit"]').click();await expect(code).toBeVisible();
  await code.locator('[name="token"]').fill('012345');await code.locator('[type="submit"]').click();
  const password=page.locator('[data-reset-password-form]');await expect(password).toBeVisible();
  await password.locator('[name="password"]').fill('new-test-password');await password.locator('[name="password2"]').fill('new-test-password');await password.locator('[type="submit"]').click();
  await expect(page.locator('[data-login-form]')).toBeVisible();
  expect(await page.evaluate(()=>window.testCalls.verify.at(-1))).toEqual({email:'mobile-test@example.com',token:'012345',type:'recovery'});
  expect(await page.evaluate(()=>window.testCalls.update)).toEqual([{password:'new-test-password'}]);
});
