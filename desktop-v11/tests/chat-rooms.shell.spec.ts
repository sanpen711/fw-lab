import {expect,test,Page} from '@playwright/test';
const me='00000000-0000-4000-8000-000000000024',other='00000000-0000-4000-8000-000000000025';
const user={id:me,aud:'authenticated',role:'authenticated',email:'room-test@example.com',app_metadata:{provider:'email',providers:['email']},user_metadata:{nickname:'测试研究员',lab_code:'FWTEST1'},created_at:'2026-09-18T00:00:00Z'};
const owner={id:other,nickname:'房主',avatar_url:''},self={id:me,nickname:'测试研究员',avatar_url:''};
function room(id:string,password=false,approval=false,owned=false){return {id,owner_id:owned?me:other,name:owned?'我创建的闲聊房间':password?'密码闲聊房间':'公开闲聊房间',description:'进来聊聊今天的工作和生活。',owner:owned?self:owner,join_mode:approval?'approval':'direct',has_password:password,retention_days:7,expires_at:new Date(Date.now()+7*86400000).toISOString(),created_at:new Date().toISOString(),member_count:owned?1:2,joined:owned,is_owner:owned,request_status:null,pending_count:owned?1:0};}
async function setup(page:Page,options:{password?:boolean,approval?:boolean,owned?:boolean}={}){
 const rooms:any[]=[room('11111111-1111-4111-8111-111111111111',!!options.password,!!options.approval,!!options.owned)];
 const messages:any[]=[{id:1,room_id:rooms[0].id,user_id:other,content:'这里是房间聊天记录',created_at:new Date().toISOString(),author:owner}];
 const members:any[]=[{user_id:rooms[0].owner_id,nickname:rooms[0].owner.nickname,is_owner:true,joined_at:new Date().toISOString()},{user_id:other,nickname:'待管理成员',is_owner:false,joined_at:new Date().toISOString()}];
 const requests:any[]=[{user_id:other,nickname:'申请研究员',created_at:new Date().toISOString()}];
 const calls:any[]=[];let failure=false;
 await page.addInitScript(user=>localStorage.setItem('fw-lab-auth-token',JSON.stringify({access_token:'room-test-token',refresh_token:'room-test-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})),user);
 await page.route('https://**.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,body=req.postDataJSON()||{};let data:any=[];
  if(path.endsWith('/auth/v1/user'))data=user;
  else if(path.endsWith('/fw_get_current_profile'))data=[{id:me,nickname:'测试研究员',role:'user',lab_code:'FWTEST1',is_banned:false}];
  else if(path.endsWith('/fw_chat_room_list')){
   calls.push({op:'list',...body});if(failure)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'读取房间暂时失败'})});
   data={rooms:rooms.filter(r=>body.p_filter==='all'||body.p_filter==='mine'&&(r.joined||r.request_status==='pending')||body.p_filter==='owned'&&r.is_owner||body.p_filter==='joined'&&r.joined&&!r.is_owner||body.p_filter==='pending'&&r.request_status==='pending'),has_more:false,server_time:new Date().toISOString()};
  }else if(path.endsWith('/fw_chat_room_read')){
   const r=rooms.find(r=>r.id===body.p_room_id);if(!r)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'房间已解散或到期。'})});
   const visible=r.joined?messages.filter(m=>m.room_id===r.id&&(!body.p_before_id||m.id<body.p_before_id)).slice(-100):[];
   data={room:r,messages:visible,members:r.joined?members:[],requests:r.is_owner?requests:[],has_more:visible.length===100,server_time:new Date().toISOString()};
  }else if(path.endsWith('/fw_chat_room_action')){
   calls.push({op:body.p_action,...body});const r=rooms.find(r=>r.id===body.p_room_id),p=body.p_payload||{};
   if(body.p_action==='create'){const created=room('22222222-2222-4222-8222-222222222222',!!p.password,p.join_mode==='approval',true);Object.assign(created,p,{expires_at:p.retention_days?new Date(Date.now()+p.retention_days*86400000).toISOString():null});delete created.password;rooms.push(created);data={room_id:created.id,status:'joined'};}
   if(body.p_action==='join'){if(r.has_password&&p.password!=='123456')data={error:'房间密码不正确。'};else if(r.join_mode==='approval'){r.request_status='pending';data={status:'pending'};}else{r.joined=true;data={status:'joined'};}}
   if(body.p_action==='cancel_request'){r.request_status=null;data={status:'cancelled'};}
   if(body.p_action==='send'){messages.push({id:messages.length+1,room_id:r.id,user_id:me,content:p.content,sticker_url:p.sticker_url,media_path:p.media_path,created_at:new Date().toISOString(),author:self});data={message_id:messages.length};}
   if(body.p_action==='accept'||body.p_action==='reject'){requests.splice(0);r.pending_count=0;data={status:body.p_action};}
   if(body.p_action==='kick'){const index=members.findIndex(m=>m.user_id===p.user_id&&!m.is_owner);if(index>=0)members.splice(index,1);data={status:'removed'};}
   if(body.p_action==='delete_message'){const index=messages.findIndex(m=>String(m.id)===String(p.message_id));if(index>=0)messages.splice(index,1);data={status:'deleted'};}
   if(body.p_action==='settings'){Object.assign(r,{name:p.name,description:p.description,join_mode:p.join_mode});if(p.password_mode==='clear')r.has_password=false;if(p.password_mode==='set')r.has_password=true;if(p.extend_days==='0')r.expires_at=null;data={status:'saved'};}
   if(body.p_action==='leave'){r.joined=false;data={status:'left'};}
   if(body.p_action==='dissolve'){rooms.splice(rooms.indexOf(r),1);data={status:'dissolved'};}
  }else if(path.endsWith('/profiles'))data=[self,owner];
  else if(path.endsWith('/storage/v1/object/sign/room-media'))data=(body.paths||[]).map((path:string)=>({path,signedURL:'/object/sign/room-media/'+path+'?token=mock'}));
  else if(path.includes('/storage/v1/object/room-media/'))data={Key:'room-media/mock'};
  else if(path.endsWith('/auth/v1/logout'))data={};
  else if(path.endsWith('/chat-room-maintenance'))data={ok:true,removed:0};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 return {rooms,messages,calls,setFailure:(v:boolean)=>{failure=v;}};
}
async function enter(page:Page){await page.goto('/');await page.locator('.nav-item[data-nav="chatrooms"]').click();await expect(page.locator('[data-room-list] .room-card')).toHaveCount(1);await page.locator('[data-room-open]').first().click();}
for(const password of [false,true])for(const approval of [false,true])test(`${password?'有密码':'无密码'}房间${approval?'需要申请':'直接加入'}，加入前隐藏聊天记录`,async({page})=>{
 const {calls,rooms}=await setup(page,{password,approval});await enter(page);
 await expect(page.locator('[data-room-detail]')).not.toContainText('这里是房间聊天记录');
 if(password){await page.locator('[data-room-join-form] [name="password"]').fill('wrong');await page.locator('[data-room-join-form]').evaluate((form:HTMLFormElement)=>form.requestSubmit());await expect(page.locator('[data-room-join-error]')).toHaveText('房间密码不正确。');await page.locator('[data-room-join-form] [name="password"]').fill('123456');}
 await page.locator('[data-room-join-form]').evaluate((form:HTMLFormElement)=>form.requestSubmit());
 if(approval){await expect(page.locator('[data-room-detail]')).toContainText('等待房主同意');await expect(page.locator('[data-room-send-form]')).toHaveCount(0);await page.locator('[data-room-mine-toggle]').click();await page.locator('[data-room-filter="pending"]').click();await expect(page.locator('[data-room-list]')).toContainText('申请中');await page.locator('[data-room-cancel-request]').click();await expect(page.locator('[data-room-join-form]')).toBeVisible();}
 else{await expect(page.locator('[data-room-messages]')).toContainText('这里是房间聊天记录');await page.locator('[data-room-send-form] textarea').fill('加入后正常聊天');await page.locator('[data-room-send-form]').evaluate((form:HTMLFormElement)=>form.requestSubmit());await expect(page.locator('[data-room-messages]')).toContainText('加入后正常聊天');}
 expect(calls.some(c=>c.op==='join')).toBe(true);expect(rooms[0].has_password).toBe(password);
});

