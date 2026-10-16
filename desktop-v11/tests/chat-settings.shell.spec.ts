import {test,expect,type Page} from '@playwright/test';

const me='00000000-0000-4000-8000-000000000024';
const other='00000000-0000-4000-8000-000000000025';
const third='00000000-0000-4000-8000-000000000026';
const stamp='2026-10-12T00:00:00Z';
const profiles=[{id:me,nickname:'测试研究员',lab_code:'FWTEST1'},{id:other,nickname:'搭子甲',lab_code:'FWTEST2'},{id:third,nickname:'搭子乙',lab_code:'FWTEST3'}];
const user={id:me,aud:'authenticated',role:'authenticated',email:'desktop-test@example.com',app_metadata:{provider:'email',providers:['email']},user_metadata:{nickname:'测试研究员',lab_code:'FWTEST1'},created_at:stamp};

function queried(rows:any[],url:URL){
  let selected=[...rows];
  const before=url.searchParams.get('id');if(before?.startsWith('lt.'))selected=selected.filter(row=>row.id<Number(before.slice(3)));
  const order=url.searchParams.get('order')||'';
  selected.sort((a,b)=>order.startsWith('id.desc')?b.id-a.id:a.id-b.id);
  return selected.slice(0,Number(url.searchParams.get('limit')||selected.length));
}

