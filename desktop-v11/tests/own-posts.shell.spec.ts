import {expect,test,Page} from '@playwright/test';

const me='00000000-0000-4000-8000-000000000024';
const other='00000000-0000-4000-8000-000000000025';
const user={id:me,aud:'authenticated',role:'authenticated',email:'desktop-test@example.com',app_metadata:{provider:'email',providers:['email']},user_metadata:{nickname:'测试研究员',lab_code:'FWTEST1'},created_at:'2026-09-18T00:00:00Z'};
async function setup(page:Page,options:{failure?:boolean,hold?:boolean}={}){
  const own=Array.from({length:31},(_,i)=>({id:100-i,user_id:me,content:`我以前的牢骚 ${i+1}`,created_at:new Date(Date.UTC(2026,8,30-i)).toISOString()}));
  const recent=Array.from({length:100},(_,i)=>({id:1000+i,user_id:other,content:`其他研究员的新帖 ${i+1}`,created_at:'2026-10-10T00:00:00Z'}));
  const comments:any[]=[{id:800,post_id:100,user_id:other,content:'旧帖评论',created_at:'2026-10-01T00:00:00Z'}];
  const requests:URL[]=[];
  let failing=!!options.failure;
  let release=()=>{};
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.addInitScript(user=>localStorage.setItem('fw-lab-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})),user);
  await page.route('https://**.supabase.co/**',async route=>{
    const req=route.request();const url=new URL(req.url());const path=url.pathname;const body=req.postDataJSON()||{};let data:any=[];
    if(path.endsWith('/auth/v1/user'))data=user;
    else if(path.endsWith('/fw_get_current_profile'))data=[{id:me,nickname:'测试研究员',role:'user',lab_code:'FWTEST1',is_banned:false}];
    else if(path.endsWith('/posts')){
      if(url.searchParams.has('user_id')){
        requests.push(url);
        if(options.hold)await pending;
        if(failing)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'暂时无法读取'})});
        const offset=Number(url.searchParams.get('offset')||0);const limit=Number(url.searchParams.get('limit')||30);
        data=own.slice(offset,offset+limit);
      }else data=recent;
    }else if(path.endsWith('/comments')){
      if(req.method()==='POST'){data={id:801,...body,created_at:'2026-10-10T01:00:00Z'};comments.push(data);}
      else {const ids=url.searchParams.get('post_id')||'';data=comments.filter(row=>ids.includes(String(row.post_id)));}
    }else if(path.endsWith('/fw_delete_own_post')){
      const index=own.findIndex(row=>row.id===body.p_post_id);if(index>=0)own.splice(index,1);data=null;
    }else if(path.endsWith('/profiles'))data=[{id:me,nickname:'测试研究员'},{id:other,nickname:'其他研究员'}];
    else if(path.endsWith('/auth/v1/logout'))data={};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  return {own,requests,recover:()=>{failing=false;},release};
}

test('我的按账号读取旧帖，分页后能发表评论和删除并切回广场',async({page})=>{
  const {requests}=await setup(page);await page.goto('/');await page.locator('.nav-item[data-nav="square"]').click();
  const feed=page.locator('[data-square-feed]');
  await expect(feed.locator('.square-post')).toHaveCount(100);
  await page.locator('[data-square-mine-toggle]').click();
  await expect(feed.locator('.square-post')).toHaveCount(30);
  expect(requests[0].searchParams.get('user_id')).toBe(`eq.${me}`);
  await expect(feed).not.toContainText('其他研究员的新帖');
  await feed.locator('.square-post').first().click();
  await expect(page.locator('[data-post-detail]')).toContainText('旧帖评论');
  await page.locator('[data-comment-form] textarea').fill('我的旧帖仍可评论');
  await page.locator('[data-comment-form]').evaluate((form:HTMLFormElement)=>form.requestSubmit());
  await expect(page.locator('[data-post-detail] .comment-list')).toContainText('我的旧帖仍可评论');
  await page.locator('[data-square-mine-more]').click();
  await expect(feed.locator('.square-post')).toHaveCount(31);
  expect(requests[1].searchParams.get('offset')).toBe('30');
  await expect(feed).toContainText('我以前的牢骚 31');
  await expect(page.locator('[data-square-mine-more]')).toHaveCount(0);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-delete-post="100"]').click();
  await expect(feed.locator('.square-post')).toHaveCount(30);
  await expect(feed.locator('.square-post[data-open-post="100"]')).toHaveCount(0);
  await expect(page.locator('[data-post-detail]')).toContainText('选择一条帖子');
  await page.locator('[data-square-refresh]').click();
  await expect.poll(()=>requests.length).toBe(3);
  await expect(feed.locator('.square-post')).toHaveCount(30);
  await page.locator('[data-square-echo-toggle]').click();
  await expect(page.locator('[data-square-echo-panel]')).toBeVisible();
  await expect(page.locator('[data-square-mine-toggle]')).toHaveAttribute('aria-pressed','false');
  await page.locator('[data-square-mine-toggle]').click();
  await expect(feed).toBeVisible();
  await page.locator('[data-square-mine-toggle]').click();
  await expect(feed.locator('.square-post')).toHaveCount(100);
  await expect(feed).toContainText('其他研究员的新帖');
});

test('我的读取失败可重试，空列表有提示，最小窗口四个操作在同一排',async({page})=>{
  const {own,recover}=await setup(page,{failure:true});await page.setViewportSize({width:760,height:560});await page.goto('/');await page.locator('.nav-item[data-nav="square"]').click();await page.locator('[data-square-mine-toggle]').click();
  await expect(page.locator('[data-square-feed]')).toContainText('我的牢骚暂时读取失败');
  own.splice(0);recover();await page.locator('[data-square-refresh]').click();
  await expect(page.locator('[data-square-feed]')).toContainText('你还没有发过牢骚');
  const toolbar=page.locator('[data-view-panel="square"] .section-actions');
  const boxes=await toolbar.locator('button').evaluateAll(nodes=>nodes.map(node=>({y:node.getBoundingClientRect().y,right:node.getBoundingClientRect().right})));
  expect(Math.max(...boxes.map(box=>box.y))-Math.min(...boxes.map(box=>box.y))).toBeLessThanOrEqual(1);
  expect(Math.max(...boxes.map(box=>box.right))).toBeLessThanOrEqual(760);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

test('退出登录时清空我的记录，延迟返回的数据不能恢复旧账号帖子',async({page})=>{
  const {requests,release}=await setup(page,{hold:true});await page.goto('/');await page.locator('.nav-item[data-nav="square"]').click();await page.locator('[data-square-mine-toggle]').click();
  await expect.poll(()=>requests.length).toBe(1);
  await page.locator('.account-button[data-open-account]').click();page.once('dialog',dialog=>dialog.accept());await page.locator('[data-sign-out]').click();
  await expect(page.locator('#app')).toBeHidden();release();
  await expect.poll(()=>page.evaluate(async()=>{const {feedStore}=await import('/src/feed-store.js');return feedStore.state.mine.posts.length;})).toBe(0);
  await expect(page.locator('[data-square-feed]')).not.toContainText('我以前的牢骚');
});
