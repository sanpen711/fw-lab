import {APP_VERSION} from './config.js';
import {desktopCache} from './desktop-persistent-cache.js';
let notify=()=>{};
const $=selector=>document.querySelector(selector);
async function refreshCache(){
  const {bytes,entries}=await desktopCache.status();
  $('[data-cache-size]').textContent=bytes>1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`;
  $('[data-cache-detail]').textContent=`${entries} 项临时数据，清理后会按需重新读取。`;
}
export const desktopSettings={
  init(options){
    notify=options.toast||notify;$('[data-app-version]').textContent=`网页 · 与电脑版 ${APP_VERSION} 同步`;
    $('[data-web-reload]').addEventListener('click',()=>location.reload());
    $('[data-clear-cache]').addEventListener('click',async event=>{
      const button=event.currentTarget;button.disabled=true;
      try{
        desktopCache.clearMemory();
        // Clear only this browser client's disposable caches. Auth and the mobile PWA
        // use separate keys and caches and must survive this action.
        if('caches' in window)for(const key of await caches.keys())if(key.startsWith('fw-web-assets-'))await caches.delete(key);
        notify('网页临时缓存已清理，登录状态已保留。');await refreshCache();
      }catch{notify('缓存清理失败，请稍后重试。');}finally{button.disabled=false;}
    });
  },
  activate:refreshCache,refreshCache
};
