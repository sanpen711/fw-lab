import {test,expect} from '@playwright/test';

const user={id:'00000000-0000-4000-8000-000000000051',email:'regular@example.invalid',
  aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{nickname:'普通研究员'}};
const admin='00000000-0000-4000-8000-000000000052';

test('普通用户可建房并查看管理员装扮，会员和商城入口收起',async({page})=>{
  const calls:string[]=[];
  await page.addInitScript(account=>localStorage.setItem('fw-lab-auth-token',JSON.stringify({
    user:account,access_token:'test',refresh_token:'test',expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer'
  })),user);
  await page.route('https://**.supabase.co/**',async route=>{
    const url=new URL(route.request().url());
    const path=url.pathname;
    const requested=route.request().postDataJSON()?.p_user_ids||[];
    calls.push(path);
    let data:unknown=[];
    if(path.endsWith('/auth/v1/user'))data=user;
    if(path.endsWith('/fw_get_current_profile'))data=[{id:user.id,nickname:'普通研究员',role:'user',is_banned:false}];
    if(path.endsWith('/fw_get_membership_appearances')&&requested.includes(admin))
      data=[{user_id:admin,theme:'black_gold',frame:'crown',nickname_color:'pink_starlight',title:'装扮测试',
        card_layout:'honor',expires_at:'9999-12-31T00:00:00Z'}];
    if(path.endsWith('/fw_get_membership_levels')&&requested.includes(admin))data=[{user_id:admin,level:9}];
    if(path.endsWith('/posts'))data=[{id:101,user_id:admin,content:'管理员装扮测试',created_at:'2026-10-01T00:00:00Z'}];
    if(path.endsWith('/profiles'))data=[{id:admin,nickname:'管理员'}];
    if(path.endsWith('/fw_create_game_party'))data=51;
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/');
  await expect(page.locator('[data-nav="membership"],[data-membership-content],[data-shop-checkout]')).toHaveCount(0);
  await page.locator('[data-nav="play"]').click();
  await page.locator('[data-party-create-toggle]').first().click();
  const form=page.locator('[data-party-create-form]');
  await expect(form).toContainText('5 个组队');
  await form.locator('[name="gameName"]').fill('普通账号测试');
  await form.locator('[type="submit"]').click();
  await expect.poll(()=>calls.some(path=>path.endsWith('/fw_create_game_party'))).toBe(true);
  await page.locator('.nav-item[data-nav="square"]').click();
  const post=page.locator('[data-square-feed] [data-open-post="101"]');
  await expect(post.locator('.member-name')).toHaveClass(/member-color-pink_starlight/);
  await expect(post.locator('.vip-frame-crown')).toBeVisible();
  await expect(post.locator('.member-level-badge')).toHaveAttribute('aria-label','V9');
  expect(calls.some(path=>/\/(memberships|membership_orders|membership-alipay|shop-alipay)$/.test(path))).toBe(false);
});
