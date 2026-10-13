import {test,expect,type Page} from '@playwright/test';

async function nav(page:Page,route:string){await page.locator(`.nav-item[data-nav="${route}"]`).click();}
async function openChat(page:Page,id=other){await nav(page,'buddy');await page.locator(`[data-open-chat="${id}"]`).first().click();await expect(page.locator('[data-chat-compose] input[name="message"]')).toBeEnabled();}
async function incoming(page:Page){
  await page.evaluate(async()=>{const {authStore}=await import('/src/auth-store.js');const original=authStore.client.channel.bind(authStore.client);(window as any).__uxSubscriptions=[];authStore.client.channel=(...args)=>{const channel=original(...args),on=channel.on.bind(channel);channel.on=(type,filter,callback)=>{(window as any).__uxSubscriptions.push({filter,callback});return on(type,filter,callback);};return channel;};});
}
async function deliver(page:Page){await page.evaluate(other=>{const handler=(window as any).__uxSubscriptions.find(x=>x.filter.table==='private_messages'&&x.filter.event==='INSERT');handler.callback({new:{id:1001,conversation_id:601,sender_id:other,content:'新消息',is_deleted:false,created_at:new Date().toISOString()}});},other);}

test('投票发布失败保留标题、四个选项，并可重试',async({page})=>{
  await boot(page,{failRpc:'fw_create_poll'});await nav(page,'rooms');await page.locator('[data-poll-create-toggle]').click();const form=page.locator('[data-poll-create-form]');
  await form.locator('[name="title"]').fill('保留标题');for(let i=1;i<=4;i++)await form.locator(`[name="option${i}"]`).fill('选项'+i);
  await form.locator('[type="submit"]').click();await expect(page.locator('[data-toast]')).toContainText('模拟网络失败');await expect(form.locator('[name="title"]')).toHaveValue('保留标题');for(let i=1;i<=4;i++)await expect(form.locator(`[name="option${i}"]`)).toHaveValue('选项'+i);
  await expect(form.locator('[type="submit"]')).toBeEnabled();
});

test('创建组队失败保留完整表单和申请开关',async({page})=>{
  await boot(page,{failRpc:'fw_create_game_party'});await nav(page,'play');await page.locator('[data-party-create-toggle]').click();const form=page.locator('[data-party-create-form]');
  await form.locator('[name="gameName"]').fill('今晚开黑');await form.locator('[name="note"]').fill('组队说明');await form.locator('[name="requiresApproval"]').uncheck();await form.locator('[type="submit"]').click();
  await expect(page.locator('[data-toast]')).toContainText('模拟网络失败');await expect(form.locator('[name="gameName"]')).toHaveValue('今晚开黑');await expect(form.locator('[name="note"]')).toHaveValue('组队说明');await expect(form.locator('[name="requiresApproval"]')).not.toBeChecked();await expect(form.locator('[type="submit"]')).toBeEnabled();
});

for(const failure of [true,false])test(`组队聊天${failure?'失败保留':'成功清空'}本房间草稿`,async({page})=>{
  await boot(page,failure?{failRpc:'fw_send_game_party_message'}:{});await nav(page,'play');await page.locator('[data-party-open]').first().click();const form=page.locator('[data-party-chat-form]');await form.locator('input').fill('组队聊天草稿');
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/fw_send_game_party_message')),form.locator('button').click()]);if(failure)await expect(page.locator('[data-toast]')).toContainText('模拟网络失败');await expect(form.locator('input')).toHaveValue(failure?'组队聊天草稿':'');
});

test('私聊草稿按对象恢复，退出账号后清除',async({page})=>{
  await boot(page);await openChat(page);const input=page.locator('[data-chat-compose] input[name="message"]');await input.fill('只给甲');await page.locator(`[data-open-chat="${third}"]`).first().click();await expect(input).toHaveValue('');await expect(input).toBeEnabled();await input.fill('只给乙');await page.locator(`[data-open-chat="${other}"]`).first().click();await expect(input).toHaveValue('只给甲');
  await page.evaluate(async()=>{const {authStore}=await import('/src/auth-store.js');await authStore.signOut();});await expect(input).toHaveValue('');
});

