const invoke=window.__TAURI__?.core?.invoke;
const FALLBACK_KEY='fw:desktop:v11:display-identity';
const DEFAULT_IDENTITY={mode:'default',displayName:'F.w 研究所',icon:'folder'};
const ICONS=new Set(['folder','document','computer','drive','image','archive','text','printer','network']);
let identity={...DEFAULT_IDENTITY};
let notify=()=>{};

const $=selector=>document.querySelector(selector);

function safeFallback(){
  try{
    const value=JSON.parse(localStorage.getItem(FALLBACK_KEY)||'null');
    return value&&typeof value==='object'?value:null;
  }catch{return null;}
}

function normalize(value){
  const mode=value?.mode==='custom'?'custom':'default';
  const displayName=String(value?.displayName||'').trim()||DEFAULT_IDENTITY.displayName;
  const savedIcon=value?.icon==='table'?'drive':value?.icon;
  const icon=ICONS.has(savedIcon)?savedIcon:'folder';
  return{mode,displayName:mode==='custom'?displayName:DEFAULT_IDENTITY.displayName,icon};
}

function iconUrl(icon){return `/app-icons/${ICONS.has(icon)?icon:'folder'}.png`;}

function setStatus(selector,message='',error=false){
  const node=$(selector);if(!node)return;node.textContent=message;node.classList.toggle('error',error);
}

function currentDraft(){
  const form=$('[data-identity-form]');if(!form)return{...identity};
  const data=new FormData(form);const mode=data.get('mode')==='custom'?'custom':'default';
  return normalize({mode,displayName:data.get('displayName'),icon:data.get('icon')});
}

function renderIdentity(next=identity){
  identity=normalize(next);const form=$('[data-identity-form]');if(!form)return;
  const mode=form.elements.mode;Array.from(mode||[]).forEach(input=>{input.checked=input.value===identity.mode;});
  form.elements.displayName.value=identity.mode==='custom'?identity.displayName:'';
  const iconInput=form.querySelector(`input[name="icon"][value="${identity.icon}"]`)||form.querySelector('input[name="icon"]');if(iconInput)iconInput.checked=true;
  renderIdentityDraft();
}

function renderIdentityDraft(){
  const form=$('[data-identity-form]');if(!form)return;const draft=currentDraft();const custom=draft.mode==='custom';
  const customPanel=$('[data-identity-custom]');if(customPanel)customPanel.hidden=!custom;
  const name=String(form.elements.displayName.value||'').trim()||'自定义名称';
  const icon=form.elements.icon.value||'folder';const previewIcon=$('[data-identity-preview-icon]');const previewName=$('[data-identity-preview-name]');
  if(previewIcon)previewIcon.src=iconUrl(icon);if(previewName)previewName.textContent=name;
}

async function loadIdentity(){
  let next=null;
  if(typeof invoke==='function'){
    try{next=await invoke('desktop_identity_get');}catch(error){console.warn('[FW settings] identity read skipped',error);}
  }
  if(!next)next=safeFallback();renderIdentity(next||DEFAULT_IDENTITY);
  document.title=identity.mode==='custom'?identity.displayName:DEFAULT_IDENTITY.displayName;
}

function validateName(value){
  const name=String(value||'').trim();
  if(!name)throw new Error('请输入应用名称。');
  if(name.length>24)throw new Error('应用名称最多 24 个字。');
  if(/[<>:"/\\|?*]/.test(name)||/[. ]$/.test(name))throw new Error('应用名称中包含 Windows 不支持的字符。');
  return name;
}

async function saveIdentity(form){
  const data=new FormData(form);const mode=data.get('mode')==='custom'?'custom':'default';
  const name=mode==='custom'?validateName(data.get('displayName')):DEFAULT_IDENTITY.displayName;
  const icon=ICONS.has(data.get('icon'))?data.get('icon'):'folder';
  setStatus('[data-identity-status]','正在保存…');
  const payload={mode,name,icon};
  try{
    let next;
    if(typeof invoke==='function')next=await invoke('desktop_identity_set',payload);
    else{next={mode,displayName:name,icon};localStorage.setItem(FALLBACK_KEY,JSON.stringify(next));}
    renderIdentity(next);document.title=mode==='custom'?name:DEFAULT_IDENTITY.displayName;
    setStatus('[data-identity-status]','已保存，窗口显示已经更新。');notify('应用显示已保存。');
  }catch(error){setStatus('[data-identity-status]',error?.message||String(error)||'保存失败，请稍后重试。',true);}
}

function formatBytes(bytes){
  const value=Math.max(0,Number(bytes||0));if(value<1024)return`${value} B`;if(value<1024*1024)return`${(value/1024).toFixed(value<10*1024?1:0)} KB`;return`${(value/1024/1024).toFixed(value<10*1024*1024?1:0)} MB`;
}

async function refreshCache(){
  const size=$('[data-cache-size]');const detail=$('[data-cache-detail]');if(!size||!detail)return;
  if(typeof invoke!=='function'){size.textContent='仅客户端可用';detail.textContent='安装版中会显示本机缓存占用。';return;}
  try{
    const status=await invoke('desktop_app_cache_status');size.textContent=formatBytes(status?.bytes);detail.textContent=`${Number(status?.entries||0)} 条本地缓存`;
  }catch(error){size.textContent='暂时无法统计';detail.textContent='稍后进入设置时会重新检测。';}
}

async function clearCache(button){
  if(typeof invoke!=='function'){setStatus('[data-cache-status]','清理缓存仅在 Windows 客户端中可用。',true);return;}
  if(!window.confirm('确定清理本机临时缓存吗？账号、登录状态、表情、游戏文件和应用显示设置都会保留。'))return;
  button.disabled=true;setStatus('[data-cache-status]','正在清理…');
  try{
    const before=await invoke('desktop_app_cache_status');const status=await invoke('desktop_app_cache_clear');window.__FW_PERSISTENT_CACHE__?.clearMemory?.();
    const removed=Math.max(0,Number(before?.bytes||0)-Number(status?.bytes||0));
    $('[data-cache-size]').textContent=formatBytes(status?.bytes);$('[data-cache-detail]').textContent=`${Number(status?.entries||0)} 条本地缓存`;
    setStatus('[data-cache-status]',`已清理 ${formatBytes(removed)} 缓存。`);notify('缓存已清理。');
  }catch(error){setStatus('[data-cache-status]',error?.message||String(error)||'缓存清理失败。',true);}finally{button.disabled=false;}
}

function bind(){
  const form=$('[data-identity-form]');
  form?.addEventListener('change',renderIdentityDraft);form?.addEventListener('input',renderIdentityDraft);
  form?.addEventListener('submit',event=>{event.preventDefault();saveIdentity(event.currentTarget);});
  $('[data-clear-cache]')?.addEventListener('click',event=>clearCache(event.currentTarget));
}

async function init(options={}){notify=options.toast||notify;bind();await loadIdentity();}
function activate(){refreshCache();renderIdentity(identity);}

export const desktopSettings={init,activate,refreshCache};
