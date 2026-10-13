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
    if(route==='square'){
      const form=page.locator('[data-comment-form]'),composer=(await form.boundingBox())!;expect(composer.y+composer.height).toBeCloseTo(560,0);
      await page.locator('.detail-content-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);const lastComment=(await page.locator('.post-comment').last().boundingBox())!;expect(lastComment.y+lastComment.height).toBeLessThanOrEqual(composer.y);
      await form.locator('[data-compact-picker-toggle]').click();const picker=page.locator('[data-comment-form] .compose-compact-picker');await expect(picker).toBeVisible();const panel=(await picker.boundingBox())!;
      expect(panel.y).toBeGreaterThanOrEqual(56);expect(panel.y+panel.height).toBeLessThan(composer.y);expect(panel.x).toBeGreaterThanOrEqual(0);expect(panel.x+panel.width).toBeLessThanOrEqual(width);expect((await form.boundingBox())!.height).toBe(composer.height);
      await form.locator('[data-compact-picker-toggle]').click();
    }
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

test('反馈弹窗打开时退出账号不会阻挡重新登录',async({page})=>{
  await boot(page);await page.locator('[data-feedback-open]').click();await page.evaluate(async()=>{const {authStore}=await import('/src/auth-store.js');await authStore.signOut();});await expect(page.locator('[data-home-tool-modal]')).toBeHidden();await expect(page.locator('[data-account-modal]')).toBeVisible();const email=page.locator('[data-auth-view="login"] input[name="email"]');await email.focus();await expect(email).toBeFocused();
});

test('组队小窗口优先显示聊天，空游戏ID不能复制，折叠和草稿在刷新后保留',async({page})=>{
  await page.setViewportSize({width:760,height:560});await boot(page);await partyFixture(page,'joined',{emptyIds:true});await nav(page,'play');await page.locator('[data-party-open="51"]').click();
  const form=page.locator('[data-party-chat-form]'),overview=page.locator('[data-party-panel="overview"]');await expect(form).toBeVisible();await expect(overview).not.toHaveAttribute('open');await expect(page.locator('.party-contact-card [data-copy-text]')).toHaveCount(0);
  await expect.poll(()=>page.locator('.party-chat').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(220);await expect.poll(()=>form.evaluate(el=>el.getBoundingClientRect().bottom)).toBeCloseTo(560,0);
  const input=form.locator('input');await input.fill('组队聊天草稿');await overview.locator('summary').click();await expect(overview).toHaveAttribute('open','');await input.focus();await input.evaluate((el:HTMLInputElement)=>el.setSelectionRange(2,4));
  await page.evaluate(async()=>{const {gamePartyStore}=await import('/src/game-party-store.js');await gamePartyStore.load(true);});await expect(overview).toHaveAttribute('open','');await expect(input).toHaveValue('组队聊天草稿');await expect(input).toBeFocused();expect(await input.evaluate((el:HTMLInputElement)=>[el.selectionStart,el.selectionEnd])).toEqual([2,4]);
  await overview.locator('summary').focus();await page.keyboard.press('Enter');await expect(overview).not.toHaveAttribute('open');await page.evaluate(async()=>{const {gamePartyStore}=await import('/src/game-party-store.js');await gamePartyStore.load(true);});await expect(overview.locator('summary')).toBeFocused();await expect(overview).not.toHaveAttribute('open');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-party-leave]').click();await expect(form).toBeVisible();
});

test('队长申请区可展开审核，处理后保持展开、聊天草稿和历史位置',async({page})=>{
  await boot(page);const requests=await partyFixture(page,'captain');await nav(page,'play');await page.locator('[data-party-open="51"]').click();
  const management=page.locator('[data-party-panel="management"]');await expect(management).not.toHaveAttribute('open');await expect(management.locator('summary')).toContainText('1 待确认');await management.locator('summary').click();await expect(management).toHaveAttribute('open','');await expect(management).toContainText('申请人游戏ID');
  await page.locator('[data-party-chat-form] input').fill('队长正在写的话');const messages=page.locator('.party-chat-messages');await messages.evaluate(el=>el.scrollTop=0);await page.locator('[data-party-decide="accept"]').click();await expect(page.locator('[data-toast]')).toContainText('已同意加入');
  await expect(management).toHaveAttribute('open','');await expect(management.locator('summary')).toContainText('0 待确认 · 2 已加入');await expect(page.locator('[data-party-chat-form] input')).toHaveValue('队长正在写的话');expect(await messages.evaluate(el=>el.scrollTop)).toBe(0);expect(requests.some(row=>row.path.endsWith('/fw_decide_game_party')&&row.body.p_accept===true)).toBe(true);
  await expect(page.locator('[data-party-close]')).toBeVisible();
});

for(const role of ['pending','visitor'] as const)test(`组队${role==='pending'?'待审核':'未加入'}状态不显示队内ID和聊天`,async({page})=>{
  await page.setViewportSize({width:760,height:560});await boot(page);await partyFixture(page,role);await nav(page,'play');await page.locator('[data-party-open="51"]').click();
  await expect(page.locator('.party-contact-card,.party-chat,[data-party-chat-form]')).toHaveCount(0);await expect(page.locator('[data-party-detail]')).not.toContainText('队长游戏ID');await expect(page.locator('[data-party-detail]')).not.toContainText('申请人游戏ID');
  if(role==='pending')await expect(page.locator('[data-party-leave]')).toHaveText('撤回申请');
  else{const form=page.locator('[data-party-join-form]');await form.locator('[name="gameId"]').fill('加入草稿ID');await form.locator('[name="message"]').fill('申请说明');await page.evaluate(async()=>{const {gamePartyStore}=await import('/src/game-party-store.js');await gamePartyStore.load(true);});await expect(form.locator('[name="gameId"]')).toHaveValue('加入草稿ID');await expect(form.locator('[name="message"]')).toHaveValue('申请说明');}
});

test('直接加入后切到聊天布局，长队名、ID和备注不会挤出操作按钮',async({page})=>{
  await page.setViewportSize({width:760,height:560});await boot(page);await partyFixture(page,'visitor',{direct:true,longInfo:true});await nav(page,'play');await page.locator('[data-party-open="51"]').click();
  const form=page.locator('[data-party-join-form]');await form.locator('[name="gameId"]').fill('我自己的ID');await form.locator('[type="submit"]').click();await expect(page.locator('[data-party-chat-form]')).toBeVisible();await expect(page.locator('.party-contact-card')).toContainText('我自己的ID');
  await page.locator('[data-party-panel="overview"] summary').click();
  const clipped=await page.locator('[data-party-detail] button').evaluateAll(nodes=>nodes.filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&r.top<innerHeight&&r.bottom>0&&(r.left<0||r.right>innerWidth);}).map(el=>el.textContent));expect(clipped).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
  expect((await page.locator('.party-chat').boundingBox())!.height).toBeGreaterThan(130);const messages=page.locator('.party-chat-messages');await messages.evaluate(el=>el.scrollTop=el.scrollHeight);const last=(await page.locator('.party-chat-message').last().boundingBox())!,composer=(await page.locator('[data-party-chat-form]').boundingBox())!;expect(last.y+last.height).toBeLessThanOrEqual(composer.y);
});