test('私聊发送成功后清除原草稿，切换对象不受迟到响应影响',async({page})=>{
  await boot(page);let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/rest/v1/private_messages**',async route=>{if(route.request().method()!=='POST')return route.fallback();await gate;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...route.request().postDataJSON(),id:1002,created_at:new Date().toISOString()})});});
  await openChat(page);const input=page.locator('[data-chat-compose] input[name="message"]');await input.fill('发给甲');await page.locator('[data-chat-compose] [type="submit"]').click();await page.locator(`[data-open-chat="${third}"]`).first().click();await expect(input).toBeEnabled();await input.fill('乙的新草稿');release();await expect(page.locator('[data-chat-compose] [type="submit"]')).toBeEnabled();await expect(input).toHaveValue('乙的新草稿');await page.locator(`[data-open-chat="${other}"]`).first().click();await expect(input).toHaveValue('');
});

test('评论刷新保留文字、焦点及光标选择范围',async({page})=>{
  await boot(page);await nav(page,'square');await page.locator('[data-open-post="101"]').first().click();const input=page.locator('[data-comment-form] textarea');await input.fill('评论输入草稿');await input.evaluate((element:HTMLTextAreaElement)=>element.setSelectionRange(2,4));
  await page.evaluate(async()=>{const {feedStore}=await import('/src/feed-store.js');await feedStore.load(true);});await expect(input).toBeFocused();await expect(input).toHaveValue('评论输入草稿');expect(await input.evaluate((el:HTMLTextAreaElement)=>[el.selectionStart,el.selectionEnd])).toEqual([2,4]);
});

test('中文输入组合期间评论刷新保留原输入节点',async({page})=>{
  await boot(page);await nav(page,'square');await page.locator('[data-open-post="101"]').first().click();const input=page.locator('[data-comment-form] textarea');await input.fill('输入中文');
  await input.evaluate(el=>{(window as any).__uxInput=el;el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));});
  await page.evaluate(async()=>{const {feedStore}=await import('/src/feed-store.js');await feedStore.load(true);});expect(await input.evaluate(el=>el===(window as any).__uxInput)).toBe(true);
  await input.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));await expect(input).toBeFocused();await expect(input).toHaveValue('输入中文');
});

for(const nearBottom of [false,true])test(`私聊新消息${nearBottom?'在底部跟随':'保留历史位置并提示'}`,async({page})=>{
  await boot(page);await incoming(page);await openChat(page);const messages=page.locator('[data-chat-messages]');await messages.evaluate((el,bottom)=>el.scrollTop=bottom?el.scrollHeight:0,nearBottom);await deliver(page);
  if(nearBottom){await expect.poll(()=>messages.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(70);await expect(page.locator('[data-chat-new-messages]')).toBeHidden();}
  else{await expect.poll(()=>messages.evaluate(el=>el.scrollTop)).toBe(0);await expect(page.locator('[data-chat-new-messages]')).toBeVisible();await page.locator('[data-chat-new-messages]').click();await expect.poll(()=>messages.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(70);}
});

for(const width of [760,1066])test(`窗口宽度${width}的广场、组队和私聊操作都可见`,async({page})=>{
  await page.setViewportSize({width,height:560});await boot(page);
  for(const route of ['square','play','buddy']){await nav(page,route);if(route==='square')await page.locator('[data-open-post="101"]').first().click();if(route==='play')await page.locator('[data-party-open]').first().click();if(route==='buddy')await page.locator(`[data-open-chat="${other}"]`).first().click();
    const clipped=await page.locator('.view.active button').evaluateAll(nodes=>nodes.filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&r.top<innerHeight&&r.bottom>0&&(r.left<0||r.right>innerWidth);}).map(el=>el.textContent));expect(clipped).toEqual([]);
  }
});

test('房间表单刷新保留滚动位置和输入选择范围',async({page})=>{
  await page.setViewportSize({width:760,height:560});await boot(page);await nav(page,'chatrooms');await page.locator('[data-room-create]').click();const input=page.locator('[data-room-editor-form] [name="name"]');await input.fill('创建房间草稿');await input.evaluate((el:HTMLInputElement)=>el.setSelectionRange(2,4));const scroll=page.locator('.room-editor');await scroll.evaluate(el=>el.scrollTop=119);const top=await scroll.evaluate(el=>el.scrollTop);
  await page.evaluate(async()=>{const {chatRoomStore}=await import('/src/chat-room-store.js');await chatRoomStore.loadRooms();});expect(await scroll.evaluate(el=>el.scrollTop)).toBe(top);await expect(input).toBeFocused();expect(await input.evaluate((el:HTMLInputElement)=>[el.selectionStart,el.selectionEnd])).toEqual([2,4]);
});

