import {test,expect,Page} from '@playwright/test';
test.use({timezoneId:'Asia/Shanghai'});

const adminId='00000000-0000-4000-8000-000000000091';
const authorId='00000000-0000-4000-8000-000000000092';
const user={id:adminId,email:'content-admin@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
const author={nickname:'发帖作者',avatar_url:'',lab_code:'FW0092'};

async function setup(page:Page,{failPosts=false,lastActiveAt='2026-10-16T02:10:00Z'}:{failPosts?:boolean,lastActiveAt?:string|null}={}){
  const requests:string[]=[];
  const created_at=new Date().toISOString();
  await page.addInitScript(user=>localStorage.setItem('fw-admin-desktop-auth',JSON.stringify({access_token:'admin-token',refresh_token:'refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})),user);
  await page.route('https://**.supabase.co/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname;
    let data:unknown=[];
    if(path.endsWith('/auth/v1/user'))data=user;
    else if(path.endsWith('/fw_get_current_profile'))data=[{id:adminId,nickname:'内容管理员',role:'admin',is_banned:false}];
    else if(path.endsWith('/admin_list_profiles'))data=[{id:authorId,...author,is_test_account:false,is_banned:false,last_sign_in_at:'2026-10-10T06:27:00Z',last_active_at:lastActiveAt}];
    else if(path.endsWith('/admin_list_feedback_tickets'))data=[{id:301,user_id:authorId,nickname:author.nickname,content:'请检查反馈入口',status:'new',priority:'normal',created_at}];
    else if(path.endsWith('/posts')){
      requests.push(url.searchParams.get('select')||'');
      // Reproduce the production response when both author and reading-history joins exist.
      if(failPosts||!url.searchParams.get('select')?.includes('profiles!posts_user_id_fkey('))return route.fulfill({status:300,contentType:'application/json',body:JSON.stringify({code:'PGRST201',message:"Could not embed because more than one relationship was found for 'posts' and 'profiles'"})});
      data=[{id:101,user_id:authorId,content:'这是作者发布的广场帖子',is_deleted:false,created_at,profiles:author}];
    }else if(path.endsWith('/comments'))data=[{id:201,post_id:101,user_id:authorId,content:'这是广场评论',is_deleted:false,created_at,profiles:author,posts:{content:'这是作者发布的广场帖子'}}];
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/');
  await expect(page.locator('[data-nav="content"]')).toBeVisible();
  return requests;
}

test('存在作者和阅读记录两条关联时，帖子作者、详情及刷新仍正常，评论保留原帖',async({page})=>{
  const requests=await setup(page);
  await page.locator('[data-nav="content"]').click();
  const post=page.locator('[data-select-kind="posts"][data-select-id="101"]');
  await expect(post).toContainText('发帖作者');
  await expect(post).toContainText('这是作者发布的广场帖子');
  await post.click();
  await expect(page.locator('.detail-panel')).toContainText('这是作者发布的广场帖子');
  await page.locator('[data-refresh]').click();
  await expect.poll(()=>requests.length).toBe(2);
  await expect(post).toContainText('发帖作者');
  await expect(page.locator('#toast')).not.toContainText('读取帖子失败');
  await page.locator('[data-content-type="comments"]').click();
  const comment=page.locator('[data-select-kind="comments"][data-select-id="201"]');
  await expect(comment).toContainText('发帖作者');
  await expect(comment).toContainText('这是广场评论');
  await expect(comment).toContainText('原帖：这是作者发布的广场帖子');
});

test('帖子读取失败时保留其他模块数据，反馈仍可打开',async({page})=>{
  await setup(page,{failPosts:true});
  await expect(page.locator('#toast')).toContainText('读取帖子失败');
  await expect(page.locator('.metric-card').nth(1).locator('strong')).toHaveText('1');
  await page.locator('[data-nav="feedback"]').click();
  await expect(page.locator('.data-table')).toContainText('请检查反馈入口');
});

test('用户列表显示最近活跃，详情分开展示上次登录',async({page})=>{
  await setup(page);
  await page.locator('[data-nav="users"]').click();
  await expect(page.locator('.data-table thead')).toContainText('最近活跃');
  const row=page.locator(`[data-select-type="user"][data-select-id="${authorId}"]`);
  await expect(row).toContainText('2026/10/16 10:10');
  await expect(row).not.toContainText('2026/10/10');
  await row.click();
  await expect(page.locator('.detail-panel')).toContainText('最近活跃：2026/10/16 10:10');
  await expect(page.locator('.detail-panel')).toContainText('上次登录：2026/10/10 14:27');
});

test('没有活跃记录时显示暂无记录，不使用旧登录时间补填',async({page})=>{
  await setup(page,{lastActiveAt:null});
  await page.locator('[data-nav="users"]').click();
  const row=page.locator(`[data-select-type="user"][data-select-id="${authorId}"]`);
  await expect(row).toContainText('暂无记录');
  await expect(row).not.toContainText('2026/10/10');
  await row.click();
  await expect(page.locator('.detail-panel')).toContainText('最近活跃：暂无记录');
  await expect(page.locator('.detail-panel')).toContainText('上次登录：');
});
