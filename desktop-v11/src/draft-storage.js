// Text is committed synchronously; File/Blob attachments live in a separate
// IndexedDB database, outside temporary content caches. Every record is owned.
const PREFIX='fw:desktop:v11:drafts:';
let database;
const mediaSignatures=new Map();
const mediaWrites=new Map();
function report(){window.dispatchEvent(new CustomEvent('fw:draft-storage-error'));}
function db(){
  return database||=new Promise((resolve,reject)=>{
    const request=indexedDB.open('fw-desktop-drafts',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('media');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  }).catch(error=>{database=null;throw error;});
}
async function mediaRecord(owner,value,write=false){
  const database=await db();
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction('media',write?'readwrite':'readonly');
    const request=write?transaction.objectStore('media').put(value,owner):transaction.objectStore('media').get(owner);
    transaction.oncomplete=()=>resolve(request.result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
  });
}
function entries(snapshot){return [['compose',snapshot.compose],...Object.entries(snapshot.comments||{}).map(([id,value])=>['comment:'+id,value])];}
export function saveDraftSnapshot(owner,snapshot){
  if(!owner)return true;
  const media={},drafts={};
  for(const [key,draft] of entries(snapshot)){
    const attachments=(draft?.attachments||[]).map(item=>{
      if(item.kind==='sticker')return{kind:'sticker',url:item.url};
      if(!item.file)return null;
      const id=item.draftId||=crypto.randomUUID();media[id]=item.file;
      return{kind:item.kind,draftId:id};
    }).filter(Boolean);
    if(draft?.text||attachments.length)drafts[key]={text:String(draft?.text||'').slice(0,300),pickerTab:draft?.pickerTab||'emoji',attachments};
  }
  const chats=Object.fromEntries(Object.entries(snapshot.chats||{}).filter(([,text])=>text).map(([id,text])=>[id,String(text).slice(0,300)]));
  try{localStorage.setItem(PREFIX+owner,JSON.stringify({version:1,drafts,chats}));}catch{report();return false;}
  const signature=Object.keys(media).sort().join('|');
  if(mediaSignatures.get(owner)===signature)return true;
  mediaSignatures.set(owner,signature);
  const pending=(mediaWrites.get(owner)||Promise.resolve()).then(()=>mediaRecord(owner,media,true)).then(
    ()=>true,
    ()=>{mediaSignatures.delete(owner);report();return !signature;}
  );
  mediaWrites.set(owner,pending);
  return true;
}
export async function loadDraftSnapshot(owner){
  let saved;try{saved=JSON.parse(localStorage.getItem(PREFIX+owner)||'null');}catch{report();}
  if(saved?.version!==1)return{compose:null,comments:{},chats:{}};
  let media={};
  try{await mediaWrites.get(owner);media=await mediaRecord(owner)||{};}catch{report();}
  const result={compose:null,comments:{},chats:saved.chats||{}};
  let missing=false;
  for(const [key,value] of Object.entries(saved.drafts||{})){
    const draft={text:String(value.text||'').slice(0,300),pickerTab:value.pickerTab||'emoji',attachments:[]};
    for(const item of value.attachments||[]){
      if(item.kind==='sticker'&&typeof item.url==='string')draft.attachments.push(item);
      else if(media[item.draftId] instanceof Blob){const file=media[item.draftId];draft.attachments.push({...item,file,preview:URL.createObjectURL(file)});}
      else missing=true;
    }
    if(key==='compose')result.compose=draft;else if(key.startsWith('comment:'))result.comments[key.slice(8)]=draft;
  }
  if(missing)report();
  return result;
}

export async function flushDraftWrites(owner){
  await Promise.all(mediaWrites.values());
  if((await mediaWrites.get(owner))===false)throw new Error('附件草稿未能保存。');
}
