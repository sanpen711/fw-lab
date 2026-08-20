// Windows 本地持久缓存桥：SQLite 文件由 Tauri/Rust 管理。
// 默认写入“安装目录\Cache\fw-cache.db”；安装目录不可写时由 Rust 自动回退 AppData。
const invoke=window.__TAURI__?.core?.invoke;
const memory=new Map();
let writeChain=Promise.resolve();

function clone(value){
  if(value==null)return value;
  try{return JSON.parse(JSON.stringify(value));}catch{return null;}
}
function part(value){return String(value??'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'');}
function cacheKey(scope,userId,suffix=''){
  const key=[part(scope),part(userId||'public'),part(suffix)].filter(Boolean).join('-').slice(0,160);
  if(!key)throw new Error('缓存名称不合法。');
  return key;
}
async function read(scope,userId,suffix=''){
  const key=cacheKey(scope,userId,suffix);
  if(memory.has(key))return clone(memory.get(key));
  if(typeof invoke!=='function')return null;
  try{
    const value=await invoke('desktop_persistent_cache_read',{key});
    memory.set(key,value??null);
    return clone(value??null);
  }catch(error){
    console.warn('[FW persistent cache] read skipped',error);
    return null;
  }
}
function write(scope,userId,payload,suffix=''){
  const key=cacheKey(scope,userId,suffix);
  const value={version:1,savedAt:Date.now(),payload:clone(payload)};
  memory.set(key,value);
  if(typeof invoke!=='function')return Promise.resolve(false);
  writeChain=writeChain.catch(()=>{}).then(()=>invoke('desktop_persistent_cache_write',{key,value})).then(()=>true).catch(error=>{
    console.warn('[FW persistent cache] write skipped',error);
    return false;
  });
  return writeChain;
}
function remove(scope,userId,suffix=''){
  const key=cacheKey(scope,userId,suffix);memory.delete(key);
  if(typeof invoke!=='function')return Promise.resolve(false);
  writeChain=writeChain.catch(()=>{}).then(()=>invoke('desktop_persistent_cache_remove',{key})).then(()=>true).catch(()=>false);
  return writeChain;
}
async function status(){
  if(typeof invoke!=='function')return{enabled:false,entries:0,bytes:0,path:'',fallback:true};
  try{return await invoke('desktop_persistent_cache_status');}catch{return{enabled:false,entries:0,bytes:0,path:'',fallback:true};}
}

export const desktopCache={enabled:typeof invoke==='function',read,write,remove,status,cacheKey};
window.__FW_PERSISTENT_CACHE__=desktopCache;
