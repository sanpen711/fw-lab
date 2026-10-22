import {test,expect} from '../../desktop-v11/node_modules/@playwright/test';
import {mock} from './fixtures';

test('游客首页可直接浏览，活动详情要求登录',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const calls=await mock(page);
 await page.goto('/');await expect(page.locator('[data-home-announcement]')).toContainText('欢迎来研究所');await expect(page.locator('[data-account-modal]')).toBeHidden();
 await page.locator('[data-nav="activities"]').click();await expect(page.locator('[data-account-modal]')).toBeVisible();await expect(page.locator('#app')).toHaveAttribute('data-view','home');
 expect(calls.filter(c=>/\/(shop_orders|private_messages|membership_orders|notifications)$/.test(c.path))).toEqual([]);expect(errors).toEqual([]);
});
test('游客可读广场和评论数量，投票板块与互动提示登录',async({page})=>{
 const calls=await mock(page);await page.goto('/square.html');await expect(page.locator('[data-square-feed]')).toContainText('今天也在低功耗运行');await expect(page.locator('.post-comment-button')).toHaveText('评论 1');await page.locator('[data-react]').first().click();await expect(page.locator('[data-account-modal]')).toBeVisible();await page.locator('[data-close-account]').click();
 await page.locator('[data-nav="rooms"]').click();await expect(page.locator('[data-account-modal]')).toBeVisible();await expect(page.locator('#app')).toHaveAttribute('data-view','square');
 expect(calls.filter(c=>/\/(fw_vote_poll|fw_create_poll_v2|polls|comments)$/.test(c.path))).toEqual([]);
});
test('游客商城直链先提示登录，不读取商品和订单',async({page})=>{
 const calls=await mock(page);await page.goto('/shop.html');await expect(page.locator('[data-account-modal]')).toBeVisible();await expect(page.locator('#app')).toHaveAttribute('data-view','home');await expect(page.locator('.shop-product-card:visible')).toHaveCount(0);expect(calls.some(c=>/\/(shop_products|shop_orders)$/.test(c.path))).toBe(false);
});
test('登录用户可发布新版投票并保留补充权限',async({page})=>{
 const calls=await mock(page,{loggedIn:true});await page.goto('/rooms.html');await page.locator('[data-poll-create-toggle]').click();const form=page.locator('[data-poll-create-form]');await form.locator('[name="title"]').fill('网页研究');await form.locator('[name="option1"]').fill('甲');await form.locator('[name="option2"]').fill('乙');await form.locator('[name="durationDays"]').selectOption('30');await form.locator('[name="allowUserOptions"]').check();await form.locator('[type="submit"]').click();await expect(page.locator('[data-toast]')).toContainText('已发布');expect(calls.find(c=>c.path.endsWith('/fw_create_poll_v2'))?.body).toEqual({p_title:'网页研究',p_options:['甲','乙'],p_is_official:false,p_duration_days:30,p_allow_user_options:true});
});