test('普通用户创建房间可选四种期限、密码和审核，永久房间创建后进入聊天',async({page})=>{
 const {calls}=await setup(page);await page.goto('/');await page.locator('.nav-item[data-nav="chatrooms"]').click();await page.locator('[data-room-create]').click();
 await expect(page.locator('[name="retention_days"] option')).toHaveText(['3 天','7 天','30 天','永久保存']);
 await page.locator('[data-room-editor-form] [name="name"]').fill('上班摸鱼闲聊');await page.locator('[name="description"]').fill('午休时聊聊');await page.locator('[name="use_password"]').check();await page.locator('[data-room-editor-form] [name="password"]').fill('123456');await page.locator('[name="join_mode"]').selectOption('approval');await page.locator('[name="retention_days"]').selectOption('0');
 await expect(page.locator('[data-room-expiry-preview]')).toContainText('永久保存');await page.locator('[data-room-editor-form]').evaluate((form:HTMLFormElement)=>form.requestSubmit());await expect(page.locator('.room-detail-head h2')).toHaveText('上班摸鱼闲聊');
 const create=calls.find(c=>c.op==='create');expect(create.p_payload).toMatchObject({password:'123456',retention_days:0,join_mode:'approval'});
 await page.screenshot({path:'/tmp/fw-member-chat-room-create.png'});
});

