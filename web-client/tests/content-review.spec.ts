import {test,expect} from '../../desktop-v11/node_modules/@playwright/test';
import {mock} from './fixtures';
test('登录用户可选择原因举报帖子，不重复公开举报人身份',async({page})=>{
 const calls=await mock(page,{loggedIn:true});await page.goto('/square.html');
 await page.locator('[data-open-post="101"]').first().click();
 await page.locator('[data-review-report="post"]').click();
 const dialog=page.locator('.review-report-dialog');await expect(dialog).toBeVisible();
 await dialog.locator('[name="category"]').selectOption({label:'泄露他人隐私'});
 await dialog.locator('[name="details"]').fill('包含他人的手机号码');
 await dialog.locator('[type="submit"]').click();await expect(dialog).toHaveCount(0);
 await expect(page.locator('[data-toast]')).toContainText('举报已提交');
 expect(calls.find(c=>c.path.endsWith('/fw_submit_report'))?.body).toEqual({p_target_type:'post',p_target_id:'101',p_reason:'泄露他人隐私 包含他人的手机号码'});
});
test('隐藏事件清除已加载的帖子，恢复事件重新读取展示',async({page})=>{
 await mock(page,{loggedIn:true});let hidden=false;await page.route('**/rest/v1/posts?**',route=>hidden?route.fulfill({status:200,contentType:'application/json',body:'[]'}):route.fallback());await page.goto('/square.html');
 await expect(page.locator('[data-square-feed]')).toContainText('今天也在低功耗运行');
 hidden=true;await page.evaluate(()=>window.dispatchEvent(new CustomEvent('fw:content-review-change',{detail:{kind:'post',target_id:'101',visible:false}})));
 await expect(page.locator('.square-post:visible')).toHaveCount(0);
 // A real server invalidation goes through the UI module as well as the stores.
 hidden=false;await page.evaluate(()=>window.dispatchEvent(new CustomEvent('fw:content-review-change',{detail:{kind:'post',target_id:'101',visible:true}})));
 await expect(page.locator('[data-square-feed]')).toContainText('今天也在低功耗运行');
});
