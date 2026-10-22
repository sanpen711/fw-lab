import {test,expect} from '../../desktop-v11/node_modules/@playwright/test';
import {mock,me,other,profiles} from './fixtures';

test('会员与商城的返回、前进及刷新保持内容和子栏目一致',async({page})=>{
 await mock(page,{loggedIn:true});await page.goto('/membership.html');
 await page.locator('.membership-tabs [data-membership-tab="appearance"]').click();await expect(page).toHaveURL(/membership.html\?tab=appearance$/);
 await page.locator('[data-membership-tab="shop"]').click();await expect(page).toHaveURL(/shop.html$/);
 await page.goBack();await expect(page.locator('.membership-appearance-page')).toBeVisible();await expect(page.locator('.membership-tabs>.active')).toHaveText('会员装扮');
 await page.reload();await expect(page.locator('.membership-appearance-page')).toBeVisible();
 await page.goForward();await expect(page.locator('.shop-product-card')).toBeVisible();await expect(page.locator('.membership-tabs>.active')).toHaveText('周边商城');
 await page.goBack();await page.goBack();await expect(page).toHaveURL(/membership.html$/);await expect(page.locator('.membership-tabs>.active')).toHaveText('我的会员');
 await expect(page.locator('.membership-tabs [data-membership-refresh]')).toBeVisible();await expect(page.locator('.membership-page-heading')).toHaveCount(0);
 await page.locator('[data-membership-tab="shop"]').click();await page.locator('.web-nav [data-nav="membership"]').click();await expect(page).toHaveURL(/membership.html$/);await expect(page.locator('.membership-tabs>.active')).toHaveText('我的会员');
});

