import {createClient} from '@supabase/supabase-js';
import {ACCOUNT_CACHE_KEY, PASSWORD_RESET_URL, SUPABASE_ANON_KEY, SUPABASE_URL} from './config.js';
import {desktopCache} from './desktop-persistent-cache.js';

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:false, storageKey:'fw-lab-auth-token'}
});

const listeners = new Set();
const state = {ready:false, busy:false, session:null, user:null, error:''};
let bootPromise = null;
let lastProfileUserId = '';
let pendingRegistration = null;

function cachedUser(){
  try{return JSON.parse(localStorage.getItem(ACCOUNT_CACHE_KEY) || 'null');}catch{return null;}
}

function persistUser(user){
  try{
    if(user) localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(ACCOUNT_CACHE_KEY);
  }catch{}
  if(user?.id) desktopCache.write('profile',user.id,{user:{...user,cached:false}}).catch(()=>{});
}

async function hydrateProfileCache(userId){
  if(!userId)return false;
  const cached=await desktopCache.read('profile',userId);const user=cached?.payload?.user;
  if(!user||String(user.id)!==String(userId))return false;
  state.user={...user,cached:true};emit();return true;
}

function emit(){
  const snapshot={...state};
  listeners.forEach(listener=>listener(snapshot));
}

function fail(result, label){
  if(result?.error) throw new Error(`${label}：${result.error.message}`);
  return result?.data;
}

function profileToUser(sessionUser, profile={}){
  return {
    id:sessionUser.id,
    email:profile.email || sessionUser.email || '',
    nickname:profile.nickname || sessionUser.user_metadata?.nickname || '临时研究员',
    avatarUrl:profile.avatar_url || '',
    labCode:profile.lab_code || sessionUser.user_metadata?.lab_code || '',
    role:profile.role || 'user',
    disabled:Boolean(profile.is_banned),
    cached:false
  };
}

async function readProfile(sessionUser, force=false){
  if(!force && lastProfileUserId === sessionUser.id && state.user && !state.user.cached) return state.user;
  let profile={};
  const rpc=await client.rpc('fw_get_current_profile');
  if(!rpc.error){
    profile=Array.isArray(rpc.data) ? (rpc.data[0] || {}) : (rpc.data || {});
  }else{
    profile=fail(await client.from('profiles').select('id,nickname,avatar_url,role,is_banned,created_at,lab_code').eq('id',sessionUser.id).maybeSingle(), '读取用户资料失败') || {};
  }
  lastProfileUserId=sessionUser.id;
  state.user=profileToUser(sessionUser, profile);
  persistUser(state.user);
  emit();
  return state.user;
}

async function boot(){
  if(bootPromise) return bootPromise;
  const cached=cachedUser();
  if(cached){state.user={...cached,cached:true};emit();}
  bootPromise=(async()=>{
    try{
      const data=fail(await client.auth.getSession(), '读取登录状态失败');
      state.session=data?.session || null;
      if(state.session?.user){
        if(!state.user||String(state.user.id)!==String(state.session.user.id))await hydrateProfileCache(state.session.user.id);
        await readProfile(state.session.user, true);
      }else {state.user=null;persistUser(null);}
    }catch(error){
      state.error=error.message || String(error);
    }finally{
      state.ready=true;
      emit();
    }
    return {...state};
  })();
  client.auth.onAuthStateChange((event, session)=>{
    state.session=session || null;
    if(event === 'SIGNED_OUT' || !session?.user){
      lastProfileUserId='';state.user=null;persistUser(null);emit();return;
    }
    if(event === 'SIGNED_IN' || event === 'USER_UPDATED'){
      if(!state.user||String(state.user.id)!==String(session.user.id))hydrateProfileCache(session.user.id).catch(()=>{});
      readProfile(session.user, event === 'USER_UPDATED').catch(()=>{});
    }
  });
  return bootPromise;
}

async function withBusy(action){
  if(state.busy) throw new Error('正在处理，请稍候。');
  state.busy=true;state.error='';emit();
  try{return await action();}
  catch(error){state.error=error.message || String(error);throw error;}
  finally{state.busy=false;emit();}
}

const normalizeCode=value=>String(value || '').trim().replace(/\s+/g,'').toUpperCase();

async function signIn(email,password){
  return withBusy(async()=>{
    const data=fail(await client.auth.signInWithPassword({email:String(email || '').trim(),password:String(password || '')}), '登录失败');
    state.session=data?.session || null;
    if(data?.user){await hydrateProfileCache(data.user.id);await readProfile(data.user,true);}
    return state.user;
  });
}

