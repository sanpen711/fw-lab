import {test,expect} from '../../desktop-v11/node_modules/@playwright/test';
import {mock,expectLoginHint,expectGuestGate} from './fixtures';

const privateReads=/\/(polls|poll_options|shop_products|membership_plans|game_parties|private_messages|fw_chat_room_list)$/;
async function signIn(page,entry='[data-open-account]'){await page.locator(entry).first().click();await expect(page.locator('[data-account-modal]')).toBeVisible();const form=page.locator('[data-auth-view="login"]');await form.locator('[name="email"]').fill('web-test@example.com');await form.locator('[name="password"]').fill('test-password');await form.locator('[type="submit"]').click();await expect(page.locator('[data-account-modal]')).toBeHidden();}

test('游客只读取帖子和精确评论数，不下载或显示评论正文',async({page})=>{
 const calls=await mock(page);await page.route('**/rest/v1/rpc/fw_public_post_comment_counts',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{post_id:101,comment_count:1234}])}));
 await page.goto('/square.html');await expect(page.locator('.post-comment-button')).toHaveText('评论 1234');await page.locator('.square-post .post-meta').click();
 await expect(page.locator('.comments-heading')).toContainText('1234 条');await expect(page.locator('.web-comments-locked')).toContainText('登录后查看评论');await expect(page.locator('.post-comment')).toHaveCount(0);await expect(page.locator('[data-comment-form]')).toHaveCount(0);expect(await page.content()).not.toContain('评论测试内容');expect(calls.some(c=>c.path.endsWith('/comments'))).toBe(false);
 await expect(page.locator('[data-account-modal]')).toBeHidden();
});

test('游客点击评论只显示轻提示，主动登录后打开对应帖子及评论',async({page})=>{
 const calls=await mock(page);await page.goto('/square.html');await page.locator('.post-comment-button').click();await expectLoginHint(page);expect(calls.some(c=>c.path.endsWith('/comments'))).toBe(false);
 await signIn(page);await expect(page).toHaveURL(/square.html\?post=101$/);await expect(page.locator('.post-comment')).toContainText('评论测试内容');await expect(page.locator('.web-comments-locked')).toHaveCount(0);
});

test('游客进入其他板块后只显示居中登录提示与按钮，不读取板块数据',async({page})=>{
 const calls=await mock(page);await page.goto('/square.html');await expect(page.locator('.square-post')).toBeVisible();
 for(const view of ['rooms','chatrooms','play','games','buddy','archive','membership']){
  await page.locator(`.web-nav [data-nav="${view}"]`).click();await expectGuestGate(page,view);await expect(page).toHaveURL(new RegExp(view+'\\.html$'));await expect(page.locator(`.web-nav [data-nav="${view}"]`)).toHaveAttribute('aria-current','page');
 }
 expect(calls.filter(c=>privateReads.test(c.path))).toEqual([]);
});

test('其他板块直链、旧链接及广场私人标签不能绕过登录',async({page})=>{
 test.setTimeout(90000);const calls=await mock(page);
 for(const route of ['rooms','chatrooms','play','games','buddy','archive','membership','shop','compose','settings','activities','announcements','rules','moderation','bird','echo','square.html?tab=echo','square.html?tab=mine']){
  await page.goto('/'+(route.includes('.html')?route:route+'.html'));await expectGuestGate(page);const path='/'+(route.includes('.html')?route:route+'.html');expect(new URL(page.url()).pathname).toBe(path.split('?')[0]);
 }
 expect(calls.filter(c=>privateReads.test(c.path))).toEqual([]);
});

test('直接访问会员装扮，验证登录后恢复目标而非提前加载',async({page})=>{
 const calls=await mock(page);await page.goto('/membership.html?tab=appearance');await expectGuestGate(page,'membership');expect(calls.filter(c=>privateReads.test(c.path))).toEqual([]);await signIn(page,'[data-web-guest-gate] [data-open-account]');await expect(page.locator('[data-web-guest-gate]')).toBeHidden();await expect(page).toHaveURL(/membership.html\?tab=appearance$/);await expect(page.locator('.membership-appearance-page')).toBeVisible();
});

test('取消登录后留在当前板块提示页，再次主动登录后显示该板块内容',async({page})=>{
 await mock(page);await page.goto('/games.html');await expectGuestGate(page,'games');await page.locator('[data-open-account]').first().click();await expect(page.locator('[data-account-modal]')).toBeVisible();await page.locator('[data-close-account]').click();await expectGuestGate(page,'games');await signIn(page,'[data-web-guest-gate] [data-open-account]');await expect(page.locator('#app')).toHaveAttribute('data-view','games');await expect(page.locator('[data-web-guest-gate]')).toBeHidden();await expect(page.locator('[data-game-open]')).toHaveCount(6);
});