test('广场返回关闭详情，前进重开，关闭按钮清理地址并恢复列表位置',async({page})=>{
 await mock(page,{loggedIn:true});
 await page.route('**/rest/v1/posts?**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(Array.from({length:25},(_,i)=>({id:101+i,user_id:other,content:'列表帖子 '+i,created_at:'2026-10-20T10:00:00Z'})))}));
 await page.goto('/square.html');await expect(page.locator('.square-post')).toHaveCount(25);
 await expect(async()=>{await page.locator('[data-open-post="111"]').first().scrollIntoViewIfNeeded();}).toPass();const before=await page.evaluate(()=>scrollY);expect(before).toBeGreaterThan(0);
 await page.locator('[data-open-post="111"]').first().click();await expect(page).toHaveURL(/post=111/);await expect(page.locator('[data-close-post]')).toBeVisible();
 await page.goBack();await expect(page).toHaveURL(/square.html$/);await expect(page.locator('.square-page')).not.toHaveClass(/web-post-open/);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(before-5);
 await page.goForward();await expect(page.locator('[data-close-post]')).toBeVisible();await page.locator('[data-close-post]').click();await expect(page).toHaveURL(/square.html$/);
 await page.reload();await expect(page.locator('.post-detail-column')).toBeHidden();
});

test('帖子直链刷新可读，直接关闭不会返回站外',async({page})=>{
 await mock(page);await page.goto('/square.html?post=101');await expect(page.locator('[data-close-post]')).toBeVisible();
 await page.reload();await expect(page.locator('[data-close-post]')).toBeVisible();await page.locator('[data-close-post]').click();await expect(page).toHaveURL(/square.html$/);await expect(page.locator('.square-post')).toBeVisible();
});

test('活动详情的返回和刷新保留对应活动，返回列表恢复阅读位置',async({page})=>{
 await mock(page,{loggedIn:true});await page.route('**/rest/v1/site_activities?**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(Array.from({length:15},(_,i)=>({id:'activity-'+i,title:'活动 '+i,summary:'查看活动介绍与参与方式',body:'这是活动 '+i+' 的完整介绍',is_published:true,published_at:'2026-10-20',starts_at:'2026-10-01',ends_at:'2099-01-01'})))}));
 await page.goto('/activities.html');await expect(async()=>{await page.locator('[data-site-open="activity-10"]').scrollIntoViewIfNeeded();}).toPass();const before=await page.evaluate(()=>scrollY);expect(before).toBeGreaterThan(0);await page.locator('[data-site-open="activity-10"]').click();await expect(page).toHaveURL(/item=activity-10/);await expect(page.locator('.site-content-detail')).toContainText('活动 10');
 await page.reload();await expect(page.locator('.site-content-detail')).toContainText('活动 10');await page.goBack();await expect(page).toHaveURL(/activities.html$/);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(before-5);
});

test('游客举报和点赞都需要登录，关闭提示后仍停在帖子',async({page})=>{
 await mock(page);await page.goto('/square.html');await page.locator('[data-open-post]').first().click();await page.locator('.detail-head .web-action-menu summary').click();await page.locator('[data-review-report="post"]').click();await expect(page.locator('[data-account-modal]')).toBeVisible();await page.locator('[data-close-account]').click();await expect(page.locator('[data-post-detail]')).toBeVisible();
 await page.locator('.detail-post [data-react]').click();await expect(page.locator('[data-account-modal]')).toBeVisible();
});

test('文字草稿跨页面、刷新恢复，清空和成功发布后不再恢复',async({page})=>{
 await mock(page,{loggedIn:true});await page.goto('/compose.html');const text=page.locator('[data-compose-form] textarea');await text.fill('未发布的文字草稿');
 await page.locator('.web-nav [data-nav="rooms"]').click();await page.locator('.web-header-actions [data-nav="compose"]').click();await expect(text).toHaveValue('未发布的文字草稿');
 await page.reload();await expect(text).toHaveValue('未发布的文字草稿');await expect(page.locator('[data-web-draft-status]')).toContainText('恢复');
 page.once('dialog',d=>d.accept());await page.locator('[data-web-clear-draft]').click();await expect(text).toHaveValue('');await page.reload();await expect(text).toHaveValue('');
 await text.fill('发布后清空草稿');await page.locator('[data-compose-form] [type="submit"]').click();await expect(page).toHaveURL(/square.html$/);
 await page.goto('/compose.html');await expect(text).toHaveValue('');
});

test('附件刷新提示重新添加，另一账号的草稿不会被读出',async({page})=>{
 await mock(page,{loggedIn:true});await page.addInitScript(({me,other})=>{
  localStorage.setItem('fw:web:compose-draft:'+me,JSON.stringify({text:'本账号草稿',attachments:true}));
  localStorage.setItem('fw:web:compose-draft:'+other,JSON.stringify({text:'另一个账号的内容',attachments:false}));
 },{me,other});
 await page.goto('/compose.html');await expect(page.locator('[data-compose-form] textarea')).toHaveValue('本账号草稿');await expect(page.locator('[data-web-draft-status]')).toContainText('重新添加');await expect(page.locator('.media-draft-item')).toHaveCount(0);
 page.once('dialog',d=>d.accept());await page.locator('[data-web-clear-draft]').click();expect(await page.evaluate(id=>localStorage.getItem('fw:web:compose-draft:'+id),other)).toContain('另一个账号的内容');
});

test('窄窗口详情有焦点约束，Escape关闭并保留列表',async({page})=>{
 await page.setViewportSize({width:900,height:650});await mock(page,{loggedIn:true});await page.goto('/square.html');
 await expect(page.locator('.post-detail-column')).toBeHidden();await page.locator('.square-post').focus();await page.keyboard.press('Enter');
 await expect(page.locator('[data-post-detail]')).toHaveAttribute('role','dialog');await expect(page.locator('[data-close-post]')).toBeFocused();await expect(page.locator('.square-feed-column')).toHaveJSProperty('inert',true);
 await page.keyboard.press('Escape');await expect(page).toHaveURL(/square.html$/);await expect(page.locator('[data-post-detail]')).toBeHidden();await expect(page.locator('.square-post')).toBeFocused();
});

test('我发起和我参与的课题包含已结束课题，并显示我的选择',async({page})=>{
 await mock(page,{loggedIn:true});
 await page.route('**/rest/v1/polls?**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:81,user_id:other,title:'我参与的课题',ends_at:'2099-01-01',created_at:'2026-10-01',allow_user_options:false},{id:82,user_id:me,title:'我发起的已结束课题',ends_at:'2026-01-01',created_at:'2025-12-01'}])}));
 await page.route('**/rest/v1/rpc/fw_my_poll_votes',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{poll_id:81,option_id:811}])}));
 await page.goto('/rooms.html');await expect(page.locator('.web-poll-toolbar [data-poll-refresh]')).toBeVisible();await expect(page.locator('.web-poll-my-choice')).toHaveText('我的选择');await expect(page.locator('.web-poll-instruction')).toContainText('截止前可以改票');
 await page.locator('[data-poll-filter="mine"]').click();await expect(page.locator('.poll-card')).toHaveCount(1);await expect(page.locator('.poll-card')).toContainText('我发起的已结束课题');await expect(page).toHaveURL(/filter=mine/);
 await page.locator('[data-poll-filter="voted"]').click();await expect(page.locator('.poll-card')).toHaveCount(1);await expect(page.locator('.poll-card')).toContainText('我参与的课题');await page.reload();await expect(page.locator('[data-poll-filter="voted"]')).toHaveAttribute('aria-pressed','true');
});

