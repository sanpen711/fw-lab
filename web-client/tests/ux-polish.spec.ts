import {test,expect} from '../../desktop-v11/node_modules/@playwright/test';
import {mock,other,expectGuestGate} from './fixtures';

async function pagedPosts(page,{failMore=false}={}){
 const rows=Array.from({length:45},(_,i)=>({id:500-i,user_id:other,content:'浏览记录 '+(500-i),created_at:'2026-10-20T10:00:00Z'}));
 const reads:string[]=[];let failed=false;
 await page.route('**/rest/v1/posts?**',route=>{
  const url=new URL(route.request().url()),cursor=url.searchParams.get('or')||'',specific=url.searchParams.get('id');reads.push(url.search);
  if(failMore&&cursor&&!failed){failed=true;return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'网络暂时断开'})});}
  const older=Number(cursor.match(/id\.lt\.(\d+)/)?.[1]||Infinity);
  const data=rows.filter(row=>specific?String(row.id)===specific.slice(3):row.id<older).slice(0,Number(url.searchParams.get('limit')||20));
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 return {rows,reads};
}

for(const loggedIn of [false,true])test(`${loggedIn?'登录后':'游客'}广场每批20条，新增帖子不影响翻旧帖，刷新返回最新一批`,async({page})=>{
 const calls=await mock(page,{loggedIn});const {rows,reads}=await pagedPosts(page);await page.goto('/square.html');
 await expect(page.locator('.square-post')).toHaveCount(20);await page.locator('[data-web-feed-more]').click();await expect(page.locator('.square-post')).toHaveCount(40);
 rows.unshift({id:501,user_id:other,content:'最新发布',created_at:'2026-10-20T11:00:00Z'});
 await page.locator('[data-web-feed-more]').click();await expect(page.locator('.square-post')).toHaveCount(45);await expect(page.locator('[data-square-feed]')).toContainText('已经到底了');await expect(page.locator('.square-post[data-open-post="456"]')).toBeVisible();
 expect(await page.locator('.square-post').evaluateAll(cards=>new Set(cards.map(card=>card.getAttribute('data-open-post'))).size)).toBe(45);
 await expect(page.locator('[data-web-back-top]')).toBeVisible();await page.locator('[data-web-back-top]').click();await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
 await page.locator('[data-square-refresh]').click();await expect(page.locator('.square-post')).toHaveCount(20);await expect(page.locator('.square-post').first()).toContainText('最新发布');
 expect(reads.some(query=>query.includes('id.lt.481'))).toBe(true);
 if(!loggedIn){expect(calls.some(call=>call.path.endsWith('/comments'))).toBe(false);expect(calls.filter(call=>call.path.endsWith('/fw_public_post_comment_counts')).every(call=>call.body.p_post_ids.length<=20)).toBe(true);}
});

test('加载旧帖失败保留已有内容，原地重试不会重复或跳过',async({page})=>{
 await mock(page);await pagedPosts(page,{failMore:true});await page.goto('/square.html');await expect(page.locator('.square-post')).toHaveCount(20);
 await page.locator('[data-web-feed-more]').click();await expect(page.locator('.web-feed-footer')).toContainText('网络暂时断开');await expect(page.locator('.square-post')).toHaveCount(20);
 await page.locator('[data-web-feed-more]').focus();await page.keyboard.press('Enter');await expect(page.locator('.square-post')).toHaveCount(40);await expect(page.locator('.square-post').last()).toContainText('浏览记录 461');await expect(page.locator('.square-post[data-open-post="480"]')).toBeFocused();
});

for(const width of [900,1440])test(`${width}px详情抽屉保持列表宽度、滚动位置和返回焦点`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});await mock(page);await pagedPosts(page);await page.goto('/square.html');await expect(page.locator('.square-post')).toHaveCount(20);
 const card=page.locator('.square-post[data-open-post="488"]');await expect(async()=>{await card.scrollIntoViewIfNeeded();}).toPass();
 const before=await page.evaluate(()=>({y:scrollY,width:document.querySelector('.square-page')!.getBoundingClientRect().width}));await card.click();
 await expect(page.locator('[data-post-detail]')).toHaveAttribute('role','dialog');await expect(page.locator('[data-post-detail]')).toHaveCSS('position','fixed');
 expect(await page.locator('.square-page').evaluate(node=>node.getBoundingClientRect().width)).toBeCloseTo(before.width,0);expect(await page.evaluate(()=>scrollY)).toBeCloseTo(before.y,0);
 await page.screenshot({path:testInfo.outputPath('drawer.png')});
 await page.keyboard.press('Escape');await expect(page.locator('[data-post-detail]')).toBeHidden();await expect.poll(()=>page.evaluate(()=>scrollY)).toBeCloseTo(before.y,0);await expect(card).toBeFocused();
});