test('房主处理申请、管理成员、修改设置并解散，普通成员没有管理入口',async({page})=>{
 const {calls}=await setup(page,{owned:true});await enter(page);await page.locator('[data-room-members-toggle]').click();await expect(page.locator('[data-room-accept]')).toBeVisible();await page.locator('[data-room-accept]').click();await expect(page.locator('[data-room-accept]')).toHaveCount(0);
 page.once('dialog',d=>d.accept());await page.locator('[data-room-kick]').click();await expect(page.locator('[data-room-kick]')).toHaveCount(0);
 await page.locator('[data-room-manage]').click();await page.locator('[name="name"]').fill('我的新房间');await page.locator('[name="extend_days"]').selectOption('0');await page.locator('[data-room-editor-form]').evaluate((form:HTMLFormElement)=>form.requestSubmit());await expect(page.locator('.room-detail-head')).toContainText('永久保存');
 await page.locator('[data-room-manage]').click();page.once('dialog',d=>d.accept());await page.locator('[data-room-dissolve]').click();await expect(page.locator('[data-room-detail]')).toContainText('房间已解散');await expect(page.locator('[data-room-list] .room-card')).toHaveCount(0);
 expect(calls.filter(c=>['accept','kick','settings','dissolve'].includes(c.op)).map(c=>c.op)).toEqual(['accept','kick','settings','dissolve']);
});

test('聊天表情选择后关闭、可粘贴图片，窄窗口布局无横向溢出',async({page})=>{
 await setup(page,{owned:true});await enter(page);await page.locator('[data-room-picker-toggle]').first().click();await expect(page.locator('[data-room-emoji]')).toHaveCount(89);await page.locator('[data-room-picker-tab="fufu1"]').click();await expect(page.locator('[data-room-emoji]')).toHaveCount(24);await page.locator('[data-room-emoji]').first().click();await expect(page.locator('.room-picker')).toBeHidden();await expect(page.locator('[data-room-send-form] textarea')).toHaveValue('[伏伏1:01]');
 await page.locator('[data-room-send-form] textarea').evaluate(node=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array([137,80,78,71])],'test.png',{type:'image/png'}));node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});await expect(page.locator('.room-attachment-preview img')).toHaveAttribute('src',/^blob:/);
 await page.locator('[data-room-attachment-remove]').click();
 for(const width of [1280,1066,760]){await page.setViewportSize({width,height:width===760?560:728});await expect(page.locator('[data-room-send-form]')).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await expect(page.locator('.nav-item[data-nav="chatrooms"]')).toBeInViewport({ratio:1});}
 await page.screenshot({path:'/tmp/fw-member-chat-room-narrow.png'});
});

test('退出账号清空房间内容和草稿，读取失败可重试',async({page})=>{
 const {setFailure}=await setup(page,{owned:true});await enter(page);await page.locator('[data-room-send-form] textarea').fill('未发送的个人草稿');await page.locator('[data-room-create]').click();await expect(page.locator('[data-room-editor-form]')).toBeVisible();await page.locator('[data-room-editor-close]').click();
 await page.locator('[data-room-mine-toggle]').click();setFailure(true);await page.locator('[data-room-refresh]').click();await expect(page.locator('.room-inline-error')).toContainText('读取房间暂时失败');setFailure(false);await page.locator('.room-inline-error [data-room-refresh]').click();await expect(page.locator('.room-inline-error')).toHaveCount(0);
 await page.locator('.account-button[data-open-account]').click();page.once('dialog',d=>d.accept());await page.locator('[data-sign-out]').click();await expect(page.locator('#app')).toBeHidden();await expect(page.locator('[data-room-detail]')).not.toContainText('这里是房间聊天记录');
});


test('已加载的历史聊天在新消息刷新后保留，成员退出后隐藏记录',async({page})=>{
 const {messages,rooms}=await setup(page,{owned:true});messages.splice(0,messages.length,...Array.from({length:150},(_,i)=>({id:i+1,room_id:rooms[0].id,user_id:other,content:`历史消息 ${i+1}`,created_at:new Date().toISOString(),author:owner})));await enter(page);
 await expect(page.locator('[data-room-message]')).toHaveCount(100);await page.locator('[data-room-history]').click();await expect(page.locator('[data-room-message]')).toHaveCount(150);await expect(page.locator('[data-room-history]')).toHaveCount(0);
 messages.push({id:151,room_id:rooms[0].id,user_id:other,content:'最新消息',created_at:new Date().toISOString(),author:owner});
 await page.evaluate(async()=>{const {chatRoomStore}=await import('/src/chat-room-store.js');await chatRoomStore.readRoom();});await expect(page.locator('[data-room-message]')).toHaveCount(151);await expect(page.locator('[data-room-messages]')).toContainText('历史消息 1');await expect(page.locator('[data-room-history]')).toHaveCount(0);
 rooms[0].joined=false;rooms[0].is_owner=false;await page.evaluate(async()=>{const {chatRoomStore}=await import('/src/chat-room-store.js');await chatRoomStore.readRoom();});await expect(page.locator('[data-room-send-form]')).toHaveCount(0);await expect(page.locator('[data-room-detail]')).not.toContainText('历史消息 1');
});
