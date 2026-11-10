import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {boot,me,other,third} from './optimization-fixture';

async function openChat(page:any,id=other){await page.locator('.nav-item[data-nav="buddy"]').click();await page.locator(`[data-open-chat="${id}"]`).first().click();await expect(page.locator('[data-chat-compose] input')).toBeEnabled();}
async function captureIncoming(page:any){await page.evaluate(async()=>{const {authStore}=await import('/src/auth-store.js');const original=authStore.client.channel.bind(authStore.client);(window as any).__handlers=[];authStore.client.channel=(...args)=>{const channel=original(...args),on=channel.on.bind(channel);channel.on=(type,filter,callback)=>{(window as any).__handlers.push({filter,callback});return on(type,filter,callback);};return channel;};});}
async function deliver(page:any,id=2001){await page.evaluate(({id,other})=>{const h=(window as any).__handlers.find(x=>x.filter.table==='private_messages'&&x.filter.event==='INSERT');h.callback({new:{id,conversation_id:601,sender_id:other,content:'刚刚送达的新消息'+id,is_deleted:false,created_at:new Date().toISOString()}});},{id,other});}

test('后台窗口不会发送已读回执，返回前台看到最新消息后才确认',async({page})=>{
  await boot(page);await captureIncoming(page);await openChat(page);await page.waitForTimeout(200);
  let reads=0;page.on('request',request=>{if(request.method()==='PATCH'&&request.url().includes('/notifications'))reads++;});
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('fw:window-attention',{detail:{active:false}})));
  await deliver(page);await page.waitForTimeout(200);expect(reads).toBe(0);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('fw:window-attention',{detail:{active:true}})));
  await expect.poll(()=>reads).toBeGreaterThan(0);
});

test('阅读历史时保持未读，新消息保留原气泡节点与阅读位置',async({page})=>{
  await boot(page);await captureIncoming(page);await openChat(page);
  const box=page.locator('[data-chat-messages]');await box.evaluate(el=>{el.scrollTop=0;(window as any).__firstBubble=el.querySelector('[data-chat-message-id]');});
  await page.waitForTimeout(100);let reads=0;page.on('request',r=>{if(r.method()==='PATCH'&&r.url().includes('/notifications'))reads++;});
  await deliver(page);await expect(page.locator('[data-chat-message-id="2001"]')).toHaveCount(1);expect(reads).toBe(0);
  expect(await box.evaluate(el=>el.querySelector('[data-chat-message-id]')===(window as any).__firstBubble)).toBe(true);
  expect(await box.evaluate(el=>el.scrollTop)).toBeLessThan(10);await expect(page.locator('[data-chat-new-messages]')).toBeVisible();
  await page.locator('[data-chat-new-messages]').click();await expect.poll(()=>reads).toBeGreaterThan(0);
});

test('重启恢复发帖文字和附件、评论及各个私聊对象的草稿',async({page})=>{
  await boot(page);await page.locator('.hero-actions [data-nav="compose"]').click();await page.locator('[data-compose-form] textarea').fill('重启后保留的帖子');
  await page.locator('[data-compose-image]').setInputFiles({name:'draft.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM2UAAAAASUVORK5CYII=','base64')});
  await page.locator('.nav-item[data-nav="square"]').click();await page.locator('[data-open-post="101"]').first().click();await page.locator('[data-comment-form] textarea').fill('重启后保留的评论');
  await openChat(page);await page.locator('[data-chat-compose] input').fill('只给甲的草稿');await page.locator(`[data-open-chat="${third}"]`).first().click();await expect(page.locator('[data-chat-compose] input')).toBeEnabled();await page.locator('[data-chat-compose] input').fill('只给乙的草稿');
  await page.evaluate(()=> (window as any).__FW_FLUSH_DRAFTS__());await page.reload();await expect(page.locator('#app')).toBeVisible();
  await page.locator('.hero-actions [data-nav="compose"]').click();await expect(page.locator('[data-compose-form] textarea')).toHaveValue('重启后保留的帖子');await expect(page.locator('.media-draft-item img')).toHaveCount(1);
  await page.locator('.nav-item[data-nav="square"]').click();await page.locator('[data-open-post="101"]').first().click();await expect(page.locator('[data-comment-form] textarea')).toHaveValue('重启后保留的评论');
  await openChat(page);await expect(page.locator('[data-chat-compose] input')).toHaveValue('只给甲的草稿');await page.locator(`[data-open-chat="${third}"]`).first().click();await expect(page.locator('[data-chat-compose] input')).toHaveValue('只给乙的草稿');
  const otherOwner=await page.evaluate(async()=>{const {loadDraftSnapshot}=await import('/src/draft-storage.js');return loadDraftSnapshot('another-account');});expect(otherOwner).toEqual({compose:null,comments:{},chats:{}});
});

