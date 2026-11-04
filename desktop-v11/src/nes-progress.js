const FORMAT=1;
const CORE='fceumm';
const LIMIT=1024*1024;

export function nesProgressKey(gameId){return 'fw:nes:manual-save:v1:'+gameId;}
function checksum(bytes){
  let hash=2166136261;
  for(const byte of bytes)hash=Math.imul(hash^byte,16777619);
  return (hash>>>0).toString(16).padStart(8,'0');
}
function encode(bytes){
  let binary='';
  for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
  return btoa(binary);
}
function decode(value){
  if(typeof value!=='string'||value.length>Math.ceil(LIMIT/3)*4)throw new Error('存档内容无效');
  const binary=atob(value);
  if(!binary.length||binary.length>LIMIT)throw new Error('存档大小无效');
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}

// One bounded manual checkpoint per game. Only an explicit Save action writes it.
export function createNesProgress({gameId,storage,onStatus=()=>{},now=()=>Date.now()}){
  const key=nesProgressKey(gameId);
  let saved=null,emulator=null,blocked=false,restored=false,restoring=false,resumeRequested=true,storageError;
  try{storage??=globalThis.localStorage;}catch(error){storageError=error;}
  function report(kind,message){onStatus({kind,message,savedAt:saved?.savedAt||0});}
  function fail(message,error){report('error',message);throw new Error(message,{cause:error});}
  function prepare(){
    let found=false;
    try{
      if(storageError||!storage)throw storageError||new Error('Storage unavailable');
      const raw=storage.getItem(key);
      found=Boolean(raw);
      if(!raw){report('empty','点击“保存进度”才会保存，退出不会自动保存');return false;}
      const record=JSON.parse(raw);
      const state=decode(record.state);
      if(record.version!==FORMAT||record.core!==CORE||record.gameId!==gameId||!Number.isFinite(record.savedAt)||record.checksum!==checksum(state))throw new Error('Invalid checkpoint');
      saved={...record,bytes:state};
      report('ready','已有手动存档，仅保存在这台电脑');
      return true;
    }catch(error){
      blocked=true;
      report('error',found?'上次进度无法读取；可点“从头开始”，原存档暂时保留':'本机存档暂不可用，当前进度无法保存');
      return false;
    }
  }
  async function start(instance){
    emulator=instance;
    if(blocked)return false;
    if(saved&&resumeRequested){
      restoring=true;
      try{
        emulator.gameManager.loadState(new Uint8Array(saved.bytes));
        // The bundled core applies load-state on its next event-loop turn.
        await new Promise(resolve=>setTimeout(resolve,0));
        restored=true;
        report('resumed','已读取保存的进度，点击“保存进度”才会更新存档');
      }catch(error){
        blocked=true;
        report('error','上次进度未能恢复；请点“从头开始”，原存档暂时保留');
        return false;
      }finally{restoring=false;}
    }else report('empty',saved?'本局尚未保存，退出后仍可读取原存档':'本局尚未保存，退出后将从头开始');
    return restored;
  }
  function save(){
    if(blocked||restoring||!emulator?.started||emulator.failedToStart)return false;
    try{
      if(!storage)throw storageError||new Error('Storage unavailable');
      const state=new Uint8Array(emulator.gameManager.getState());
      if(!state.length||state.length>LIMIT)throw new Error('Invalid snapshot size');
      const record={version:FORMAT,core:CORE,gameId,savedAt:now(),checksum:checksum(state),state:encode(state)};
      storage.setItem(key,JSON.stringify(record));
      saved={...record,bytes:state};resumeRequested=true;
      report('saved','进度已保存，仅保存在这台电脑');
      return true;
    }catch(error){return fail('进度保存失败，请重试；上次成功保存的进度仍会保留',error);}
  }
  function restart(){
    blocked=false;restored=false;resumeRequested=false;
    if(emulator?.started)emulator.gameManager.restart();
    report('empty',saved?'已从头开始，原存档保留；点击“保存进度”才会覆盖':'已从头开始，点击“保存进度”才会保留本局');
  }
  return {prepare,start,save,restart,info:()=>({key,hasSave:Boolean(saved),savedAt:saved?.savedAt||0,blocked,restored})};
}
