// A browser draft belongs to one verified account. File objects stay in memory.
const prefix='fw:web:compose-draft:';
let restoredFor='',missingAttachments=false,storageError=false;
export const webDraft={
  restore(userId,draft){
    restoredFor='';missingAttachments=false;storageError=false;
    if(!userId)return;
    try{
      const saved=JSON.parse(localStorage.getItem(prefix+userId)||'null');
      if(!saved||typeof saved.text!=='string')return;
      draft.text=saved.text.slice(0,300);missingAttachments=Boolean(saved.attachments);
      if(draft.text||missingAttachments)restoredFor=String(userId);
    }catch{storageError=true;}
  },
  save(userId,draft){
    if(!userId)return;
    try{
      const attachments=Boolean(draft.attachments?.length)||missingAttachments;
      if(draft.text||attachments)localStorage.setItem(prefix+userId,JSON.stringify({text:draft.text,attachments,updatedAt:Date.now()}));
      else localStorage.removeItem(prefix+userId);
      storageError=false;
    }catch{storageError=true;}
    this.paint(userId);
  },
  clear(userId){
    restoredFor='';missingAttachments=false;
    try{localStorage.removeItem(prefix+userId);storageError=false;}catch{storageError=true;}
  },
  paint(userId){
    const node=document.querySelector('[data-web-draft-status]');if(!node)return;
    node.textContent=storageError?'当前浏览器无法保存草稿，请勿刷新。':missingAttachments?'文字草稿已恢复，图片、视频和表情请重新添加。':restoredFor===String(userId)?'已恢复上次的文字草稿。':'文字草稿已自动保存。';
  },
};