test('首页显示真实活动，入口去广场，移除下班卡片及重复发帖按钮',async({page},testInfo)=>{
 await mock(page);await page.goto('/');await expect(page.locator('[data-home-activities-summary]')).toContainText('伏伏的摸鱼活动');await expect(page.locator('[data-home-activities-summary] time')).toContainText('2026');
 await expect(page.locator('.web-home-activity')).toHaveCSS('position','static');expect((await page.locator('.web-home-activity').boundingBox())!.width).toBeGreaterThan(200);
 await expect(page.locator('.offwork-card')).toHaveCount(0);await expect(page.locator('.hero-eyebrow')).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath('home.png'),fullPage:true});
 await page.getByRole('button',{name:'逛逛精神广场',exact:true}).click();await expect(page).toHaveURL(/square.html$/);await expect(page.locator('.web-compose')).toBeHidden();
 await expect(page.locator('.web-square-tabs button')).toHaveText(['广场','回声','我的帖子']);await expect(page.locator('.square-heading .section-actions button')).toHaveText(['刷新','发牢骚']);
 await page.locator('.square-heading [data-nav="compose"]').click();await expectGuestGate(page,'compose');await expect(page.locator('.web-compose')).toBeHidden();
});

test('没有活动时首页清楚显示暂无活动',async({page})=>{
 await mock(page);await page.route('**/rest/v1/site_activities?**',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));await page.goto('/');await expect(page.locator('[data-home-activities-summary]')).toHaveText('暂无活动');
});

test('反馈菜单关闭并进入登录提示页，登录后继续填写同一页面',async({page})=>{
 await mock(page);await page.goto('/');await page.locator('[data-sidebar-more-toggle]').click();await page.locator('[data-feedback-open]').click();
 await expect(page).toHaveURL(/feedback.html$/);await expectGuestGate(page,'feedback');await expect(page.locator('[data-sidebar-more-toggle]')).toHaveAttribute('aria-expanded','false');
 await page.locator('[data-web-guest-gate] [data-open-account]').click();const login=page.locator('[data-auth-view="login"]');await login.locator('[name="email"]').fill('web-test@example.com');await login.locator('[name="password"]').fill('test-password');await login.locator('[type="submit"]').click();
 await expect(page.locator('[data-feedback-form]')).toBeVisible();await expect(page.locator('[data-account-modal]')).toBeHidden();await expect(page).toHaveURL(/feedback.html$/);
});

test('登录用户在页面加载期间点击反馈，加载完成后保留该入口',async({page})=>{
 await mock(page,{loggedIn:true});let resume;const waiting=new Promise(resolve=>resume=resolve);
 await page.route('**/web/assets/feature-alignment-*.js',async route=>{await waiting;await route.continue();});
 await page.goto('/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>Boolean((window as any).__FW_WEB_APP__));await expect(page.locator('[data-account-label]')).toHaveText('网页研究员');
 await page.locator('[data-sidebar-more-toggle]').click();await page.locator('[data-feedback-open]').click();resume();await expect(page).toHaveURL(/feedback.html$/);await expect(page.locator('[data-feedback-form]')).toBeVisible();await expect(page.locator('[data-sidebar-more-toggle]')).toHaveAttribute('aria-expanded','false');
});

test('注册可提前阅读规则和隐私，密码开关及提示可用，阅读后保留表单',async({page},testInfo)=>{
 await mock(page);await page.goto('/');await page.locator('[data-open-account]').first().click();await page.locator('[data-show-auth="register"]').first().click();
 const form=page.locator('[data-auth-view="register"]');await form.locator('[name="email"]').fill('review@example.com');await expect(form).toContainText('密码至少 6 位');
 await page.screenshot({path:testInfo.outputPath('registration.png')});
 await form.locator('[name="password"]').fill('review-password');await form.getByRole('button',{name:'显示密码',exact:true}).click();await expect(form.locator('[name="password"]')).toHaveAttribute('type','text');await form.getByRole('button',{name:'隐藏密码',exact:true}).click();await expect(form.locator('[name="password"]')).toHaveAttribute('type','password');
 await expect(form.getByRole('link',{name:'《隐私政策》'})).toHaveAttribute('href','/privacy.html');await form.getByRole('button',{name:'《入馆须知》'}).click();
 await expect(page.locator('[data-web-terms]')).toBeVisible();await expect(page.locator('[data-web-terms]')).toContainText('允许吐槽，不允许伤害他人');await page.keyboard.press('Tab');expect(await page.locator('[data-web-terms]').evaluate(node=>node.contains(document.activeElement))).toBe(true);
 await page.keyboard.press('Escape');await expect(page.locator('[data-web-terms]')).toBeHidden();await expect(form.locator('[name="email"]')).toHaveValue('review@example.com');await expect(form.locator('[name="password"]')).toHaveValue('review-password');await expect(form.locator('[data-align-open-rules]')).toHaveCount(1);
});

test('商城列表图片与详情都是3比4，会员订单有独立名称',async({page})=>{
 await mock(page,{loggedIn:true});await page.goto('/shop.html');await expect(page.locator('.shop-product-card>img')).toHaveCSS('aspect-ratio','3 / 4');await expect(page.locator('[data-membership-tab="orders"]')).toHaveText('会员订单');await expect(page.locator('[data-shop-view="orders"]')).toHaveText('我的周边订单');
});
