import {authStore} from './auth-store.js';

const client=authStore.client;
const listeners=new Set();
const state={loaded:false,loading:false,busy:false,error:'',polls:[],profiles:{},dailyCount:null};
let channel=null;
let active=false;
let refreshTimer=null;

function snapshot(){return {...state,polls:state.polls.map(poll=>({...poll,options:[...(poll.options||[])],stats:{...(poll.stats||{})},myVote:poll.myVote&&{...poll.myVote}})),profiles:{...state.profiles}};}
function emit(){const next=snapshot();listeners.forEach(listener=>listener(next));}
function fail(result,label){if(result?.error)throw new Error(`${label}：${result.error.message}`);return result?.data;}
function count(){if(window.__FW_DESKTOP_V11__)window.__FW_DESKTOP_V11__.contentRequests=(window.__FW_DESKTOP_V11__.contentRequests||0)+1;}
function currentUser(){const user=authStore.state.user;return user&&!user.cached?user:null;}
function requireUser(){const user=currentUser();if(!user)throw new Error('请先登录。');if(user.disabled)throw new Error('这个账号已被停用。');return user;}

async function load(force=false){
  if(state.loading||(!force&&state.loaded))return state.polls;state.loading=true;state.error='';emit();
  try{
    count();const rows=fail(await client.from('polls').select('id,user_id,title,is_official,created_at,ends_at,closed_at,conclusion').eq('is_deleted',false).order('is_official',{ascending:false}).order('created_at',{ascending:false}).limit(80),'读取课题失败')||[];
    const ids=rows.map(row=>row.id);let options=[];let stats=[];let votes=[];
    if(ids.length){
      count();options=fail(await client.from('poll_options').select('id,poll_id,user_id,label,source,created_at').in('poll_id',ids).order('created_at',{ascending:true}),'读取选项失败')||[];
      count();stats=fail(await client.rpc('fw_poll_vote_stats'),'读取投票统计失败')||[];
      if(currentUser()){count();votes=fail(await client.rpc('fw_my_poll_votes'),'读取我的投票失败')||[];}
    }
    const profileIds=Array.from(new Set(rows.map(row=>row.user_id).filter(Boolean)));if(profileIds.length){count();const profiles=fail(await client.from('profiles').select('id,nickname,avatar_url').in('id',profileIds),'读取发起人资料失败')||[];const map={...state.profiles};profiles.forEach(row=>{map[String(row.id)]=row;});state.profiles=map;}
    const optionMap={};options.forEach(row=>(optionMap[String(row.poll_id)]??=[]).push(row));const statMap={};const participants={};const idSet=new Set(ids.map(String));stats.forEach(row=>{if(!idSet.has(String(row.poll_id)))return;(statMap[String(row.poll_id)]??={})[String(row.option_id)]=Number(row.vote_count||0);participants[String(row.poll_id)]=Number(row.poll_participant_count||0);});const voteMap={};votes.forEach(row=>{if(idSet.has(String(row.poll_id)))voteMap[String(row.poll_id)]={poll_id:row.poll_id,option_id:row.option_id};});
    state.polls=rows.map(row=>({...row,options:optionMap[String(row.id)]||[],stats:statMap[String(row.id)]||{},participantCount:participants[String(row.id)]||0,myVote:voteMap[String(row.id)]||null}));
    if(currentUser()){const daily=await client.rpc('fw_my_poll_daily_count');state.dailyCount=daily.error?null:Number(daily.data||0);}else state.dailyCount=null;
    state.loaded=true;state.loading=false;emit();return state.polls;
  }catch(error){state.loaded=true;state.loading=false;state.error=error.message||'课题读取失败。';emit();throw error;}
}

function schedule(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(active)load(true).catch(()=>{});},240);}
function activate(){active=true;if(!channel){channel=client.channel('desktop-v11-polls').on('postgres_changes',{event:'*',schema:'public',table:'polls'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'poll_options'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'poll_votes'},schedule).subscribe();}return load();}
function deactivate(){active=false;clearTimeout(refreshTimer);if(channel){client.removeChannel(channel);channel=null;}}

async function mutate(action){requireUser();if(state.busy)throw new Error('正在处理，请稍候。');state.busy=true;emit();try{const result=await action();await load(true);return result;}finally{state.busy=false;emit();}}
async function createPoll({title,options,isOfficial=false}){const user=requireUser();const clean=String(title||'').trim();const values=(options||[]).map(value=>String(value||'').trim());if(!clean)throw new Error('请先填写课题标题。');if(clean.length>120)throw new Error('课题标题最多 120 个字。');if(values.length!==4||values.some(value=>!value))throw new Error('创建投票必须填写 4 个初始选项。');if(new Set(values.map(value=>value.toLowerCase())).size!==4)throw new Error('初始选项不能重复。');return mutate(()=>client.rpc('fw_create_poll',{p_title:clean,p_options:values,p_is_official:Boolean(isOfficial&&user.role==='admin')}).then(result=>fail(result,'发布课题失败')));}
async function vote(pollId,optionId){return mutate(()=>client.rpc('fw_vote_poll',{p_poll_id:Number(pollId),p_option_id:Number(optionId)}).then(result=>fail(result,'投票失败')));}
async function addOption(pollId,label){const clean=String(label||'').trim();if(!clean)throw new Error('请先填写新增选项。');return mutate(async()=>{const optionId=fail(await client.rpc('fw_add_poll_option',{p_poll_id:Number(pollId),p_label:clean}),'新增选项失败');if(optionId)fail(await client.rpc('fw_vote_poll',{p_poll_id:Number(pollId),p_option_id:Number(optionId)}),'新选项投票失败');return optionId;});}
async function deleteOption(optionId){return mutate(()=>client.rpc('fw_delete_my_poll_option',{p_option_id:Number(optionId)}).then(result=>fail(result,'删除选项失败')));}
async function promote(pollId){const user=requireUser();if(user.role!=='admin')throw new Error('只有管理员可以设置官方课题。');return mutate(()=>client.rpc('fw_promote_poll_to_official',{p_poll_id:Number(pollId)}).then(result=>fail(result,'设置官方课题失败')));}

authStore.subscribe(auth=>{if(!auth.ready)return;if(!auth.user){deactivate();state.loaded=false;state.polls=[];state.profiles={};state.dailyCount=null;emit();}else if(active)load(true).catch(()=>{});});
export const pollStore={state,activate,deactivate,load,createPoll,vote,addOption,deleteOption,promote,subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);}};
