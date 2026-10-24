import {reportButton} from './content-review-ui.js';
import {openDialog,closeDialog} from './dialog-focus.js';

const labels={post:'帖子',comment:'评论',poll:'课题',poll_option:'选项',private_message:'消息',room_message:'消息'};
function placeMenu(menu){
  const rect=menu.querySelector('summary').getBoundingClientRect(),panel=menu.querySelector('.web-action-menu-panel');
  panel.style.left=`${Math.max(8,Math.min(innerWidth-148,rect.right-140))}px`;
  panel.style.top=`${rect.bottom+56>innerHeight?Math.max(8,rect.top-52):rect.bottom+4}px`;
}
export function webReportButton(kind,id){
  return `<details class="web-action-menu"><summary aria-label="${labels[kind]||'内容'}的更多操作" title="更多操作">⋯</summary><div class="web-action-menu-panel">${reportButton(kind,id)}</div></details>`;
}

// Each conversation tracks only its current rendered message IDs. Loading older
// history, editing messages and repeated store notifications do not add unread.
const conversations=new Map();
export const webMessages={
  update(name,{context,rows,ownerField,ownId,scroller,button,nearBottom,forceBottom=false}){
    if(!scroller||!button)return;
    let memo=conversations.get(name);
    if(!memo||memo.context!==context)memo={context,ids:new Set(),tail:'',lastTime:0,count:0,initialized:false};
    const tailIndex=rows.findIndex(row=>String(row.id)===memo.tail);
    const fresh=memo.initialized?rows.filter((row,index)=>!memo.ids.has(String(row.id))&&String(row[ownerField])!==String(ownId)&&!String(row.id).startsWith('pending-')&&(tailIndex>=0?index>tailIndex:new Date(row.created_at).getTime()>memo.lastTime)):[];
    memo.count=forceBottom||nearBottom?0:memo.count+fresh.length;
    memo.ids=new Set(rows.map(row=>String(row.id)));memo.tail=String(rows.at(-1)?.id||'');memo.lastTime=new Date(rows.at(-1)?.created_at||0).getTime();memo.initialized=true;
    conversations.set(name,memo);
    const paint=()=>{
      if(!scroller.isConnected||conversations.get(name)!==memo)return;
      const atBottom=scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<70;
      if(atBottom)memo.count=0;
      button.hidden=atBottom||!context;
      button.textContent=memo.count?`${memo.count>99?'99+':memo.count} 条新消息 · 回到最新`:'回到最新';
      button.dataset.newCount=String(memo.count);
    };
    // Private chat schedules its own scroll in the next frame.
    if(forceBottom){button.hidden=true;button.dataset.newCount='0';}else paint();
    if(scroller.__webMessagePaint)scroller.removeEventListener('scroll',scroller.__webMessagePaint);
    scroller.__webMessagePaint=paint;scroller.addEventListener('scroll',paint,{passive:true});
    button.onclick=()=>{scroller.scrollTop=scroller.scrollHeight;memo.count=0;paint();};
  },
  reset(){conversations.clear();},
};