async function boot(page:Page){
  await page.context().routeWebSocket('wss://**',ws=>ws.close());
  await page.addInitScript(user=>localStorage.setItem('fw-lab-auth-token',JSON.stringify({access_token:'test-only-token',refresh_token:'test-only-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),user);
  await page.context().route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    if(url.hostname==='127.0.0.1')return route.continue();
    if(!url.hostname.endsWith('.supabase.co'))return route.abort();
    let body:any={};try{body=req.postDataJSON()||{};}catch{}
    let data:any=[];
    if(path.endsWith('/auth/v1/user'))data=user;
    else if(path.endsWith('/fw_get_current_profile'))data=[{...profiles[0],role:'user',is_banned:false}];
    else if(path.endsWith('/profiles'))data=profiles;
    else if(path.endsWith('/friendships'))data=[other,third].map((id,i)=>({id:i+1,requester_id:me,receiver_id:id,status:'accepted',created_at:stamp,updated_at:stamp}));
    else if(path.endsWith('/conversations'))data=[{id:601,user_one_id:me,user_two_id:other},{id:602,user_one_id:me,user_two_id:third}];
    else if(path.endsWith('/fw_get_or_create_conversation'))data=body.target_user_id===third?602:601;
    else if(path.endsWith('/game_parties'))data=[{id:51,captain_id:other,game_name:'消息边界测试',capacity:5,member_count:2,status:'open'}];
    else if(path.endsWith('/game_party_members'))data=[{party_id:51,user_id:me,state:'accepted',role:'member'}];
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/');await expect(page.locator('#app')).toBeVisible();
}

async function openChat(page:Page,id=other){
  await page.locator('.nav-item[data-nav="buddy"]').click();
  await page.locator(`[data-open-chat="${id}"]`).first().click();
  await expect(page.locator('[data-chat-compose] input[name="message"]')).toBeEnabled();
}

async function privateFixture(page:Page){
  const rows=Array.from({length:450},(_,i)=>({id:i+1,conversation_id:601,sender_id:i%2?me:other,content:`历史消息 ${i+1}`,is_deleted:false,created_at:stamp}));
  await page.route('**/rest/v1/private_messages**',async route=>{
    const url=new URL(route.request().url());
    const conv=url.searchParams.get('conversation_id');
    const data=conv==='eq.602'?[]:queried(rows,url);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
}

test('组队超过200条仍展示最新消息，刷新后顺序正确',async({page})=>{
  const rows=Array.from({length:250},(_,i)=>({id:i+1,party_id:51,user_id:other,content:`队伍消息 ${i+1}`,created_at:stamp}));
  await page.route('**/rest/v1/game_party_messages**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(queried(rows,new URL(route.request().url())))}));
  await boot(page);await page.locator('.nav-item[data-nav="play"]').click();await page.locator('[data-party-open]').click();
  const messages=page.locator('.party-chat-message');await expect(messages).toHaveCount(200);
  await expect(messages.first()).toContainText('队伍消息 51');await expect(messages.last()).toContainText('队伍消息 250');
  rows.push({id:251,party_id:51,user_id:other,content:'第251条新消息',created_at:stamp});
  await page.locator('[data-party-refresh]').click();await expect(messages.last()).toContainText('第251条新消息');await expect(messages.first()).toContainText('队伍消息 52');
});

test('私聊历史跨200条分页无遗漏，保留阅读位置、草稿与后续新消息',async({page})=>{
  await privateFixture(page);await boot(page);
  await page.evaluate(async()=>{
    const {authStore}=await import('/src/auth-store.js');const original=authStore.client.channel.bind(authStore.client);
    authStore.client.channel=(...args)=>{const channel=original(...args),on=channel.on.bind(channel);channel.on=(type,filter,callback)=>{if(filter.table==='private_messages')(window as any).__privateIncoming=callback;return on(type,filter,callback);};return channel;};
  });
  await openChat(page);const messages=page.locator('[data-chat-messages]'),items=messages.locator('.chat-message');
  await expect(items).toHaveCount(200);await expect(items.first()).toHaveAttribute('data-chat-message-id','251');await expect(items.last()).toHaveAttribute('data-chat-message-id','450');
  await page.locator('[data-chat-compose] input[name="message"]').fill('保留未发送文字');await messages.evaluate(el=>el.scrollTop=0);
  const anchor=messages.locator('[data-chat-message-id="251"]'),before=await anchor.evaluate(el=>el.getBoundingClientRect().top);
  await messages.locator('[data-chat-load-older]').click();await expect(items).toHaveCount(400);
  expect(Math.abs((await anchor.evaluate(el=>el.getBoundingClientRect().top))-before)).toBeLessThan(2);
  await expect(page.locator('[data-chat-new-messages]')).toBeHidden();await expect(page.locator('[data-chat-compose] input[name="message"]')).toHaveValue('保留未发送文字');
  await messages.evaluate(el=>el.scrollTop=0);await messages.locator('[data-chat-load-older]').click();await expect(items).toHaveCount(450);
  const ids=await items.evaluateAll(nodes=>nodes.map(el=>el.getAttribute('data-chat-message-id')));expect(new Set(ids).size).toBe(450);expect(ids).toEqual(Array.from({length:450},(_,i)=>String(i+1)));
  await expect(messages.locator('[data-chat-load-older]')).toHaveCount(0);await expect(messages).toContainText('没有更早的消息了');
  await page.evaluate(other=>(window as any).__privateIncoming({new:{id:451,conversation_id:601,sender_id:other,content:'分页后的实时新消息',is_deleted:false,created_at:new Date().toISOString()}}),other);
  await expect(items).toHaveCount(451);await expect(items.first()).toHaveAttribute('data-chat-message-id','1');await expect(items.last()).toContainText('分页后的实时新消息');
  await page.screenshot({path:'/tmp/fw-member-private-history.png'});
});

test('私聊历史失败可重试，切换搭子后迟到响应不会串入新会话',async({page})=>{
  await privateFixture(page);let fail=true,release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
  await page.route('**/rest/v1/private_messages**',async route=>{
    if(!new URL(route.request().url()).searchParams.get('id')?.startsWith('lt.'))return route.fallback();
    // A terminal HTTP failure keeps this assertion independent of the SDK's 503 retry backoff.
    if(fail)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'测试读取失败'})});
    await pending;return route.fallback();
  });
  await boot(page);await openChat(page);const messages=page.locator('[data-chat-messages]');
  await messages.locator('[data-chat-load-older]').click();await expect(messages).toContainText('更早的消息暂时读取失败');await expect(messages.locator('.chat-message')).toHaveCount(200);
  fail=false;await messages.locator('[data-chat-load-older]').click();await expect(messages.locator('[data-chat-load-older]')).toBeDisabled();
  await page.locator(`[data-open-chat="${third}"]`).first().click();await expect(page.locator('[data-chat-title]')).toContainText('搭子乙');await expect(page.locator('[data-chat-compose] input[name="message"]')).toBeEnabled();
  const finished=page.waitForResponse(r=>r.url().includes('/private_messages')&&new URL(r.url()).searchParams.get('id')?.startsWith('lt.')&&r.status()===200);
  release();await (await finished).finished();await page.evaluate(()=>new Promise(requestAnimationFrame));await expect(messages.locator('.chat-message')).toHaveCount(0);await expect(messages.locator('[data-chat-load-older]')).toHaveCount(0);await expect(messages).toContainText('还没有私聊消息');
});

async function nativeUpdates(page:Page,result:any){
  await page.addInitScript(result=>{
    (window as any).__updateCalls=0;
    (window as any).__TAURI__={core:{invoke:async(command:string)=>{
      if(command==='desktop_app_version')return '9.8.7';
      if(command==='desktop_check_for_updates'){
        (window as any).__updateCalls++;
        if(result==='hold')return new Promise(resolve=>(window as any).__finishUpdate=resolve);
        if(result==='error')throw new Error('检查更新失败，请确认网络连接后重试。');
        return result;
      }
      return null;
    }}};
  },result);
  await boot(page);await page.locator('[data-sidebar-more-toggle]').click();await page.locator('[data-nav="settings"]').click();
}

test('设置显示原生版本号，检查中防止重复点击，无更新时明确反馈',async({page})=>{
  await page.setViewportSize({width:760,height:560});await nativeUpdates(page,'hold');await expect(page.locator('[data-app-version]')).toHaveText('9.8.7');
  const button=page.locator('[data-check-updates]');await button.click();await expect(button).toBeDisabled();await expect(button).toHaveText('检查中…');await expect(page.locator('[data-update-check-status]')).toContainText('正在检查更新');
  expect(await page.evaluate(()=>(window as any).__updateCalls)).toBe(1);
  await page.evaluate(()=>(window as any).__finishUpdate({status:'latest'}));await expect(button).toBeEnabled();await expect(page.locator('[data-update-check-status]')).toHaveText('当前已是最新版本。');
  await page.screenshot({path:'/tmp/fw-member-settings-update.png'});
});

for(const [name,result,text] of [
  ['可用更新',{status:'available',version:'9.8.8'},'发现新版本 9.8.8'],
  ['已有更新检查',{status:'busy'},'正在检查或处理更新'],
  ['检查失败','error','检查更新失败，请确认网络连接后重试。'],
] as const)test(`手动检查更新：${name}有结果且按钮可再次使用`,async({page})=>{
  await nativeUpdates(page,result);const button=page.locator('[data-check-updates]');await button.click();await expect(page.locator('[data-update-check-status]')).toContainText(text);await expect(button).toBeEnabled();await expect(button).toHaveText('检查更新');
});