test('广场帖子和评论网址通过默认浏览器打开，点击列表链接不会打开帖子详情',async({page})=>{
  await boot(page);await linkFixture(page);await nav(page,'square');const card=page.locator('.square-post[data-open-post="101"]'),link=card.locator('[data-external-link]');await expect(link).toBeVisible();await nativeLinkMock(page);
  const currentUrl=page.url();await link.click();await expect.poll(()=>page.evaluate(()=>(window as any).__linkCalls.length)).toBe(1);expect(await page.evaluate(async()=>{const {feedStore}=await import('/src/feed-store.js');return feedStore.state.openPostId;})).toBe('');expect(page.url()).toBe(currentUrl);
  await card.locator('.post-meta').click();const commentLink=page.locator('.post-comment [data-external-link]');await expect(commentLink).toHaveAttribute('href','https://www.example.org/path');await page.locator('[data-comment-form] textarea').fill('保留这条评论草稿');await commentLink.focus();await page.keyboard.press('Enter');await expect.poll(()=>page.evaluate(()=>(window as any).__linkCalls.length)).toBe(2);
  await page.locator('.detail-post [data-external-link]').click({button:'middle'});await expect.poll(()=>page.evaluate(()=>(window as any).__linkCalls.length)).toBe(3);await expect(page.locator('[data-comment-form] textarea')).toHaveValue('保留这条评论草稿');expect(page.url()).toBe(currentUrl);
  const calls=await page.evaluate(()=>(window as any).__linkCalls);expect(calls.map(row=>row.command)).toEqual(Array(3).fill('desktop_open_web_url'));expect(calls.map(row=>row.args.url)).toEqual(['https://example.com/watch?v=one&lang=zh','https://www.example.org/path','https://example.com/watch?v=one&lang=zh']);
});

test('浏览器预览的网址在新标签页打开并保留当前页面',async({page})=>{
  await boot(page);await linkFixture(page);await nav(page,'square');await page.evaluate(()=>{(window as any).__linkCalls=[];window.open=((...args)=>{(window as any).__linkCalls.push(args);return null;}) as any;});
  const currentUrl=page.url();await page.locator('.square-post [data-external-link]').click({modifiers:['Control']});await expect.poll(()=>page.evaluate(()=>(window as any).__linkCalls.length)).toBe(1);expect(await page.evaluate(()=>(window as any).__linkCalls[0])).toEqual(['https://example.com/watch?v=one&lang=zh','_blank','noopener,noreferrer']);expect(page.url()).toBe(currentUrl);expect(page.context().pages()).toHaveLength(1);
});