export function installWebUx(feedStore){
  const square=document.querySelector('.square-page'),detail=document.querySelector('[data-post-detail]'),list=document.querySelector('.square-feed-column');
  const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='web-post-backdrop';backdrop.hidden=true;backdrop.tabIndex=-1;backdrop.setAttribute('aria-label','关闭帖子详情');square.append(backdrop);
  let openId='',dialogOpen=false,trigger=null;
  const close=()=>feedStore.closePost();backdrop.addEventListener('click',close);
  const update=()=>{
    const visible=Boolean(openId)&&document.querySelector('#app').dataset.view==='square',drawer=visible;
    square.classList.toggle('web-post-open',visible);backdrop.hidden=!drawer;list.inert=drawer;
    document.body.classList.toggle('web-post-drawer-open',drawer);
    if(drawer){detail.setAttribute('role','dialog');detail.setAttribute('aria-modal','true');detail.setAttribute('aria-label','帖子详情');}
    else{detail.removeAttribute('role');detail.removeAttribute('aria-modal');detail.removeAttribute('aria-label');}
    if(drawer&&!dialogOpen){dialogOpen=true;openDialog(detail,{close,initialFocus:()=>detail.querySelector('[data-close-post]')});}
    else if(!drawer&&dialogOpen){dialogOpen=false;closeDialog(detail);}
  };
  // Store refreshes may replace a focused button. Keep keyboard focus inside
  // the drawer while allowing the report dialog and other overlays to take it.
  new MutationObserver(()=>{
    if(dialogOpen&&document.activeElement===document.body&&!document.querySelector('dialog[open],.modal:not([hidden])'))detail.querySelector('[data-close-post]')?.focus({preventScroll:true});
  }).observe(detail,{childList:true,subtree:true});
  feedStore.subscribe(state=>{
    const refresh=document.querySelector('[data-square-refresh]');refresh.disabled=Boolean(state.loading||state.webPage?.loadingMore);refresh.textContent=state.loading?'正在刷新…':'刷新';
    const previous=openId;openId=String(state.openPostId||'');
    if(openId&&!previous)trigger=document.activeElement;
    update();
    if(previous&&!openId){const target=trigger?.isConnected?trigger:document.querySelector(`.square-post[data-open-post="${CSS.escape(previous)}"]`);target?.focus({preventScroll:true});trigger=null;}
  });
  window.addEventListener('fw:web-view',update);
  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-web-feed-more]')){
      const keyboard=event.detail===0,previous=new Set(feedStore.state.posts.map(post=>String(post.id)));
      feedStore.loadMore().catch(()=>{}).finally(()=>{
        if(!keyboard||document.querySelector('#app').dataset.view!=='square')return;
        const next=[...document.querySelectorAll('.square-post')].find(card=>!previous.has(card.dataset.openPost));
        (next||document.querySelector('[data-web-feed-more]')||document.querySelector('.web-feed-footer'))?.focus();
      });
    }
  });
  const top=document.createElement('button');top.type='button';top.className='secondary web-back-top';top.dataset.webBackTop='';top.textContent='↑ 回到顶部';top.hidden=true;document.body.append(top);
  const paintTop=()=>{top.hidden=document.querySelector('#app').dataset.view!=='square'||window.scrollY<700||Boolean(openId);};
  window.addEventListener('scroll',paintTop,{passive:true});window.addEventListener('fw:web-view',paintTop);feedStore.subscribe(paintTop);
  top.onclick=()=>{window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});document.querySelector('.web-square-tabs button')?.focus({preventScroll:true});};
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&openId&&!dialogOpen&&!document.querySelector('dialog[open],.modal:not([hidden])')){event.preventDefault();close();return;}
    const card=event.target.closest?.('.square-post');
    if(card&&event.target===card&&['Enter',' '].includes(event.key)){event.preventDefault();feedStore.openPost(card.dataset.openPost);}
    if(event.key==='Escape'){const menu=document.querySelector('.web-action-menu[open]');if(menu){menu.open=false;menu.querySelector('summary').focus();}}
  });
  document.addEventListener('click',event=>{
    const summary=event.target.closest?.('.web-action-menu>summary');if(summary)placeMenu(summary.closest('details'));
    const report=event.target.closest?.('.web-action-menu [data-review-report]');
    if(report){const menu=report.closest('details');menu.querySelector('summary').focus({preventScroll:true});menu.open=false;}
    for(const menu of document.querySelectorAll('.web-action-menu[open]'))if(!menu.contains(event.target))menu.open=false;
  },true);
  document.addEventListener('toggle',event=>{
    const menu=event.target;if(!menu.matches?.('.web-action-menu')||!menu.open)return;
    for(const other of document.querySelectorAll('.web-action-menu[open]'))if(other!==menu)other.open=false;
    placeMenu(menu);
  },true);
  document.addEventListener('scroll',event=>{if(!event.target.closest?.('.web-action-menu-panel'))for(const menu of document.querySelectorAll('.web-action-menu[open]'))menu.open=false;},true);
}
