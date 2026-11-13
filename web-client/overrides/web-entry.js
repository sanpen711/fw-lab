import {authStore} from './auth-store.js';
import {feedStore} from './feed-store.js';
import {installWebNavigation} from './web-navigation.js';
import {installWebUx} from './web-ux.js';
import {webAccess} from './web-access.js';
import {webRecovery} from './web-password-recovery.js';

const paths={home:'index.html',square:'square.html',rooms:'rooms.html',chatrooms:'chatrooms.html',play:'play.html',games:'games.html',buddy:'buddy.html',compose:'compose.html',archive:'archive.html',settings:'settings.html',activities:'activities.html',announcements:'announcements.html',rules:'rules.html',moderation:'moderation.html'};
const aliases={'bird.html':'chatrooms','echo.html':'echo','admin.html':'moderation'};
const names={home:'首页',square:'精神广场',rooms:'学术研讨',chatrooms:'闲聊房间',play:'下班开黑',games:'小游戏',buddy:'搭子',compose:'发牢骚',archive:'档案',settings:'设置',activities:'活动',announcements:'公告',rules:'入馆须知',moderation:'处理公告'};
const descriptions={square:'随时吐槽，围观日常。把想说的话留在这里。',rooms:'分享一个课题，看看大家怎么选。',chatrooms:'找个房间聊聊，让话题慢慢展开。',play:'下班以后，找队友一起开黑。',games:'休息一下，玩点轻松的。',buddy:'联系你的搭子，继续没聊完的话题。',compose:'文字、图片、视频和我的表情，发布到精神广场。',archive:'自动整理精神广场里的点赞数据。',settings:'管理个人资料和当前浏览器。',activities:'查看研究所的各项活动与参与方式。',announcements:'研究所的新消息，都在这里。'};
let current='home',identity=null;
function pageHeading(view,mode){
  const intro=document.querySelector('[data-web-page-intro]');
  intro.hidden=!webAccess.allow(view,{mode})||view==='home'||['rules','moderation'].includes(view);
  const title=view==='square'&&mode==='echo'?'回声':(names[view]||'回声');
  document.querySelector('#web-main').setAttribute('aria-label',title);
  document.querySelector('[data-web-page-description]').textContent=descriptions[view]||'';
  document.querySelectorAll('.web-nav [data-nav],.web-nav [data-align-nav]').forEach(node=>{
    const navView=['activities','announcements'].includes(view)?'home':view;
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
const protectedClicks='[data-nav="compose"],[data-poll-create-toggle],[data-poll-vote],[data-react],[data-square-mine-toggle],[data-square-echo-toggle],[data-echo-mark-all],[data-party-create-toggle],[data-party-apply],[data-room-create],[data-room-join],[data-profile-add],[data-profile-block],[data-profile-unblock],[data-profile-report],[data-fw-report-post],[data-report-post],[data-report-comment],[data-comment-reply],[data-reply-comment],[data-reply-post],[data-feedback-open]';
document.addEventListener('click',event=>{
  if(signed())return;
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
  if(signed())return;if(event.target.closest('[data-account-modal],[data-web-password-recovery]'))return;
  event.preventDefault();event.stopImmediatePropagation();login();
},true);
authStore.client.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY')queueMicrotask(()=>webRecovery.acceptSession(session));});

await import('./app.js');
await import('./alignment-nav-fix.js');
await import('./feature-alignment.js');
await import('./game-center.js');
webRecovery.install();

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

navigation.apply({keepMenu:true});
