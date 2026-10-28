import {test,expect} from '@playwright/test';

const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'desktop-test@example.com',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{nickname:'测试研究员',lab_code:'FWTEST1'},created_at:'2026-01-01T00:00:00Z'};
const session={access_token:'test-access-token',refresh_token:'test-refresh-token',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
async function setup(page,{failSend=false,failSave=false}={}){
  const calls={send:[],verify:[],save:[],profiles:0,logout:0};
  await page.context().routeWebSocket('wss://**',ws=>ws.close());
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='127.0.0.1')return route.continue();
    if(!url.hostname.endsWith('.supabase.co'))return route.abort();
    const path=url.pathname;let body;try{body=req.postDataJSON();}catch{}
    let data:any=[],status=200;
    if(path.endsWith('/recover')){calls.send.push(body);if(failSend){status=503;data={message:'模拟发信失败'};}else data={};}
    else if(path.endsWith('/verify')){calls.verify.push(body);if(body.token==='012345')data=session;else{status=403;data={message:'Token has expired or is invalid',code:'otp_expired'};}}
    else if(path.endsWith('/user')){data=user;if(req.method()==='PUT'){calls.save.push(body);if(failSave){status=503;data={message:'模拟保存失败'};}}}
    else if(path.endsWith('/logout')){calls.logout++;data={};}
    else if(path.endsWith('/token'))data=session;
    else if(path.endsWith('/fw_get_current_profile')){calls.profiles++;data=[{id:user.id,nickname:'测试研究员',lab_code:'FWTEST1',role:'user',is_banned:false}];}
    return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/');await page.locator('[data-show-auth="reset"]').click();
  const form=page.locator('[data-auth-view="reset"]');await form.locator('[name="email"]').fill(user.email);
  return {calls,form,verify:page.locator('[data-auth-view="resetVerify"]'),password:page.locator('[data-auth-view="resetNew"]')};
}

test('客户端收到邮件后显示验证码，完成修改后仍需使用新密码登录',async({page})=>{
  const {calls,form,verify,password}=await setup(page);
  await form.locator('[type="submit"]').click();await expect(verify).toBeVisible();await expect(verify).toContainText(user.email);
  await expect(verify.locator('[data-resend-reset-code]')).toBeDisabled();await expect(password).toBeHidden();
  await verify.locator('[name="token"]').fill('999999');await verify.locator('[type="submit"]').click();await expect(page.locator('[data-form-status]')).toContainText('验证码不正确或已过期');
  expect(calls.save).toHaveLength(0);await expect(verify).toBeVisible();
  await verify.locator('[name="token"]').fill('012345');await verify.locator('[type="submit"]').click();await expect(password).toBeVisible();
  expect(calls.verify.at(-1)).toMatchObject({email:user.email,token:'012345',type:'recovery'});
  await expect(page.locator('#app')).toBeHidden();expect(calls.profiles).toBe(0);
  await password.locator('[name="password"]').fill('new-test-password');await password.locator('[name="confirm"]').fill('wrong-test-password');await password.locator('[type="submit"]').click();
  await expect(password).toBeVisible();await expect(page.locator('[data-form-status]')).toContainText('两次密码不一致');expect(calls.save).toHaveLength(0);
  await password.locator('[name="confirm"]').fill('new-test-password');await password.locator('[type="submit"]').click();
  await expect(page.locator('[data-auth-view="login"]')).toBeVisible();await expect(page.locator('[data-toast]')).toContainText('密码已修改成功');
  await expect(page.locator('#app')).toBeHidden();await expect(page.locator('[data-account-modal]')).toHaveAttribute('data-auth-locked','true');
  expect(calls.save).toHaveLength(1);expect(calls.save[0]).toMatchObject({password:'new-test-password'});expect(calls.profiles).toBe(0);
  expect(await page.evaluate(()=>localStorage.getItem('fw-lab-auth-token'))).toBeNull();
  const login=page.locator('[data-auth-view="login"]');await login.locator('[name="email"]').fill(user.email);await login.locator('[name="password"]').fill('new-test-password');await login.locator('[type="submit"]').click();
  await expect(page.locator('#app')).toBeVisible();await expect(page.locator('[data-account-label]')).toHaveText('测试研究员');
});

test('已收到验证码可直接填写，重发与返回保留同一邮箱',async({page})=>{
  const {calls,form,verify}=await setup(page);await form.locator('[data-reset-enter-code]').click();await expect(verify).toBeVisible();expect(calls.send).toHaveLength(0);
  await verify.locator('[data-resend-reset-code]').click();await expect(page.locator('[data-form-status]')).toContainText('验证码已重新发送');
  expect(calls.send).toHaveLength(1);expect(calls.send[0]).toMatchObject({email:user.email});await expect(verify.locator('[data-resend-reset-code]')).toBeDisabled();
  await verify.locator('[data-reset-back]').click();await expect(form).toBeVisible();await expect(form.locator('[name="email"]')).toHaveValue(user.email);
});

test('发信失败留在邮箱表单',async({page})=>{
  const {form,verify}=await setup(page,{failSend:true});await form.locator('[type="submit"]').click();await expect(page.locator('[data-form-status]')).toContainText('模拟发信失败');await expect(form).toBeVisible();await expect(verify).toBeHidden();
});

test('保存失败仍显示新密码表单，取消会清除恢复会话',async({page})=>{
  const {calls,form,verify,password}=await setup(page,{failSave:true});await form.locator('[data-reset-enter-code]').click();await verify.locator('[name="token"]').fill('012345');await verify.locator('[type="submit"]').click();
  await password.locator('[name="password"]').fill('new-test-password');await password.locator('[name="confirm"]').fill('new-test-password');await password.locator('[type="submit"]').click();
  await expect(password).toBeVisible();await expect(page.locator('[data-form-status]')).toContainText('模拟保存失败');await expect(password.locator('[type="submit"]')).toBeEnabled();
  await password.locator('[data-cancel-reset]').click();await expect(page.locator('[data-auth-view="login"]')).toBeVisible();expect(calls.logout).toBe(1);expect(await page.evaluate(()=>localStorage.getItem('fw-lab-auth-token'))).toBeNull();await expect(page.locator('#app')).toBeHidden();
});

test('恢复会话失效不允许更新密码，最小窗口可操作验证码表单',async({page})=>{
  await page.setViewportSize({width:760,height:560});const {calls,form,verify,password}=await setup(page);await form.locator('[data-reset-enter-code]').click();
  await expect(verify.locator('[name="token"]')).toBeInViewport();await expect(verify.locator('[type="submit"]')).toBeInViewport();
  await page.keyboard.press('Escape');await expect(verify).toBeVisible();await expect(page.locator('#app')).toBeHidden();
  await verify.locator('[name="token"]').fill('012345');await verify.locator('[type="submit"]').click();await expect(password).toBeVisible();
  await page.evaluate(()=>localStorage.removeItem('fw-lab-auth-token'));await password.locator('[name="password"]').fill('new-test-password');await password.locator('[name="confirm"]').fill('new-test-password');await password.locator('[type="submit"]').click();
  await expect(page.locator('[data-form-status]')).toContainText('找回密码状态已失效');expect(calls.save).toHaveLength(0);
});