test('成功发送后草稿从本机移除，失败仍保留',async({page})=>{
  await boot(page);await openChat(page);const input=page.locator('[data-chat-compose] input');await input.fill('成功发送一次');await page.locator('[data-chat-compose] [type="submit"]').click();await expect(input).toHaveValue('');
  await page.reload();await expect(page.locator('#app')).toBeVisible();await openChat(page);await expect(input).toHaveValue('');
  await page.route('**/rest/v1/rpc/fw_send_private_message_to_user',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Failed to fetch: private server detail'})}));
  await input.fill('网络失败后保留');await page.locator('[data-chat-compose] [type="submit"]').click();await expect(page.locator('[data-toast]')).toHaveText('网络连接异常，请检查网络后重试。');await expect(input).toHaveValue('网络失败后保留');
});

test('隐藏预览仍保留消息列表，设置保存后立即生效',async({page})=>{
  await page.addInitScript(()=>{(window as any).__TAURI__={core:{invoke:async(command,args)=>{if(command==='desktop_behavior_get')return{closeToTray:false,shortcutEnabled:true,shortcut:'Ctrl+Alt+H',messagePreview:true,shortcutRegistered:true};if(command==='desktop_behavior_set'){(window as any).__savedBehavior=args.preferences;return args.preferences;}return null;}}};});
  await boot(page);await page.locator('[data-sidebar-more-toggle]').click();await page.locator('[data-nav="settings"]').click();const form=page.locator('[data-behavior-form]');await form.locator('[name="closeToTray"]').check();await form.locator('[name="messagePreview"]').uncheck();await form.locator('[name="shortcut"]').selectOption('Ctrl+Alt+Q');await form.locator('[type="submit"]').click();
  await expect(page.locator('[data-behavior-status]')).toContainText('已保存');expect(await page.evaluate(()=>(window as any).__savedBehavior)).toEqual({closeToTray:true,shortcutEnabled:true,shortcut:'Ctrl+Alt+Q',messagePreview:false});
  await page.locator('.nav-item[data-nav="buddy"]').click();await expect(page.locator('[data-buddy-list]')).toContainText('消息内容已隐藏');
});

for(const size of [{width:760,height:560},{width:853,height:547},{width:1066,height:640}])test(`紧凑窗口 ${size.width}×${size.height} 保留编辑与设置操作`,async({page})=>{
  await page.setViewportSize(size);await boot(page);await openChat(page);await expect(page.locator('[data-chat-compose] [type="submit"]')).toBeInViewport();
  await page.locator('.nav-item[data-nav="square"]').click();await expect(page.locator('[data-square-refresh]')).toBeInViewport();await expect(page.locator('[data-square-echo-toggle]')).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('[data-sidebar-more-toggle]').click();await page.locator('[data-nav="settings"]').click();const save=page.locator('[data-behavior-form] [type="submit"]');await save.scrollIntoViewIfNeeded();await expect(save).toBeInViewport();
  await page.screenshot({path:test.info().outputPath('compact-settings.png')});
});

test('断网状态明确提示，恢复网络可同步且不丢失草稿',async({page})=>{
  await boot(page);await page.locator('.hero-actions [data-nav="compose"]').click();const input=page.locator('[data-compose-form] textarea');await input.fill('网络恢复前保留');
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));});await expect(page.locator('.network-banner')).toContainText('网络已断开');
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});await expect(page.locator('.network-banner')).toBeHidden();await expect(input).toHaveValue('网络恢复前保留');
});

test('后台更新可继续操作，收起后不反复弹出，安装前先保存草稿',async({page})=>{
  await page.setContent('<main id="app"><button onclick="this.textContent=\'可以继续使用\'">原有操作</button></main>');await page.addScriptTag({content:readFileSync(new URL('../../src-tauri/src/update_ui.js',import.meta.url),'utf8')});
  await page.evaluate(()=>{const w=window as any;w.__order=[];w.__FW_FLUSH_DRAFTS__=async()=>w.__order.push('drafts');w.__TAURI__={core:{invoke:async(command)=>w.__order.push(command)}};w.__FW_UPDATE_RENDER__({phase:'downloading',title:'正在后台下载',detail:'可以继续使用软件',percent:20});});
  await page.getByRole('button',{name:'原有操作'}).click();await expect(page.getByRole('button',{name:'可以继续使用'})).toBeVisible();await page.getByRole('button',{name:'收起',exact:true}).click();
  await page.evaluate(()=>(window as any).__FW_UPDATE_RENDER__({phase:'downloading',percent:50}));await expect(page.locator('#fw-update-overlay')).toBeHidden();
  await page.evaluate(()=>(window as any).__FW_UPDATE_RENDER__({phase:'ready',title:'更新已准备好'}));await expect(page.locator('#fw-update-overlay')).toBeVisible();expect(await page.evaluate(()=>(window as any).__order)).toEqual([]);
  await page.getByRole('button',{name:'重启安装'}).click();expect(await page.evaluate(()=>(window as any).__order)).toEqual(['drafts','desktop_install_ready_update']);
});
