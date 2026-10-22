import {authStore} from './auth-store.js';

let pending=null;
const signed=()=>{
  const state=authStore.state;
  return Boolean(state.ready&&state.user&&!state.user.cached&&!state.user.disabled&&state.session?.user?.id===state.user.id);
};
function ready(){
  if(authStore.state.ready)return Promise.resolve();
  return new Promise(resolve=>{const off=authStore.subscribe(state=>{if(state.ready){off();resolve();}});});
}
export const webAccess={
  signed,ready,
  allow(view,{mode='feed'}={}){return signed()||view==='home'||view==='square'&&mode==='feed';},
  request(view=null,options={}){
    if(view)pending={view,...options};
    ready().then(()=>{
      if(signed())window.dispatchEvent(new Event('fw:web-resume'));
      else window.__FW_WEB_APP__?.notify(view==='square'&&options.post?'查看评论需要登录，请先注册或登录。':view?'此板块需要登录，请先注册或登录。':'请先注册或登录后再操作。');
    });
  },
  takePending(){const value=pending;pending=null;return value;},
  clearPending(){pending=null;},
};

export function webCommentCount(post){
  return signed()?(post.comments||[]).length:Math.max(0,Number(post.commentCount??post.comments?.length??0)||0);
}
