const formatter=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function parts(value){
  if(value==null||value==='')return null;
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
  const p=Object.fromEntries(formatter.formatToParts(date).map(({type,value})=>[type,value]));
  return{...p,key:`${p.year}-${p.month}-${p.day}`,clock:`${p.hour}:${p.minute}`,ms:date.getTime()};
}
export function showChatTime(value,previous){
  const current=parts(value),before=parts(previous);
  return Boolean(current&&(!before||current.key!==before.key||current.ms-before.ms>=5*60*1000));
}
export function fullChatTime(value){const p=parts(value);return p?`${p.key} ${p.clock}:${p.second}`:'';}
export function chatTimeLabel(value,now=new Date()){
  const p=parts(value),today=parts(now);if(!p)return'';
  if(p.key===today?.key)return p.clock;
  if(p.key===parts(new Date(now).getTime()-86400000)?.key)return `昨天 ${p.clock}`;
  return `${p.year===today?.year?'':p.year+'年'}${Number(p.month)}月${Number(p.day)}日 ${p.clock}`;
}
export function conversationTime(value,now=new Date()){
  const p=parts(value),today=parts(now);if(!p)return'';
  if(p.key===today?.key)return p.clock;
  if(p.key===parts(new Date(now).getTime()-86400000)?.key)return'昨天';
  return `${p.year===today?.year?'':p.year+'/'}${Number(p.month)}/${Number(p.day)}`;
}