test('游客房间和搭子入口弹登录，关闭后继续浏览首页',async({page})=>{
 const calls=await mock(page);await page.goto('/chatrooms.html');await expect(page.locator('[data-account-modal]')).toBeVisible();await expect(page.locator('#app')).toHaveAttribute('data-view','home');await page.locator('[data-close-account]').click();await page.locator('[data-nav="buddy"]').click();await expect(page.locator('[data-account-modal]')).toBeVisible();await expect(page.locator('#app')).toHaveAttribute('data-view','home');expect(calls.some(c=>c.path.endsWith('/fw_chat_room_list'))).toBe(false);
});
test('网页保留访客浏览，登录后可退出返回访客状态',async({page})=>{
 await mock(page);await page.goto('/');await page.locator('[data-open-account]').first().click();const form=page.locator('[data-auth-view="login"]');await form.locator('[name="email"]').fill('web-test@example.com');await form.locator('[name="password"]').fill('test-password');await form.locator('[type="submit"]').click();await expect(page.locator('[data-account-label]')).toHaveText('网页研究员');await expect(page.locator('[data-account-modal]')).toBeHidden();await page.locator('[data-open-account]').first().click();page.once('dialog',dialog=>dialog.accept());await page.locator('[data-sign-out]').click();await expect(page.locator('[data-account-label]')).toHaveText('注册 / 登录');await expect(page.locator('[data-account-modal]')).toBeHidden();await expect(page.locator('#app')).toBeVisible();
});
test('旧新闻链接进入闲聊房间，网页版路径刷新和返回有效',async({page})=>{
 await mock(page,{loggedIn:true});await page.goto('/bird.html');await expect(page.locator('#app')).toHaveAttribute('data-view','chatrooms');await page.locator('[data-nav="rooms"]').click();await expect(page).toHaveURL(/rooms.html$/);await page.reload();await expect(page.locator('[data-poll-list]')).toContainText('今天的研究课题');await page.goBack();await expect(page.locator('#app')).toHaveAttribute('data-view','chatrooms');
});
test('广场“我的”和回声需要登录，登录用户可以使用',async({page})=>{
 await mock(page,{loggedIn:true});await page.goto('/square.html');await page.locator('[data-square-mine-toggle]').click();await expect(page.locator('[data-square-mine-toggle]')).toHaveAttribute('aria-pressed','true');await page.locator('[data-square-echo-toggle]').click();await expect(page.locator('[data-square-echo-panel]')).toBeVisible();
});
test('未开放补充的投票不显示输入框，投票失败可重试',async({page})=>{
 await mock(page,{loggedIn:true,fail:'fw_vote_poll'});await page.goto('/rooms.html');await expect(page.locator('[data-poll-add-option]')).toHaveCount(0);await expect(page.locator('.poll-card')).toContainText('发起人未开放补充选项');await page.locator('[data-poll-vote]').first().click();await expect(page.locator('[data-toast]')).toContainText('模拟网络失败');await expect(page.locator('[data-poll-vote]').first()).toBeEnabled();
});
test('投票重复选项不提交，网络失败保留完整输入',async({page})=>{
 const calls=await mock(page,{loggedIn:true,fail:'fw_create_poll_v2'});await page.goto('/rooms.html');await page.locator('[data-poll-create-toggle]').click();const form=page.locator('[data-poll-create-form]');await form.locator('[name="title"]').fill('保留输入');await form.locator('[name="option1"]').fill('重复');await form.locator('[name="option2"]').fill('重复');await form.locator('[type="submit"]').click();await expect(page.locator('[data-toast]')).toContainText('不能重复');expect(calls.some(c=>c.path.endsWith('/fw_create_poll_v2'))).toBe(false);await form.locator('[name="option2"]').fill('另一个');await form.locator('[name="durationDays"]').selectOption('15');await form.locator('[type="submit"]').click();await expect(page.locator('[data-toast]')).toContainText('模拟网络失败');await expect(form.locator('[name="title"]')).toHaveValue('保留输入');await expect(form.locator('[name="durationDays"]')).toHaveValue('15');
});
test('非会员仍能浏览和加入组队，创建显示会员说明',async({page})=>{
 await mock(page,{loggedIn:true,member:false});await page.goto('/play.html');await expect(page.locator('[data-party-list]')).toContainText('今晚一起开黑');await page.locator('[data-party-create-toggle]').click();await expect(page.locator('[data-party-create-host]')).toContainText('会员才能创建组队');
});
test('登录后闲聊房间接入新界面与创建表单',async({page})=>{
 const calls=await mock(page,{loggedIn:true});await page.goto('/chatrooms.html');await expect.poll(()=>calls.some(c=>c.path.endsWith('/fw_chat_room_list'))).toBe(true);await page.locator('[data-room-create]').click();await expect(page.locator('[data-room-editor-form]')).toBeVisible();await expect(page.locator('[data-room-editor-form]')).toContainText('创建');
});
test('会员展示等级、装扮、商城及订单入口',async({page})=>{
 await mock(page,{loggedIn:true});await page.goto('/membership.html');await expect(page.locator('[data-membership-content]')).toContainText('会员权益');await expect(page.locator('[data-membership-content]')).toContainText('V2');await page.locator('[data-membership-tab="appearance"]').first().click();await expect(page.locator('.membership-appearance-page')).toBeVisible();await page.locator('[data-membership-tab="shop"]').click();await expect(page.locator('.shop-product-card')).toHaveCount(1);await page.locator('[data-membership-tab="orders"]').click();await expect(page.locator('.membership-orders-panel')).toBeVisible();
});
test('支付未开放时显示真实状态，不创建订单',async({page})=>{
 const calls=await mock(page,{loggedIn:true});await page.goto('/membership.html');await page.locator('[data-membership-purchase]').first().click();await expect(page.locator('[data-payment-create]')).toBeDisabled();await expect(page.locator('.membership-checkout')).toContainText('支付宝支付暂未开放');expect(calls.some(c=>c.body?.action==='create')).toBe(false);
});
test('网页设置移除桌面伪装，清理缓存保留账号和手机缓存',async({page})=>{
 await mock(page,{loggedIn:true});await page.goto('/settings.html');await expect(page.locator('[data-identity-form]')).toHaveCount(0);await expect(page.locator('[data-app-version]')).toContainText('网页');await page.evaluate(async()=>{await caches.open('fw-mobile-test');await caches.open('fw-web-assets-test');});await page.locator('[data-clear-cache]').click();await expect(page.locator('[data-toast]')).toContainText('登录状态已保留');expect(await page.evaluate(()=>!!localStorage.getItem('sb-ekbovsmxbiplhyrzxoyw-auth-token'))).toBe(true);expect(await page.evaluate(()=>caches.keys())).toContain('fw-mobile-test');expect(await page.evaluate(()=>caches.keys())).not.toContain('fw-web-assets-test');await expect(page.locator('.settings-filing a')).toHaveAttribute('href','https://beian.miit.gov.cn/');
});
test('六款H5游戏可以打开，NES仍仅在电脑版提供',async({page})=>{
 await mock(page,{loggedIn:true});await page.goto('/games.html');await expect(page.locator('[data-game-open]')).toHaveCount(6);await expect(page.locator('[data-game-open="contra"]')).toHaveCount(0);await page.locator('[data-game-open="2048"]').click();await expect(page.locator('[data-game-frame]')).toHaveAttribute('src',/\/web\/games\/2048\/index.html/);await expect(page.frameLocator('[data-game-frame]').locator('body')).toContainText('2048');
});
test('登录后可通过更多打开规则和处理公告',async({page})=>{
 await mock(page,{loggedIn:true});await page.goto('/rules.html');await expect(page.locator('[data-align-view="rules"]')).toBeVisible();await page.locator('[data-sidebar-more-toggle]').click();await page.locator('[data-align-nav="moderation"]').click();await expect(page.locator('[data-align-view="moderation"]')).toBeVisible();
});
for(const width of [760,1440])test(`浏览器${width}宽度的首页及设置无横向溢出`,async({page})=>{
 await mock(page,{loggedIn:true});await page.setViewportSize({width,height:820});await page.goto('/');await expect(page.locator('.hero-card')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.goto('/settings.html');await expect(page.locator('[data-clear-cache]')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('过期登录会回到访客状态，公开内容仍可浏览',async({page})=>{
 await mock(page,{loggedIn:true});await page.route('**/auth/v1/user',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'expired',code:'bad_jwt'})}));await page.goto('/square.html');await expect(page.locator('[data-account-label]')).toHaveText('注册 / 登录');await expect(page.locator('[data-square-feed]')).toContainText('今天也在低功耗运行');await expect(page.locator('[data-account-modal]')).toBeHidden();
});
test('手机访问网站仍进入原有PWA',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/138 Mobile Safari/537.36',isMobile:true,hasTouch:true});const page=await context.newPage();await mock(page);await page.goto('/');await expect(page).toHaveURL(/\/app\/index.html/);await expect(page.locator('[data-app-view="home"]')).toBeVisible();await context.close();
});
test('找回密码链接能进入独立的新密码表单',async({page})=>{
 await mock(page);await page.goto('/#access_token=web-recovery-token&refresh_token=web-recovery-refresh&expires_in=3600&token_type=bearer&type=recovery');await expect(page.locator('[data-web-password-recovery]')).toBeVisible();const form=page.locator('[data-web-password-recovery]');await form.locator('[name="password"]').fill('new-password');await form.locator('[name="confirm"]').fill('different-password');await form.locator('[type="submit"]').click();await expect(form).toContainText('两次密码不一致');
});
test('历史帖子直链能读取列表之外的帖子',async({page})=>{
 await mock(page);await page.route('**/rest/v1/posts?*',route=>{const specific=new URL(route.request().url()).searchParams.get('id');return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(specific?[{id:999,user_id:'22222222-2222-4222-8222-222222222222',content:'历史帖子的完整内容',created_at:'2026-01-01T00:00:00Z'}]:[])});});await page.goto('/square.html?post=999');await expect(page.locator('[data-post-detail]')).toContainText('历史帖子的完整内容');
});
test('反馈以网页版来源提交给现有后台',async({page})=>{
 const calls=await mock(page,{loggedIn:true});await page.goto('/');await page.locator('[data-sidebar-more-toggle]').click();await page.locator('[data-feedback-open]').click();const form=page.locator('[data-feedback-form]');await form.locator('[name="content"]').fill('网页版功能反馈测试');await form.locator('[type="submit"]').click();await expect(page.locator('[data-toast]')).toContainText('反馈已收到');expect(calls.find(c=>c.path.endsWith('/auth/v1/user')&&c.method==='PUT')?.body.data.fw_feedback).toMatchObject({platform:'web',content:'网页版功能反馈测试'});
});
test('发布采用300字和最多4张媒体的共同限制',async({page})=>{
 await mock(page,{loggedIn:true});await page.goto('/compose.html');const form=page.locator('[data-compose-form]');await expect(form.locator('textarea')).toHaveAttribute('maxlength','300');const file={name:'test.gif',mimeType:'image/gif',buffer:Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')};await page.locator('[data-compose-image]').setInputFiles([file,file,file,file]);await expect(page.locator('.media-draft-item')).toHaveCount(4);await page.locator('[data-compose-image]').setInputFiles(file);await expect(page.locator('[data-toast]')).toContainText('4');await expect(page.locator('.media-draft-item')).toHaveCount(4);
});