test('退出后移除评论正文，改用评论数量接口并限制其他板块',async({page})=>{
 const calls=await mock(page,{loggedIn:true});await page.goto('/square.html?post=101');await expect(page.locator('.post-comment')).toContainText('评论测试内容');await page.locator('[data-open-account]').first().click();page.once('dialog',d=>d.accept());await page.locator('[data-sign-out]').click();await expect(page.locator('[data-account-label]')).toHaveText('注册 / 登录');await expect(page.locator('.post-comment')).toHaveCount(0);expect(await page.content()).not.toContain('评论测试内容');await expect.poll(()=>calls.some(c=>c.path.endsWith('/fw_public_post_comment_counts'))).toBe(true);await page.locator('.web-nav [data-nav="games"]').click();await expectGuestGate(page,'games');
});

test('已有有效会话直接访问受限页不闪登录，失效会话不能进入',async({page,browser})=>{
 await mock(page,{loggedIn:true});await page.goto('/rooms.html');await expect(page.locator('.poll-card')).toBeVisible();await expect(page.locator('[data-account-modal]')).toBeHidden();
 const context=await browser.newContext();const invalid=await context.newPage();await mock(invalid,{loggedIn:true});await invalid.route('**/auth/v1/user',r=>r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'expired',code:'bad_jwt'})}));await invalid.goto('http://127.0.0.1:4175/rooms.html');await expectGuestGate(invalid,'rooms');await context.close();
});


test('离开板块登录提示页后继续浏览公开页面，稍后登录留在当前页面',async({page})=>{
 await mock(page);await page.goto('/');await page.locator('.web-nav [data-nav="games"]').click();await expectGuestGate(page,'games');await page.locator('.web-nav [data-nav="square"]').click();await expect(page.locator('[data-web-guest-gate]')).toBeHidden();await expect(page.locator('.square-post')).toBeVisible();await signIn(page);await expect(page).toHaveURL(/square.html$/);await expect(page.locator('#app')).toHaveAttribute('data-view','square');
});


test('游客板块提示页支持刷新、返回和前进，按钮可用键盘打开登录',async({page})=>{
 await mock(page);await page.goto('/square.html');await expect(page.locator('.square-post')).toBeVisible();
 await page.locator('.web-nav [data-nav="rooms"]').click();await expectGuestGate(page,'rooms');await page.locator('.web-nav [data-nav="buddy"]').click();await expectGuestGate(page,'buddy');
 await page.goBack();await expectGuestGate(page,'rooms');await page.goBack();await expect(page.locator('.square-post')).toBeVisible();await expect(page.locator('[data-web-guest-gate]')).toBeHidden();
 await page.goForward();await expectGuestGate(page,'rooms');await page.reload();await expectGuestGate(page,'rooms');
 await page.locator('[data-web-guest-gate] button').focus();await page.keyboard.press('Enter');await expect(page.locator('[data-account-modal]')).toBeVisible();await page.locator('[data-close-account]').click();await expectGuestGate(page,'rooms');
});

test('受限板块退出登录后只显示提示，重新登录恢复当前板块',async({page})=>{
 await mock(page,{loggedIn:true});await page.goto('/rooms.html');await expect(page.locator('.poll-card')).toBeVisible();await page.locator('[data-open-account]').first().click();page.once('dialog',d=>d.accept());await page.locator('[data-sign-out]').click();await expectGuestGate(page,'rooms');await expect(page).toHaveURL(/rooms.html$/);await expect(page.locator('.poll-card:visible')).toHaveCount(0);await signIn(page,'[data-web-guest-gate] [data-open-account]');await expect(page.locator('.poll-card')).toBeVisible();await expect(page.locator('[data-web-guest-gate]')).toBeHidden();
});

test('游客可以进入我的和回声提示页，也可以返回公开广场',async({page})=>{
 const calls=await mock(page);await page.goto('/square.html');await expect(page.locator('.square-post')).toBeVisible();
 for(const [button,mode] of [['mine','mine'],['echo','echo']]){await page.locator(`[data-square-${button}-toggle]`).click();await expectGuestGate(page,'square');await expect(page).toHaveURL(new RegExp('tab='+mode+'$'));await page.locator('.web-nav [data-nav="square"]').click();await expect(page.locator('.square-post')).toBeVisible();await expect(page.locator('[data-web-guest-gate]')).toBeHidden();}
 expect(calls.some(c=>/\/(notifications|fw_chat_room_list|private_messages)$/.test(c.path))).toBe(false);
});

for(const viewport of [{width:760,height:560},{width:1440,height:900}])test(`游客板块提示在 ${viewport.width} 窗口居中，内容区只有提示与按钮`,async({page})=>{
 await page.setViewportSize(viewport);await mock(page);await page.goto('/rooms.html');await expectGuestGate(page,'rooms');
 const main=await page.locator('#web-main').boundingBox(),title=await page.locator('#web-guest-gate-title').boundingBox(),button=await page.locator('[data-web-guest-gate] button').boundingBox();
 expect(Math.abs(title.x+title.width/2-viewport.width/2)).toBeLessThan(2);expect(Math.abs(button.x+button.width/2-viewport.width/2)).toBeLessThan(2);
 expect(Math.abs((title.y+button.y+button.height)/2-(main.y+main.height/2))).toBeLessThan(20);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
