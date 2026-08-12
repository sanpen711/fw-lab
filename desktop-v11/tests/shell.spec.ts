import {expect,test} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.route('https://**.supabase.co/**',async route=>{
    const url=route.request().url();
    if(url.includes('/auth/v1/token') || url.includes('/auth/v1/user')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:null,session:null})});
    return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
});

test('本地首页保留桌面视觉和完整导航框架',async({page})=>{
  await page.goto('/');
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.getByRole('heading',{name:'F.w 研究所'})).toBeVisible();
  await expect(page.locator('[data-nav="home"].nav-item')).toHaveClass(/active/);
  await expect(page.locator('[data-badge="echo"]')).toBeHidden();
  await expect(page.locator('[data-badge="buddy"]')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>window.__FW_DESKTOP_V11__?.contentRequests)).toBe(0);
});

test('本地路由不重载网页并能返回首页',async({page})=>{
  await page.goto('/');
  const original=page.url();
  await page.locator('[data-nav="echo"].nav-item').click();
  await expect(page.locator('[data-pending-title]')).toHaveText('回声正在迁移');
  expect(page.url()).toBe(original);
  await page.getByRole('button',{name:'返回首页'}).click();
  await expect(page.locator('[data-view-panel="home"]')).toHaveClass(/active/);
});

test('账号入口打开本地登录注册界面',async({page})=>{
  await page.goto('/');
  await page.locator('[data-open-account]').last().click();
  await expect(page.locator('[data-account-modal]')).toBeVisible();
  await expect(page.locator('[data-auth-view="login"]')).toBeVisible();
  await page.getByRole('button',{name:'没有账号？去注册'}).click();
  await expect(page.locator('[data-auth-view="register"]')).toBeVisible();
  await expect(page.locator('[data-auth-view="register"] input[name="labCode"]')).toBeVisible();
  await page.locator('[data-close-account]').click();
  await expect(page.locator('[data-account-modal]')).toBeHidden();
});
