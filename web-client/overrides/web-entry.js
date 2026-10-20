import {authStore} from './auth-store.js';
import {feedStore} from './feed-store.js';

const paths={home:'index.html',square:'square.html',rooms:'rooms.html',chatrooms:'chatrooms.html',play:'play.html',games:'games.html',buddy:'buddy.html',compose:'compose.html',membership:'membership.html',shop:'shop.html',archive:'archive.html',settings:'settings.html',activities:'activities.html',announcements:'announcements.html',rules:'rules.html',moderation:'moderation.html'};
const aliases={'bird.html':'chatrooms','echo.html':'echo','admin.html':'moderation'};
const names={home:'首页',square:'精神广场',rooms:'学术研讨',chatrooms:'闲聊房间',play:'下班开黑',games:'小游戏',buddy:'搭子',compose:'发牢骚',membership:'会员',shop:'周边商城',archive:'档案',settings:'设置',activities:'活动',announcements:'公告',rules:'入馆须知',moderation:'处理公告'};
const descriptions={square:'随时吐槽，围观日常。把想说的话留在这里。',rooms:'分享一个课题，看看大家怎么选。',chatrooms:'找个房间聊聊，让话题慢慢展开。',play:'下班以后，找队友一起开黑。',games:'休息一下，玩点轻松的。',buddy:'联系你的搭子，继续没聊完的话题。',compose:'文字、图片、视频和我的表情，发布到精神广场。',membership:'查看会员权益与装扮。固定期限，不会自动续费。',shop:'研究所的日常，也可以带回家。',archive:'自动整理精神广场里的点赞数据。',settings:'管理个人资料和当前浏览器。',activities:'查看研究所的各项活动与参与方式。',announcements:'研究所的新消息，都在这里。'};
let applying=false,current='home',identity=null,pendingView='';
function pageHeading(view,mode){
  const intro=document.querySelector('[data-web-page-intro]');
  intro.hidden=view==='home'||['rules','moderation'].includes(view);
  const title=view==='square'&&mode==='echo'?'回声':(names[view]||'回声');
  document.querySelector('#web-main').setAttribute('aria-label',title);
  document.querySelector('[data-web-page-description]').textContent=descriptions[view]||'';
  document.querySelectorAll('.web-nav [data-nav]').forEach(node=>{
    const navView=['activities','announcements'].includes(view)?'home':view==='shop'?'membership':view;
    if(node.dataset.nav===navView)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');
  });
}
// Navigation identifies the page; retain only descriptions and feature actions.
document.querySelectorAll('.section-heading').forEach(heading=>{
  const copy=heading.querySelector(':scope > div:first-child');
  if(copy?.querySelector('h1')){copy.classList.add('web-heading-copy');heading.classList.add('web-feature-toolbar');if(!heading.querySelector('button'))heading.classList.add('web-empty-toolbar');}
});
function signed(){const s=authStore.state;return s.ready&&s.user&&!s.user.cached&&!s.user.disabled&&s.session?.user?.id===s.user.id;}
function login(){window.__FW_WEB_APP__?.openAccount();}
function reservePaymentWindow(){
  const previous=window.__FW_WEB_PAYMENT_WINDOW__;if(previous&&!previous.closed)previous.close();
  const popup=window.open('about:blank','_blank');window.__FW_WEB_PAYMENT_WINDOW__=popup;
  if(!popup)return;popup.opener=null;popup.document.title='正在连接支付宝';popup.document.body.textContent='正在确认订单，请稍候…';
  setTimeout(()=>{if(window.__FW_WEB_PAYMENT_WINDOW__===popup){popup.close();window.__FW_WEB_PAYMENT_WINDOW__=null;}},20000);
}
const protectedClicks='[data-nav="compose"],[data-poll-create-toggle],[data-poll-vote],[data-react],[data-square-mine-toggle],[data-square-echo-toggle],[data-echo-mark-all],[data-party-create-toggle],[data-party-apply],[data-room-create],[data-room-join],[data-membership-purchase],[data-membership-tab="purchase"],[data-membership-tab="orders"],[data-shop-view="orders"],[data-profile-add],[data-profile-block],[data-profile-unblock],[data-profile-report],[data-fw-report-post],[data-report-post],[data-report-comment],[data-comment-reply],[data-reply-comment],[data-reply-post],[data-feedback-open]';
document.addEventListener('click',event=>{
  if(signed()){if(event.target.closest('[data-payment-create],[data-payment-resume],[data-payment-open],[data-shop-resume]'))reservePaymentWindow();return;}const button=event.target.closest(protectedClicks);if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();pendingView=button.dataset.nav||'';login();
},true);
document.addEventListener('submit',event=>{
  if(signed()){if(event.target.matches('[data-shop-checkout]'))reservePaymentWindow();return;}if(event.target.closest('[data-account-modal],[data-web-password-recovery]'))return;
  event.preventDefault();event.stopImmediatePropagation();login();
},true);
authStore.client.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')queueMicrotask(showRecovery);});

await import('./app.js');
await import('./alignment-nav-fix.js');
await import('./feature-alignment.js');
await import('./game-center.js');

