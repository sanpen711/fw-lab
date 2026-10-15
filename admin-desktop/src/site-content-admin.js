import {ACTIVITY_BUCKET,SITE_TABLES,ACTIVITY_TARGETS,activityImage,activityStatus,activityTimeInput,siteContentValues,siteTime} from '../../desktop-v11/src/site-content-model.js';
import {SUPABASE_URL} from './config.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={kind:'announcements',rows:[],page:0,hasNext:false,loading:false,busy:false,error:'',preview:false,drafts:{announcements:null,activities:null}};
let client,render,toast,admin,openDialog,generation=0,controller;
const draft=()=>state.drafts[state.kind];
function check(r){if(r.error)throw new Error(r.error.message);return r.data;}
function clearDraft(kind=state.kind){const d=state.drafts[kind];if(d?.cover?.file)URL.revokeObjectURL(d.cover.url);state.drafts[kind]=null;state.preview=false;}
async function load(){
 if(!admin()||state.loading)return;const token=generation,kind=state.kind;state.loading=true;state.error='';render();controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
 try{const result=await client.from(SITE_TABLES[kind]).select('*').is('deleted_at',null).order('is_pinned',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).range(state.page*20,state.page*20+20).abortSignal(controller.signal);if(token!==generation)return;const rows=check(result)||[];state.rows=rows.slice(0,20);state.hasNext=rows.length>20;}
 catch(e){if(token===generation)state.error=`读取失败：${e.message||'请重试'}`;}
 finally{clearTimeout(timer);if(token===generation){state.loading=false;render();}}
}
function newDraft(){clearDraft();const start=new Date(Date.now()+3600000),end=new Date(Date.now()+7*86400000);state.drafts[state.kind]={id:crypto.randomUUID(),title:'',body:'',summary:'',is_published:false,is_pinned:false,starts_at:activityTimeInput(start),ends_at:activityTimeInput(end),target:'',participation_url:'',cover:null,existing:false};}
function preview(d){return `<article class="site-admin-preview">${d.cover?`<img src="${esc(d.cover.url)}" alt="活动封面">`:''}<h3>${esc(d.title||'未填写标题')}</h3>${state.kind==='activities'?`<p>${esc(d.starts_at.replace('T',' '))} — ${esc(d.ends_at.replace('T',' '))}（北京时间）</p><p>${esc(d.summary)}</p>`:''}<div>${esc(d.body||'未填写内容').replace(/\n/g,'<br>')}</div>${state.kind==='activities'&&d.target?`<p>参与入口：${esc(ACTIVITY_TARGETS[d.target]||d.participation_url)}</p>`:''}</article>`;}
function editor(){
 const d=draft();if(!d)return '<div class="empty-state">选择内容编辑，或点击新增。</div>';const activity=state.kind==='activities';
 return `<form class="site-admin-editor" data-site-admin-form><fieldset ${state.busy?'disabled':''}><h3>${d.existing?'编辑':'新增'}${activity?'活动':'公告'}</h3><label class="field">标题<input name="title" value="${esc(d.title)}" required maxlength="80"></label>${activity?`<label class="field">活动简介<textarea name="summary" maxlength="200" rows="2">${esc(d.summary)}</textarea></label><div class="site-admin-time"><label class="field">开始时间（北京时间）<input type="datetime-local" name="starts_at" value="${esc(d.starts_at)}" required></label><label class="field">结束时间（北京时间）<input type="datetime-local" name="ends_at" value="${esc(d.ends_at)}" required></label></div>${d.cover?`<div class="site-admin-cover"><img src="${esc(d.cover.url)}" alt="活动封面"><button type="button" class="button compact" data-site-admin-remove-cover>移除封面</button></div>`:''}<label class="field">活动封面<input type="file" data-site-admin-cover accept="image/jpeg,image/png,image/webp"></label><p class="help-text">可上传一张横图，建议16∶9。支持JPG、PNG、WebP，最多5MB。</p><label class="field">参与入口<select name="target"><option value="" ${!d.target?'selected':''}>仅展示活动介绍</option>${Object.entries(ACTIVITY_TARGETS).map(([k,v])=>`<option value="${k}" ${d.target===k?'selected':''}>${v}</option>`).join('')}<option value="external" ${d.target==='external'?'selected':''}>外部网址</option></select></label>${d.target==='external'?`<label class="field">参与网址<input name="participation_url" type="url" value="${esc(d.participation_url)}" required maxlength="2048" placeholder="https://"></label>`:''}`:''}<label class="field">详细内容<textarea name="body" required maxlength="10000" rows="9" placeholder="填写${activity?'活动介绍与参与方式':'公告正文'}">${esc(d.body)}</textarea></label><label class="site-admin-check"><input name="is_pinned" type="checkbox" ${d.is_pinned?'checked':''}> 置顶</label><label class="site-admin-check"><input name="is_published" type="checkbox" ${d.is_published?'checked':''}> 发布到客户端（取消勾选则保存为草稿）</label><div class="detail-actions"><button class="button" type="button" data-site-admin-cancel>取消</button><button class="button" type="button" data-site-admin-preview>${state.preview?'收起预览':'预览'}</button><button class="button primary" type="submit">${state.busy?'正在保存…':'保存'}</button></div></fieldset>${state.preview?preview(d):''}</form>`;
}
async function selectCover(file){
 const d=draft();if(!file||!d||state.busy)return;const token=generation;state.busy=true;
 try{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5242880)throw new Error('封面须为JPG、PNG或WebP，最多5MB。');
  const bitmap=await createImageBitmap(file);bitmap.close();if(token!==generation||draft()!==d)return;
  if(d.cover?.file)URL.revokeObjectURL(d.cover.url);d.cover={file,url:URL.createObjectURL(file),path:`activities/${d.id}/${crypto.randomUUID()}.${({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[file.type]}`,uploaded:false};
 }catch(e){if(token===generation)toast(e.message||'封面无法读取。',true);}
 finally{if(token===generation){state.busy=false;render();}}
}
async function save(){
 if(state.busy||!draft()||!admin())return;const d=draft(),kind=state.kind,token=generation;let values;
 try{values=siteContentValues(kind,d);}catch(e){toast(e.message,true);return;}
 state.busy=true;render();
 try{
  if(d.cover?.file&&!d.cover.uploaded){check(await client.storage.from(ACTIVITY_BUCKET).upload(d.cover.path,d.cover.file,{contentType:d.cover.file.type,upsert:false,cacheControl:'31536000'}));d.cover.uploaded=true;}
  if(token!==generation)return;
  const table=SITE_TABLES[kind];const result=d.existing?await client.from(table).update(values).eq('id',d.id).is('deleted_at',null).select('id').single():await client.from(table).insert({id:d.id,...values}).select('id').single();
  if(result.error){
   const recovered=await client.from(table).select('*').eq('id',d.id).maybeSingle();const row=recovered.data;
   const same=row&&!row.deleted_at&&Object.entries(values).every(([k,v])=>k==='starts_at'||k==='ends_at'?new Date(row[k]).getTime()===new Date(v).getTime():row[k]===v);
   if(recovered.error||!same)check(result);
  }
  if(token!==generation)return;clearDraft(kind);toast(values.is_published?'内容已发布。':'草稿已保存。');await load();
 }catch(e){if(token===generation)toast(`保存失败，草稿已保留：${e.message}`,true);}
 finally{if(token===generation){state.busy=false;render();}}
}
async function togglePublished(row){
 if(state.busy)return;const token=generation;state.busy=true;render();
 try{check(await client.from(SITE_TABLES[state.kind]).update({is_published:!row.is_published}).eq('id',row.id).is('deleted_at',null).select('id').single());if(token!==generation)return;if(draft()?.id===row.id)draft().is_published=!row.is_published;toast(row.is_published?'内容已撤下。':'内容已发布。');await load();}
 catch(e){if(token===generation)toast(e.message||'操作失败。',true);}finally{if(token===generation){state.busy=false;render();}}
}
export const siteContentAdmin={
 load,
 reset(){generation++;controller?.abort();for(const k of Object.keys(state.drafts))clearDraft(k);Object.assign(state,{kind:'announcements',rows:[],page:0,hasNext:false,loading:false,busy:false,error:'',preview:false});},
 content(){const activity=state.kind==='activities';return `<div class="filter-row"><button class="filter-button ${!activity?'active':''}" data-site-admin-tab="announcements" ${state.busy||state.loading?'disabled':''}>公告</button><button class="filter-button ${activity?'active':''}" data-site-admin-tab="activities" ${state.busy||state.loading?'disabled':''}>活动</button></div>${state.error?`<p class="site-admin-error" role="alert">${esc(state.error)}</p>`:''}<div class="site-admin-workspace"><section class="panel"><div class="panel-heading"><div><h2>${activity?'活动':'公告'}管理</h2><p>${activity?'活动显示在首页的活动列表中':'置顶公告优先显示在首页上方'}</p></div><button class="button primary compact" data-site-admin-new ${state.busy?'disabled':''}>新增${activity?'活动':'公告'}</button></div><div class="site-admin-list">${state.loading&&!state.rows.length?'<div class="empty-state">正在读取…</div>':state.rows.map(r=>`<article><div><h3>${esc(r.title)}</h3><p>${r.is_pinned?'置顶 · ':''}${r.is_published?(activity?activityStatus(r):'已发布'):'草稿'} · ${esc(siteTime(r.published_at||r.created_at))}</p></div><div class="site-admin-list-actions"><button class="button compact" data-site-admin-edit="${r.id}" ${state.busy?'disabled':''}>编辑</button><button class="button compact" data-site-admin-publish="${r.id}" ${state.busy?'disabled':''}>${r.is_published?'撤下':'发布'}</button><button class="button danger compact" data-site-admin-delete="${r.id}" ${state.busy?'disabled':''}>删除</button></div></article>`).join('')||'<div class="empty-state">暂无内容，点击新增。</div>'}</div><div class="site-admin-pages"><button class="button compact" data-site-admin-page="-1" ${state.loading||state.busy||!state.page?'disabled':''}>上一页</button><span>第 ${state.page+1} 页</span><button class="button compact" data-site-admin-page="1" ${state.loading||state.busy||!state.hasNext?'disabled':''}>下一页</button></div></section><section class="panel">${editor()}</section></div>`;},
 init(options){({client,render,toast,admin,openDialog}=options);
  document.addEventListener('input',e=>{const d=draft();if(!d||!e.target.closest('[data-site-admin-form]'))return;const name=e.target.name;if(['title','summary','body','is_pinned','is_published','starts_at','ends_at','participation_url','target'].includes(name))d[name]=e.target.type==='checkbox'?e.target.checked:e.target.value;});
  document.addEventListener('change',e=>{if(e.target.matches('[data-site-admin-cover]'))selectCover(e.target.files[0]);if(e.target.matches('[data-site-admin-form] [name="target"]')&&draft()){draft().target=e.target.value;render();}});
  document.addEventListener('submit',e=>{if(e.target.matches('[data-site-admin-form]')){e.preventDefault();save();}});
  document.addEventListener('click',e=>{
   const b=e.target.closest('button');if(!b||b.disabled||!admin()||state.busy)return;
   if(b.hasAttribute('data-site-admin-new')){newDraft();render();}
   if(b.hasAttribute('data-site-admin-cancel')){clearDraft();render();}
   if(b.hasAttribute('data-site-admin-preview')){state.preview=!state.preview;render();}
   if(b.hasAttribute('data-site-admin-remove-cover')&&draft()){if(draft().cover?.file)URL.revokeObjectURL(draft().cover.url);draft().cover=null;render();}
   if(b.hasAttribute('data-site-admin-tab')){state.kind=b.dataset.siteAdminTab;state.page=0;state.rows=[];state.preview=false;load();}
   if(b.hasAttribute('data-site-admin-page')){state.page+=Number(b.dataset.siteAdminPage);load();}
   const row=state.rows.find(r=>r.id===(b.dataset.siteAdminEdit||b.dataset.siteAdminPublish||b.dataset.siteAdminDelete));
   if(row&&b.hasAttribute('data-site-admin-edit')){clearDraft();state.drafts[state.kind]={...row,starts_at:activityTimeInput(row.starts_at),ends_at:activityTimeInput(row.ends_at),target:row.target_view|| (row.participation_url?'external':''),cover:row.cover_path?{path:row.cover_path,url:activityImage(row.cover_path,SUPABASE_URL)}:null,existing:true};render();}
   if(row&&b.hasAttribute('data-site-admin-publish'))togglePublished(row);
   if(row&&b.hasAttribute('data-site-admin-delete')){const kind=state.kind;openDialog({title:'删除'+(kind==='activities'?'活动':'公告'),description:'删除后将从客户端和管理列表中移除。',body:`<p>${esc(row.title)}</p>`,danger:true,submitLabel:'确认删除',onSubmit:async()=>{check(await client.from(SITE_TABLES[kind]).update({is_published:false,deleted_at:new Date().toISOString()}).eq('id',row.id).is('deleted_at',null).select('id').single());if(state.drafts[kind]?.id===row.id)clearDraft(kind);await load();}});}
  });
 },
};
