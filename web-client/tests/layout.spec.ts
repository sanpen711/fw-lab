import {test,expect} from '../../desktop-v11/node_modules/@playwright/test';
import {mock} from './fixtures';

for(const viewport of [{width:760,height:560},{width:1440,height:900}]){
 test(`网站布局 ${viewport.width}：横向导航、居中内容、滚动页脚和双栏操作`,async({page})=>{
  test.setTimeout(60000);
  await page.setViewportSize(viewport);await mock(page,{loggedIn:true});await page.goto('/');
  await expect(page.locator('.web-header')).toBeVisible();await expect(page.locator('.sidebar')).toHaveCount(0);
  const navigation=await page.locator('.web-nav .nav-item').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  expect(navigation).toHaveLength(10);
  expect(new Set(navigation.map(r=>Math.round(r.y))).size).toBe(1);
  for(const item of navigation){expect(item.x).toBeGreaterThanOrEqual(0);expect(item.right).toBeLessThanOrEqual(viewport.width);}
  const main=await page.locator('.main-content').boundingBox();expect(main!.width).toBeLessThanOrEqual(1200);expect(Math.abs(main!.x-(viewport.width-main!.width)/2)).toBeLessThan(1);
  for(const view of ['rooms','settings','membership','compose','games','play','chatrooms','buddy','archive','activities','rules'])await test.step(view,async()=>{
   await page.goto('/'+view+'.html');await expect(page.locator('#app')).toHaveAttribute('data-view',view);await expect(page.locator('[data-account-label]')).toHaveText('网页研究员');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),view+' horizontal overflow').toBe(true);
   await expect(async()=>{await page.locator('.web-filing').scrollIntoViewIfNeeded();const footer=await page.locator('.web-filing').boundingBox();expect(footer!.y).toBeGreaterThan(116);expect(footer!.y+footer!.height).toBeLessThanOrEqual(viewport.height);}).toPass({timeout:5000});
   expect((await page.locator('.web-header').boundingBox())!.y).toBe(0);
  });
  await page.locator('[data-sidebar-more-toggle]').click();await expect(page.locator('.sidebar-more-menu')).toBeInViewport();await page.keyboard.press('Escape');await expect(page.locator('[data-sidebar-more-toggle]')).toHaveAttribute('aria-expanded','false');
  await page.goto('/square.html');await page.locator('.square-post .post-meta').click();await expect(page.locator('[data-comment-form]')).toBeVisible();
  await expect(page.locator('[data-web-page-intro]')).toHaveText('随时吐槽，围观日常。把想说的话留在这里。');await expect(page.locator('[data-web-page-crumb],[data-web-page-title]')).toHaveCount(0);
  const workspace=await page.locator('.square-page').boundingBox(),intro=await page.locator('[data-web-page-intro]').boundingBox();expect(workspace!.y).toBeGreaterThanOrEqual(intro!.y+intro!.height);expect(workspace!.x).toBeGreaterThanOrEqual(20);expect(workspace!.x+workspace!.width).toBeLessThanOrEqual(viewport.width-20);
  await page.locator('[data-comment-form] textarea').scrollIntoViewIfNeeded();await page.locator('[data-comment-form] textarea').fill('布局检查草稿');await expect(page.locator('[data-comment-form] textarea')).toHaveValue('布局检查草稿');
 });
}

test('商城和会员切换时只显示简介，浏览器标题与地址同步',async({page})=>{
 await mock(page,{loggedIn:true});await page.goto('/shop.html');await expect(page).toHaveTitle('周边商城｜F.w 研究所');await expect(page.locator('[data-web-page-intro]')).toHaveText('研究所的日常，也可以带回家。');
 await page.locator('[data-membership-tab="benefits"]').click();await expect(page).toHaveURL(/membership.html$/);await expect(page).toHaveTitle('会员｜F.w 研究所');await expect(page.locator('[data-web-page-intro]')).toHaveText('查看会员权益与装扮。固定期限，不会自动续费。');
 await page.locator('[data-membership-tab="shop"]').click();await expect(page).toHaveURL(/shop.html$/);await expect(page).toHaveTitle('周边商城｜F.w 研究所');await expect(page.locator('[data-web-page-intro]')).toHaveText('研究所的日常，也可以带回家。');await expect(page.locator('[data-web-page-crumb],[data-web-page-title]')).toHaveCount(0);
});
