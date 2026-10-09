import {expect,test,Page} from '@playwright/test';

const me='00000000-0000-4000-8000-000000000031';
const other='00000000-0000-4000-8000-000000000032';
const user={id:me,aud:'authenticated',role:'authenticated',email:'member-test@example.com',app_metadata:{provider:'email',providers:['email']},user_metadata:{nickname:'会员测试',lab_code:'FWTEST2'},created_at:'2026-09-18T00:00:00Z'};
const expires=new Date(Date.now()+86400000).toISOString();
async function setup(page:Page,active=true,following=true,paymentMode=false as false|'success'|'failure'|'pending'){
  const requests:any[]=[];
  let appearance:any={user_id:me,theme:'black_gold',frame:'ticket',nickname_color:'rose_gold',title:'摸鱼研究员',card_layout:'pass',intro:'下班后上线',featured_post_id:null,expires_at:expires};
  let reading:any[]=following?[{post_id:101,following:true,last_seen_comment_id:201,anchor_comment_id:204,anchor_offset:0,scroll_top:300,content:'今晚有人一起玩吗',available:true,unread_count:11}]:[];
  let joined=false,paid=false;
  let order:any=null;
  await page.addInitScript(()=>{(window as any).checkoutUrls=[];window.open=((url:any)=>{(window as any).checkoutUrls.push(String(url));return {};}) as any;});
  await page.addInitScript(user=>localStorage.setItem('fw-lab-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})),user);
  await page.route('https://**.supabase.co/**',async route=>{
    const url=new URL(route.request().url());const path=url.pathname;let data:any=[];
    const body=route.request().postDataJSON?.()||{};
    requests.push({path,body,method:route.request().method()});
    if(path.endsWith('/membership-alipay')){
      if(body.action==='config')data={enabled:!!paymentMode,configured:true,max_amount_cents:5000};
      else if(body.action==='create'){
        await new Promise(resolve=>setTimeout(resolve,150));
        order=order||{id:'test-order',order_no:'FW'+'1'.repeat(32),plan_id:body.plan_id,plan_name:body.plan_id==='quarterly'?'季度会员':'月度会员',duration_months:body.plan_id==='quarterly'?3:1,amount_cents:body.plan_id==='quarterly'?2500:200,status:'pending',payment_method:'alipay',payment_expires_at:new Date(Date.now()+600000).toISOString(),created_at:new Date().toISOString(),paid_at:null};
        data={order,payment_url:'https://openapi.alipay.com/gateway.do?app_id=2021007104686921&method=alipay.trade.page.pay&sign=synthetic'};
      }else if(body.action==='resume')data={order,payment_url:'https://openapi.alipay.com/gateway.do?app_id=2021007104686921&method=alipay.trade.page.pay&sign=synthetic'};
      else if(body.action==='query'){
        if(paymentMode==='failure')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'PAYMENT_QUERY_UNAVAILABLE'})});
        if(paymentMode==='success'){paid=true;order={...order,status:'paid',paid_at:new Date().toISOString()};}
        data={order};
      }
    }
    else if(path.endsWith('/auth/v1/user'))data=user;
    else if(path.endsWith('/fw_get_current_profile'))data=[{id:me,nickname:'会员测试',role:'user',lab_code:'FWTEST2',is_banned:false}];
    else if(path.endsWith('/memberships'))data={user_id:me,status:'active',starts_at:'2026-01-01T00:00:00Z',expires_at:active||paid?expires:'2026-01-02T00:00:00Z',plan_id:'monthly'};
    else if(path.endsWith('/fw_get_own_membership_growth'))data={level:2,active_days:31,next_level:3,next_threshold:90,active:active||paid};
    else if(path.endsWith('/fw_get_membership_levels'))data=active||paid?body.p_user_ids.map((id:string)=>({user_id:id,level:2})):[];
    else if(path.endsWith('/membership_orders'))data=order?[order]:[];
    else if(path.endsWith('/fw_get_membership_appearances'))data=active||paid?[appearance]:[];
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
  await expect(page.locator('.membership-alipay-only')).toContainText('支付宝');
  await expect(page.locator('[data-membership-content]')).not.toContainText('微信');
  await page.locator('[data-membership-plan="quarterly"]').click();
  await expect(page.locator('.membership-checkout')).toContainText('季度会员');
  await expect(page.locator('.membership-pay-total strong')).toHaveText('¥25');
  await expect(page.locator('[data-membership-plan="quarterly"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-membership-plan="yearly"]')).toBeDisabled();
  await expect(page.locator('.membership-pay-disabled')).toBeDisabled();
  await expect(page.locator('.membership-renewal-note')).toContainText(active?'从当前到期时间顺延':'付款成功后开始计时');
  await page.locator('[data-membership-plan="monthly"]').click();
  if(active)await expect(page.locator('.membership-purchase-heading')).toContainText('当前会员有效至');
  if(!active)await page.screenshot({path:'/tmp/fw-member-purchase-desktop.png'});
  for(const width of [1066,760]){
    await page.setViewportSize({width,height:width===1066?728:820});
    await expect(page.locator('[data-membership-plan="monthly"]')).toBeVisible();
    expect(await page.locator('.membership-purchase-page').evaluate(node=>node.scrollWidth-node.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
    await expect(page.locator('.membership-pay-total strong')).toHaveText('¥2');
    if(width===1066&&!active)await page.screenshot({path:'/tmp/fw-member-purchase-1066.png'});
    if(width===760)await page.locator('[data-payment-config]').scrollIntoViewIfNeeded();
  }
  await page.locator('[data-membership-return]').click();
  await expect(entry).toBeFocused();
  await expect(page.locator('[data-member-identity-preview]')).toBeVisible();
  expect(requests.filter(row=>['POST','PATCH','DELETE'].includes(row.method)&&/\/(membership_orders|memberships)$/.test(row.path))).toHaveLength(0);
  expect(requests.filter(row=>row.path.endsWith('/membership-alipay')&&row.body.action==='create')).toHaveLength(0);
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


test('V1～V9 进度、锁定装扮与到期保留等级',async({page})=>{
  await setup(page,false);await page.goto('/');await page.locator('[data-nav="membership"]').click();
  await expect(page.locator('.membership-level-steps article')).toHaveCount(9);
  await expect(page.locator('.membership-growth h3')).toContainText('V2');
  await expect(page.locator('.membership-growth')).toContainText('已暂停累计');
  await expect(page.locator('[data-member-identity-choice="frame"][data-value="crown"]')).toBeDisabled();
  await expect(page.locator('[data-member-identity-choice="card_layout"][data-value="honor"]')).toBeDisabled();
  await expect(page.locator('[data-account-avatar]')).not.toHaveClass(/vip-identity/);
});

test('支付宝下单防重复，官方付款页和自动开通结果同步',async({page})=>{
  const {requests}=await setup(page,false,false,'success');await page.goto('/');await page.locator('[data-nav="membership"]').click();await page.locator('[data-membership-purchase]').click();
  await expect(page.locator('[data-payment-create]')).toBeEnabled();
  await page.locator('[data-payment-create]').dblclick();
  await expect(page.locator('[data-payment-query]')).toBeVisible();
  expect(requests.filter(row=>row.path.endsWith('/membership-alipay')&&row.body.action==='create')).toHaveLength(1);
  expect(await page.evaluate(()=>(window as any).checkoutUrls)).toEqual([expect.stringContaining('https://openapi.alipay.com/gateway.do')]);
  await page.locator('[data-payment-query]').click();
  await expect(page.locator('.membership-payment-success')).toContainText('付款成功');
  await expect(page.locator('.membership-payment-success')).toContainText('会员已自动生效');
  await expect(page.locator('.membership-payment-success')).toContainText('有效至');
  expect(requests.filter(row=>['POST','PATCH','DELETE'].includes(row.method)&&/\/(membership_orders|memberships)$/.test(row.path))).toHaveLength(0);
  await page.screenshot({path:'/tmp/fw-member-payment-success.png'});
  await page.getByRole('button',{name:'装扮我的身份',exact:true}).click();await expect(page.getByRole('button',{name:'保存身份',exact:true})).toBeEnabled();
});

test('查询失败不伪造开通，可继续原订单付款',async({page})=>{
  const {requests}=await setup(page,false,false,'failure');await page.goto('/');await page.locator('[data-nav="membership"]').click();await page.locator('[data-membership-purchase]').click();await page.locator('[data-payment-create]').click();
  await expect(page.locator('[data-payment-query]')).toBeVisible();await page.locator('[data-payment-query]').click();
  await expect(page.locator('.membership-payment-error')).toContainText('暂时无法确认付款结果');
  await expect(page.locator('.membership-payment-success')).toHaveCount(0);
  await page.locator('[data-payment-resume]').click();
  await expect.poll(()=>requests.filter(row=>row.path.endsWith('/membership-alipay')&&row.body.action==='resume').length).toBe(1);
  expect(requests.filter(row=>row.path.endsWith('/membership-alipay')&&row.body.action==='create')).toHaveLength(1);
  await page.locator('[data-membership-tab="orders"]').click();await expect(page.locator('.membership-order')).toContainText('FW'+'1'.repeat(32));
});

test('客户端付款使用受限原生命令，付款后自动查询到账',async({page})=>{
  await setup(page,false,false,'success');await page.goto('/');
  await page.evaluate(()=>{(window as any).nativeCheckout=[];(window as any).__TAURI__={core:{invoke:async(command:string,args:any)=>{if(command==='desktop_open_alipay')(window as any).nativeCheckout.push(args.url);return null;}}};});
  await page.locator('[data-nav="membership"]').click();await page.locator('[data-membership-purchase]').click();await page.locator('[data-payment-create]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).nativeCheckout.length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).checkoutUrls.length)).toBe(0);
  await expect(page.locator('.membership-payment-success')).toContainText('会员已自动生效',{timeout:8000});
});

test('退出登录清除付款缓存，停止原订单轮询',async({page})=>{
  const {requests}=await setup(page,false,false,'pending');await page.goto('/');await page.locator('[data-nav="membership"]').click();await page.locator('[data-membership-purchase]').click();await page.locator('[data-payment-create]').click();
  await expect(page.locator('[data-payment-query]')).toBeVisible();
  expect(await page.evaluate(id=>localStorage.getItem(`fw-membership-checkout:${id}`),me)).toContain('order_no');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('.account-button[data-open-account]').click();await page.getByRole('button',{name:'退出登录',exact:true}).click();await expect(page.locator('#app')).toBeHidden();
  expect(await page.evaluate(id=>localStorage.getItem(`fw-membership-checkout:${id}`),me)).toBeNull();
  const count=requests.filter(row=>row.body.action==='query').length;
  await page.clock.install();await page.clock.runFor(6000);
  expect(requests.filter(row=>row.body.action==='query')).toHaveLength(count);
});

test('等级提升显示静态伏伏提示，可关闭',async({page})=>{
  await setup(page);await page.addInitScript(id=>localStorage.setItem(`fw-member-level-seen:${id}`,'1'),me);await page.goto('/');await page.locator('[data-nav="membership"]').click();
  await expect(page.locator('.membership-level-notice')).toContainText('V2 已解锁');
  await expect(page.locator('.membership-level-notice img')).toHaveCSS('animation-name','none');
  await page.locator('[data-member-level-dismiss]').click();await expect(page.locator('.membership-level-notice')).toHaveCount(0);
});
