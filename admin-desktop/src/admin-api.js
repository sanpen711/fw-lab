import {createClient} from '@supabase/supabase-js';
import {AUTH_STORAGE_KEY,SUPABASE_PUBLISHABLE_KEY,SUPABASE_URL} from './config.js';

const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:AUTH_STORAGE_KEY}
});

function fail(result,label){
  if(result?.error) throw new Error(`${label}：${result.error.message}`);
  return result?.data;
}

function first(value){
  return Array.isArray(value)?(value[0]||null):(value||null);
}

async function readAdmin(){
  const auth=fail(await client.auth.getUser(),'确认登录状态失败');
  if(!auth?.user) return null;
  const profile=first(fail(await client.rpc('fw_get_current_profile'),'确认管理员权限失败'));
  if(!profile||profile.role!=='admin'||profile.is_banned){
    await client.auth.signOut();
    throw new Error('这个账号没有管理权限。');
  }
  return {
    id:auth.user.id,
    email:auth.user.email||profile.email||'',
    nickname:profile.nickname||'管理员',
    avatarUrl:profile.avatar_url||'',
    role:profile.role
  };
}

async function restoreAdmin(){
  const session=fail(await client.auth.getSession(),'读取登录状态失败')?.session;
  if(!session) return null;
  return readAdmin();
}

async function signIn(email,password){
  fail(await client.auth.signInWithPassword({email:String(email||'').trim(),password:String(password||'')}),'登录失败');
  return readAdmin();
}

async function signOut(){
  fail(await client.auth.signOut(),'退出登录失败');
}

async function rpc(name,args={},label='读取数据失败'){
  return fail(await client.rpc(name,args),label)||[];
}

async function listUsers(){
  return rpc('admin_list_profiles',{},'读取用户列表失败');
}

async function listReports(){
  return rpc('admin_list_chat_reports',{},'读取举报列表失败');
}

async function listFeedback(){
  return rpc('admin_list_feedback_tickets',{},'读取问题反馈失败');
}

async function listPosts(){
  return fail(await client.from('posts')
    .select('id,user_id,content,is_deleted,created_at,profiles(nickname,avatar_url,lab_code)')
    .order('created_at',{ascending:false}).limit(200),'读取帖子失败')||[];
}

async function listComments(){
  return fail(await client.from('comments')
    .select('id,post_id,user_id,content,is_deleted,created_at,profiles!comments_user_id_fkey(nickname,avatar_url,lab_code),posts(content)')
    .order('created_at',{ascending:false}).limit(200),'读取评论失败')||[];
}

async function listChats(){
  return rpc('admin_list_chat_messages',{},'读取房间消息失败');
}

async function listParties(){
  return rpc('admin_list_game_parties',{},'读取组队房间失败');
}

async function listBirdPosts(){
  return rpc('admin_list_bird_posts',{},'读取树洞帖子失败');
}

async function listBirdComments(){
  return rpc('admin_list_bird_comments',{},'读取树洞评论失败');
}

async function listPolls(){
  return rpc('admin_list_polls',{},'读取投票失败');
}

async function listPartyMessages(){
  return rpc('admin_list_game_party_messages',{},'读取组队留言失败');
}

async function listLogs(){
  return fail(await client.from('moderation_logs')
    .select('id,target_type,target_id,target_user_id,target_display_name,action,reason,duration_text,public_visible,is_revoked,created_at,expires_at')
    .order('created_at',{ascending:false}).limit(240),'读取处理记录失败')||[];
}

async function moderateUser({userId,action,muteMinutes=null,reason,publicVisible=false}){
  return rpc('admin_moderate_user',{
    p_target_user_id:userId,
    p_action:action,
    p_mute_minutes:muteMinutes,
    p_reason:reason,
    p_public_visible:publicVisible
  },'处理用户失败');
}

async function moderatePost({id,remove,reason,publicVisible=false}){
  return rpc('admin_moderate_post',{p_post_id:Number(id),p_delete:Boolean(remove),p_reason:reason,p_public_visible:publicVisible},'处理帖子失败');
}

async function moderateComment({id,remove,reason,publicVisible=false}){
  return rpc('admin_moderate_comment',{p_comment_id:Number(id),p_delete:Boolean(remove),p_reason:reason,p_public_visible:publicVisible},'处理评论失败');
}

async function moderateChat({id,remove,reason,publicVisible=false}){
  return rpc('admin_moderate_chat_message',{p_message_id:Number(id),p_delete:Boolean(remove),p_reason:reason,p_public_visible:publicVisible},'处理房间消息失败');
}

async function resolveReport({id,status,reason,publicVisible=false}){
  return rpc('admin_resolve_chat_report',{p_report_id:Number(id),p_status:status,p_reason:reason,p_public_visible:publicVisible},'处理举报失败');
}

async function updateFeedback({id,status,priority,reply,note}){
  return rpc('admin_update_feedback_ticket',{
    p_ticket_id:Number(id),
    p_status:status,
    p_priority:priority,
    p_admin_reply:reply||'',
    p_internal_note:note||''
  },'更新反馈失败');
}

async function moderateParty({id,reason}){
  return rpc('admin_delete_game_party',{p_party_id:Number(id),p_reason:reason},'删除组队房间失败');
}

async function moderateBirdPost({id,remove,reason,publicVisible=false}){
  return rpc('admin_moderate_bird_post',{p_id:Number(id),p_delete:Boolean(remove),p_reason:reason,p_public_visible:publicVisible},'处理树洞帖子失败');
}

async function moderateBirdComment({id,remove,reason,publicVisible=false}){
  return rpc('admin_moderate_bird_comment',{p_id:Number(id),p_delete:Boolean(remove),p_reason:reason,p_public_visible:publicVisible},'处理树洞评论失败');
}

async function moderatePoll({id,remove,reason,publicVisible=false}){
  return rpc('admin_moderate_poll',{p_id:Number(id),p_delete:Boolean(remove),p_reason:reason,p_public_visible:publicVisible},'处理投票失败');
}

async function deletePartyMessage({id,reason,publicVisible=false}){
  return rpc('admin_delete_game_party_message',{p_id:Number(id),p_reason:reason,p_public_visible:publicVisible},'删除组队留言失败');
}

async function deleteUserAccount({targetUserId,confirmCode,confirmText,reason}){
  const result=await client.functions.invoke('admin-delete-user',{
    body:{targetUserId,confirmCode,confirmText,reason}
  });
  if(result.error){
    let message=result.error.message||'删除账号失败';
    const response=result.error.context;
    if(response&&typeof response.json==='function'){
      try{message=(await response.json())?.error||message;}catch{/* 保留原始错误 */}
    }
    throw new Error(message);
  }
  if(result.data?.error)throw new Error(result.data.error);
  return result.data;
}

export const adminApi={
  client,restoreAdmin,signIn,signOut,listUsers,listReports,listFeedback,listPosts,listComments,listChats,listParties,
  listBirdPosts,listBirdComments,listPolls,listPartyMessages,listLogs,
  moderateUser,moderatePost,moderateComment,moderateChat,resolveReport,updateFeedback,moderateParty,
  moderateBirdPost,moderateBirdComment,moderatePoll,deletePartyMessage,deleteUserAccount,
  onAuthStateChange(callback){return client.auth.onAuthStateChange((event)=>callback(event));}
};
