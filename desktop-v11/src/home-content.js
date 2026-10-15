import {authStore} from './auth-store.js';
import {SUPABASE_URL} from './config.js';
import {escapeHtml as esc} from './member-identity.js';
import {renderWebLinks,webUrl} from './external-links.js';
import {SITE_TABLES,SITE_FIELDS,ACTIVITY_FIELDS,ACTIVITY_TARGETS,activityImage,activityStatus,siteTime} from './site-content-model.js';

const fresh=()=>({rows:[],page:0,hasNext:false,count:0,selected:'',scroll:0,loaded:false,loading:false,reload:false,error:'',loadedAt:0});
const state={announcements:fresh(),activities:fresh()};
let started=false,userId='',generation=0,view='home',navigate=()=>{},readNotices={};
let announcementSignature='',announcementFrame=0;
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const controllers=new Set();
const $=selector=>document.querySelector(selector);
const readKey=()=>`fw:site-notices-read:${userId}`;
const version=row=>row.updated_at||row.published_at;
function markRead(row){
  if(!row||!userId)return;readNotices[row.id]=version(row);
  readNotices=Object.fromEntries(Object.entries(readNotices).slice(-100));
  try{localStorage.setItem(readKey(),JSON.stringify(readNotices));}catch{}
}
function cover(row){const url=activityImage(row.cover_path,SUPABASE_URL);return url?`<img class="site-activity-cover" src="${esc(url)}" alt="${esc(row.title)}" loading="lazy">`:'<div class="site-activity-cover site-cover-placeholder" aria-hidden="true">FW</div>';}
function status(row){const label=activityStatus(row);return `<span class="site-activity-status ${label==='进行中'?'ongoing':''}">${label}</span>`;}
function measureAnnouncement(){
  announcementFrame=0;
  const button=$('.announcement-message'),copy=button?.querySelector('[data-announcement-copy]');if(!button||!copy)return;
  const width=copy.scrollWidth,scrolling=button.clientWidth>0&&width>button.clientWidth+1&&!reducedMotion.matches;
  button.classList.toggle('is-scrolling',scrolling);button.dataset.scrolling=String(scrolling);
  if(scrolling){const travel=width+48;button.style.setProperty('--announcement-travel',`${travel}px`);button.style.setProperty('--announcement-duration',`${Math.max(12,travel/32)}s`);}
}
function queueAnnouncementMeasure(){if(!announcementFrame)announcementFrame=requestAnimationFrame(measureAnnouncement);}
function renderHome(){
  const host=$('[data-home-announcement]'),s=state.announcements;
  if(host){
    host.hidden=s.loaded&&!s.rows.length&&!s.error;
    const row=s.page===0?s.rows[0]:null;
    const body=String(row?.body||'').replace(/\s+/g,' ').trim(),unread=row&&readNotices[row.id]!==version(row);
    const signature=JSON.stringify([userId,row?.id,row?.title,body,row?.published_at,unread,s.error]);
    if(signature!==announcementSignature){
      announcementSignature=signature;
      const copy=row?`<strong>${esc(row.title)}</strong>${body?`<span>：${esc(body)}</span>`:''}`:'';
      host.innerHTML=row?`${unread?'<i class="announcement-unread" aria-label="未读公告"></i>':''}<button class="announcement-message" type="button" data-site-open="${esc(row.id)}" data-site-kind="announcements" aria-label="${esc(row.title+(body?'：'+body:''))}"><span class="announcement-track"><span class="announcement-copy" data-announcement-copy>${copy}</span><span class="announcement-copy announcement-repeat" aria-hidden="true">${copy}</span></span></button><time>${esc(siteTime(row.published_at).split(' ')[0])}</time><button type="button" data-nav="announcements">查看全部 →</button>`:`<span class="announcement-placeholder">${s.error?'公告暂时无法读取':'正在读取公告…'}</span>${s.error?'<button type="button" data-site-refresh="announcements">重试</button>':''}`;
    }
    queueAnnouncementMeasure();
  }
  const summary=$('[data-home-activities-summary]');if(summary)summary.textContent=state.activities.count?`共有 ${state.activities.count} 项活动，点开查看详情`:'查看各项活动与参与方式';
}
function detail(kind,row){
  const activity=kind==='activities',url=webUrl(row.participation_url),active=activity&&activityStatus(row)==='进行中';
  const action=active&&ACTIVITY_TARGETS[row.target_view]?`<button class="site-content-action" type="button" data-site-target="${esc(row.target_view)}">前往${ACTIVITY_TARGETS[row.target_view]}</button>`:active&&url?`<a class="site-content-action" href="${esc(url)}" data-external-link="${esc(url)}" target="_blank" rel="noopener noreferrer">前往参与</a>`:'';
  return `<article class="site-content-detail">${activity?cover(row):''}<div class="site-content-detail-copy">${activity?status(row):''}<h2>${esc(row.title)}</h2><div class="site-content-meta">${activity?`${esc(siteTime(row.starts_at))} — ${esc(siteTime(row.ends_at))}（北京时间）`:`发布于 ${esc(siteTime(row.published_at))}`}</div><div class="site-content-body">${renderWebLinks(row.body,esc).replace(/\n/g,'<br>')}</div>${action}</div></article>`;
}
function renderPage(kind){
  const host=$(`[data-site-content="${kind}"]`);if(!host)return;
  const s=state[kind],row=s.rows.find(r=>r.id===s.selected),activity=kind==='activities';
  const toolbar=`<div class="site-content-toolbar"><button type="button" ${row?`data-site-back="${kind}"`:'data-nav="home"'}>← 返回${row?'列表':''}</button><button type="button" data-site-refresh="${kind}" ${s.loading?'disabled':''}>${s.loading?'正在刷新…':'刷新'}</button></div>`;
  let body='';
  if(row)body=detail(kind,row);
  else if(s.loading&&!s.loaded)body='<div class="site-content-empty">正在读取…</div>';
  else if(!s.rows.length)body=`<div class="site-content-empty">${s.error?'读取失败，请点击刷新重试。':activity?'暂无发布的活动，新活动发布后会显示在这里。':'暂无公告。'}</div>`;
  else body=activity?`<div class="site-activity-grid">${s.rows.map(r=>`<button type="button" class="site-activity-card" data-site-kind="activities" data-site-open="${esc(r.id)}">${cover(r)}<div class="site-activity-copy">${status(r)}${r.is_pinned?'<span class="site-activity-status">置顶</span>':''}<h3>${esc(r.title)}</h3>${r.summary?`<p>${esc(r.summary)}</p>`:''}<time>${esc(siteTime(r.starts_at))} — ${esc(siteTime(r.ends_at))}</time></div></button>`).join('')}</div>`:`<div class="site-notice-list">${s.rows.map(r=>`<button type="button" class="site-notice-row" data-site-kind="announcements" data-site-open="${esc(r.id)}"><b>${r.is_pinned?'<small>置顶</small>':''}${esc(r.title)}</b><time>${esc(siteTime(r.published_at))}</time></button>`).join('')}</div>`;
  const pages=!row&&(s.page>0||s.hasNext)?`<div class="site-content-pagination"><button type="button" data-site-page="-1" data-site-kind="${kind}" ${s.loading||!s.page?'disabled':''}>上一页</button><span>第 ${s.page+1} 页</span><button type="button" data-site-page="1" data-site-kind="${kind}" ${s.loading||!s.hasNext?'disabled':''}>下一页</button></div>`:'';
  host.innerHTML=toolbar+(s.error?`<div class="site-content-error" role="alert">${esc(s.error)}</div>`:'')+body+pages;
}
function render(){renderHome();for(const kind of Object.keys(state))renderPage(kind);}
async function load(kind,force=false){
  const s=state[kind];if(!userId)return;if(s.loading){if(force)s.reload=true;return;}if(s.loaded&&!force)return;
  const token=generation,requestedPage=s.page,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);controllers.add(controller);
  s.loading=true;s.error='';render();
  try{
    const {data,error,count}=await authStore.client.from(SITE_TABLES[kind]).select(kind==='activities'?ACTIVITY_FIELDS:SITE_FIELDS,{count:'exact'}).eq('is_published',true).is('deleted_at',null).order('is_pinned',{ascending:false}).order('published_at',{ascending:false}).order('id',{ascending:false}).range(s.page*20,s.page*20+20).abortSignal(controller.signal);
    if(token!==generation||requestedPage!==s.page)return;if(error)throw error;
    s.rows=(data||[]).slice(0,20);s.hasNext=(data||[]).length>20;s.count=count??s.rows.length;s.loaded=true;s.loadedAt=Date.now();
    if(s.selected&&!s.rows.some(r=>r.id===s.selected))s.selected='';
  }catch{if(token===generation&&requestedPage===s.page)s.error='内容读取失败，请刷新重试。';}
  finally{clearTimeout(timer);controllers.delete(controller);if(token===generation){s.loading=false;if(requestedPage!==s.page||s.reload){s.reload=false;load(kind,true);}else render();}}
}
export const homeContent={
  init(options){
    navigate=options.navigate;if(started)return;started=true;
    new ResizeObserver(queueAnnouncementMeasure).observe($('[data-home-announcement]'));
    reducedMotion.addEventListener('change',queueAnnouncementMeasure);
    document.fonts?.addEventListener('loadingdone',queueAnnouncementMeasure);
    authStore.subscribe(auth=>{
      if(!auth.ready)return;const id=auth.user&&!auth.user.cached&&!auth.user.disabled?String(auth.user.id):'';if(id===userId)return;
      generation++;for(const c of controllers)c.abort();controllers.clear();userId=id;readNotices={};state.announcements=fresh();state.activities=fresh();view='home';
      if(id){try{const saved=JSON.parse(localStorage.getItem(readKey())||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))readNotices=saved;}catch{}load('announcements');load('activities');}render();
    });
    document.addEventListener('click',event=>{
      const b=event.target.closest('button');if(!b||b.disabled||!userId)return;
      const kind=b.dataset.siteKind;
      if(b.hasAttribute('data-site-open')&&state[kind]){if(kind==='announcements')markRead(state[kind].rows.find(r=>r.id===b.dataset.siteOpen));state[kind].scroll=$('.main-content').scrollTop;navigate(kind);state[kind].selected=b.dataset.siteOpen;render();$('.main-content').scrollTop=0;const title=$(`[data-site-content="${kind}"] h2`);title?.setAttribute('tabindex','-1');title?.focus({preventScroll:true});}
      if(b.hasAttribute('data-site-back')&&state[b.dataset.siteBack]){const k=b.dataset.siteBack,id=state[k].selected;state[k].selected='';render();$('.main-content').scrollTop=state[k].scroll;document.querySelector(`[data-site-kind="${k}"][data-site-open="${CSS.escape(id)}"]`)?.focus({preventScroll:true});}
      if(b.hasAttribute('data-site-refresh')&&state[b.dataset.siteRefresh])load(b.dataset.siteRefresh,true);
      if(b.hasAttribute('data-site-page')&&state[kind]){state[kind].page+=Number(b.dataset.sitePage);load(kind,true);}
      if(b.hasAttribute('data-site-target')&&ACTIVITY_TARGETS[b.dataset.siteTarget])navigate(b.dataset.siteTarget);
    });
    const refresh=()=>{if(!userId||document.hidden)return;const kinds=view==='home'?Object.keys(state):state[view]?[view]:[];for(const k of kinds)if(Date.now()-state[k].loadedAt>15000)load(k,true);};
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  },
  setVisible(next){
    const previous=view;view=next;
    if(next==='home'){for(const k of Object.keys(state)){if(previous!=='home'){state[k].page=0;state[k].selected='';}load(k,true);}}
    else if(state[next]){if(previous!==next)state[next].selected='';load(next,previous!==next);}render();if(previous!==next)$('.main-content').scrollTop=0;
  },
};