test('举报收进对应对象菜单，键盘可打开并提交原有举报流程',async({page})=>{
 const calls=await mock(page,{loggedIn:true});await page.goto('/rooms.html');const menu=page.locator('.poll-option-row .web-action-menu').first();await expect(menu.locator('[data-review-report]')).toBeHidden();await menu.locator('summary').focus();await page.keyboard.press('Enter');await expect(menu.locator('[data-review-report]')).toBeVisible();await menu.locator('[data-review-report]').click();
 await expect(page.locator('.review-report-dialog')).toBeVisible();await page.locator('.review-report-dialog [type="submit"]').click();await expect(page.locator('.review-report-dialog')).toHaveCount(0);expect(calls.find(c=>c.path.endsWith('/fw_submit_report'))?.body.p_target_type).toBe('poll_option');
});

test('房间翻看历史时累积新消息，重复刷新和加载旧消息不重复计数',async({page})=>{
 await mock(page,{loggedIn:true});let total=45;
 const room={id:'room-1',name:'交互测试房间',description:'',member_count:2,joined:true,is_owner:false,join_mode:'direct',owner:profiles[1]};
 await page.route('**/rest/v1/rpc/fw_chat_room_list',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({rooms:[room],has_more:false,server_time:new Date().toISOString()})}));
 await page.route('**/rest/v1/rpc/fw_chat_room_read',route=>{
  const older=route.request().postDataJSON().p_before_id;
  const messages=Array.from({length:older?5:total},(_,i)=>({id:older?i+1:i+10,user_id:other,author:profiles[1],content:'房间消息 '+i,created_at:new Date(Date.UTC(2026,9,20,10,0,older?i:i+10)).toISOString()}));
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({room,messages,members:[],requests:[],has_more:!older,server_time:new Date().toISOString()})});
 });
 await page.goto('/chatrooms.html');await page.locator('[data-room-open]').click();const scroll=page.locator('[data-room-messages]'),latest=page.locator('[data-web-room-latest]');await expect(page.locator('[data-room-message]')).toHaveCount(45);await expect(scroll).toBeVisible();
 // Realtime connection status may replace the message element after it is found.
 // Establish the actual reading position before testing subsequent new messages.
 await expect(async()=>{await scroll.evaluate(e=>e.scrollTop=0);await expect(latest).toBeVisible({timeout:300});await expect.poll(()=>scroll.evaluate(e=>e.scrollTop),{timeout:300}).toBe(0);}).toPass();
 total=47;await page.locator('[data-room-refresh]').click();await expect(page.locator('[data-room-message]')).toHaveCount(47);await expect(latest).toHaveAttribute('data-new-count','2');expect(await scroll.evaluate(e=>e.scrollTop)).toBe(0);
 await page.locator('[data-room-refresh]').click();await expect(latest).toHaveAttribute('data-new-count','2');
 await page.locator('[data-room-history]').click();await expect(page.locator('[data-room-message]')).toHaveCount(52);await expect(latest).toHaveAttribute('data-new-count','2');
 await latest.click();await expect(latest).toBeHidden();expect(await scroll.evaluate(e=>e.scrollHeight-e.scrollTop-e.clientHeight)).toBeLessThan(2);
});