test('窗口缩放无资料卡空节点错误，折叠侧栏有名称与提示',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);await page.setViewportSize({width:760,height:560});await page.locator('.nav-list button').first().focus();for(const item of await page.locator('.nav-list .nav-item').all()){expect(await item.getAttribute('aria-label')).toBeTruthy();expect(await item.getAttribute('title')).toBeTruthy();}await page.setViewportSize({width:1066,height:728});expect(errors).toEqual([]);
});

test('2048打开后直接接收键盘，返回后恢复卡片焦点',async({page})=>{
  await boot(page);await nav(page,'games');await page.locator('[data-game-open="2048"]').click();await page.frameLocator('[data-game-frame]').locator('.game-container').waitFor();await expect(page.locator('[data-game-frame]')).toBeFocused();const child=page.frames().find(frame=>frame.url().includes('/games/2048/'))!;await child.evaluate(()=>{(window as any).__uxKeys=0;document.addEventListener('keydown',()=>((window as any).__uxKeys++));});await page.keyboard.press('ArrowLeft');expect(await child.evaluate(()=>(window as any).__uxKeys)).toBe(1);await page.locator('[data-game-back]').click();await expect(page.locator('[data-game-open="2048"]')).toBeFocused();
});

test('反馈弹窗限制正反Tab并在Esc关闭后恢复入口焦点',async({page})=>{
  await boot(page);const trigger=page.locator('[data-feedback-open]');await trigger.click();for(const key of [...Array(7).fill('Tab'),...Array(7).fill('Shift+Tab')]){await page.keyboard.press(key);expect(await page.evaluate(()=>!!document.activeElement?.closest('[data-home-tool-modal]'))).toBe(true);}await page.keyboard.press('Escape');await expect(page.locator('[data-home-tool-modal]')).toBeHidden();await expect(trigger).toBeFocused();
});

test('更多菜单支持Esc关闭并恢复触发按钮焦点',async({page})=>{
  await boot(page);const trigger=page.locator('[data-sidebar-more-toggle]');await trigger.click();await page.locator('.sidebar-more-menu [data-nav="settings"]').focus();await page.keyboard.press('Escape');await expect(trigger).toHaveAttribute('aria-expanded','false');await expect(trigger).toBeFocused();
});