function route(){
  const file=location.pathname.split('/').pop()||'index.html';
  if(file==='square.html'&&new URLSearchParams(location.search).get('tab')==='echo')return'echo';
  return aliases[file]||Object.keys(paths).find(key=>paths[key]===file)||'home';
}
function address(view,mode){
  const url=new URL(location.href);url.pathname='/'+(paths[view]||paths.home);
  const desktop=url.searchParams.get('desktop');url.search='';if(desktop==='1')url.searchParams.set('desktop','1');
  if(view==='square'&&mode==='echo')url.searchParams.set('tab','echo');
  url.hash='';return url;
}
function guestPanels(){
  document.body.classList.toggle('is-guest',!signed());
  document.querySelector('[data-open-account]').setAttribute('aria-label',signed()?'账号菜单':'登录或注册');
  for(const view of ['buddy','chatrooms']){
    const panel=document.querySelector(`[data-view-panel="${view}"]`);panel.toggleAttribute('data-web-guest',!signed());
    let card=panel.querySelector('.web-guest-card');if(!card){card=document.createElement('div');card.className='web-guest-card';card.innerHTML=`<h1>${names[view]}</h1><p>${view==='buddy'?'登录后查看搭子、处理申请和发送私聊。':'登录后浏览闲聊房间、加入聊天或创建自己的房间。'}</p><button class="primary" type="button" data-open-account>登录 / 注册</button>`;panel.append(card);}
    card.hidden=Boolean(signed());
  }
  const form=document.querySelector('[data-settings-profile]');let hint=document.querySelector('[data-web-profile-login]');
  if(!hint){hint=document.createElement('p');hint.dataset.webProfileLogin='';hint.innerHTML='登录后可以修改头像和昵称。 <button class="secondary compact" type="button" data-open-account>登录 / 注册</button>';form.before(hint);}hint.hidden=Boolean(signed());
  if(!signed())form.reset();
}
function apply({keepMenu=false}={}){
  const more=document.querySelector('[data-sidebar-more-wrap]'),menuOpen=keepMenu&&more.classList.contains('open');
  applying=true;const requested=route();current=requested;
  const post=new URLSearchParams(location.search).get('post');if(current==='square'&&post)sessionStorage.setItem('fw:desktop:v11:pending-post',JSON.stringify({id:post}));
  window.__FW_WEB_APP__.openView(requested);current=requested;guestPanels();pageHeading(current);document.title=`${names[current]||'回声'}｜F.w 研究所`;applying=false;
  if(menuOpen){more.classList.add('open');document.querySelector('[data-sidebar-more-toggle]').setAttribute('aria-expanded','true');}
}
window.addEventListener('fw:web-view',event=>{
  const {view,mode}=event.detail;const changed=current!==view;current=view;guestPanels();pageHeading(view,mode);if(changed)window.scrollTo({top:0,behavior:'instant'});
  if(!applying){const url=address(view,mode);if(url.href!==location.href)history.pushState({view},'',url);document.title=`${names[view]||'F.w 研究所'}｜F.w 研究所`;}
});
window.addEventListener('popstate',apply);
document.addEventListener('click',event=>{
  const tab=event.target.closest('[data-membership-tab]');if(tab){current=tab.dataset.membershipTab==='shop'?'shop':'membership';pageHeading(current);const url=address(current);if(url.href!==location.href)history.pushState({view:current},'',url);document.title=`${names[current]}｜F.w 研究所`;}

});
feedStore.subscribe(state=>{
  if(!['square','echo'].includes(current)||applying)return;
  const url=new URL(location.href),id=String(state.openPostId||'');
  if(id&&url.searchParams.get('post')!==id){url.searchParams.set('post',id);history.replaceState(history.state,'',url);}
});
authStore.subscribe(state=>{
  if(!state.ready)return;const next=signed()?state.user.id:'guest';if(identity===next)return;
  identity=next;queueMicrotask(()=>{if(signed()&&pendingView){current=pendingView;pendingView='';history.pushState({view:current},'',address(current));}apply({keepMenu:true});});
});

// Recovery links are consumed by Supabase; the password form stays separate from
// sign-in and requires the verified recovery session before updating a password.
function showRecovery(){
  let modal=document.querySelector('[data-web-password-recovery]');if(modal)return;
  modal=document.createElement('div');modal.className='web-recovery';modal.dataset.webPasswordRecovery='';modal.innerHTML='<form role="dialog" aria-modal="true" aria-label="设置新密码"><h2>设置新密码</h2><label>新密码<input name="password" type="password" autocomplete="new-password" minlength="6" required></label><label>确认新密码<input name="confirm" type="password" autocomplete="new-password" minlength="6" required></label><p role="status"></p><button class="primary" type="submit">保存新密码</button></form>';document.body.append(modal);
  modal.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const data=new FormData(event.currentTarget),status=modal.querySelector('[role="status"]'),button=modal.querySelector('button');if(data.get('password')!==data.get('confirm')){status.textContent='两次密码不一致。';return;}button.disabled=true;try{const result=await authStore.client.auth.updateUser({password:data.get('password')});if(result.error)throw result.error;modal.remove();}catch(error){status.textContent=error.message||'保存失败，请重试。';}finally{button.disabled=false;}});
}
apply({keepMenu:true});
