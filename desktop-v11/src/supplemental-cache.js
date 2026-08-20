import {desktopCache} from './desktop-persistent-cache.js';

function cacheableHtml(node){
  if(!node)return'';
  const html=String(node.innerHTML||'').trim();
  if(!html||/正在读取|读取资料\.\.\.|进入页面后读取|读取失败|暂时读取失败/.test(node.textContent||''))return'';
  return html;
}

async function restoreModeration(){
  const cached=await desktopCache.read('moderation','public');const html=cached?.payload?.html;
  if(!html)return;
  const host=document.querySelector('[data-align-public-list]');
  if(host&&(/正在读取/.test(host.textContent||'')||!host.children.length))host.innerHTML=html;
}
function saveModeration(){
  const host=document.querySelector('[data-align-public-list]');const html=cacheableHtml(host);
  if(html)desktopCache.write('moderation','public',{html}).catch(()=>{});
}
async function restoreProfile(userId){
  const cached=await desktopCache.read('public_profile','public',userId);const html=cached?.payload?.html;
  if(!html)return;
  const body=document.querySelector('[data-align-profile-body]');
  if(body&&/正在读取/.test(body.textContent||''))body.innerHTML=html;
}
function saveProfile(userId){
  const body=document.querySelector('[data-align-profile-body]');const html=cacheableHtml(body);
  if(html)desktopCache.write('public_profile','public',{html},userId).catch(()=>{});
}
function afterNetwork(fn){[350,1200,3000,6000].forEach(delay=>setTimeout(fn,delay));}

document.addEventListener('click',event=>{
  const moderation=event.target.closest?.('[data-align-nav="moderation"],[data-align-refresh-logs]');
  if(moderation){setTimeout(()=>restoreModeration(),0);afterNetwork(saveModeration);}
  const profile=event.target.closest?.('[data-align-view-profile]');
  if(profile){
    const userId=String(profile.dataset.alignViewProfile||'');
    if(userId){setTimeout(()=>restoreProfile(userId),0);afterNetwork(()=>saveProfile(userId));}
  }
},true);