const me='00000000-0000-4000-8000-000000000024',other='00000000-0000-4000-8000-000000000025',third='00000000-0000-4000-8000-000000000026';
const user={id:me,aud:'authenticated',role:'authenticated',email:'audit@example.com',app_metadata:{provider:'email',providers:['email']},user_metadata:{nickname:'检查研究员',lab_code:'AUDIT1'},created_at:'2026-09-18T00:00:00Z'};
const profiles=[{id:me,nickname:'检查研究员',lab_code:'AUDIT1'},{id:other,nickname:'搭子甲',lab_code:'AUDIT2'},{id:third,nickname:'搭子乙',lab_code:'AUDIT3'}];
const posts=Array.from({length:40},(_,i)=>({id:101+i,user_id:other,content:`第 ${i+1} 条日常牢骚：${'今天工作有点忙，午休来这里看看大家都在聊什么。'.repeat(4)}`,created_at:'2026-10-12T01:00:00Z'}));
const comments=Array.from({length:25},(_,i)=>({id:201+i,post_id:101,user_id:other,content:`评论 ${i+1}：${'一起聊聊今天的工作和生活。'.repeat(3)}`,created_at:'2026-10-12T02:00:00Z'}));
const privateMessages=Array.from({length:45},(_,i)=>({id:401+i,conversation_id:601,sender_id:i%2?me:other,content:`历史消息 ${i+1}：聊聊今天的工作和生活。`,is_deleted:false,created_at:new Date(Date.UTC(2026,9,12,0,i)).toISOString()}));
const room={id:'11111111-1111-4111-8111-111111111111',owner_id:me,name:'午休闲聊房间',description:'聊聊工作和生活。',owner:profiles[0],join_mode:'direct',has_password:false,retention_days:7,expires_at:new Date(Date.now()+7*86400000).toISOString(),created_at:new Date().toISOString(),member_count:3,joined:true,is_owner:true,request_status:null,pending_count:0};
const roomMessages=Array.from({length:50},(_,i)=>({id:501+i,room_id:room.id,user_id:other,content:`房间历史 ${i+1}：今天午休大家都吃了什么？`,author:profiles[1],created_at:'2026-10-12T03:00:00Z'}));
async function boot(page:Page,options:{failRpc?:string}={}){
 const context=page.context();
 await context.routeWebSocket('wss://**',ws=>ws.close());
 await context.addInitScript(user=>localStorage.setItem('fw-lab-auth-token',JSON.stringify({access_token:'audit-fake-token',refresh_token:'audit-fake-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),user);
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;let body={};try{body=req.postDataJSON()||{};}catch{}

  if(url.hostname==='127.0.0.1')return route.continue();
  if(!url.hostname.endsWith('.supabase.co'))return route.abort();
  if(options.failRpc&&path.endsWith('/'+options.failRpc))return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'检查用模拟网络失败',code:'AUDIT_NETWORK_FAILURE'})});
  let data=[];
  if(path.endsWith('/auth/v1/user'))data=user;
  else if(path.endsWith('/fw_get_current_profile'))data=[{...profiles[0],role:'user',is_banned:false}];
  else if(path.endsWith('/memberships'))data={user_id:me,status:'active',starts_at:'2026-01-01T00:00:00Z',expires_at:new Date(Date.now()+86400000).toISOString(),plan_id:'monthly'};
  else if(path.endsWith('/fw_get_own_membership_growth'))data={level:2,active_days:31,next_level:3,next_threshold:90,active:true};
  else if(path.endsWith('/fw_get_membership_levels'))data=(body.p_user_ids||[]).map(id=>({user_id:id,level:2}));
  else if(path.endsWith('/membership-alipay'))data={enabled:false,configured:true,max_amount_cents:5000};
  else if(path.endsWith('/profiles'))data=profiles;
  else if(path.endsWith('/posts'))data=url.searchParams.has('user_id')?[]:posts;
  else if(path.endsWith('/comments'))data=comments;
  else if(path.endsWith('/polls'))data=[];
  else if(path.endsWith('/fw_my_poll_daily_count'))data=0;
  else if(path.endsWith('/friendships'))data=[other,third].map((id,i)=>({id:1+i,requester_id:me,receiver_id:id,status:'accepted',created_at:'2026-10-12T00:00:00Z',updated_at:'2026-10-12T00:00:00Z'}));
  else if(path.endsWith('/conversations'))data=[{id:601,user_one_id:me,user_two_id:other},{id:602,user_one_id:me,user_two_id:third}];
  else if(path.endsWith('/fw_get_or_create_conversation'))data=body.target_user_id===third?602:601;
  else if(path.endsWith('/private_messages')&&req.method()==='POST')data={...body,id:999,created_at:new Date().toISOString()};
  else if(path.endsWith('/private_messages'))data=url.searchParams.get('conversation_id')==='eq.602'?[]:[...privateMessages].reverse();
  else if(path.endsWith('/game_parties'))data=[{id:51,captain_id:other,game_name:'今晚一起开黑',capacity:5,member_count:2,status:'open',requires_approval:true,note:'一起轻松玩几局。'}];
  else if(path.endsWith('/game_party_members'))data=[{party_id:51,user_id:me,role:'member',state:'accepted'}];
  else if(path.endsWith('/game_party_contacts'))data=[{party_id:51,user_id:me,game_id:'我的游戏ID'},{party_id:51,user_id:other,game_id:'搭子甲的ID'}];
  else if(path.endsWith('/game_party_messages'))data=Array.from({length:15},(_,i)=>({id:701+i,party_id:51,user_id:other,content:`队伍聊天 ${i+1}`,created_at:'2026-10-12T00:00:00Z'}));
  else if(path.endsWith('/fw_chat_room_list'))data={rooms:[room],has_more:false,server_time:new Date().toISOString()};
  else if(path.endsWith('/fw_chat_room_read'))data={room,messages:roomMessages,members:[],requests:[],has_more:false,server_time:new Date().toISOString()};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });

 await page.goto('/');await page.locator('#app:not([hidden])').waitFor();
}
