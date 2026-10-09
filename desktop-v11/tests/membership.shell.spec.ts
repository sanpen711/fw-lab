import {expect,test,Page} from '@playwright/test';

const me='00000000-0000-4000-8000-000000000031';
const other='00000000-0000-4000-8000-000000000032';
const user={id:me,aud:'authenticated',role:'authenticated',email:'member-test@example.com',app_metadata:{provider:'email',providers:['email']},user_metadata:{nickname:'会员测试',lab_code:'FWTEST2'},created_at:'2026-09-18T00:00:00Z'};
const expires=new Date(Date.now()+86400000).toISOString();
async function setup(page:Page,active=true,following=true){
  const requests:any[]=[];
  let appearance:any={user_id:me,theme:'black_gold',frame:'ticket',nickname_color:'rose_gold',title:'摸鱼研究员',card_layout:'pass',intro:'下班后上线',featured_post_id:null,expires_at:expires};
  let reading:any[]=following?[{post_id:101,following:true,last_seen_comment_id:201,anchor_comment_id:204,anchor_offset:0,scroll_top:300,content:'今晚有人一起玩吗',available:true,unread_count:11}]:[];
  let joined=false;
  await page.addInitScript(user=>localStorage.setItem('fw-lab-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})),user);
  await page.route('https://**.supabase.co/**',async route=>{
    const url=new URL(route.request().url());const path=url.pathname;let data:any=[];
    const body=route.request().postDataJSON?.()||{};
    requests.push({path,body,method:route.request().method()});
    if(path.endsWith('/auth/v1/user'))data=user;
    else if(path.endsWith('/fw_get_current_profile'))data=[{id:me,nickname:'会员测试',role:'user',lab_code:'FWTEST2',is_banned:false}];
    else if(path.endsWith('/memberships'))data={user_id:me,status:'active',starts_at:'2026-01-01T00:00:00Z',expires_at:active?expires:'2026-01-02T00:00:00Z',plan_id:'monthly'};
    else if(path.endsWith('/fw_get_membership_appearances'))data=active?[appearance]:[];
    else if(path.endsWith('/fw_get_own_membership_appearance'))data=[appearance];
    else if(path.endsWith('/fw_set_membership_appearance')){appearance={...appearance,theme:body.p_theme,frame:body.p_frame,nickname_color:body.p_nickname_color,title:body.p_title,card_layout:body.p_card_layout,intro:body.p_intro,featured_post_id:body.p_featured_post_id};data=null;}
    else if(path.endsWith('/fw_get_post_reading'))data=reading.map(row=>({...row,unread_count:active?row.unread_count:0}));
    else if(path.endsWith('/fw_update_post_reading')){const row=reading.find(row=>row.post_id===body.p_post_id);if(row){Object.assign(row,{last_seen_comment_id:body.p_seen_comment_id,anchor_comment_id:body.p_anchor_comment_id,anchor_offset:body.p_anchor_offset,scroll_top:body.p_scroll_top});row.unread_count=Math.max(0,212-row.last_seen_comment_id);}data=null;}
    else if(path.endsWith('/fw_save_post_reading')){const row=reading.find(row=>row.post_id===body.p_post_id);if(row)row.following=body.p_following;else reading.push({post_id:body.p_post_id,following:body.p_following,last_seen_comment_id:212,scroll_top:0,content:'今晚有人一起玩吗',available:true,unread_count:0});data=null;}
    else if(path.endsWith('/post_reading')&&route.request().method()==='DELETE'){reading=[];data=null;}
    else if(path.endsWith('/posts'))data=url.searchParams.has('user_id')?[]:[{id:101,user_id:other,content:'今晚有人一起玩吗',created_at:'2026-10-01T00:00:00Z'}];
    else if(path.endsWith('/comments'))data=Array.from({length:12},(_,i)=>({id:201+i,post_id:101,user_id:other,content:`评论 ${i+1}：一起玩，阅读位置测试。`,created_at:`2026-10-01T01:${String(i).padStart(2,'0')}:00Z`}));
    else if(path.endsWith('/profiles'))data=[{id:other,nickname:'队友',lab_code:'FWTEAM1'}];
    else if(path.endsWith('/game_parties'))data=[{id:51,captain_id:other,game_name:'一起开黑',capacity:5,member_count:joined?2:1,status:'open',requires_approval:false}];
    else if(path.endsWith('/game_party_members'))data=joined?[{party_id:51,user_id:me,role:'member',state:'accepted'}]:[];
    else if(path.endsWith('/fw_apply_game_party')){joined=true;data='joined';}
    else if(path.endsWith('/fw_create_game_party'))data=52;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  return {requests,getReading:()=>reading};
}

test('会员身份先预览再保存，组合同步到资料卡并保持静态',async({page})=>{
  const {requests}=await setup(page);await page.goto('/');await page.locator('[data-nav="membership"]').click();
  await expect(page.locator('[data-member-identity-form] input[name="title"]')).toHaveValue('摸鱼研究员');
  await page.locator('[data-member-identity-choice="frame"][data-value="corners"]').click();
  await page.locator('[data-member-identity-form] input[name="title"]').fill('准点下班');
  await expect(page.locator('[data-member-identity-preview]')).toContainText('准点下班');
  expect(requests.filter(row=>row.path.endsWith('/fw_set_membership_appearance'))).toHaveLength(0);
  await page.getByRole('button',{name:'保存身份',exact:true}).click();
  await expect(page.locator('[data-member-identity-status]')).toHaveText('当前设置已同步');
  expect(requests.find(row=>row.path.endsWith('/fw_set_membership_appearance')).body).toMatchObject({p_frame:'corners',p_title:'准点下班',p_card_layout:'pass',p_intro:'下班后上线'});
  await expect(page.locator('[data-account-avatar]')).toHaveClass(/vip-frame-corners/);
  await expect(page.locator('[data-account-avatar]')).toHaveCSS('animation-name','none');
  await expect(page.locator('[data-membership-content]')).not.toContainText('优先体验');
  await expect(page.locator('[data-membership-content]')).not.toContainText('云存档');
  await page.screenshot({path:'/tmp/fw-member-center.png',fullPage:true});
  for(const width of [1000,760]){
    await page.setViewportSize({width,height:820});
    const preview=page.locator('[data-member-identity-preview]');
    await expect(preview).toBeVisible();
    expect(await preview.evaluate(node=>node.scrollWidth-node.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  }
  await page.screenshot({path:'/tmp/fw-member-narrow.png',fullPage:true});
});

for(const active of [false,true])test(`${active?'会员续费':'普通用户开通'}入口首屏可见，套餐金额同步且未开放支付不可扣款`,async({page})=>{
  const {requests}=await setup(page,active);await page.goto('/');await page.locator('[data-nav="membership"]').click();
  const entry=page.getByRole('button',{name:active?'续费会员':'开通会员'});
  await expect(entry).toBeInViewport();
  if(!active)await page.screenshot({path:'/tmp/fw-member-entry-desktop.png'});
  await entry.click();
  await expect(page.getByRole('heading',{name:active?'续费研究所会员':'开通研究所会员'})).toBeFocused();
  await expect(page.locator('.membership-pay-total')).toContainText('¥2');
  await expect(page.locator('[data-membership-payment="alipay"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-membership-plan="quarterly"]').click();
  await expect(page.locator('.membership-checkout')).toContainText('季度会员');
  await expect(page.locator('.membership-pay-total strong')).toHaveText('¥25');
  await page.locator('[data-membership-payment="wechat"]').click();
  await expect(page.locator('.membership-qr-placeholder')).toContainText('微信扫码');
  await expect(page.locator('[data-membership-plan="quarterly"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-membership-plan="yearly"]').click();
  await expect(page.locator('.membership-pay-total strong')).toHaveText('¥88');
  await expect(page.locator('.membership-pay-disabled')).toBeDisabled();
  await page.locator('[data-membership-plan="monthly"]').click();
  await page.locator('[data-membership-payment="alipay"]').click();
  if(active)await expect(page.locator('.membership-purchase-heading')).toContainText('当前会员有效至');
  if(!active)await page.screenshot({path:'/tmp/fw-member-purchase-desktop.png'});
  for(const width of [1066,760]){
    await page.setViewportSize({width,height:width===1066?728:820});
    await expect(page.locator('[data-membership-plan="monthly"]')).toBeVisible();
    expect(await page.locator('.membership-purchase-page').evaluate(node=>node.scrollWidth-node.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
    await expect(page.locator('.membership-pay-total strong')).toHaveText('¥2');
    if(width===1066&&!active)await page.screenshot({path:'/tmp/fw-member-purchase-1066.png'});
    if(width===760){
      await page.locator('[data-membership-payment="wechat"]').scrollIntoViewIfNeeded();
      const scroll=page.locator('[data-membership-content] .membership-page-scroll');const position=await scroll.evaluate(node=>node.scrollTop);
      expect(position).toBeGreaterThan(0);
      await page.locator('[data-membership-payment="wechat"]').click();
      expect(Math.abs(await scroll.evaluate(node=>node.scrollTop)-position)).toBeLessThanOrEqual(1);
      await expect(page.locator('[data-membership-plan="monthly"]')).toHaveAttribute('aria-pressed','true');
    }
  }
  await page.locator('[data-membership-return]').click();
  await expect(entry).toBeFocused();
  await expect(page.locator('[data-member-identity-preview]')).toBeVisible();
  expect(requests.filter(row=>['POST','PATCH','DELETE'].includes(row.method)&&/\/(membership_orders|memberships)$/.test(row.path))).toHaveLength(0);
});

test('到期会员保留身份与追更列表，不能保存身份或创建组队，仍可加入',async({page})=>{
  const {requests}=await setup(page,false);await page.goto('/');await page.locator('[data-nav="membership"]').click();
  await expect(page.locator('[data-member-identity-form] input[name="title"]')).toHaveValue('摸鱼研究员');
  await expect(page.getByRole('button',{name:'保存身份',exact:true})).toBeDisabled();
  await expect(page.locator('[data-account-avatar]')).not.toHaveClass(/vip-identity/);
  await page.locator('[data-membership-tab="reading"]').first().click();await expect(page.locator('.reading-list')).toContainText('今晚有人一起玩吗');
  await expect(page.locator('.reading-library')).toContainText('到期后暂停自动追更');
  await page.locator('.nav-item[data-nav="play"]').click();await page.locator('[data-party-create-toggle]').click();
  await expect(page.locator('[data-party-create-form]')).toHaveCount(0);await expect(page.locator('[data-party-create-host]')).toContainText('会员才能创建组队');
  await page.locator('[data-party-create-host] [data-party-create-toggle]').click();
  const detailLoaded=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/profiles'));
  await page.locator('[data-party-open="51"]').click();await detailLoaded;
  await page.locator('[data-party-join-form] button[type="submit"]').click();await expect(page.locator('[data-party-chat-form]')).toBeVisible();
  expect(requests.some(row=>row.path.endsWith('/fw_create_game_party'))).toBe(false);
  expect(requests.some(row=>row.path.endsWith('/fw_apply_game_party'))).toBe(true);
});

test('追更恢复位置、标记新评论，开帖不会自动清空未读，停止后保留收藏',async({page})=>{
  const {requests}=await setup(page);await page.goto('/');await page.locator('.nav-item[data-nav="square"]').click();
  await page.locator('[data-square-feed] [data-open-post="101"]').first().click();
  await expect(page.locator('.post-comment.is-new')).toHaveCount(11);
  await expect.poll(()=>page.locator('.detail-content-scroll').evaluate(node=>node.scrollTop)).toBeGreaterThan(100);
  expect(requests.filter(row=>row.path.endsWith('/fw_update_post_reading')&&row.body.p_seen_comment_id>201)).toHaveLength(0);
  await page.locator('[data-reading-seen]').click();await expect.poll(()=>requests.filter(row=>row.path.endsWith('/fw_update_post_reading')&&row.body.p_seen_comment_id===212).length).toBeGreaterThan(0);
  await expect(page.locator('.post-comment.is-new')).toHaveCount(0);
  await page.locator('[data-reading-stop="101"]').click();await expect(page.locator('[data-reading-follow="101"]')).toBeVisible();
  await page.locator('[data-reading-library]').click();await page.locator('[data-membership-tab="saved"]').click();await expect(page.locator('.reading-list')).toContainText('已收藏');
  await page.locator('.reading-list [data-reading-remove="101"]').click();await expect(page.locator('.reading-list')).toHaveCount(0);
});

test('普通用户收藏免费，追更入口引导会员且不提交写入',async({page})=>{
  const {requests}=await setup(page,false,false);await page.goto('/');await page.locator('.nav-item[data-nav="square"]').click();await page.locator('[data-square-feed] [data-open-post="101"]').first().click();
  await page.locator('[data-reading-save="101"]').click();await expect(page.locator('[data-reading-remove="101"]')).toBeVisible();
  await page.locator('[data-reading-follow="101"]').click();await expect(page.locator('[data-view-panel="membership"]')).toHaveClass(/active/);
  expect(requests.filter(row=>row.path.endsWith('/fw_save_post_reading'))).toHaveLength(1);
  expect(requests.find(row=>row.path.endsWith('/fw_save_post_reading')).body.p_following).toBe(false);
});
