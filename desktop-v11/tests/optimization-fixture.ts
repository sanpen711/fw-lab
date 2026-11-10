import {type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
export const me='00000000-0000-4000-8000-000000000024',other='00000000-0000-4000-8000-000000000025',third='00000000-0000-4000-8000-000000000026';
const user={id:me,aud:'authenticated',role:'authenticated',email:'audit@example.com',app_metadata:{provider:'email',providers:['email']},user_metadata:{nickname:'检查研究员',lab_code:'AUDIT1'},created_at:'2026-09-18T00:00:00Z'};
const profiles=[{id:me,nickname:'检查研究员',lab_code:'AUDIT1'},{id:other,nickname:'搭子甲',lab_code:'AUDIT2'},{id:third,nickname:'搭子乙',lab_code:'AUDIT3'}];
const posts=Array.from({length:40},(_,i)=>({id:101+i,user_id:other,content:`第 ${i+1} 条日常牢骚：${'今天工作有点忙，午休来这里看看大家都在聊什么。'.repeat(4)}`,created_at:'2026-10-12T01:00:00Z'}));
const comments=Array.from({length:25},(_,i)=>({id:201+i,post_id:101,user_id:other,content:`评论 ${i+1}：${'一起聊聊今天的工作和生活。'.repeat(3)}`,created_at:'2026-10-12T02:00:00Z'}));
const privateMessages=Array.from({length:45},(_,i)=>({id:401+i,conversation_id:601,sender_id:i%2?me:other,content:`历史消息 ${i+1}：聊聊今天的工作和生活。`,is_deleted:false,created_at:new Date(Date.UTC(2026,9,12,0,i)).toISOString()}));
const room={id:'11111111-1111-4111-8111-111111111111',owner_id:me,name:'午休闲聊房间',description:'聊聊工作和生活。',owner:profiles[0],join_mode:'direct',has_password:false,retention_days:7,expires_at:new Date(Date.now()+7*86400000).toISOString(),created_at:new Date().toISOString(),member_count:3,joined:true,is_owner:true,request_status:null,pending_count:0};
const roomMessages=Array.from({length:50},(_,i)=>({id:501+i,room_id:room.id,user_id:other,content:`房间历史 ${i+1}：今天午休大家都吃了什么？`,author:profiles[1],created_at:'2026-10-12T03:00:00Z'}));
export async function boot(page:Page,options:{failRpc?:string}={}){
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

 if(process.env.FW_MEDIA_QA_FONT)await page.route('**/qa-font.otf',route=>route.fulfill({status:200,contentType:'font/otf',body:readFileSync(process.env.FW_MEDIA_QA_FONT!)}));
 await page.goto('/');await page.locator('#app:not([hidden])').waitFor();
 if(process.env.FW_MEDIA_QA_FONT){await page.addStyleTag({content:"@font-face{font-family:QAChinese;src:url('/qa-font.otf')}body,button,input,textarea,select{font-family:QAChinese,sans-serif!important}"});await page.evaluate(()=>document.fonts.ready);}
}
