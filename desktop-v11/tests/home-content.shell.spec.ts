import {test,expect,Page} from '@playwright/test';
const me='00000000-0000-4000-8000-000000000071';
const user={id:me,aud:'authenticated',role:'authenticated',email:'home-test@example.invalid',app_metadata:{provider:'email'},user_metadata:{nickname:'首页测试',lab_code:'FWHOME1'}};
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function setup(page:Page){
 const now=Date.now(),time=(d:number)=>new Date(now+d*86400000).toISOString();
 const c:any={fail:false,requests:[],notices:[{id:id(1),title:'置顶公告',body:'公告内容\nhttps://example.com/notice',is_pinned:true,published_at:time(-2),updated_at:time(-2)}],activities:[
  {id:id(2),title:'进行中的活动',body:'参与说明\n<img src=x onerror=alert(1)>',summary:'活动简介',starts_at:time(-1),ends_at:time(1),target_view:'shop',cover_path:`activities/${id(2)}/${id(4)}.png`},
  {id:id(3),title:'之后的活动',body:'稍后开始',starts_at:time(1),ends_at:time(2)},
  {id:id(4),title:'过去的活动',body:'已经结束',starts_at:time(-2),ends_at:time(-1),participation_url:'https://example.com/ended'},
 ]};
 if(process.env.FW_MEDIA_QA_FONT)await page.route('**/__home-qa-font.otf',r=>r.fulfill({path:process.env.FW_MEDIA_QA_FONT!}));
 await page.addInitScript(user=>{localStorage.setItem('fw-lab-auth-token',JSON.stringify({access_token:'token',refresh_token:'refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));localStorage.setItem('fw:desktop:v11:weather-location',JSON.stringify({latitude:30,longitude:110,label:'旧天气地区'}));(window as any).opened=[];window.open=(u:any)=>{(window as any).opened.push(String(u));return {} as any;};},user);
 await page.route('https://**.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;c.requests.push(path);let data:any=[];
  if(path.includes('/storage/v1/object/public/activity-covers/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#f6ecee"/><text x="70" y="280" font-size="60" fill="#b87689">FW</text></svg>'});
  if(path.endsWith('/auth/v1/user'))data=user;
  else if(path.endsWith('/fw_get_current_profile'))data=[{id:me,nickname:'首页测试',lab_code:'FWHOME1',role:'user',is_banned:false}];
  else if(path.endsWith('/site_announcements')||path.endsWith('/site_activities')){
   if(c.fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'temporarily unavailable'})});
   data=path.endsWith('/site_announcements')?c.notices:c.activities;
   return route.fulfill({contentType:'application/json',headers:{'content-range':`0-${Math.max(0,data.length-1)}/${data.length}`},body:JSON.stringify(data)});
  }
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('/');if(process.env.FW_MEDIA_QA_FONT){await page.addStyleTag({content:'@font-face{font-family:HomeQA;src:url(/__home-qa-font.otf)}body,input,button,textarea,h1{font-family:HomeQA,sans-serif!important}'});await page.evaluate(()=>document.fonts.ready);}
 await expect(page.locator('[data-home-announcement]')).toContainText('置顶公告');await expect(page.locator('[data-home-activities-summary]')).toContainText('3 项活动');return c;
}
test('首页公告在主视觉上方，活动合并两格，倒计时在右，旧天气不再请求',async({page},testInfo)=>{
 const c=await setup(page);
 for(const width of [1066,760]){
  await page.setViewportSize({width,height:width===760?560:728});const a=await page.locator('.home-activities-card').boundingBox(),o=await page.locator('.offwork-card').boundingBox(),n=await page.locator('[data-home-announcement]').boundingBox(),h=await page.locator('.hero-card').boundingBox();
  expect(a!.width/o!.width).toBeGreaterThan(1.8);expect(a!.x).toBeLessThan(o!.x);expect(Math.abs(a!.y-o!.y)).toBeLessThan(1);expect(n!.y+n!.height).toBeLessThan(h!.y+1);expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:testInfo.outputPath(`home-content-${width}.png`)});
 }
 expect(c.requests.some((s:string)=>s.includes('fw-weather'))).toBe(false);await expect(page.locator('[data-weather-open]')).toHaveCount(0);
 await page.locator('[data-sidebar-more-toggle]').click();const labels=await page.locator('.sidebar-more-menu b').allTextContents();expect(labels.indexOf('反馈意见')).toBe(labels.indexOf('处理公告')+1);await page.locator('[data-feedback-open]').click();await expect(page.locator('[data-home-tool-view="feedback"]')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('[data-sidebar-more-toggle]')).toBeFocused();
});
test('活动入口打开列表与详情，按时间显示状态，正文转义且参与入口可跳转商城',async({page},testInfo)=>{
 await setup(page);await page.locator('.home-activities-card').click();await expect(page.locator('.site-activity-card')).toHaveCount(3);await expect(page.locator('.site-activity-grid')).toContainText('进行中');await expect(page.locator('.site-activity-grid')).toContainText('未开始');await expect(page.locator('.site-activity-grid')).toContainText('已结束');await page.locator(`[data-site-open="${id(2)}"]`).click();await expect(page.locator('.site-content-detail')).toContainText('参与说明');await expect(page.locator('.site-content-body img')).toHaveCount(0);await expect(page.locator('.site-content-body')).toContainText('<img src=x');await page.screenshot({path:testInfo.outputPath('activity-detail.png')});await page.locator('[data-site-target="shop"]').click();await expect(page.locator('.membership-shop')).toBeVisible();
});
test('公告查看后移除未读标记，更新正文后重新提示未读，支持历史列表',async({page})=>{
 const c=await setup(page);await expect(page.locator('.announcement-unread')).toBeVisible();await page.locator('[data-home-announcement] [data-site-open]').click();await expect(page.locator('[data-site-content="announcements"]')).toContainText('公告内容');await expect(page.locator('.site-content-body a')).toHaveAttribute('href','https://example.com/notice');await page.locator('[data-site-back="announcements"]').click();await expect(page.locator('.site-notice-row')).toHaveCount(1);await page.locator('[data-site-content="announcements"] [data-nav="home"]').click();await expect(page.locator('.announcement-unread')).toHaveCount(0);
 c.notices[0].updated_at=new Date(Date.now()+60000).toISOString();await page.locator('.home-activities-card').click();await page.locator('[data-site-content="activities"] [data-nav="home"]').click();await expect(page.locator('.announcement-unread')).toBeVisible();
});
test('活动读取失败可以重试，已结束的活动没有参与按钮',async({page})=>{
 const c=await setup(page);c.fail=true;await page.locator('.home-activities-card').click();await expect(page.locator('[data-site-content="activities"] [role="alert"]')).toBeVisible({timeout:18000});c.fail=false;await page.locator('[data-site-refresh="activities"]').click();await expect(page.locator('[data-site-content="activities"] [role="alert"]')).toHaveCount(0);await page.locator(`[data-site-open="${id(4)}"]`).click();await expect(page.locator('.site-content-detail')).toContainText('已经结束');await expect(page.locator('.site-content-action')).toHaveCount(0);
});
test('退出账号清除公告和活动展示，重新登录前不能进入活动',async({page})=>{
 await setup(page);await page.locator('.home-activities-card').click();await page.evaluate(async()=>{const {authStore}=await import('/src/auth-store.js');await authStore.signOut();});await expect(page.locator('#app')).toBeHidden();expect(await page.locator('[data-site-content="activities"]').innerHTML()).not.toContain('进行中的活动');
});
