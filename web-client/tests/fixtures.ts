import type {Page} from '../../desktop-v11/node_modules/@playwright/test';
import {expect} from '../../desktop-v11/node_modules/@playwright/test';
export async function expectGuestGate(page:Page,view?:string){
 const gate=page.locator('[data-web-guest-gate]');
 await expect(gate).toBeVisible();await expect(gate).toContainText('注册或登录后即可使用');
 await expect(gate.getByRole('button',{name:'注册 / 登录',exact:true})).toBeVisible();
 await expect(page.locator('#web-main>.view:visible')).toHaveCount(0);
 await expect(page.locator('[data-web-page-intro]')).toBeHidden();
 await expect(page.locator('[data-account-modal]')).toBeHidden();
 await expect(page.locator('#app')).toHaveJSProperty('inert',false);
 if(view)await expect(page.locator('#app')).toHaveAttribute('data-view',view);
}
export async function expectLoginHint(page:Page){
 await expect(page.locator('[data-toast]')).toContainText('请先注册或登录');
 await expect(page.locator('[data-toast]')).toHaveClass(/show/);
 await expect(page.locator('[data-account-modal]')).toBeHidden();
 await expect(page.locator('#app')).toHaveJSProperty('inert',false);
}
export const me='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
export const user={id:me,aud:'authenticated',role:'authenticated',email:'web-test@example.com',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{nickname:'网页研究员',lab_code:'FWTEST1'},created_at:'2026-01-01T00:00:00Z'};
export const session={access_token:'web-test-access-token',refresh_token:'web-test-refresh-token',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
export const profiles=[{id:me,nickname:'网页研究员',lab_code:'FWTEST1',avatar_url:'',role:'user',is_banned:false},{id:other,nickname:'搭子甲',lab_code:'FWTEST2',avatar_url:''}];
export const product={id:'33333333-3333-4333-8333-333333333333',title:'伏伏表情包贴纸',price_cents:1000,image_paths:['products/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.webp']};
export async function mock(page:Page,options:{loggedIn?:boolean,fail?:string,member?:boolean}={}){
 const calls:{path:string,method:string,body:any}[]=[];let signed=!!options.loggedIn;
 await page.context().routeWebSocket('wss://**',ws=>ws.close());
 if(signed)await page.addInitScript(session=>localStorage.setItem('sb-ekbovsmxbiplhyrzxoyw-auth-token',JSON.stringify(session)),session);
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;let body:any={};try{body=req.postDataJSON()||{};}catch{}
  if(url.hostname==='127.0.0.1')return route.continue();
  if(!url.hostname.endsWith('.supabase.co'))return route.abort();
  if(path.includes('/storage/'))return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#ffdce0"/></svg>'});
  calls.push({path,method:req.method(),body});
  if(options.fail&&path.endsWith('/'+options.fail))return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'模拟网络失败'})});
  let data:any=[];
  if(path.endsWith('/auth/v1/token')){signed=true;data=session;}
  else if(path.endsWith('/auth/v1/logout')){signed=false;data={};}
  else if(path.endsWith('/auth/v1/user'))data=user;
  else if(path.endsWith('/fw_get_current_profile'))data=[profiles[0]];
  else if(path.endsWith('/profiles'))data=profiles;
  else if(path.endsWith('/site_announcements'))data=[{id:'a1',title:'欢迎来研究所',body:'本周活动已经开放，欢迎参与。',is_published:true,is_pinned:true,published_at:'2026-10-20T00:00:00Z'}];
  else if(path.endsWith('/site_activities'))data=[{id:'a2',title:'伏伏的摸鱼活动',body:'活动详细介绍',summary:'点开查看参与方式',cover_path:'',starts_at:'2026-10-01T00:00:00Z',ends_at:'2099-12-31T00:00:00Z',target_view:'square',is_published:true,published_at:'2026-10-20T00:00:00Z'}];
  else if(path.endsWith('/membership_plans'))data=[{id:'monthly',name:'月度会员',duration_months:1,price_cents:200,sort_order:1},{id:'quarterly',name:'季度会员',duration_months:3,price_cents:2500,sort_order:2},{id:'yearly',name:'年度会员',duration_months:12,price_cents:8800,sort_order:3}];
  else if(path.endsWith('/memberships'))data=options.member===false?null:{user_id:me,status:'active',starts_at:'2026-01-01T00:00:00Z',expires_at:'2099-01-01T00:00:00Z',plan_id:'monthly'};
  else if(path.endsWith('/fw_get_own_membership_growth'))data={level:2,active_days:31,next_level:3,next_threshold:90,active:true};
  else if(path.endsWith('/fw_get_membership_levels'))data=(body.p_user_ids||[]).map(id=>({user_id:id,level:2}));
  else if(path.endsWith('/membership-alipay')||path.endsWith('/shop-alipay'))data={enabled:false,configured:true,max_amount_cents:5000};
  else if(path.endsWith('/shop_products'))data=[product];
  else if(path.endsWith('/posts'))data=[{id:101,user_id:other,content:'今天也在低功耗运行',created_at:new Date().toISOString()}];
  else if(path.endsWith('/fw_public_post_comment_counts'))data=(body.p_post_ids||[]).map(id=>({post_id:id,comment_count:Number(id)===101?1:0}));
  else if(path.endsWith('/comments'))data=[{id:201,post_id:101,user_id:me,parent_comment_id:null,content:'评论测试内容',created_at:new Date().toISOString()}];
  else if(path.endsWith('/polls'))data=[{id:81,user_id:other,title:'今天的研究课题',allow_user_options:false,is_official:false,created_at:new Date().toISOString(),ends_at:'2099-01-01T00:00:00Z'}];
  else if(path.endsWith('/poll_options'))data=[{id:811,poll_id:81,label:'选项甲',source:'initial'},{id:812,poll_id:81,label:'选项乙',source:'initial'}];
  else if(path.endsWith('/fw_my_poll_daily_count'))data=0;
  else if(path.endsWith('/fw_create_poll_v2'))data=82;
  else if(path.endsWith('/fw_chat_room_list'))data={rooms:[],has_more:false,server_time:new Date().toISOString()};
  else if(path.endsWith('/game_parties'))data=[{id:51,captain_id:other,game_name:'今晚一起开黑',capacity:5,member_count:2,status:'open',requires_approval:true,note:'一起轻松玩几局。'}];
  else if(path.endsWith('/friendships'))data=signed?[{id:1,requester_id:me,receiver_id:other,status:'accepted'}]:[];
  else if(path.endsWith('/conversations'))data=[{id:601,user_one_id:me,user_two_id:other}];
  else if(path.endsWith('/fw_get_or_create_conversation'))data=601;
  else if(path.endsWith('/private_messages'))data=[{id:1,conversation_id:601,sender_id:other,content:'搭子聊天测试',created_at:new Date().toISOString(),is_read:false}];
  await route.fulfill({status:200,contentType:'application/json',headers:{'content-range':`0-${Math.max(0,(data?.length||1)-1)}/${data?.length||1}`},body:JSON.stringify(data)});
 });
 return calls;
}