test('外链打开失败有提示，非法地址和HTML文本不会变成可执行内容',async({page})=>{
  await boot(page);await linkFixture(page);await nav(page,'square');await page.locator('.square-post .post-meta').click();await expect(page.locator('.post-comment [data-external-link]')).toHaveCount(1);await expect(page.locator('.post-comment script,.post-comment img[onerror],.post-comment a[href^="javascript:"]')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__URL_XSS)).toBeUndefined();
  await nativeLinkMock(page,true);await page.locator('[data-comment-form] textarea').fill('失败时保留草稿');const currentUrl=page.url();await page.locator('.detail-post [data-external-link]').click();await expect(page.locator('[data-toast]')).toHaveText('打开失败，请复制网址到浏览器。');await expect(page.locator('[data-comment-form] textarea')).toHaveValue('失败时保留草稿');expect(page.url()).toBe(currentUrl);
});

test('搭子私聊继续拦截普通网址并保留输入',async({page})=>{
  await boot(page);await openChat(page);const input=page.locator('[data-chat-compose] input[name="message"]');await input.fill('https://example.com/');await page.locator('[data-chat-compose] [type="submit"]').click();await expect(page.locator('[data-toast]')).toContainText('私聊暂不支持链接');await expect(input).toHaveValue('https://example.com/');
});

async function linkFixture(page:Page){
  await page.route('**/rest/v1/posts**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:101,user_id:other,content:'看看这个网址：https://example.com/watch?v=one&lang=zh。😀',created_at:'2026-10-12T01:00:00Z'}])}));
  await page.route('**/rest/v1/comments**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:201,post_id:101,user_id:other,content:'网址：www.example.org/path。javascript:alert(1) file:///tmp/x https://user:pass@example.com/ <script>window.__URL_XSS=1</script>',created_at:'2026-10-12T02:00:00Z'}])}));
}
async function nativeLinkMock(page:Page,failure=false){await page.evaluate(failure=>{(window as any).__linkCalls=[];(window as any).__TAURI__={core:{invoke:async(command,args)=>{if(command==='desktop_open_web_url'){(window as any).__linkCalls.push({command,args});if(failure)throw new Error('模拟打开失败');}return null;}}};},failure);}

async function partyFixture(page:Page,role:'joined'|'captain'|'pending'|'visitor',options:{emptyIds?:boolean,direct?:boolean,longInfo?:boolean}={}){
  const captain=role==='captain'?me:other,requests:{path:string,body:any}[]=[];
  const party={id:51,captain_id:captain,game_name:options.longInfo?'一起轻松玩游戏'.repeat(4).slice(0,30):'斗地主',server_name:'微信',mode:'血流成河',starts_at_text:'今晚 20:00',capacity:5,member_count:2,status:'open',requires_approval:!options.direct,note:options.longInfo?'这是较长的组队说明，确认展开资料时聊天仍可使用。'.repeat(9).slice(0,200):''};
  const members:any[]=[{party_id:51,user_id:captain,role:'captain',state:'accepted'}];
  if(role==='captain')members.push({party_id:51,user_id:other,role:'member',state:'pending',request_message:'想一起玩'},{party_id:51,user_id:third,role:'member',state:'accepted'});
  else if(role!=='visitor')members.push({party_id:51,user_id:me,role:'member',state:role==='pending'?'pending':'accepted'});
  const contacts=[{party_id:51,user_id:captain,game_id:options.emptyIds?'':options.longInfo?'LongGameID'.repeat(6):'队长游戏ID'},{party_id:51,user_id:role==='captain'?other:me,game_id:options.emptyIds?'':'申请人游戏ID'}];
  await page.route(/\/rest\/v1\/(?:game_parties|game_party_members|game_party_contacts|game_party_messages|rpc\/fw_(?:decide_game_party|apply_game_party))/,async route=>{
    const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON()||{};requests.push({path,body});let data:any=[];
    if(path.endsWith('/game_parties'))data=[party];
    else if(path.endsWith('/game_party_members'))data=members;
    else if(path.endsWith('/game_party_contacts'))data=contacts;
    else if(path.endsWith('/game_party_messages'))data=Array.from({length:40},(_,i)=>({id:900+i,party_id:51,user_id:captain,content:`队伍历史消息 ${i+1}`,created_at:'2026-10-12T00:00:00Z'}));
    else if(path.endsWith('/fw_decide_game_party')){members.find(row=>row.user_id===body.p_user_id).state=body.p_accept?'accepted':'rejected';party.member_count++;data=null;}
    else if(path.endsWith('/fw_apply_game_party')){members.push({party_id:51,user_id:me,role:'member',state:options.direct?'accepted':'pending'});contacts.find(row=>row.user_id===me)!.game_id=body.p_game_id;data=options.direct?'joined':'pending';}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });return requests;
}

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