async function beginRegistration({email,password,password2,labCode}){
  return withBusy(async()=>{
    const code=normalizeCode(labCode);
    const mail=String(email || '').trim().toLowerCase();
    if(!/^[A-Z0-9]{7}$/.test(code)) throw new Error('实验品编号必须是 7 位字母或数字。');
    if(String(password || '').length < 6) throw new Error('密码至少 6 位。');
    if(password !== password2) throw new Error('两次密码不一致。');
    const nickname=`研究员${code}`;
    const check=await client.rpc('fw_check_profile_identity',{check_lab_code:code,check_nickname:nickname});
    if(check.error) throw new Error(`检查编号失败：${check.error.message}`);
    if(check.data?.lab_code_taken) throw new Error('该编号已被注册。');
    const result=await client.auth.signUp({email:mail,password,options:{data:{nickname,lab_code:code},emailRedirectTo:PASSWORD_RESET_URL}});
    if(result.error) throw new Error(`注册失败：${result.error.message}`);
    pendingRegistration={email:mail,password,labCode:code,nickname};
    sessionStorage.setItem('fw:desktop:v11:registration',JSON.stringify(pendingRegistration));
    return {email:mail};
  });
}

async function finishRegistration(token){
  return withBusy(async()=>{
    if(!pendingRegistration){
      try{pendingRegistration=JSON.parse(sessionStorage.getItem('fw:desktop:v11:registration') || 'null');}catch{}
    }
    if(!pendingRegistration?.email) throw new Error('注册信息已失效，请返回重新填写。');
    const verified=fail(await client.auth.verifyOtp({email:pendingRegistration.email,token:String(token || '').replace(/\s+/g,''),type:'signup'}), '验证失败');
    const user=verified?.user;
    if(!user?.id) throw new Error('邮箱已验证，但账号状态未同步，请重新登录。');
    const saved=await client.from('profiles').update({nickname:pendingRegistration.nickname,lab_code:pendingRegistration.labCode,email_search:pendingRegistration.email,updated_at:new Date().toISOString()}).eq('id',user.id);
    if(saved.error) throw new Error(`保存实验品编号失败：${saved.error.message}`);
    sessionStorage.removeItem('fw:desktop:v11:registration');
    pendingRegistration=null;
    await client.auth.signOut();
    return {ok:true};
  });
}

async function resendRegistration(){
  if(!pendingRegistration){
    try{pendingRegistration=JSON.parse(sessionStorage.getItem('fw:desktop:v11:registration') || 'null');}catch{}
  }
  if(!pendingRegistration?.email) throw new Error('注册信息已失效，请返回重新填写。');
  const result=await client.auth.resend({type:'signup',email:pendingRegistration.email});
  if(result.error) throw new Error(`重新发送失败：${result.error.message}`);
  return {email:pendingRegistration.email};
}

async function sendPasswordReset(email){
  return withBusy(async()=>{
    const result=await client.auth.resetPasswordForEmail(String(email || '').trim(),{redirectTo:PASSWORD_RESET_URL});
    if(result.error) throw new Error(`发送失败：${result.error.message}`);
  });
}

async function updateProfile({nickname,avatarFile}){
  return withBusy(async()=>{
    if(!state.session?.user) throw new Error('请先登录。');
    let avatarUrl='';
    if(avatarFile?.size){
      const safeName=avatarFile.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const path=`${state.session.user.id}/${Date.now()}_${safeName}`;
      const upload=await client.storage.from('avatars').upload(path,avatarFile,{upsert:true,cacheControl:'3600'});
      if(upload.error) throw new Error(`头像上传失败：${upload.error.message}`);
      avatarUrl=client.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    }
    const nextNickname=String(nickname || '').trim().slice(0,12);
    const rpc=await client.rpc('fw_update_own_profile',{p_nickname:nextNickname,p_avatar_url:avatarUrl || null});
    if(rpc.error){
      const patch={nickname:nextNickname,updated_at:new Date().toISOString()};
      if(avatarUrl) patch.avatar_url=avatarUrl;
      fail(await client.from('profiles').update(patch).eq('id',state.session.user.id), '资料保存失败');
    }
    return readProfile(state.session.user,true);
  });
}

async function signOut(){
  return withBusy(async()=>{fail(await client.auth.signOut(), '退出失败');});
}

export const authStore={
  client,
  state,
  boot,
  subscribe(listener){listeners.add(listener);listener({...state});return()=>listeners.delete(listener);},
  signIn,
  beginRegistration,
  finishRegistration,
  resendRegistration,
  sendPasswordReset,
  updateProfile,
  signOut
};
