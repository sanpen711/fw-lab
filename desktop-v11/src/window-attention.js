// Receipts are allowed only while the visible, focused window is being read.
let nativeActive=null;
const listeners=new Set();
export function windowIsActive(){return document.visibilityState==='visible'&&document.hasFocus()&&nativeActive!==false;}
function changed(){listeners.forEach(listener=>listener(windowIsActive()));}
window.addEventListener('focus',changed);
window.addEventListener('blur',changed);
document.addEventListener('visibilitychange',changed);
window.addEventListener('fw:window-attention',event=>{nativeActive=Boolean(event.detail?.active);changed();});
export function onWindowAttention(listener){listeners.add(listener);return()=>listeners.delete(listener);}
const invoke=window.__TAURI__?.core?.invoke;
if(typeof invoke==='function')invoke('desktop_window_is_active').then(value=>{if(typeof value==='boolean'){nativeActive=value;changed();}}).catch(()=>{});
