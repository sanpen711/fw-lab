import {test,expect} from '../../desktop-v11/node_modules/@playwright/test';
import {mock} from './fixtures';

const privateReads=/\/(polls|poll_options|shop_products|membership_plans|game_parties|private_messages|fw_chat_room_list)$/;
async function signIn(page){const form=page.locator('[data-auth-view="login"]');await form.locator('[name="email"]').fill('web-test@example.com');await form.locator('[name="password"]').fill('test-password');await form.locator('[type="submit"]').click();await expect(page.locator('[data-account-modal]')).toBeHidden();}

test('游客只读取帖子和精确评论数，不下载或显示评论正文',async({page})=>{
 const calls=await mock(page);await page.route('**/rest/v1/rpc/fw_public_post_comment_counts',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{post_id:101,comment_count:1234}])}));
 await page.goto('/square.html');await expect(page.locator('.post-comment-button')).toHaveText('评论 1234');await page.locator('.square-post .post-meta').click();
 await expect(page.locator('.comments-heading')).toContainText('1234 条');await expect(page.locator('.web-comments-locked')).toContainText('登录后查看评论');await expect(page.locator('.post-comment')).toHaveCount(0);await expect(page.locator('[data-comment-form]')).toHaveCount(0);expect(await page.content()).not.toContain('评论测试内容');expect(calls.some(c=>c.path.endsWith('/comments'))).toBe(false);
 await expect(page.locator('[data-account-modal]')).toBeHidden();
});

test('游客点击评论数量提示登录，登录后打开对应帖子及评论',async({page})=>{
 const calls=await mock(page);await page.goto('/square.html');await page.locator('.post-comment-button').click();await expect(page.locator('[data-account-modal]')).toBeVisible();expect(calls.some(c=>c.path.endsWith('/comments'))).toBe(false);
 await signIn(page);await expect(page).toHaveURL(/square.html\?post=101$/);await expect(page.locator('.post-comment')).toContainText('评论测试内容');await expect(page.locator('.web-comments-locked')).toHaveCount(0);
});

test('游客点击其他导航统一提示登录，不切换页面或请求板块数据',async({page})=>{
 const calls=await mock(page);await page.goto('/square.html');await expect(page.locator('.square-post')).toBeVisible();
 for(const view of ['rooms','chatrooms','play','games','buddy','archive','membership']){
  await page.locator(`.web-nav [data-nav="${view}"]`).click();await expect(page.locator('[data-account-modal]')).toBeVisible();await expect(page).toHaveURL(/square.html$/);await expect(page.locator('#app')).toHaveAttribute('data-view','square');await page.locator('[data-close-account]').click();
 }
 expect(calls.filter(c=>privateReads.test(c.path))).toEqual([]);
});

test('其他板块直链、旧链接及广场私人标签不能绕过登录',async({page})=>{
 test.setTimeout(90000);const calls=await mock(page);
 for(const route of ['rooms','chatrooms','play','games','buddy','archive','membership','shop','compose','settings','activities','announcements','rules','moderation','bird','echo','square.html?tab=echo','square.html?tab=mine']){
  await page.goto('/'+(route.includes('.html')?route:route+'.html'));await expect(page.locator('[data-account-modal]')).toBeVisible();await expect(page.locator('#app')).toHaveAttribute('data-view','home');await expect(page).toHaveURL(/index.html$/);await page.locator('[data-close-account]').click();
 }
 expect(calls.filter(c=>privateReads.test(c.path))).toEqual([]);
});

test('直接访问会员装扮，验证登录后恢复目标而非提前加载',async({page})=>{
 const calls=await mock(page);await page.goto('/membership.html?tab=appearance');await expect(page.locator('[data-account-modal]')).toBeVisible();expect(calls.filter(c=>privateReads.test(c.path))).toEqual([]);await signIn(page);await expect(page).toHaveURL(/membership.html\?tab=appearance$/);await expect(page.locator('.membership-appearance-page')).toBeVisible();
});

test('取消登录会清除待进入板块，稍后主动登录仍留在首页',async({page})=>{
 await mock(page);await page.goto('/games.html');await expect(page.locator('[data-account-modal]')).toBeVisible();await page.locator('[data-close-account]').click();await page.locator('[data-open-account]').first().click();await signIn(page);await expect(page.locator('#app')).toHaveAttribute('data-view','home');
});

test('退出后移除评论正文，改用评论数量接口并限制其他板块',async({page})=>{
 const calls=await mock(page,{loggedIn:true});await page.goto('/square.html?post=101');await expect(page.locator('.post-comment')).toContainText('评论测试内容');await page.locator('[data-open-account]').first().click();page.once('dialog',d=>d.accept());await page.locator('[data-sign-out]').click();await expect(page.locator('[data-account-label]')).toHaveText('注册 / 登录');await expect(page.locator('.post-comment')).toHaveCount(0);expect(await page.content()).not.toContain('评论测试内容');await expect.poll(()=>calls.some(c=>c.path.endsWith('/fw_public_post_comment_counts'))).toBe(true);await page.locator('.web-nav [data-nav="games"]').click();await expect(page.locator('[data-account-modal]')).toBeVisible();
});

test('已有有效会话直接访问受限页不闪登录，失效会话不能进入',async({page,browser})=>{
 await mock(page,{loggedIn:true});await page.goto('/rooms.html');await expect(page.locator('.poll-card')).toBeVisible();await expect(page.locator('[data-account-modal]')).toBeHidden();
 const context=await browser.newContext();const invalid=await context.newPage();await mock(invalid,{loggedIn:true});await invalid.route('**/auth/v1/user',r=>r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'expired',code:'bad_jwt'})}));await invalid.goto('http://127.0.0.1:4175/rooms.html');await expect(invalid.locator('[data-account-modal]')).toBeVisible();await expect(invalid.locator('#app')).toHaveAttribute('data-view','home');await context.close();
});
