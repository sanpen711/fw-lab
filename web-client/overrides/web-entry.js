import {authStore} from './auth-store.js';
import {feedStore} from './feed-store.js';
import {installWebNavigation} from './web-navigation.js';
import {installWebUx} from './web-ux.js';
import {webAccess} from './web-access.js';

const paths={home:'index.html',square:'square.html',rooms:'rooms.html',chatrooms:'chatrooms.html',play:'play.html',games:'games.html',buddy:'buddy.html',compose:'compose.html',membership:'membership.html',shop:'shop.html',archive:'archive.html',settings:'settings.html',activities:'activities.html',announcements:'announcements.html',rules:'rules.html',moderation:'moderation.html'};
const aliases={'bird.html':'chatrooms','echo.html':'echo','admin.html':'moderation'};
const names={home:'首页',square:'精神广场',rooms:'学术研讨',chatrooms:'闲聊房间',play:'下班开黑',games:'小游戏',buddy:'搭子',compose:'发牢骚',membership:'会员',shop:'周边商城',archive:'档案',settings:'设置',activities:'活动',announcements:'公告',rules:'入馆须知',moderation:'处理公告'};
const descriptions={square:'随时吐槽，围观日常。把想说的话留在这里。',rooms:'分享一个课题，看看大家怎么选。',chatrooms:'找个房间聊聊，让话题慢慢展开。',play:'下班以后，找队友一起开黑。',games:'休息一下，玩点轻松的。',buddy:'联系你的搭子，继续没聊完的话题。',compose:'文字、图片、视频和我的表情，发布到精神广场。',membership:'查看会员权益与装扮。固定期限，不会自动续费。',shop:'研究所的日常，也可以带回家。',archive:'自动整理精神广场里的点赞数据。',settings:'管理个人资料和当前浏览器。',activities:'查看研究所的各项活动与参与方式。',announcements:'研究所的新消息，都在这里。'};
let current='home',identity=null;
function pageHeading(view,mode){
  const intro=document.querySelector('[data-web-page-intro]');
  intro.hidden=!webAccess.allow(view,{mode})||view==='home'||['rules','moderation'].includes(view);
  const title=view==='square'&&mode==='echo'?'回声':(names[view]||'回声');
  document.querySelector('#web-main').setAttribute('aria-label',title);
  document.querySelector('[data-web-page-description]').textContent=descriptions[view]||'';
  document.querySelectorAll('.web-nav [data-nav],.web-nav [data-align-nav]').forEach(node=>{
    const navView=['activities','announcements'].includes(view)?'home':view==='shop'?'membership':view;
    const active=(node.dataset.nav||node.dataset.alignNav)===navView;node.classList.toggle('active',active);
    if(active)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');
  });
}
// Navigation identifies the page; retain only descriptions and feature actions.
document.querySelectorAll('.section-heading').forEach(heading=>{
  const copy=heading.querySelector(':scope > div:first-child');
  if(copy?.querySelector('h1')){copy.classList.add('web-heading-copy');heading.classList.add('web-feature-toolbar');if(!heading.querySelector('button'))heading.classList.add('web-empty-toolbar');}
});
const signed=webAccess.signed;
function login(){webAccess.request();}
function reservePaymentWindow(){
  const previous=window.__FW_WEB_PAYMENT_WINDOW__;if(previous&&!previous.closed)previous.close();
  const popup=window.open('about:blank','_blank');window.__FW_WEB_PAYMENT_WINDOW__=popup;
  if(!popup)return;popup.opener=null;popup.document.title='正在连接支付宝';popup.document.body.textContent='正在确认订单，请稍候…';
  setTimeout(()=>{if(window.__FW_WEB_PAYMENT_WINDOW__===popup){popup.close();window.__FW_WEB_PAYMENT_WINDOW__=null;}},20000);
}
const protectedClicks='[data-nav="compose"],[data-poll-create-toggle],[data-poll-vote],[data-react],[data-square-mine-toggle],[data-square-echo-toggle],[data-echo-mark-all],[data-party-create-toggle],[data-party-apply],[data-room-create],[data-room-join],[data-membership-purchase],[data-membership-tab="purchase"],[data-membership-tab="orders"],[data-shop-view="orders"],[data-profile-add],[data-profile-block],[data-profile-unblock],[data-profile-report],[data-fw-report-post],[data-report-post],[data-report-comment],[data-comment-reply],[data-reply-comment],[data-reply-post],[data-feedback-open]';
document.addEventListener('click',event=>{
  if(signed()){if(event.target.closest('[data-payment-create],[data-payment-resume],[data-payment-open],[data-shop-resume]'))reservePaymentWindow();return;}
  const nav=event.target.closest('[data-nav],[data-align-nav]');const view=nav?.dataset.nav||nav?.dataset.alignNav;
  const site=event.target.closest('[data-site-open],[data-site-target]');
  const comment=event.target.closest('.post-comment-button');
  const button=event.target.closest(protectedClicks+', [data-review-report], [data-profile-user], [data-profile-anonymous]');
  if(nav&&!webAccess.allow(view)||site||comment||button){
    event.preventDefault();event.stopImmediatePropagation();
    if(nav&&!webAccess.allow(view))webAccess.request(view);
    else if(site)webAccess.request(site.dataset.siteTarget||site.dataset.siteKind,{item:site.dataset.siteOpen||''});
    else if(button?.hasAttribute('data-square-mine-toggle'))webAccess.request('square',{mode:'mine'});
    else if(button?.hasAttribute('data-square-echo-toggle'))webAccess.request('square',{mode:'echo'});
    else if(comment)webAccess.request('square',{post:comment.dataset.openPost});
    else webAccess.request();
  }else if(nav||event.target.closest('[data-open-post],[data-close-post]'))webAccess.clearPending();
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

const guestGate=document.createElement('section');guestGate.className='web-guest-gate';guestGate.dataset.webGuestGate='';guestGate.hidden=true;
guestGate.setAttribute('aria-labelledby','web-guest-gate-title');
guestGate.innerHTML='<h2 id="web-guest-gate-title">注册或登录后即可使用</h2><button type="button" class="primary" data-open-account>注册 / 登录</button>';
document.querySelector('#web-main').append(guestGate);
function guestPanels(){
  const locked=!webAccess.allow(current,{mode:window.__FW_WEB_APP__.state().mode});
  document.body.classList.toggle('web-section-locked',locked);guestGate.hidden=!locked;
  document.body.classList.toggle('is-guest',!signed());
  document.querySelector('[data-open-account]').setAttribute('aria-label',signed()?'账号菜单':'登录或注册');
  if(!signed())document.querySelector('[data-settings-profile]').reset();
}
// Feature controls share one compact bar on the website.
const rooms=document.querySelector('.rooms-page'),pollActions=rooms.querySelector('.section-actions'),filters=rooms.querySelector('.poll-filters');
filters.setAttribute('role','group');filters.setAttribute('aria-label','课题筛选');
for(const [value,label] of [['mine','我发起的'],['voted','我参与的']]){const button=document.createElement('button');button.type='button';button.dataset.pollFilter=value;button.textContent=label;button.hidden=!signed();filters.append(button);}
const pollBar=document.createElement('div');pollBar.className='web-poll-toolbar';pollBar.append(filters,pollActions);rooms.querySelector('.section-heading').remove();rooms.prepend(pollBar);
const membershipTools=document.querySelector('.membership-page-heading .section-actions');
const memberHost=document.querySelector('[data-membership-content]');
function placeMembershipTools(){const tabs=memberHost.querySelector('.membership-tabs');if(tabs&&!tabs.contains(membershipTools))tabs.append(membershipTools);}
document.querySelector('.membership-page-heading').remove();placeMembershipTools();
new MutationObserver(placeMembershipTools).observe(memberHost,{childList:true});
installWebUx(feedStore);
const navigation=installWebNavigation({paths,aliases,onView(view,mode){current=view;guestPanels();pageHeading(view,mode);document.title=`${names[view]||'回声'}｜F.w 研究所`;}});
// Keep navigation clicked while the feature modules were still loading.
const waiting=webAccess.peekPending();
if(waiting&&!webAccess.allow(waiting.view,waiting)){const url=navigation.address(waiting.view,waiting);if(url.href!==location.href)history.pushState({view:waiting.view},'',url);}
function resume(){const target=webAccess.takePending();if(target){current=target.view;const url=navigation.address(current,target);if(url.href!==location.href)history.pushState({view:current},'',url);}navigation.apply({keepMenu:true});}
window.addEventListener('fw:web-resume',()=>{if(signed())resume();});
authStore.subscribe(state=>{
  if(!state.ready)return;const next=signed()?state.user.id:'guest';if(identity===next)return;
  identity=next;queueMicrotask(()=>{if(signed())resume();else navigation.apply({keepMenu:true});});
});

// Recovery links are consumed by Supabase; the password form stays separate from
// sign-in and requires the verified recovery session before updating a password.
function showRecovery(){
  let modal=document.querySelector('[data-web-password-recovery]');if(modal)return;
  modal=document.createElement('div');modal.className='web-recovery';modal.dataset.webPasswordRecovery='';modal.innerHTML='<form role="dialog" aria-modal="true" aria-label="设置新密码"><h2>设置新密码</h2><label>新密码<input name="password" type="password" autocomplete="new-password" minlength="6" required></label><label>确认新密码<input name="confirm" type="password" autocomplete="new-password" minlength="6" required></label><p role="status"></p><button class="primary" type="submit">保存新密码</button></form>';document.body.append(modal);
  modal.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const data=new FormData(event.currentTarget),status=modal.querySelector('[role="status"]'),button=modal.querySelector('button');if(data.get('password')!==data.get('confirm')){status.textContent='两次密码不一致。';return;}button.disabled=true;try{const result=await authStore.client.auth.updateUser({password:data.get('password')});if(result.error)throw result.error;modal.remove();}catch(error){status.textContent=error.message||'保存失败，请重试。';}finally{button.disabled=false;}});
}
navigation.apply({keepMenu:true});
