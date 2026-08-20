import {authStore} from './auth-store.js';
import {desktopCache} from './desktop-persistent-cache.js';

const client=authStore.client;
const listeners=new Set();
const state={loaded:false,loading:false,error:'',weekly:{like:[],same:[],tissue:[]},daily:{like:[],same:[],tissue:[]},ranges:null};
let hydratedCache=false;

function snapshot(){return {...state,weekly:{like:[...state.weekly.like],same:[...state.weekly.same],tissue:[...state.weekly.tissue]},daily:{like:[...state.daily.like],same:[...state.daily.same],tissue:[...state.daily.tissue]},ranges:state.ranges&&{...state.ranges}};}
function emit(){const next=snapshot();listeners.forEach(listener=>listener(next));}
function fail(result,label){if(result?.error)throw new Error(`${label}：${result.error.message}`);return result?.data;}
function count(){if(window.__FW_DESKTOP_V11__)window.__FW_DESKTOP_V11__.contentRequests=(window.__FW_DESKTOP_V11__.contentRequests||0)+1;}
function startOfDay(value=new Date()){const date=new Date(value);date.setHours(0,0,0,0);return date;}
function addDays(value,days){const date=new Date(value);date.setDate(date.getDate()+days);return date;}
function ranges(){const today=startOfDay();const yesterday=addDays(today,-1);const sinceMonday=(today.getDay()+6)%7;const thisMonday=addDays(today,-sinceMonday);const lastMonday=addDays(thisMonday,-7);return{today,yesterday,thisMonday,lastMonday,nextDay:addDays(today,1),nextMonday:addDays(thisMonday,7)};}
function within(value,start,end){const time=new Date(value).getTime();return time>=start.getTime()&&time<end.getTime();}

function rank(posts,reactions,profiles,start,end,type,limit){
  const selected=posts.filter(post=>within(post.created_at,start,end));const byId=new Map(selected.map(post=>[String(post.id),post]));const users={};const postScores={};
  reactions.forEach(reaction=>{if(reaction.type!==type)return;const post=byId.get(String(reaction.post_id));if(!post||String(reaction.user_id)===String(post.user_id))return;postScores[String(post.id)]=(postScores[String(post.id)]||0)+1;const id=String(post.user_id);if(!users[id])users[id]={user_id:post.user_id,nickname:profiles[id]?.nickname||'匿名研究员',avatar_url:profiles[id]?.avatar_url||'',score:0,topPost:post,topPostScore:0};users[id].score+=1;});
  Object.values(users).forEach(user=>selected.filter(post=>String(post.user_id)===String(user.user_id)).forEach(post=>{const score=postScores[String(post.id)]||0;if(score>user.topPostScore){user.topPost=post;user.topPostScore=score;}}));
  return Object.values(users).sort((a,b)=>b.score-a.score||String(a.nickname).localeCompare(String(b.nickname),'zh-CN')).slice(0,limit);
}

async function hydrateCache(){
  if(hydratedCache)return false;hydratedCache=true;
  const cached=await desktopCache.read('archive','public');const payload=cached?.payload;
  if(!payload?.weekly||!payload?.daily)return false;
  state.weekly={like:[...(payload.weekly.like||[])],same:[...(payload.weekly.same||[])],tissue:[...(payload.weekly.tissue||[])]};
  state.daily={like:[...(payload.daily.like||[])],same:[...(payload.daily.same||[])],tissue:[...(payload.daily.tissue||[])]};
  state.ranges=payload.ranges&&typeof payload.ranges==='object'?payload.ranges:null;state.loaded=true;state.loading=false;state.error='';emit();return true;
}
function persistCache(){return desktopCache.write('archive','public',{weekly:state.weekly,daily:state.daily,ranges:state.ranges});}

async function load(force=false){
  if(!force&&!state.loaded){const hit=await hydrateCache();if(hit){load(true).catch(()=>{});return snapshot();}}
  if(state.loading||(!force&&state.loaded))return snapshot();state.loading=true;state.error='';emit();
  try{
    const span=ranges();count();const posts=fail(await client.from('posts').select('id,user_id,content,status_tag,created_at').eq('is_deleted',false).gte('created_at',span.lastMonday.toISOString()).lt('created_at',span.today.toISOString()).order('created_at',{ascending:false}).limit(1000),'读取档案帖子失败')||[];const ids=posts.map(post=>post.id);let reactions=[];let profileRows=[];
    if(ids.length){count();reactions=fail(await client.from('reactions').select('post_id,user_id,type').in('post_id',ids),'读取档案互动失败')||[];const userIds=Array.from(new Set(posts.map(post=>post.user_id).filter(Boolean)));if(userIds.length){count();profileRows=fail(await client.from('profiles').select('id,nickname,avatar_url').in('id',userIds),'读取档案用户失败')||[];}}
    const profiles={};profileRows.forEach(row=>{profiles[String(row.id)]=row;});const weekly={};const daily={};['like','same','tissue'].forEach(type=>{weekly[type]=rank(posts,reactions,profiles,span.lastMonday,span.thisMonday,type,3);daily[type]=rank(posts,reactions,profiles,span.yesterday,span.today,type,10);});state.weekly=weekly;state.daily=daily;state.ranges=Object.fromEntries(Object.entries(span).map(([key,value])=>[key,value.toISOString()]));state.loaded=true;state.loading=false;emit();persistCache().catch(()=>{});return snapshot();
  }catch(error){state.loaded=true;state.loading=false;state.error=error.message||'废话档案读取失败。';emit();if(state.weekly.like.length||state.weekly.same.length||state.weekly.tissue.length||state.daily.like.length||state.daily.same.length||state.daily.tissue.length)return snapshot();throw error;}
}

export const archiveStore={state,load,subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);}};
