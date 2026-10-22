import {feedStore} from './feed-store.js';
import {webAccess} from './web-access.js';

const scrollSelectors=['[data-square-feed]','[data-square-echo-panel]','.detail-content-scroll','[data-room-list]','[data-room-messages]','[data-chat-messages]','[data-buddy-list]','.party-list'];
const newKey=()=>crypto.randomUUID();
export function installWebNavigation({paths,aliases,onView}){
  let applying=true,pending=null,queued=false,generation=0,restoreTimer=null,restoring=false,saveTimer=null;
  const app=()=>window.__FW_WEB_APP__;
  const readRoute=()=>{
    const url=new URL(location.href),file=url.pathname.split('/').pop()||'index.html';
    let view=aliases[file]||Object.keys(paths).find(key=>paths[key]===file)||'home';
    const p=url.searchParams;if(view==='echo')view='square';
    return {view,tab:p.get('tab')||'benefits',mode:file==='echo.html'?'echo':p.get('tab')||'feed',post:p.get('post')||'',item:p.get('item')||'',filter:p.get('filter')||'all'};
  };
  function address(view,options={}){
    const url=new URL(location.href),desktop=url.searchParams.get('desktop');url.pathname='/'+(paths[view]||paths.home);url.search='';url.hash='';
    if(desktop==='1')url.searchParams.set('desktop','1');
    if(view==='square'&&['echo','mine'].includes(options.mode))url.searchParams.set('tab',options.mode);
    if(view==='membership'&&['appearance','orders','purchase'].includes(options.tab))url.searchParams.set('tab',options.tab);
    if(view==='square'&&options.post)url.searchParams.set('post',options.post);
    if(['activities','announcements'].includes(view)&&options.item)url.searchParams.set('item',options.item);
    if(view==='rooms'&&options.filter&&options.filter!=='all')url.searchParams.set('filter',options.filter);
    return url;
  }
  function save(){
    clearTimeout(saveTimer);saveTimer=null;
    if(applying||restoring)return;
    const scroll={y:window.scrollY};
    for(const selector of scrollSelectors){const node=document.querySelector(selector);if(node?.getClientRects().length)scroll[selector]=node.scrollTop;}
    history.replaceState({...history.state,web:{...history.state?.web,key:history.state?.web?.key||newKey(),scroll}},'',location.href);
  }
  function stopRestore(){clearTimeout(restoreTimer);restoring=false;}
  function restore(scroll={y:0}){
    stopRestore();restoring=true;const until=performance.now()+1800;
    const paint=()=>{
      if(!restoring)return;
      window.scrollTo({top:scroll.y||0,behavior:'instant'});
      for(const selector of scrollSelectors){const node=document.querySelector(selector);if(node&&scroll[selector]!=null)node.scrollTop=scroll[selector];}
      const done=Math.abs(window.scrollY-(scroll.y||0))<2&&scrollSelectors.every(selector=>scroll[selector]==null||Math.abs((document.querySelector(selector)?.scrollTop||0)-scroll[selector])<2);
      if(!done&&performance.now()<until)restoreTimer=setTimeout(paint,80);else restoring=false;
    };
    paint();
  }
  function show(route){onView(route.view,route.mode);}
  function commit(view,extra={}){
    if(applying)return;
    if(!webAccess.allow(view,{mode:extra.mode||app().state().mode})){webAccess.request(view,extra);return;}
    const state=app().state();if(view==='membership'&&state.tab==='shop')view='shop';
    const route={view,tab:state.tab,mode:state.mode,filter:state.filter,...extra};
    if(view==='square')route.post=String(feedStore.state.openPostId||'');
    const url=address(view,route),previous=readRoute();
    if(url.href!==location.href){
      stopRestore();
      const samePostLayer=view==='square'&&previous.view==='square'&&Boolean(previous.post)&&Boolean(route.post);
      const web={key:newKey(),scroll:{y:0},postEntry:view==='square'&&Boolean(route.post)&&(history.state?.web?.postEntry||previous.view==='square'&&!previous.post),contentEntry:['activities','announcements'].includes(view)&&Boolean(route.item)&&(history.state?.web?.contentEntry||previous.view===view&&!previous.item)};
      if(samePostLayer)history.replaceState({...history.state,web:{...history.state?.web,postEntry:history.state?.web?.postEntry}},'',url);
      else history.pushState({web},'',url);
      if(previous.view!==view||previous.tab!==route.tab||previous.filter!==route.filter)window.scrollTo({top:0,behavior:'instant'});
    }
    show(route);
  }
  function queue(view,extra={}){
    if(applying)return;
    pending={view,...extra};if(queued)return;queued=true;
    queueMicrotask(()=>{queued=false;const next=pending;pending=null;if(next){const {view,...extra}=next;commit(view,extra);}});
  }
  async function apply({keepMenu=false,resetScroll=false}={}){
    const token=++generation;applying=true;pending=null;stopRestore();
    await webAccess.ready();if(token!==generation)return;
    let route=readRoute();let scroll=resetScroll?{y:0}:history.state?.web?.scroll||{y:0};
    if(!webAccess.allow(route.view,route)){
      webAccess.request(route.view,route);route={view:'home',mode:'feed'};scroll={y:0};
      history.replaceState({web:{key:newKey(),scroll}},'',address('home'));
    }
    const more=document.querySelector('[data-sidebar-more-wrap]'),menuOpen=keepMenu&&more.classList.contains('open');
    feedStore.closePost();
    app().openView(route.view,route);show(route);
    if(menuOpen){more.classList.add('open');document.querySelector('[data-sidebar-more-toggle]').setAttribute('aria-expanded','true');}
    if(route.view==='square'&&route.post){
      try{await app().openPost(route.post);}catch{if(token===generation){const url=address('square',{mode:route.mode});history.replaceState(history.state,'',url);}}
    }
    if(token!==generation)return;
    applying=false;
    if(!history.state?.web)history.replaceState({...history.state,web:{key:newKey(),scroll}},'',location.href);
    restore(scroll);
  }
  history.scrollRestoration='manual';
  window.addEventListener('fw:web-before-view',save);
  document.addEventListener('scroll',()=>{if(!saveTimer)saveTimer=setTimeout(save,120);},{capture:true,passive:true});
  for(const type of ['wheel','pointerdown','keydown'])document.addEventListener(type,()=>{stopRestore();save();},{capture:true,passive:true});
  document.addEventListener('click',event=>{if(event.target.closest?.('[data-nav],[data-open-post],[data-close-post],[data-membership-tab],[data-poll-filter],[data-site-open],[data-site-back],[data-square-echo-toggle],[data-square-mine-toggle]'))save();},true);
  window.addEventListener('fw:web-view',event=>queue(event.detail.view));
  window.addEventListener('fw:web-membership',()=>queue('membership'));
  window.addEventListener('fw:web-poll-filter',()=>queue('rooms'));
  window.addEventListener('fw:web-square-mode',()=>{if(app().state().view==='square')queue('square');});
  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-membership-tab],[data-membership-purchase],[data-membership-return],[data-payment-resume]'))queue('membership');
    if(event.target.closest?.('[data-poll-filter]'))queue('rooms');
  });
  window.addEventListener('fw:web-content',event=>{
    const {kind,id}=event.detail;
    if(!id&&history.state?.web?.contentEntry){history.back();return;}
    queue(kind,{item:id});
  });
  feedStore.subscribe(state=>{
    if(applying||document.querySelector('#app').dataset.view!=='square')return;
    const id=String(state.openPostId||''),route=readRoute();
    if(!id&&route.post){
      if(history.state?.web?.postEntry){history.back();return;}
      history.replaceState(history.state,'',address('square',{mode:app().state().mode}));show({...route,post:''});return;
    }
    if(id!==route.post)queue('square');
  });
  window.addEventListener('popstate',()=>apply());
  window.addEventListener('pagehide',save);
  return {apply,address,save};
}
