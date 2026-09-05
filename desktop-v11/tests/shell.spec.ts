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

test('回声已经是本地页面且导航不会重载网页',async({page})=>{
  await page.goto('/');
  const original=page.url();
  await page.locator('[data-nav="echo"].nav-item').click();
  await expect(page.locator('[data-view-panel="echo"]')).toHaveClass(/active/);
  await expect(page.getByRole('heading',{name:'回声通知'})).toBeVisible();
  await expect(page.getByText('登录后查看回声')).toBeVisible();
  expect(page.url()).toBe(original);
  await page.locator('[data-nav="home"].nav-item').click();
  await expect(page.locator('[data-view-panel="home"]')).toHaveClass(/active/);
});

test('搭子和私聊使用本地左右分栏且没有定时轮询',async({page})=>{
  await page.goto('/');
  await page.locator('[data-nav="buddy"].nav-item').click();
  await expect(page.locator('[data-view-panel="buddy"]')).toHaveClass(/active/);
  await expect(page.locator('[data-buddy-tab="messages"]')).toBeVisible();
  await expect(page.locator('[data-buddy-tab="friends"]')).toBeVisible();
  await expect(page.locator('[data-buddy-tab="new"]')).toBeVisible();
  await expect(page.locator('[data-chat-messages]')).toContainText('还没有选择聊天对象');
  await expect(page.locator('[data-chat-compose] input')).toBeDisabled();
  await expect.poll(()=>page.evaluate(()=>window.__FW_DESKTOP_V11__?.pollingTimers)).toBe(0);
});

test('账号入口打开本地登录注册界面',async({page})=>{
  await page.goto('/');
  await page.locator('.account-button[data-open-account]').click();
  await expect(page.locator('[data-account-modal]')).toBeVisible();
  await expect(page.locator('[data-auth-view="login"]')).toBeVisible();
  await page.getByRole('button',{name:'没有账号？去注册'}).click();
  await expect(page.locator('[data-auth-view="register"]')).toBeVisible();
  await expect(page.locator('[data-auth-view="register"] input[name="labCode"]')).toBeVisible();
  await page.locator('[data-close-account]').click();
  await expect(page.locator('[data-account-modal]')).toBeHidden();
});

test('发牢骚和精神广场均为本地页面且内容按需读取',async({page})=>{
  await page.goto('/');
  const original=page.url();
  await expect.poll(()=>page.evaluate(()=>window.__FW_DESKTOP_V11__?.contentRequests)).toBe(0);
  await page.locator('.hero-actions [data-nav="compose"]').click();
  await expect(page.locator('[data-view-panel="compose"]')).toHaveClass(/active/);
  await expect(page.getByRole('heading',{name:'发一句牢骚'})).toBeVisible();
  await expect(page.getByText('登录后发牢骚')).toBeVisible();
  expect(page.url()).toBe(original);
  await page.locator('[data-nav="square"].nav-item').click();
  await expect(page.locator('[data-view-panel="square"]')).toHaveClass(/active/);
  await expect(page.getByRole('heading',{name:'精神广场'})).toBeVisible();
  await expect(page.locator('[data-post-detail]')).toContainText('选择一条帖子');
  await expect.poll(()=>page.evaluate(()=>window.__FW_DESKTOP_V11__?.contentRequests)).toBeGreaterThan(0);
  expect(page.url()).toBe(original);
});

test('学术研讨为本地按需页面并保留投票分类',async({page})=>{
  await page.goto('/');
  const original=page.url();
  await expect.poll(()=>page.evaluate(()=>window.__FW_DESKTOP_V11__?.contentRequests)).toBe(0);
  await page.locator('[data-nav="rooms"].nav-item').click();
  await expect(page.locator('[data-view-panel="rooms"]')).toHaveClass(/active/);
  await expect(page.getByRole('heading',{name:'学术研讨'})).toBeVisible();
  await expect(page.locator('[data-poll-filter="all"]')).toBeVisible();
  await expect(page.locator('[data-poll-filter="official"]')).toBeVisible();
  await expect(page.locator('[data-poll-filter="user"]')).toBeVisible();
  await expect(page.locator('[data-poll-filter="ended"]')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__FW_DESKTOP_V11__?.contentRequests)).toBeGreaterThan(0);
  await page.locator('[data-poll-create-toggle]').click();
  await expect(page.getByText('登录后发起课题')).toBeVisible();
  expect(page.url()).toBe(original);
});

test('新闻专区为本地双栏按需页面',async({page})=>{
  await page.goto('/');
  const original=page.url();
  await expect.poll(()=>page.evaluate(()=>window.__FW_DESKTOP_V11__?.contentRequests)).toBe(0);
  await page.locator('[data-nav="bird"].nav-item').click();
  await expect(page.locator('[data-view-panel="bird"]')).toHaveClass(/active/);
  await expect(page.getByRole('heading',{name:'新闻专区'})).toBeVisible();
  await expect(page.locator('[data-bird-detail]')).toContainText('选择一条内容');
  await expect.poll(()=>page.evaluate(()=>window.__FW_DESKTOP_V11__?.contentRequests)).toBeGreaterThan(0);
  await page.locator('[data-bird-compose-toggle]').click();
  await expect(page.getByText('登录后发布内容')).toBeVisible();
  expect(page.url()).toBe(original);
});

test('废话档案为本地按需榜单页面',async({page})=>{
  await page.goto('/');
  const original=page.url();
  await expect.poll(()=>page.evaluate(()=>window.__FW_DESKTOP_V11__?.contentRequests)).toBe(0);
  await page.locator('[data-nav="archive"].nav-item').click();
  await expect(page.locator('[data-view-panel="archive"]')).toHaveClass(/active/);
  await expect(page.getByRole('heading',{name:'废话档案',exact:true})).toBeVisible();
  await expect(page.getByText('上周低功耗荣誉榜')).toBeVisible();
  await expect(page.getByText('昨日情绪残留榜')).toBeVisible();
  await expect(page.locator('[data-archive-daily="like"]')).toBeVisible();
  await expect(page.locator('[data-archive-daily="same"]')).toBeVisible();
  await expect(page.locator('[data-archive-daily="tissue"]')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__FW_DESKTOP_V11__?.contentRequests)).toBeGreaterThan(0);
  expect(page.url()).toBe(original);
});
