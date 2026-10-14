import {webUrl} from './external-links.js';

export const ACTIVITY_BUCKET='activity-covers';
export const SITE_TABLES={announcements:'site_announcements',activities:'site_activities'};
export const SITE_FIELDS='id,title,body,is_pinned,published_at,updated_at';
export const ACTIVITY_FIELDS=SITE_FIELDS+',summary,cover_path,starts_at,ends_at,target_view,participation_url';
export const ACTIVITY_TARGETS={square:'精神广场',rooms:'学术研讨',play:'下班开黑',shop:'周边商城'};
export function activityStatus(row,now=Date.now()){
  if(now>=new Date(row.ends_at).getTime())return '已结束';
  return now<new Date(row.starts_at).getTime()?'未开始':'进行中';
}
export function siteTime(value){
  if(!value||!Number.isFinite(new Date(value).getTime()))return '—';
  return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
}
export function activityTimeInput(value){
  if(!value||!Number.isFinite(new Date(value).getTime()))return '';
  const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
  const p=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function parseTime(value){
  const text=String(value||'');const date=new Date(text+'+08:00');
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)||!Number.isFinite(date.getTime())||activityTimeInput(date.toISOString())!==text)throw new Error('请填写有效的活动时间（北京时间）。');
  return date.toISOString();
}
export function activityImage(path,base){
  if(!/^activities\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(String(path||'')))return '';
  return `${base}/storage/v1/object/public/${ACTIVITY_BUCKET}/${path}`;
}
export function siteContentValues(kind,draft){
  const title=String(draft.title||'').trim(),body=String(draft.body||'').trim();
  if(!title||[...title].length>80)throw new Error('标题须为1—80字。');
  if(!body||[...body].length>10000)throw new Error('详细内容须为1—10000字。');
  const values={title,body,is_published:Boolean(draft.is_published),is_pinned:Boolean(draft.is_pinned)};
  if(kind==='activities'){
    const summary=String(draft.summary||'').trim();if([...summary].length>200)throw new Error('活动简介最多200字。');
    const starts_at=parseTime(draft.starts_at),ends_at=parseTime(draft.ends_at);if(ends_at<=starts_at)throw new Error('结束时间须晚于开始时间。');
    const target=String(draft.target||'');if(target&&!ACTIVITY_TARGETS[target]&&target!=='external')throw new Error('请选择有效的参与入口。');
    const participation_url=target==='external'?webUrl(String(draft.participation_url||'').trim()):'';
    if(target==='external'&&(!participation_url||participation_url.length>2048))throw new Error('请填写有效的HTTP或HTTPS网址，最多2048字。');
    Object.assign(values,{summary,starts_at,ends_at,target_view:ACTIVITY_TARGETS[target]?target:'',participation_url,cover_path:draft.cover?.path||''});
  }else if(kind!=='announcements')throw new Error('内容类型无效。');
  return values;
}
