import {authStore} from './auth-store.js';
import {socialStore} from './social-store.js';
import {feedStore} from './feed-store.js';
import {pollStore} from './poll-store.js';
import {birdStore} from './bird-store.js';
import {archiveStore} from './archive-store.js';
import {gamePartyUi} from './game-party-ui.js';
import {homeWidgets} from './home-widgets.js';
import {membershipStore} from './membership-store.js';
import {APP_VERSION} from './config.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>Array.from(document.querySelectorAll(selector));
const routes={
  home:['首页','放下个人素质，享受缺德人生'],compose:['发牢骚','把今天想说的话单独放在这里'],square:['精神广场','匿名说点真话，也听听别人的今天'],rooms:['学术研讨','一本正经地研究不太正经的问题'],bird:['新闻专区','看看研究所里此刻发生了什么'],play:['下班开黑','找到今晚一起玩的队友'],games:['小游戏','不用跳出软件，点开直接玩'],buddy:['搭子','左边选人，右边直接聊天'],membership:['会员中心','查看会员权益、套餐和订单'],archive:['档案','翻一翻被留下来的研究记录']
};
const EMOJIS=[
  ['😀','1f600'],['😁','1f601'],['😂','1f602'],['🤣','1f923'],['😄','1f604'],['😅','1f605'],['😆','1f606'],['😊','1f60a'],['😉','1f609'],['😌','1f60c'],
  ['🥰','1f970'],['😍','1f60d'],['🤩','1f929'],['😘','1f618'],['😋','1f60b'],['😜','1f61c'],['🤪','1f92a'],['😎','1f60e'],['🤓','1f913'],['🧐','1f9d0'],
  ['🤔','1f914'],['😏','1f60f'],['😒','1f612'],['🙄','1f644'],['🙃','1f643'],['😬','1f62c'],['🤭','1f92d'],['🫢','1fae2'],['🫣','1fae3'],['🤫','1f92b'],
  ['😐','1f610'],['😮','1f62e'],['😲','1f632'],['😳','1f633'],['😔','1f614'],['😢','1f622'],['😭','1f62d'],['🥺','1f97a'],['😩','1f629'],['😫','1f62b'],
  ['🥱','1f971'],['😴','1f634'],['😷','1f637'],['😤','1f624'],['😡','1f621'],['🤯','1f92f'],['😱','1f631'],['🫠','1fae0'],['🫡','1fae1'],['🤡','1f921'],
  ['👍','1f44d'],['👎','1f44e'],['👌','1f44c'],['✌️','270c'],['🤞','1f91e'],['🤟','1f91f'],['🤘','1f918'],['🤙','1f919'],['👈','1f448'],['👉','1f449'],
  ['👆','1f446'],['👇','1f447'],['👋','1f44b'],['👏','1f44f'],['🙌','1f64c'],['🙏','1f64f'],['💪','1f4aa'],['🤝','1f91d'],['🫶','1faf6'],
  ['❤️','2764'],['💕','1f495'],['💖','1f496'],['💔','1f494'],['💯','1f4af'],['🔥','1f525'],['✨','2728'],['⭐','2b50'],['🌟','1f31f'],['💥','1f4a5'],
  ['🎉','1f389'],['🎁','1f381'],['🏆','1f3c6'],['🚀','1f680'],['☕','2615'],['🍓','1f353'],['🍉','1f349'],['🐶','1f436'],['🐱','1f431'],['🐟','1f41f']
];
const RECENT_STICKERS_KEY='fw:desktop:v11:recent-stickers';
let accountState={ready:false,busy:false,user:null};
let socialState=socialStore.state;
let feedState=feedStore.state;
let pollState=pollStore.state;
let birdState=birdStore.state;
let archiveState=archiveStore.state;
let membershipState=membershipStore.state;
let currentAuthView='login';
let currentView='home';
let membershipTab='benefits';
let membershipPlanId='';
let membershipPaymentMethod='wechat';
let squareMode='feed';
let emojiTab='emoji';
let lastChatRenderSignature='';
let socialRenderMemo=null;
let pollFilter='all';
let pollCreateOpen=false;
let birdComposeOpen=false;
let avatarPreviewUrl='';
const birdDraft={title:'',content:'',displayMode:'profile',penName:'',files:[],previews:[]};
const composeDraft={text:'',imageFile:null,imagePreview:'',stickers:new Set(),pickerTab:'emoji'};
const commentDrafts=new Map();

window.__FW_DESKTOP_V11__={version:APP_VERSION,architecture:'local-frontend',contentRequests:0,socialContentRequests:0,realtimeChat:true,pollingTimers:0};

function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function uiIcon(name,className=''){return `<svg class="ui-symbol ${esc(className)}" aria-hidden="true"><use href="/ui-icons.svg#${esc(name)}"></use></svg>`;}
function emojiImage(item,className=''){return `<img class="twemoji ${esc(className)}" src="/emoji/twemoji/${esc(item[1])}.svg" alt="${esc(item[0])}" draggable="false">`;}
function emojiText(value){
  let html=esc(value);
  EMOJIS.slice().sort((a,b)=>b[0].length-a[0].length).forEach(item=>{html=html.split(esc(item[0])).join(emojiImage(item,'inline'));});
  return html.replace(/\n/g,'<br>');
}
function recentStickerUrls(){try{return JSON.parse(localStorage.getItem(RECENT_STICKERS_KEY)||'[]').filter(Boolean).slice(0,12);}catch{return[];}}
function rememberSticker(url){if(!url)return;const next=[url,...recentStickerUrls().filter(item=>item!==url)].slice(0,12);try{localStorage.setItem(RECENT_STICKERS_KEY,JSON.stringify(next));}catch{}}
function sortedStickers(){const recent=recentStickerUrls();return [...(socialState.stickers.rows||[])].sort((a,b)=>{const ai=recent.indexOf(a.image_url);const bi=recent.indexOf(b.image_url);return (ai<0?999:ai)-(bi<0?999:bi);});}
function initials(name){return String(name||'FW').trim().slice(0,2).toUpperCase();}
function avatarHtml(profile,className='social-avatar',options={}){
  const name=profile?.nickname||profile?.name||'研究员';const url=profile?.avatar_url||profile?.avatarUrl||'';const userId=options.userId||profile?.id||profile?.user_id||'';const anonymous=Boolean(options.anonymous);const label=anonymous?(options.anonymousLabel||name):name;
  const interactive=anonymous?` data-profile-anonymous="${esc(label)}" role="button" tabindex="0" aria-label="查看匿名资料说明"`:userId?` data-profile-user="${esc(userId)}" role="button" tabindex="0" aria-label="查看${esc(name)}的资料"`:'';
  return url?`<span class="${className} has-image"${interactive}><img src="${esc(url)}" alt="${esc(name)}"></span>`:`<span class="${className}"${interactive}>${esc(initials(name))}</span>`;
}
function setAvatar(element,user){
  if(!element)return;element.textContent='';element.style.backgroundImage='';
  if(user?.avatarUrl){element.style.backgroundImage=`url("${String(user.avatarUrl).replace(/["\\]/g,'')}")`;element.classList.add('has-image');}
  else{element.textContent=initials(user?.nickname);element.classList.remove('has-image');}
}
function toast(message){const node=$('[data-toast]');node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2800);}
function openLightbox(url){const modal=$('[data-media-lightbox]');const image=$('[data-media-lightbox-image]');if(!modal||!image||!url)return;image.src=url;modal.hidden=false;document.body.classList.add('lightbox-open');}
function closeLightbox(){const modal=$('[data-media-lightbox]');const image=$('[data-media-lightbox-image]');if(!modal||modal.hidden)return;modal.hidden=true;if(image)image.removeAttribute('src');document.body.classList.remove('lightbox-open');}
function setFormStatus(message,error=false){const node=$('[data-form-status]');node.textContent=message||'';node.classList.toggle('error',error);}
function timeText(value){
  if(!value)return'刚刚';const date=new Date(value);if(Number.isNaN(date.getTime()))return'刚刚';const minutes=Math.floor(Math.max(0,Date.now()-date.getTime())/60000);if(minutes<1)return'刚刚';if(minutes<60)return`${minutes}分钟前`;const hours=Math.floor(minutes/60);if(hours<24)return`${hours}小时前`;const days=Math.floor(hours/24);return days<7?`${days}天前`:date.toLocaleDateString('zh-CN');
}
function noticeText(type){return({like:'点赞了你的帖子',comment:'评论了你的帖子',comment_reply:'回复了你的评论',chat_agree:'赞同了你的房间消息',game_party_apply:'申请加入你的开黑房间',game_party_joined:'加入了你的开黑房间',game_party_accepted:'同意了你的开黑申请',game_party_rejected:'处理了你的开黑申请',system:'发送了一条系统通知'})[type]||'给你发来一条回声';}
function previewText(value){return String(value||'对你的低功耗发言产生了回应。').replace(/\[\[FW_USER_STICKER:[A-Za-z0-9+/=]+\]\]/g,'动画表情').replace(/\[\[FW_MEDIA_IMAGE:[A-Za-z0-9+/=]+\]\]/g,'图片').replace(/\[\[FW_MEDIA_VIDEO:[A-Za-z0-9+/=]+\]\]/g,'视频').replace(/\s+/g,' ').trim()||'对你的低功耗发言产生了回应。';}
function decodeSticker(value){const match=String(value||'').trim().match(/^\[\[FW_USER_STICKER:([A-Za-z0-9+/=]+)\]\]$/);if(!match)return'';try{return atob(match[1]);}catch{return'';}}
function safeMediaUrl(encoded){try{const url=new URL(atob(encoded));return['http:','https:'].includes(url.protocol)?url.href:'';}catch{return'';}}
function richContent(value){
  const source=String(value||'');const pattern=/\[\[(FW_MEDIA_IMAGE|FW_USER_STICKER):([A-Za-z0-9+/=]+)\]\]/g;let cursor=0;let match;const text=[];const media=[];
  while((match=pattern.exec(source))){text.push(source.slice(cursor,match.index));const url=safeMediaUrl(match[2]);if(url)media.push(match[1]==='FW_USER_STICKER'?`<img class="rich-sticker" src="${esc(url)}" alt="自定义表情" loading="lazy">`:`<img class="rich-image" src="${esc(url)}" alt="帖子图片，点击查看原图" loading="lazy" data-lightbox-src="${esc(url)}">`);cursor=match.index+match[0].length;}
  text.push(source.slice(cursor));const clean=text.join('').trim();return `${clean?`<div class="rich-text">${emojiText(clean)}</div>`:''}${media.length?`<div class="rich-media">${media.join('')}</div>`:''}`||'<div class="rich-text">（空白记录）</div>';
}

function money(cents){return `¥${(Number(cents||0)/100).toFixed(Number(cents||0)%100?1:0)}`;}
function memberDate(value){if(!value)return'';const date=new Date(value);return Number.isNaN(date.getTime())?'':date.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'});}
function activeMembership(){return membershipStore.isActive(membershipState.membership)?membershipState.membership:null;}
function renderMembershipEntry(){
  const active=activeMembership();const state=$('[data-membership-page-state]');
  if(state)state.textContent=!accountState.user?'未登录':active?'会员有效':'普通研究员';
}
function membershipBenefits(){return [
  ['会员标识','昵称与个人资料展示会员身份'],
  ['专属资料卡','使用更醒目的会员资料卡样式'],
  ['表情扩容','“我的表情”上限由 80 个提升至 160 个'],
  ['组队扩容','可同时创建的组队由 5 个提升至 15 个'],
  ['优先体验','新的小功能与小游戏优先开放']
];}
function orderStatus(value){return({pending:'待支付',paid:'已支付',closed:'已关闭',refunded:'已退款',failed:'支付失败'})[value]||'处理中';}
function renderMembershipContent(){
  const host=$('[data-membership-content]');if(!host)return;renderMembershipEntry();
  const tabs=`<nav class="membership-tabs" aria-label="会员中心栏目"><button type="button" class="${membershipTab==='benefits'?'active':''}" data-membership-tab="benefits">会员权益</button><button type="button" class="${membershipTab==='orders'?'active':''}" data-membership-tab="orders">订单记录</button></nav>`;
  if(membershipState.loading&&!membershipState.loaded){host.innerHTML=`${tabs}<div class="membership-page-scroll"><div class="state-card">正在读取会员信息...</div></div>`;return;}
  const active=activeMembership();const plan=membershipState.plans.find(item=>String(item.id)===String(active?.plan_id));const selected=membershipState.plans.find(item=>String(item.id)===String(membershipPlanId));
  if(membershipTab==='orders'){
    const rows=membershipState.orders.length?membershipState.orders.map(order=>{const item=membershipState.plans.find(planItem=>String(planItem.id)===String(order.plan_id));return `<article class="membership-order"><div><b>${esc(item?.name||'研究所会员')}</b><span>${esc(order.order_no||'订单号生成中')}</span></div><div><strong>${money(order.amount_cents)}</strong><span>${esc(orderStatus(order.status))} · ${esc(memberDate(order.created_at))}</span></div></article>`;}).join(''):`<div class="membership-empty"><b>${accountState.user?'暂无会员订单':'登录后查看订单'}</b><span>${accountState.user?'接入微信、支付宝扫码支付后，订单会保存在这里。':'登录账号后，可在这里查看会员状态和订单记录。'}</span>${accountState.user?'':'<button class="primary compact" type="button" data-open-account>登录账号</button>'}</div>`;
    host.innerHTML=`${tabs}<div class="membership-page-scroll"><section class="membership-orders-panel"><div class="membership-order-head"><div><h3>订单记录</h3><p>只显示当前账号的会员订单。</p></div></div><div class="membership-order-list">${rows}</div>${membershipState.error?`<p class="membership-sync-note">${esc(membershipState.error)}</p>`:''}</section></div>`;return;
  }
  const status=`<section class="membership-status ${active?'active':''}"><div><small>当前状态</small><h3>${!accountState.user?'尚未登录':active?'研究所会员':'普通研究员'}</h3><p>${!accountState.user?'登录后查看会员状态和订单记录。':active?`${esc(plan?.name||'会员')} · ${esc(memberDate(active.expires_at))} 到期`:'当前可以正常使用全部基础功能。'}</p></div>${accountState.user?`<span>${active?'已开通':'未开通'}</span>`:'<button class="membership-login" type="button" data-open-account>登录账号</button>'}</section>`;
  const benefits=`<section class="membership-section"><header><h3>会员权益</h3><span>基础功能不会因未开通会员而受限</span></header><div class="membership-benefits">${membershipBenefits().map(([title,copy],index)=>`<article><i>${String(index+1).padStart(2,'0')}</i><div><b>${esc(title)}</b><span>${esc(copy)}</span></div></article>`).join('')}</div></section>`;
  const plans=`<section class="membership-section"><header><h3>${active?'续费会员':'选择会员时长'}</h3><span>一次购买固定时长，不会自动扣费</span></header><div class="membership-plans">${membershipState.plans.map(item=>`<article class="membership-plan ${item.is_recommended?'recommended':''} ${String(item.id)===String(membershipPlanId)?'selected':''}">${String(item.id)==='monthly'?'<em>限时</em>':item.is_recommended?'<em>推荐</em>':''}<small>${Number(item.duration_months)} 个月</small><h4>${esc(item.name)}</h4><div><strong>${money(item.price_cents)}</strong>${item.compare_at_price_cents?`<del>${money(item.compare_at_price_cents)}</del>`:''}</div><button class="${String(item.id)===String(membershipPlanId)?'primary':'secondary'} compact" type="button" data-membership-plan="${esc(item.id)}">${String(item.id)===String(membershipPlanId)?'已选择':'选择套餐'}</button></article>`).join('')}</div></section>`;
  const checkout=selected?`<section class="membership-checkout"><header><div><small>已选择</small><h3>${esc(selected.name)} · ${money(selected.price_cents)}</h3></div><button type="button" data-membership-cancel-checkout>重新选择</button></header><div class="membership-payment-methods"><button type="button" class="${membershipPaymentMethod==='wechat'?'active':''}" data-membership-payment="wechat">微信支付</button><button type="button" class="${membershipPaymentMethod==='alipay'?'active':''}" data-membership-payment="alipay">支付宝</button></div><div class="membership-qr-placeholder"><span>${membershipPaymentMethod==='wechat'?'微信':'支付宝'}</span><div><b>支付接口待接入</b><p>正式接入后，这里会显示扫码付款二维码。</p></div></div><p class="membership-payment-note">当前页面不会创建订单，也不会产生扣款。</p></section>`:'';
  host.innerHTML=`${tabs}<div class="membership-page-scroll"><div class="membership-page-grid"><main class="membership-main-stack">${status}${plans}${checkout}${membershipState.error?`<p class="membership-sync-note">${esc(membershipState.error)}</p>`:''}</main><aside class="membership-benefit-aside">${benefits}</aside></div></div>`;
}
function renderMembership(next=membershipState){membershipState=next;renderMembershipContent();}
function renderAccount(next){
  const previousUserId=String(accountState.user?.id||'');accountState=next;const user=next.user;
  $('[data-account-label]').textContent=user?user.nickname:(next.ready?'注册 / 登录':'正在连接…');
  setAvatar($('[data-account-avatar]'),user);setAvatar($('[data-profile-avatar]'),user);
  $('[data-profile-name]').textContent=user?.nickname||'研究员';$('[data-profile-email]').textContent=user?.email||'';
  const profile=$('[data-auth-view="profile"]');if(profile&&user){profile.elements.labCode.value=user.labCode||'';profile.elements.nickname.value=user.nickname||'';}
  $$('[data-account-modal] button, [data-account-modal] input').forEach(node=>{
    if(node.matches('[data-close-account]'))return;
    const fixedProfileCode=node.name==='labCode'&&Boolean(node.closest('[data-auth-view="profile"]'));
    node.disabled=fixedProfileCode||Boolean(next.busy);
  });
  if(next.ready&&previousUserId!==String(user?.id||''))renderSocial();
  if(next.ready)renderFeed();
  if(next.ready)renderPolls();
  if(next.ready)renderBird();
  if(next.ready)renderArchive();
  renderMembershipEntry();
}

function showAuth(view){
  currentAuthView=view;const labels={login:['账号登录','输入邮箱和密码，进入研究所。'],register:['注册账号','填写信息后，我们会向邮箱发送验证码。'],verify:['验证邮箱','输入邮件中的验证码，完成注册。'],reset:['找回密码','输入邮箱，接收找回密码邮件。'],profile:['个人资料','修改昵称和头像，账号数据继续与网页、手机端共用。']};
  const [title,copy]=labels[view]||labels.login;$('[data-account-title]').textContent=title;$('[data-account-copy]').textContent=copy;
  $$('[data-auth-view]').forEach(panel=>panel.hidden=panel.dataset.authView!==view);setFormStatus('');if(view==='profile'){if(avatarPreviewUrl){URL.revokeObjectURL(avatarPreviewUrl);avatarPreviewUrl='';}const input=$('[data-auth-view="profile"] input[name="avatar"]');if(input)input.value='';setAvatar($('[data-profile-avatar]'),accountState.user);}requestAnimationFrame(()=>{$(`[data-auth-view="${view}"] input:not([disabled])`)?.focus();});
}
function openAccount(){const modal=$('[data-account-modal]');modal.hidden=false;document.body.classList.add('modal-open');showAuth(accountState.user?'profile':'login');}
function closeAccount(){$('[data-account-modal]').hidden=true;document.body.classList.remove('modal-open');setFormStatus('');}
function closeSidebarMore(){const wrap=$('[data-sidebar-more-wrap]');wrap?.classList.remove('open');$('[data-sidebar-more-toggle]')?.setAttribute('aria-expanded','false');}
function bindSidebarMore(){document.addEventListener('click',event=>{const toggle=event.target.closest('[data-sidebar-more-toggle]');if(toggle){const wrap=toggle.closest('[data-sidebar-more-wrap]');const open=!wrap.classList.contains('open');closeSidebarMore();wrap.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));return;}if(!event.target.closest('[data-sidebar-more-wrap]'))closeSidebarMore();},true);}

function navigate(view){
  closeSidebarMore();
  if(view==='echo'){view='square';squareMode='echo';}
  else if(view==='square')squareMode='feed';
  const route=routes[view]||routes.home;currentView=view;$('#app').dataset.view=view;
  $$('[data-nav]').forEach(node=>node.classList.toggle('active',node.dataset.nav===view));
  const localViews=['home','compose','square','rooms','bird','play','games','buddy','membership','archive'];
  $$('[data-view-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.viewPanel===(localViews.includes(view)?view:'pending')));
  if(!localViews.includes(view)){$('[data-pending-title]').textContent=route[0]+'正在迁移';$('[data-pending-copy]').textContent=`${route[0]}会直接接入共用数据库，不再加载网页版对应页面。当前 1.0.5 的原有功能不受影响。`;}
  $('[data-emoji-panel]').hidden=true;
  if(view!=='buddy')socialStore.closeChat();
  if(view!=='square')feedStore.deactivate();
  if(view!=='rooms')pollStore.deactivate();
  if(view!=='bird')birdStore.deactivate();
  if(view!=='play')gamePartyUi.deactivate();
  if(view!=='games')window.__FW_GAMES__?.close();
  if(view==='buddy')socialStore.loadBuddy();
  if(view==='compose'){socialStore.loadStickers().catch(()=>{});renderFeed();}
  if(view==='square'){
    renderSquareMode();
    feedStore.activate().then(()=>{
      const raw=sessionStorage.getItem('fw:desktop:v11:pending-post');if(!raw)return;
      sessionStorage.removeItem('fw:desktop:v11:pending-post');try{const pending=JSON.parse(raw);feedStore.openPost(pending.id);}catch{}
    }).catch(error=>toast(error.message||'精神广场读取失败。'));
    if(squareMode==='echo')socialStore.loadEcho().catch(()=>{});
  }
  if(view==='rooms')pollStore.activate().catch(error=>toast(error.message||'课题读取失败。'));
  if(view==='bird')birdStore.activate().catch(error=>toast(error.message||'新闻专区读取失败。'));
  if(view==='play')gamePartyUi.activate().catch(error=>toast(error.message||'组队房间读取失败。'));
  if(view==='games')window.__FW_GAMES__?.activate();
  if(view==='membership'){renderMembershipContent();membershipStore.load(true).catch(error=>toast(error.message||'会员信息读取失败。'));}
  if(view==='archive')archiveStore.load().catch(error=>toast(error.message||'废话档案读取失败。'));
}

function setBadge(kind,count){const badge=$(`[data-badge="${kind}"]`);if(!badge)return;const value=Number(count||0);badge.hidden=value<=0;badge.textContent=value>99?'99+':String(value||'');}
function setDot(kind,count){$$(`[data-dot="${kind}"]`).forEach(dot=>{dot.hidden=Number(count||0)<=0;});}
function echoPostId(row){if(row.__post_id)return String(row.__post_id);if(row.target_type==='post'&&row.target_id)return String(row.target_id);if(['like','comment'].includes(row.type)&&row.target_id)return String(row.target_id);return'';}

function renderSquareMode(){
  const feed=$('[data-square-feed]');const echo=$('[data-square-echo-panel]');const button=$('[data-square-echo-toggle]');if(!feed||!echo||!button)return;
  const showingEcho=squareMode==='echo';feed.hidden=showingEcho;echo.hidden=!showingEcho;button.classList.toggle('active',showingEcho);button.setAttribute('aria-pressed',String(showingEcho));
}

function currentProfile(userId){return feedState.profiles[String(userId)]||{};}
function reactionInfo(post){
  const mine=String(accountState.user?.id||'');const values={like:0};const active={like:false};
  (post.reactions||[]).forEach(row=>{if(row.type!=='like')return;values.like+=1;if(String(row.user_id)===mine)active.like=true;});return{values,active};
}
function draftFor(postId){const key=String(postId);if(!commentDrafts.has(key))commentDrafts.set(key,{text:'',imageFile:null,imagePreview:'',stickers:new Set(),pickerTab:'emoji'});return commentDrafts.get(key);}
function releasePreview(draft){if(draft?.imagePreview){try{URL.revokeObjectURL(draft.imagePreview);}catch{}}if(draft){draft.imageFile=null;draft.imagePreview='';}}
function selectedStickerPreview(draft,context,postId=''){
  const url=Array.from(draft.stickers||[])[0];if(!url)return'';
  const remove=context==='compose'?'data-compose-sticker-remove':`data-comment-sticker-remove="${esc(postId)}"`;
  return `<div class="selected-sticker-preview"><img src="${esc(url)}" alt="已选择的表情"><span>已选择 1 个表情</span><button type="button" ${remove}>移除</button></div>`;
}
function sharedPicker(draft,context,postId=''){
  const tab=draft.pickerTab||'emoji';const suffix=postId?` data-post-id="${esc(postId)}"`:'';
  const tabs=`<div class="inline-picker-tabs" role="tablist"><button class="${tab==='emoji'?'active':''}" type="button" data-${context}-picker-tab="emoji"${suffix}>小表情</button><button class="${tab==='stickers'?'active':''}" type="button" data-${context}-picker-tab="stickers"${suffix}>我的表情</button></div>`;
  if(tab==='emoji')return `${tabs}<div class="inline-emoji-grid">${EMOJIS.map(item=>`<button type="button" data-${context}-emoji="${esc(item[0])}"${suffix} aria-label="${esc(item[0])}">${emojiImage(item)}</button>`).join('')}</div>`;
  if(socialState.stickers.loading&&!socialState.stickers.loaded)return `${tabs}<div class="state-card small">正在读取我的表情...</div>`;
  const rows=sortedStickers();const attribute=`data-${context}-sticker`;
  const toolbar=`<div class="sticker-toolbar"><button class="secondary compact" type="button" data-upload-sticker>${uiIcon('media')}添加表情</button><span>${rows.length}/${membershipStore.stickerLimit()} · 最大 1MB · 发送时仅选 1 个</span></div>`;
  if(!rows.length)return `${tabs}${toolbar}<div class="inline-sticker-grid is-empty" aria-label="我的表情为空"></div>`;
  return `${tabs}${toolbar}<div class="inline-sticker-grid">${rows.map(row=>{const on=draft.stickers.has(row.image_url);return `<div class="inline-sticker-item"><button class="${on?'selected':''}" type="button" ${attribute}="${esc(row.image_url)}"${suffix} aria-pressed="${on}"><img src="${esc(row.image_url)}" alt="我的表情"></button><button class="inline-sticker-delete" type="button" data-delete-sticker="${esc(row.id)}" aria-label="删除这个表情">×</button></div>`;}).join('')}</div>`;
}
function renderCompose(){
  const host=$('[data-compose-content]');if(!host)return;
  if(!accountState.user){host.innerHTML='<div class="state-card"><b>登录后发牢骚</b><span>发布内容会与网页、PWA、APK 共用同一账号和数据库。</span><button class="primary compact" type="button" data-open-account>注册 / 登录</button></div>';return;}
  host.innerHTML=`<form class="compose-card" data-compose-form>
    <label for="composeText">把想说的先放在这里</label><textarea id="composeText" name="content" maxlength="500" placeholder="不要求有结论，也不要求立刻振作。">${esc(composeDraft.text)}</textarea><div class="compose-count">${composeDraft.text.length}/500</div>
    <div class="media-tools"><label class="secondary compact file-button">添加图片<input type="file" accept="image/*" data-compose-image hidden></label><span>静态图过大时会压缩；GIF 最大 3MB；每次最多发送 1 个“我的表情”。</span></div>
    ${composeDraft.imagePreview?`<div class="image-preview"><img src="${esc(composeDraft.imagePreview)}" alt="待发布图片"><button class="secondary compact danger" type="button" data-compose-image-remove>移除图片</button></div>`:''}
    ${selectedStickerPreview(composeDraft,'compose')}
    <div class="picker-block" hidden>${sharedPicker(composeDraft,'compose')}</div>
    <div class="compose-actions"><button class="secondary" type="button" data-nav="square">取消</button><button class="primary" type="submit" ${feedState.busy?'disabled':''}>${feedState.busy?'发布中...':'投递到精神广场'}</button></div>
  </form>`;
}
function postCard(post){
  const profile=currentProfile(post.user_id);const reactions=reactionInfo(post);const open=String(feedState.openPostId)===String(post.id);
  return `<article class="square-post ${open?'active':''}" data-open-post="${esc(post.id)}"><div class="post-meta time-only"><time>${esc(timeText(post.created_at))}</time></div><div class="post-author">${avatarHtml(profile,'social-avatar mini',{userId:post.user_id})}<b>${esc(profile.nickname||'匿名研究员')}</b></div>${richContent(post.content)}<div class="post-stats"><button class="post-like-button ${reactions.active.like?'active':''}" type="button" data-react="like" data-post-id="${esc(post.id)}" aria-pressed="${reactions.active.like}">点赞 ${reactions.values.like}</button><button class="post-comment-button" type="button" data-open-post="${esc(post.id)}">评论 ${(post.comments||[]).length}</button></div></article>`;
}
function renderSquareFeed(){
  const host=$('[data-square-feed]');if(!host)return;
  if(feedState.loading&&!feedState.loaded){host.innerHTML='<div class="state-card">正在读取精神广场...</div>';return;}
  if(feedState.error&&!feedState.posts.length){host.innerHTML=`<div class="state-card"><b>精神广场暂时读取失败</b><span>${esc(feedState.error)}</span><button class="secondary compact" type="button" data-square-refresh>重试</button></div>`;return;}
  host.innerHTML=feedState.posts.length?feedState.posts.map(postCard).join(''):'<div class="state-card"><b>广场还很安静</b><span>可以留下第一条低功耗记录。</span><button class="primary compact" type="button" data-nav="compose">发牢骚</button></div>';
}
function commentTree(comments){
  const byId=new Map((comments||[]).map(row=>[String(row.id),row]));const roots=[];const replies=new Map();
  (comments||[]).forEach(row=>{let rootId=String(row.parent_comment_id||row.id);let cursor=byId.get(rootId);let guard=0;while(cursor?.parent_comment_id&&byId.has(String(cursor.parent_comment_id))&&guard++<20){cursor=byId.get(String(cursor.parent_comment_id));rootId=String(cursor.id);}if(!row.parent_comment_id||rootId===String(row.id))roots.push(row);else{if(!replies.has(rootId))replies.set(rootId,[]);replies.get(rootId).push(row);}});
  return{roots,replies};
}
function commentHtml(comment,{reply=false}={}){
  const profile=currentProfile(comment.user_id);const target=currentProfile(comment.reply_to_user_id);const mine=String(comment.user_id)===String(accountState.user?.id);
  return `<article class="post-comment ${reply?'reply':''}" data-comment-id="${esc(comment.id)}">${avatarHtml(profile,'social-avatar mini',{userId:comment.user_id})}<div><div class="comment-meta"><b>${esc(profile.nickname||'匿名用户')}${reply&&target.nickname?` 回复 ${esc(target.nickname)}`:''}</b><time>${esc(timeText(comment.created_at))}</time></div>${richContent(comment.content)}<div class="comment-actions"><button type="button" data-reply-comment="${esc(comment.id)}">回复</button>${mine?`<button class="danger" type="button" data-delete-comment="${esc(comment.id)}">删除</button>`:''}</div></div></article>`;
}
function renderPostDetail(){
  const host=$('[data-post-detail]');if(!host)return;const previousPostId=host.dataset.renderedPostId||'';const previousScrollTop=host.querySelector('.detail-content-scroll')?.scrollTop||0;const post=feedState.posts.find(row=>String(row.id)===String(feedState.openPostId));
  if(!post){delete host.dataset.renderedPostId;host.innerHTML='<div class="post-detail-empty"><b>选择一条帖子</b><span>在这里查看完整评论、回复和互动。</span></div>';return;}
  const profile=currentProfile(post.user_id);const reaction=reactionInfo(post);const mine=String(post.user_id)===String(accountState.user?.id);const tree=commentTree(post.comments);const draft=draftFor(post.id);const reply=feedState.reply&&String(feedState.reply.postId)===String(post.id)?feedState.reply:null;
  const comments=tree.roots.length?tree.roots.map(root=>`<div class="comment-thread">${commentHtml(root)}${(tree.replies.get(String(root.id))||[]).map(item=>commentHtml(item,{reply:true})).join('')}</div>`).join(''):'<div class="comment-empty">还没有评论，来说两句吧。</div>';
  const composer=accountState.user?`<form class="comment-compose-card" data-comment-form="${esc(post.id)}">${reply?`<div class="replying">正在回复 ${esc(reply.name)}<button type="button" data-clear-reply>取消</button></div>`:''}<div class="comment-compose-toolbar"><div class="media-tools"><label class="secondary compact file-button">图片<input type="file" accept="image/*" data-comment-image="${esc(post.id)}" hidden></label><span>也可以只发送图片或表情</span></div>${selectedStickerPreview(draft,'comment',post.id)}</div><textarea name="content" maxlength="180" placeholder="发表评论，最多 180 字">${esc(draft.text)}</textarea>${draft.imagePreview?`<div class="image-preview small"><img src="${esc(draft.imagePreview)}" alt="待发送图片"><button class="secondary compact danger" type="button" data-comment-image-remove="${esc(post.id)}">移除</button></div>`:''}<div class="picker-block compact-picker" hidden>${sharedPicker(draft,'comment',post.id)}</div><div class="comment-compose-footer"><span>Ctrl + Enter 发送</span><button class="primary compact" type="submit" ${feedState.busy?'disabled':''}>${feedState.busy?'发送中...':'发表评论'}</button></div></form>`:'';
  const signIn=accountState.user?'':'<div class="state-card small"><b>登录后参与评论</b><button class="primary compact" type="button" data-open-account>注册 / 登录</button></div>';
  host.innerHTML=`<div class="detail-scroll ${accountState.user?'has-comment-composer':''}"><header class="detail-head"><b>帖子详情</b><div class="row-actions">${mine?`<button class="detail-quiet-action danger" type="button" data-delete-post="${esc(post.id)}">删除帖子</button>`:`<button class="detail-quiet-action" type="button" data-report-post="${esc(post.id)}">举报</button>`}<button class="secondary compact" type="button" data-close-post>关闭</button></div></header><div class="detail-content-scroll"><article class="detail-post"><div class="detail-author-row"><div class="post-author">${avatarHtml(profile,'social-avatar',{userId:post.user_id})}<b>${esc(profile.nickname||'匿名研究员')}</b></div><time>${esc(new Date(post.created_at).toLocaleString('zh-CN'))}</time></div>${richContent(post.content)}<div class="detail-post-actions"><div class="reaction-row"><button class="${reaction.active.like?'active':''}" type="button" data-react="like" data-post-id="${esc(post.id)}" aria-pressed="${reaction.active.like}">点赞 ${reaction.values.like}</button></div></div></article><section class="comments-section"><div class="comments-heading"><h3>评论</h3><span>${(post.comments||[]).length} 条</span></div><div class="comment-list">${comments}</div>${signIn}</section></div>${composer}</div>`;
  host.dataset.renderedPostId=String(post.id);if(previousPostId===String(post.id))host.querySelector('.detail-content-scroll').scrollTop=previousScrollTop;
}
function renderFeed(next=feedState,scope='all'){feedState=next;if(scope==='all'||scope==='compose')renderCompose();if(scope==='all'||scope==='content')renderSquareFeed();if(scope!=='compose')renderPostDetail();}

function pollEnded(poll){return Boolean(poll.closed_at)||new Date(poll.ends_at).getTime()<=Date.now();}
function remainingTime(value){const ms=new Date(value).getTime()-Date.now();if(!Number.isFinite(ms)||ms<=0)return'已结束';const minutes=Math.ceil(ms/60000);const days=Math.floor(minutes/1440);const hours=Math.floor((minutes%1440)/60);return days?`${days}天${hours?` ${hours}小时`:''}`:hours?`${hours}小时${minutes%60?` ${minutes%60}分钟`:''}`:`${minutes}分钟`;}
function pollConclusion(poll){if(poll.conclusion)return poll.conclusion;const total=Number(poll.participantCount||0);if(!total)return'样本量仍为 0，本课题暂时没有形成有效研究结论。';const counts=poll.options.map(option=>Number(poll.stats[String(option.id)]||0));const max=Math.max(...counts);const winners=poll.options.filter(option=>Number(poll.stats[String(option.id)]||0)===max);if(winners.length>1)return`样本显示「${winners.map(item=>item.label).join('」「')}」并列领先，各获得 ${max} 票。`;return`样本倾向于「${winners[0]?.label||'暂无'}」，获得 ${max} 票，占参与样本的 ${Math.round(max/total*100)}%。`;}
function pollMatches(poll){const ended=pollEnded(poll);if(pollFilter==='ended')return ended;if(ended)return false;if(pollFilter==='official')return Boolean(poll.is_official);if(pollFilter==='user')return!poll.is_official;return true;}
function pollCard(poll){
  const ended=pollEnded(poll);const profile=pollState.profiles[String(poll.user_id)]||{};const total=Number(poll.participantCount||0);const user=accountState.user;const myOption=String(poll.myVote?.option_id||'');
  return `<article class="poll-card ${poll.is_official?'official':''} ${ended?'ended':''}"><header><div><div class="poll-tags"><span>${poll.is_official?'官方课题':'用户课题'}</span><span>${ended?'已结束':'研究中'}</span></div><h2>${esc(poll.title)}</h2><p>由 ${esc(profile.nickname||'匿名研究员')} 发起 · ${esc(new Date(poll.created_at).toLocaleDateString('zh-CN'))} 发布 · 默认 7 天截止</p></div><div class="poll-deadline"><b>${esc(remainingTime(poll.ends_at))}</b><span>${ended?'截止状态':'剩余时间'}</span></div></header>${user?.role==='admin'&&!poll.is_official&&!ended?`<button class="secondary compact" type="button" data-poll-promote="${esc(poll.id)}">设为官方课题</button>`:''}<div class="poll-options">${poll.options.map(option=>{const votes=Number(poll.stats[String(option.id)]||0);const percent=total?Math.round(votes/total*100):0;const selected=myOption===String(option.id);const canDelete=user&&!ended&&option.source==='user'&&String(option.user_id)===String(user.id);return `<div class="poll-option-row"><button class="poll-option ${selected?'selected':''}" type="button" data-poll-vote="${esc(poll.id)}" data-option-id="${esc(option.id)}" ${ended||pollState.busy?'disabled':''}><span><b>${esc(option.label)}</b><small>${votes}票 · ${percent}%</small></span><i><i style="width:${percent}%"></i></i></button>${canDelete?`<button class="poll-delete-option danger" type="button" data-poll-delete-option="${esc(option.id)}">删除</button>`:''}</div>`;}).join('')}</div>${!ended&&poll.options.length<20&&!poll.options.some(option=>option.source==='user'&&String(option.user_id)===String(user?.id))?`<form class="poll-add-option" data-poll-add-option="${esc(poll.id)}"><input name="label" maxlength="80" placeholder="补充一个新选项"><button class="secondary compact" type="submit">新增并投票</button></form>`:!ended&&user?'<p class="poll-note">每人每个课题最多补充 1 个选项，课题最多 20 个选项。</p>':''}${ended?`<div class="poll-conclusion"><b>研究结论</b><p>${esc(pollConclusion(poll))}</p></div>`:''}<footer><span><b>${total}</b>参与</span><span><b>${poll.options.length}</b>选项</span><span><b>${poll.myVote?'已投':'未投'}</b>状态</span></footer></article>`;
}
function renderPolls(next=pollState){
  pollState=next;const countNode=$('[data-poll-daily-count]');if(countNode)countNode.textContent=accountState.user?(pollState.dailyCount==null?'今日次数读取失败':`今日发起 ${pollState.dailyCount}/3`):'登录后可见';
  $$('[data-poll-filter]').forEach(button=>button.classList.toggle('active',button.dataset.pollFilter===pollFilter));
  const create=$('[data-poll-create-host]');if(create){create.hidden=!pollCreateOpen;if(pollCreateOpen)create.innerHTML=accountState.user?`<form class="poll-create-card" data-poll-create-form><div><h2>发起 7 天投票</h2><p>每人每天最多 3 次；标题最多 120 字，创建时必须填写 4 个不同选项。</p></div><label>课题标题<input name="title" maxlength="120" autocomplete="off" required placeholder="例如：今天最值得研究的崩溃来源是什么？"></label><div class="poll-initial-options">${[1,2,3,4].map(index=>`<label>选项 ${index}<input name="option${index}" maxlength="80" required></label>`).join('')}</div>${accountState.user.role==='admin'?'<label class="poll-official-check"><input type="checkbox" name="official"> 作为官方课题发布并置顶</label>':''}<div class="compose-actions"><button class="secondary" type="button" data-poll-create-toggle>取消</button><button class="primary" type="submit" ${pollState.busy?'disabled':''}>${pollState.busy?'发布中...':'发布课题'}</button></div></form>`:'<div class="state-card"><b>登录后发起课题</b><button class="primary compact" type="button" data-open-account>注册 / 登录</button></div>';}
  const list=$('[data-poll-list]');if(!list)return;if(pollState.loading&&!pollState.loaded){list.innerHTML='<div class="state-card">正在读取学术研讨课题...</div>';return;}if(pollState.error&&!pollState.polls.length){list.innerHTML=`<div class="state-card"><b>课题暂时读取失败</b><span>${esc(pollState.error)}</span><button class="secondary compact" type="button" data-poll-refresh>重试</button></div>`;return;}const rows=pollState.polls.filter(pollMatches).sort((a,b)=>pollFilter==='ended'?new Date(b.created_at)-new Date(a.created_at):Number(b.is_official)-Number(a.is_official)||new Date(b.created_at)-new Date(a.created_at));list.innerHTML=rows.length?rows.map(pollCard).join(''):'<div class="state-card">这个分类下暂时没有课题。</div>';
}

function safeDirectUrl(value){try{const url=new URL(String(value||''));return['http:','https:'].includes(url.protocol)?url.href:'';}catch{return'';}}
function birdAuthor(post){if(post.display_mode==='anonymous')return{nickname:'匿名发布者',avatar_url:'',anonymous:true};if(post.display_mode==='pen_name')return{nickname:post.pen_name||'临时作者',avatar_url:'',anonymous:true};const profile=birdState.profiles[String(post.user_id)]||{};return{id:post.user_id,nickname:profile.nickname||'发布者',avatar_url:profile.avatar_url||'',anonymous:false};}
function birdReaction(post){const values={valid:0,seen:0,tissue:0};const active={valid:false,seen:false,tissue:false};const mine=String(accountState.user?.id||'');(post.reactions||[]).forEach(row=>{if(row.type in values)values[row.type]+=1;if(String(row.user_id)===mine)active[row.type]=true;});return{values,active};}
function releaseBirdFiles(){birdDraft.previews.forEach(url=>{try{URL.revokeObjectURL(url);}catch{}});birdDraft.files=[];birdDraft.previews=[];}
function renderBirdCompose(){const host=$('[data-bird-compose-host]');if(!host)return;host.hidden=!birdComposeOpen;if(!birdComposeOpen)return;if(!accountState.user){host.innerHTML='<div class="state-card"><b>登录后发布内容</b><button class="primary compact" type="button" data-open-account>注册 / 登录</button></div>';return;}host.innerHTML=`<form class="bird-compose-card" data-bird-compose-form><div><h2>发布一条专区内容</h2><p>标题 2–80 字，正文最多 5000 字，可上传最多 20 张图片。</p></div><label>标题<input name="title" maxlength="80" required value="${esc(birdDraft.title)}"></label><label>正文<textarea name="content" maxlength="5000" required>${esc(birdDraft.content)}</textarea></label><fieldset><legend>署名方式</legend>${[['profile','使用账号资料'],['anonymous','匿名发布'],['pen_name','临时笔名']].map(([value,label])=>`<label><input type="radio" name="displayMode" value="${value}" ${birdDraft.displayMode===value?'checked':''}> ${label}</label>`).join('')}</fieldset>${birdDraft.displayMode==='pen_name'?`<label>临时笔名<input name="penName" maxlength="20" value="${esc(birdDraft.penName)}" required></label>`:''}<div class="media-tools"><label class="secondary compact file-button">添加图片<input type="file" accept="image/*" multiple data-bird-files hidden></label><span>${birdDraft.files.length}/20 · 每张会压缩至 800KB 内 · 可 Ctrl+V 粘贴</span></div>${birdDraft.previews.length?`<div class="bird-preview-grid">${birdDraft.previews.map((url,index)=>`<div><img src="${esc(url)}" alt="待上传图片"><button type="button" data-bird-remove-file="${index}">×</button></div>`).join('')}</div>`:''}<div class="compose-actions"><button class="secondary" type="button" data-bird-compose-toggle>取消</button><button class="primary" type="submit" ${birdState.busy?'disabled':''}>${birdState.busy?'发布中...':'发布内容'}</button></div></form>`;}
function birdCard(post){const author=birdAuthor(post);const cover=safeDirectUrl(post.images?.[0]?.url);return `<article class="bird-card" data-bird-open="${esc(post.id)}">${cover?`<div class="bird-cover"><img src="${esc(cover)}" alt="内容图片" loading="lazy">${post.images.length>1?`<span>共 ${post.images.length} 张图</span>`:''}</div>`:'<div class="bird-cover empty">暂无配图</div>'}<div><h2>${esc(post.title)}</h2><div class="post-author">${avatarHtml(author,'social-avatar mini',{anonymous:author.anonymous,anonymousLabel:author.nickname,userId:author.id})}<b>${esc(author.nickname)}</b></div><time>${esc(timeText(post.created_at))}</time></div></article>`;}
function renderBirdFeed(){const host=$('[data-bird-feed]');if(!host)return;if(birdState.loading&&!birdState.loaded){host.innerHTML='<div class="state-card">正在读取新闻专区...</div>';return;}if(birdState.error&&!birdState.posts.length){host.innerHTML=`<div class="state-card"><b>新闻专区暂时读取失败</b><span>${esc(birdState.error)}</span><button class="secondary compact" type="button" data-bird-refresh>重试</button></div>`;return;}host.innerHTML=birdState.posts.length?birdState.posts.map(birdCard).join(''):'<div class="state-card"><b>新闻专区还没有内容</b><span>可以先发布一条长图文。</span></div>';}
function renderBirdDetail(){const host=$('[data-bird-detail]');if(!host)return;const post=birdState.posts.find(row=>String(row.id)===String(birdState.openPostId));if(!post){host.innerHTML='<div class="post-detail-empty"><b>选择一条内容</b><span>查看完整正文、图片、评论和互动。</span></div>';return;}const author=birdAuthor(post);const stats=birdReaction(post);const mine=String(post.user_id)===String(accountState.user?.id);host.innerHTML=`<div class="detail-scroll"><header class="detail-head"><button class="secondary compact" type="button" data-bird-close>关闭</button>${mine?`<button class="secondary compact danger" type="button" data-bird-delete-post="${esc(post.id)}">删除内容</button>`:''}</header><article class="bird-detail-card"><p class="bird-label">新闻专区</p><h2>${esc(post.title)}</h2><div class="post-author">${avatarHtml(author,'social-avatar',{anonymous:author.anonymous,anonymousLabel:author.nickname,userId:author.id})}<b>${esc(author.nickname)}</b><time>${esc(timeText(post.created_at))}</time></div><div class="bird-content">${emojiText(post.content)}</div>${post.images.length?`<div class="bird-images">${post.images.map(image=>safeDirectUrl(image.url)).filter(Boolean).map(url=>`<img src="${esc(url)}" alt="内容图片，点击查看原图" loading="lazy" data-lightbox-src="${esc(url)}">`).join('')}</div>`:''}<div class="reaction-row">${[['valid','有点意思'],['seen','我也见过'],['tissue','递纸巾']].map(([type,label])=>`<button class="${stats.active[type]?'active':''}" type="button" data-bird-react="${type}" data-post-id="${esc(post.id)}" ${stats.active[type]?'disabled':''}>${label} ${stats.values[type]}</button>`).join('')}</div></article><section class="comments-section"><h3>评论 ${post.comments.length}</h3><div class="comment-list">${post.comments.length?post.comments.map(comment=>{const profile=birdState.profiles[String(comment.user_id)]||{};const own=String(comment.user_id)===String(accountState.user?.id);return `<article class="post-comment">${avatarHtml(profile,'social-avatar mini',{userId:comment.user_id})}<div><div class="comment-meta"><b>${esc(profile.nickname||'匿名回声')}</b><time>${esc(timeText(comment.created_at))}</time></div><div class="rich-text">${emojiText(comment.content)}</div>${own?`<div class="comment-actions"><button class="danger" type="button" data-bird-delete-comment="${esc(comment.id)}">删除</button></div>`:''}</div></article>`;}).join(''):'<div class="state-card small">还没有评论，可以先留一句。</div>'}</div>${accountState.user?`<form class="comment-compose-card" data-bird-comment-form="${esc(post.id)}"><textarea name="content" maxlength="500" placeholder="留一句评论，最多 500 字"></textarea><button class="primary full" type="submit" ${birdState.busy?'disabled':''}>发送</button></form>`:'<div class="state-card small"><b>登录后参与评论</b><button class="primary compact" type="button" data-open-account>注册 / 登录</button></div>'}</section></div>`;}
function renderBird(next=birdState){birdState=next;renderBirdCompose();renderBirdFeed();renderBirdDetail();}

const ARCHIVE_AWARD={title:'点赞之王',en:'LIKE KING',medal:'赞',quote:'代表废话'};
function archiveAvatar(row,className='archive-avatar'){return avatarHtml(row,className);}
function archiveWinner(row,rank){const item=row||{nickname:`暂无第${rank}名`,score:0};return `<div class="archive-winner rank-${rank}">${archiveAvatar(item)}<b>${esc(item.nickname||'暂无上榜')}</b><strong>${Number(item.score||0)}</strong><i>${rank}</i></div>`;}
function archiveAward(rows){const config=ARCHIVE_AWARD;if(!rows.length)return`<article class="archive-award"><header><div><small>${config.en}</small><h3>${config.title}</h3></div><i>${config.medal}</i></header><div class="state-card small">上周还没有产生${config.title}。</div><blockquote><b>${config.quote}：</b>暂无。</blockquote></article>`;const first=rows[0];return`<article class="archive-award"><header><div><small>${config.en}</small><h3>${config.title}</h3></div><i>${config.medal}</i></header><div class="archive-podium">${archiveWinner(rows[1],2)}${archiveWinner(first,1)}${archiveWinner(rows[2],3)}</div><blockquote><b>${config.quote}：</b>“${esc(previewText(first.topPost?.content||'暂无代表废话。').slice(0,100))}”</blockquote></article>`;}
function formatMonthDay(value){const date=new Date(value);return`${date.getMonth()+1}月${date.getDate()}日`;}
function renderArchive(next=archiveState){
  archiveState=next;const host=$('[data-archive-content]');if(!host)return;if(archiveState.loading&&!archiveState.loaded){host.innerHTML='<div class="state-card">正在整理废话档案...</div>';return;}const weekly=archiveState.weekly.like||[];const daily=archiveState.daily.like||[];const hasRows=weekly.length||daily.length;if(archiveState.error&&!hasRows){host.innerHTML=`<div class="state-card"><b>榜单暂时读取失败</b><span>${esc(archiveState.error)}</span><button class="secondary compact" type="button" data-archive-refresh>重试</button></div>`;return;}const nextDay=archiveState.ranges?.nextDay;const nextMonday=archiveState.ranges?.nextMonday;const top=weekly[0];host.innerHTML=`<section class="archive-hero"><div><small>LOW POWER ARCHIVE</small><h2>有人发牢骚，有人点了赞，<br>有些废话就这样被留下。</h2><p>榜单不是为了竞争，只是看看哪些话被大家顺手点亮了。</p></div><div class="archive-update">周榜：${nextMonday?formatMonthDay(nextMonday):'下周一'} 00:00 更新<br>日榜：${nextDay?formatMonthDay(nextDay):'明日'} 00:00 更新</div></section><section class="archive-section"><header><div><small>LAST WEEK LIKE HONOR WALL</small><h2>上周点赞荣誉榜</h2></div><span>前三名</span></header><div class="archive-award-grid">${archiveAward(weekly)}</div></section><section class="archive-section"><header><div><small>YESTERDAY LIKE TOP 10</small><h2>昨日点赞榜</h2></div><span>每日 0 点更新</span></header><div class="archive-daily-list">${daily.length?daily.map((row,index)=>`<div class="archive-daily-row"><span>${String(index+1).padStart(2,'0')}</span>${archiveAvatar(row)}<b>${esc(row.nickname)}</b><strong>${Number(row.score||0)}</strong></div>`).join(''):'<div class="state-card small">昨日还没有产生点赞榜。</div>'}</div></section><section class="archive-rule"><b>档案规则</b><span>自己给自己的点赞可以显示，但不计入榜单；同一用户对同一条内容只统计 1 次；删除或被处理的内容不会进入榜单。</span></section><section class="archive-section"><header><div><small>PAST ARCHIVES</small><h2>历代废话档案</h2></div><span>最近一周预览</span></header><div class="archive-history"><article><small>上周 / ${ARCHIVE_AWARD.title}</small><h3>${esc(top?.nickname||'暂无上榜')}</h3><p>${esc(top?previewText(top.topPost?.content).slice(0,100):'还没有足够数据进入档案。')}</p></article></div></section>`;}

function renderEcho(){
  const list=$('[data-echo-list]');if(!list)return;
  const markAll=$('[data-echo-mark-all]');const rows=socialState.echo.rows||[];if(markAll)markAll.hidden=!rows.some(row=>!row.is_read);
  if(!accountState.user){list.innerHTML='<div class="state-card"><b>登录后查看回声</b><span>账号数据与网页和手机端共用。</span><button class="primary compact" type="button" data-open-account>注册 / 登录</button></div>';return;}
  if(socialState.echo.loading&&!socialState.echo.loaded){list.innerHTML='<div class="state-card">正在读取回声...</div>';return;}
  if(!rows.length){list.innerHTML='<div class="state-card"><b>暂时没有新的回声</b><span>安静也是一种运行状态。</span></div>';return;}
  list.innerHTML=rows.map(row=>{
    const profile=socialState.echo.profiles[row.actor_id]||{};const name=profile.nickname||'某位研究员';const postId=echoPostId(row);
    return `<article class="echo-item ${row.is_read?'':'unread'}" data-echo-item="${esc(row.id)}">${avatarHtml(profile,'social-avatar',{userId:row.actor_id})}<div class="echo-main"><b>${esc(name)} ${esc(noticeText(row.type))}</b><span>${esc(previewText(row.content))}</span><time>${esc(timeText(row.created_at))}</time></div><div class="row-actions">${postId?`<button class="primary compact" type="button" data-echo-post="${esc(postId)}">查看帖子</button>`:'<span class="echo-expired">帖子已不可查看</span>'}</div></article>`;
  }).join('');
}

function buddyRelation(userId){const me=accountState.user?.id;return(socialState.buddy.rows||[]).find(row=>(String(row.requester_id)===String(me)&&String(row.receiver_id)===String(userId))||(String(row.receiver_id)===String(me)&&String(row.requester_id)===String(userId)))||null;}
function buddyOtherId(row){return String(row.requester_id)===String(accountState.user?.id)?String(row.receiver_id):String(row.requester_id);}
function buddyCard(row,{mode='friend'}={}){
  const userId=buddyOtherId(row);const profile=socialState.buddy.profiles[userId]||{};const name=profile.nickname||'低功耗研究员';
  if(mode==='friend')return `<article class="buddy-item ${socialState.chat.targetId===userId?'active':''}" data-open-chat="${esc(userId)}">${avatarHtml(profile,'social-avatar',{userId})}<div class="buddy-main"><b>${esc(name)}</b><span>实验品编号：${esc(profile.lab_code||'未设置')}</span></div><div class="row-actions"><button class="secondary compact danger" type="button" data-remove-friend="${esc(row.id)}">解除</button></div></article>`;
  const incoming=String(row.receiver_id)===String(accountState.user?.id);return `<article class="buddy-item">${avatarHtml(profile,'social-avatar',{userId})}<div class="buddy-main"><b>${esc(name)}</b><span>实验品编号：${esc(profile.lab_code||'未设置')} · ${incoming?'对方想加你为搭子':'等待对方处理'}</span></div><div class="row-actions">${incoming?`<button class="primary compact" type="button" data-accept-friend="${esc(row.id)}">同意</button><button class="secondary compact danger" type="button" data-reject-friend="${esc(row.id)}">拒绝</button>`:`<button class="secondary compact danger" type="button" data-remove-friend="${esc(row.id)}">撤回</button>`}</div></article>`;
}

function messagePreview(value){return decodeSticker(value)?'动画表情':String(value||'[消息]').replace(/\s+/g,' ').trim();}
function renderMessageList(accepted){
  const rows=accepted.map(friend=>{const userId=buddyOtherId(friend);return{friend,userId,profile:socialState.buddy.profiles[userId]||{},latest:socialState.buddy.latest[userId]||null,unread:Number(socialState.buddy.unread[userId]||0)};}).sort((a,b)=>b.unread-a.unread||new Date(b.latest?.created_at||0)-new Date(a.latest?.created_at||0)||String(a.profile.nickname||'').localeCompare(String(b.profile.nickname||''),'zh-CN'));
  if(!rows.length)return'<div class="state-card">暂时还没有搭子消息。先去“新的搭子”加一个搭子吧。</div>';
  return rows.map(item=>{const mine=String(item.latest?.sender_id||'')===String(accountState.user?.id);return `<article class="buddy-item message-item ${item.unread?'unread':''} ${socialState.chat.targetId===item.userId?'active':''}" data-open-chat="${esc(item.userId)}">${avatarHtml(item.profile,'social-avatar',{userId:item.userId})}${item.unread?`<i class="unread-dot">${item.unread>99?'99+':item.unread}</i>`:''}<div class="buddy-main"><b>${esc(item.profile.nickname||'低功耗搭子')}</b><span>${esc(item.latest?(mine?'我：':'')+messagePreview(item.latest.content):'还没有消息，点这里打个招呼')}</span><time>${item.latest?esc(timeText(item.latest.created_at)):''}</time></div></article>`;}).join('');
}

function renderSearchResults(){
  const rows=socialState.buddy.search||[];if(socialState.buddy.searching)return'<div class="state-card">正在搜索实验品...</div>';if(!rows.length)return'';
  return `<section class="buddy-section"><h3>搜索结果</h3>${rows.map(profile=>{const relation=buddyRelation(profile.id);let actions=`<button class="primary compact" type="button" data-add-friend="${esc(profile.id)}">加为搭子</button>`;let text='可以发送搭子申请';if(relation?.status==='accepted'){actions=`<button class="primary compact" type="button" data-open-chat="${esc(profile.id)}">打开私聊</button>`;text='已是搭子';}else if(relation?.status==='pending'&&String(relation.requester_id)===String(accountState.user?.id)){actions='<button class="secondary compact" type="button" disabled>等待处理</button>';text='申请已发出';}else if(relation?.status==='pending'){actions=`<button class="primary compact" type="button" data-accept-friend="${esc(relation.id)}">同意</button><button class="secondary compact danger" type="button" data-reject-friend="${esc(relation.id)}">拒绝</button>`;text='对方想加你为搭子';}else if(relation?.status==='blocked'){actions='<button class="secondary compact" type="button" disabled>已拉黑</button>';text='当前不可添加';}return `<article class="buddy-item">${avatarHtml(profile,'social-avatar',{userId:profile.id})}<div class="buddy-main"><b>${esc(profile.nickname||'低功耗研究员')}</b><span>实验品编号：${esc(profile.lab_code||'未设置')} · ${esc(text)}</span></div><div class="row-actions">${actions}</div></article>`;}).join('')}</section>`;
}

function renderBuddyList(){
  const list=$('[data-buddy-list]');if(!list)return;const tab=socialState.buddy.tab;
  $$('[data-buddy-tab]').forEach(button=>button.classList.toggle('active',button.dataset.buddyTab===tab));$('[data-buddy-search]').hidden=tab!=='new';
  if(!accountState.user){list.innerHTML='<div class="state-card"><b>登录后使用搭子</b><span>联系人和私聊与网页、手机端共用。</span><button class="primary compact" type="button" data-open-account>注册 / 登录</button></div>';return;}
  if(socialState.buddy.loading&&!socialState.buddy.loaded){list.innerHTML='<div class="state-card">正在读取搭子列表...</div>';return;}
  const rows=socialState.buddy.rows||[];const accepted=rows.filter(row=>row.status==='accepted');
  if(tab==='messages'){list.innerHTML=renderMessageList(accepted);return;}
  if(tab==='friends'){list.innerHTML=accepted.length?accepted.slice().sort((a,b)=>String((socialState.buddy.profiles[buddyOtherId(a)]||{}).nickname||'').localeCompare(String((socialState.buddy.profiles[buddyOtherId(b)]||{}).nickname||''),'zh-CN')).map(row=>buddyCard(row)).join(''):'<div class="state-card">暂时还没有搭子，可以去“新的搭子”搜索实验品。</div>';return;}
  const incoming=rows.filter(row=>row.status==='pending'&&String(row.receiver_id)===String(accountState.user.id));const outgoing=rows.filter(row=>row.status==='pending'&&String(row.requester_id)===String(accountState.user.id));
  list.innerHTML=renderSearchResults()+`<section class="buddy-section"><h3>收到申请</h3>${incoming.length?incoming.map(row=>buddyCard(row,{mode:'request'})).join(''):'<div class="state-card small">暂时没有收到新的搭子申请。</div>'}</section><section class="buddy-section"><h3>发出申请</h3>${outgoing.length?outgoing.map(row=>buddyCard(row,{mode:'request'})).join(''):'<div class="state-card small">暂时没有发出的搭子申请。</div>'}</section>`;
}

function messageBubble(row){const mine=String(row.sender_id)===String(accountState.user?.id);const sticker=decodeSticker(row.content);return `<article class="chat-message ${mine?'mine':''}"><small>${mine?'你':esc(socialState.chat.profile?.nickname||'搭子')}</small><div class="chat-bubble ${sticker?'sticker':''}">${sticker?`<img src="${esc(sticker)}" alt="表情">`:emojiText(row.content)}</div><time>${esc(timeText(row.created_at))}</time></article>`;}
function renderChat(){
  const chat=socialState.chat;const messages=$('[data-chat-messages]');const input=$('[data-chat-compose] input');const submit=$('[data-chat-compose] button[type="submit"]');const emoji=$('[data-emoji-toggle]');
  $('[data-chat-title]').textContent=chat.targetId?`和 ${chat.profile?.nickname||'搭子'} 私聊`:'选择一个搭子';$('[data-chat-subtitle]').textContent=chat.targetId?`${chat.profile?.lab_code?`实验品编号：${chat.profile.lab_code}`:'实验品编号：未设置'}${chat.loading?' · 正在同步':''}`:'左边点一个消息或搭子，右边直接聊天。';$('[data-close-chat]').hidden=!chat.targetId;
  const enabled=Boolean(chat.targetId&&!chat.loading);input.disabled=!enabled;submit.disabled=!enabled||chat.sending;emoji.disabled=!enabled;input.placeholder=enabled?'输入文字，或 Ctrl+V 直接粘贴图片...':'先从左侧选择一个搭子';submit.textContent=chat.sending?'发送中...':'发送';
  const signature=[chat.targetId,chat.loading&&!(chat.rows||[]).length?'loading':'ready',chat.profile?.nickname||'',...(chat.rows||[]).map(row=>`${row.id}:${row.is_deleted?'1':'0'}:${row.content}`)].join('|');
  if(signature===lastChatRenderSignature)return;const shouldScroll=Boolean(chat.targetId&&(chat.rows||[]).length);lastChatRenderSignature=signature;
  if(chat.loading&&!chat.rows.length){messages.innerHTML='<div class="state-card">正在打开私聊...</div>';return;}if(!chat.targetId){messages.innerHTML='<div class="state-card">还没有选择聊天对象。</div>';return;}if(!chat.rows.length){messages.innerHTML='<div class="state-card">还没有私聊消息。可以先低功耗地打个招呼。</div>';return;}
  messages.innerHTML=chat.rows.map(messageBubble).join('');if(shouldScroll)requestAnimationFrame(()=>{messages.scrollTop=messages.scrollHeight;});
}

function renderEmojiPanel(){
  const body=$('[data-emoji-body]');if(!body)return;$$('[data-emoji-tab]').forEach(button=>button.classList.toggle('active',button.dataset.emojiTab===emojiTab));
  if(emojiTab==='emoji'){body.innerHTML=`<div class="emoji-grid">${EMOJIS.map(item=>`<button type="button" data-insert-emoji="${esc(item[0])}" aria-label="${esc(item[0])}">${emojiImage(item)}</button>`).join('')}</div>`;return;}
  if(socialState.stickers.loading&&!socialState.stickers.loaded){body.innerHTML='<div class="state-card small">正在读取我的表情...</div>';return;}
  const rows=sortedStickers();body.innerHTML=`<div class="sticker-toolbar"><button class="secondary compact" type="button" data-upload-sticker>${uiIcon('media')}添加表情</button><span>${rows.length}/${membershipStore.stickerLimit()} · 最大 1MB</span></div>`+(rows.length?`<div class="sticker-grid">${rows.map(row=>`<div class="sticker-item"><button type="button" data-send-sticker="${esc(row.image_url)}"><img src="${esc(row.image_url)}" alt="表情"></button><button class="sticker-delete" type="button" data-delete-sticker="${esc(row.id)}" aria-label="删除表情">×</button></div>`).join('')}</div>`:'<div class="state-card small">还没有添加自定义表情；可以添加 JPG、PNG、WebP 或 GIF。</div>');
}

function renderSocial(next=socialState){
  const previous=socialRenderMemo;const userId=String(accountState.user?.id||'');socialState=next;
  const badgesChanged=!previous||previous.echoBadge!==next.badges.echo||previous.buddyBadge!==next.badges.buddy||previous.playBadge!==next.badges.play;
  const echoChanged=!previous||previous.userId!==userId||previous.echoRows!==next.echo.rows||previous.echoProfiles!==next.echo.profiles||previous.echoLoaded!==next.echo.loaded||previous.echoLoading!==next.echo.loading;
  const buddyChanged=!previous||previous.userId!==userId||previous.buddyRows!==next.buddy.rows||previous.buddyProfiles!==next.buddy.profiles||previous.buddyLatest!==next.buddy.latest||previous.buddyUnread!==next.buddy.unread||previous.buddySearch!==next.buddy.search||previous.buddyTab!==next.buddy.tab||previous.buddyLoaded!==next.buddy.loaded||previous.buddyLoading!==next.buddy.loading||previous.chatTarget!==next.chat.targetId;
  const chatChanged=!previous||previous.userId!==userId||previous.chatTarget!==next.chat.targetId||previous.chatConversation!==next.chat.conversationId||previous.chatProfile!==next.chat.profile||previous.chatRows!==next.chat.rows||previous.chatLoading!==next.chat.loading||previous.chatSending!==next.chat.sending;
  const stickersChanged=!previous||previous.stickerRows!==next.stickers.rows||previous.stickerLoaded!==next.stickers.loaded||previous.stickerLoading!==next.stickers.loading;
  if(badgesChanged){setDot('square',next.badges.echo);setDot('square-echo',next.badges.echo);setDot('play',next.badges.play);setBadge('buddy',next.badges.buddy);}if(echoChanged)renderEcho();if(buddyChanged)renderBuddyList();if(chatChanged)renderChat();if(stickersChanged&&!$('[data-emoji-panel]').hidden)renderEmojiPanel();if(stickersChanged&&(currentView==='compose'||currentView==='square'))renderFeed();
  socialRenderMemo={userId,echoBadge:next.badges.echo,buddyBadge:next.badges.buddy,playBadge:next.badges.play,echoRows:next.echo.rows,echoProfiles:next.echo.profiles,echoLoaded:next.echo.loaded,echoLoading:next.echo.loading,buddyRows:next.buddy.rows,buddyProfiles:next.buddy.profiles,buddyLatest:next.buddy.latest,buddyUnread:next.buddy.unread,buddySearch:next.buddy.search,buddyTab:next.buddy.tab,buddyLoaded:next.buddy.loaded,buddyLoading:next.buddy.loading,chatTarget:next.chat.targetId,chatConversation:next.chat.conversationId,chatProfile:next.chat.profile,chatRows:next.chat.rows,chatLoading:next.chat.loading,chatSending:next.chat.sending,stickerRows:next.stickers.rows,stickerLoaded:next.stickers.loaded,stickerLoading:next.stickers.loading};
}

function bindNavigation(){
  document.addEventListener('click',async event=>{
    const lightbox=event.target.closest('[data-lightbox-src]');if(lightbox){event.preventDefault();openLightbox(lightbox.dataset.lightboxSrc||lightbox.src);return;}
    if(event.target.closest('[data-media-lightbox-close]')||event.target.matches('[data-media-lightbox]')){closeLightbox();return;}
    const nav=event.target.closest('[data-nav]');if(nav){navigate(nav.dataset.nav);return;}
    if(event.target.closest('[data-open-account]')){openAccount();return;}if(event.target.closest('[data-close-account]')){closeAccount();return;}
    const membershipTabButton=event.target.closest('[data-membership-tab]');if(membershipTabButton){membershipTab=membershipTabButton.dataset.membershipTab;membershipPlanId='';renderMembershipContent();return;}
    const membershipPlanButton=event.target.closest('[data-membership-plan]');if(membershipPlanButton){if(!accountState.user){openAccount();return;}membershipPlanId=membershipPlanButton.dataset.membershipPlan;renderMembershipContent();requestAnimationFrame(()=>$('[data-view-panel="membership"] .membership-checkout')?.scrollIntoView({behavior:'smooth',block:'nearest'}));return;}
    const membershipPaymentButton=event.target.closest('[data-membership-payment]');if(membershipPaymentButton){membershipPaymentMethod=membershipPaymentButton.dataset.membershipPayment;renderMembershipContent();return;}
    if(event.target.closest('[data-membership-cancel-checkout]')){membershipPlanId='';renderMembershipContent();return;}
    if(event.target.closest('[data-membership-refresh]')){membershipStore.load(true).catch(()=>{});return;}
    const switcher=event.target.closest('[data-show-auth]');if(switcher){showAuth(switcher.dataset.showAuth);return;}
    if(event.target.closest('[data-archive-refresh]')){archiveStore.load(true).catch(error=>toast(error.message||'刷新失败。'));return;}
    if(event.target.closest('[data-bird-refresh]')){birdStore.load(true).catch(error=>toast(error.message||'刷新失败。'));return;}
    if(event.target.closest('[data-bird-compose-toggle]')){birdComposeOpen=!birdComposeOpen;if(!birdComposeOpen)releaseBirdFiles();renderBirdCompose();requestAnimationFrame(()=>$('[data-bird-compose-form] input[name="title"]')?.focus());return;}
    const removeBirdFile=event.target.closest('[data-bird-remove-file]');if(removeBirdFile){const index=Number(removeBirdFile.dataset.birdRemoveFile);const url=birdDraft.previews[index];if(url)URL.revokeObjectURL(url);birdDraft.files.splice(index,1);birdDraft.previews.splice(index,1);renderBirdCompose();return;}
    const birdReact=event.target.closest('[data-bird-react]');if(birdReact){try{await birdStore.react(birdReact.dataset.postId,birdReact.dataset.birdReact);toast('互动已记录。');}catch(error){toast(error.message||'互动失败。');}return;}
    const deleteBirdPost=event.target.closest('[data-bird-delete-post]');if(deleteBirdPost){if(!window.confirm('确定删除这条内容吗？'))return;try{await birdStore.deletePost(deleteBirdPost.dataset.birdDeletePost);toast('内容已删除。');}catch(error){toast(error.message||'删除失败。');}return;}
    const deleteBirdComment=event.target.closest('[data-bird-delete-comment]');if(deleteBirdComment){if(!window.confirm('确定删除这条评论吗？'))return;try{await birdStore.deleteComment(deleteBirdComment.dataset.birdDeleteComment);toast('评论已删除。');}catch(error){toast(error.message||'删除失败。');}return;}
    if(event.target.closest('[data-bird-close]')){birdStore.closePost();return;}
    const openBird=event.target.closest('[data-bird-open]');if(openBird){birdStore.openPost(openBird.dataset.birdOpen);return;}
    if(event.target.closest('[data-poll-refresh]')){pollStore.load(true).catch(error=>toast(error.message||'刷新失败。'));return;}
    if(event.target.closest('[data-poll-create-toggle]')){pollCreateOpen=!pollCreateOpen;renderPolls();requestAnimationFrame(()=>$('[data-poll-create-form] input[name="title"]')?.focus());return;}
    const pollTab=event.target.closest('[data-poll-filter]');if(pollTab){pollFilter=pollTab.dataset.pollFilter;renderPolls();return;}
    const pollVote=event.target.closest('[data-poll-vote]');if(pollVote){try{await pollStore.vote(pollVote.dataset.pollVote,pollVote.dataset.optionId);toast('投票已记录，截止前可以改票。');}catch(error){toast(error.message||'投票失败。');}return;}
    const pollDelete=event.target.closest('[data-poll-delete-option]');if(pollDelete){if(!window.confirm('确定删除这个补充选项吗？已有投票的选项不能删除。'))return;try{await pollStore.deleteOption(pollDelete.dataset.pollDeleteOption);toast('补充选项已删除。');}catch(error){toast(error.message||'删除失败。');}return;}
    const promote=event.target.closest('[data-poll-promote]');if(promote){if(!window.confirm('确定将这个课题设为官方课题并置顶吗？'))return;try{await pollStore.promote(promote.dataset.pollPromote);pollFilter='official';toast('已设为官方课题并置顶。');}catch(error){toast(error.message||'设置失败。');}return;}
    if(event.target.closest('[data-square-echo-toggle]')){squareMode=squareMode==='echo'?'feed':'echo';renderSquareMode();if(squareMode==='echo')socialStore.loadEcho().catch(error=>toast(error.message||'回声读取失败。'));return;}
    if(event.target.closest('[data-square-refresh]')){if(squareMode==='echo')socialStore.loadEcho(true).catch(error=>toast(error.message||'回声刷新失败。'));else feedStore.load(true).catch(error=>toast(error.message||'刷新失败。'));return;}
    const composePickerTab=event.target.closest('[data-compose-picker-tab]');if(composePickerTab){composeDraft.pickerTab=composePickerTab.dataset.composePickerTab;if(composeDraft.pickerTab==='stickers')socialStore.loadStickers().catch(error=>toast(error.message));renderCompose();return;}
    const composeEmoji=event.target.closest('[data-compose-emoji]');if(composeEmoji){if(composeDraft.text.length+composeEmoji.dataset.composeEmoji.length<=500)composeDraft.text+=composeEmoji.dataset.composeEmoji;renderCompose();requestAnimationFrame(()=>$('[data-compose-form] textarea')?.focus());return;}
    const composeSticker=event.target.closest('[data-compose-sticker]');if(composeSticker){const url=composeSticker.dataset.composeSticker;if(composeDraft.stickers.has(url))composeDraft.stickers.clear();else{composeDraft.stickers.clear();composeDraft.stickers.add(url);rememberSticker(url);}renderCompose();return;}
    if(event.target.closest('[data-compose-sticker-remove]')){composeDraft.stickers.clear();renderCompose();return;}
    if(event.target.closest('[data-compose-image-remove]')){releasePreview(composeDraft);renderCompose();return;}
    const commentPickerTab=event.target.closest('[data-comment-picker-tab]');if(commentPickerTab){const draft=draftFor(commentPickerTab.dataset.postId);draft.pickerTab=commentPickerTab.dataset.commentPickerTab;if(draft.pickerTab==='stickers')socialStore.loadStickers().catch(error=>toast(error.message));renderPostDetail();return;}
    const commentEmoji=event.target.closest('[data-comment-emoji]');if(commentEmoji){const draft=draftFor(commentEmoji.dataset.postId);if(draft.text.length+commentEmoji.dataset.commentEmoji.length<=180)draft.text+=commentEmoji.dataset.commentEmoji;renderPostDetail();requestAnimationFrame(()=>$('[data-comment-form] textarea')?.focus());return;}
    const commentSticker=event.target.closest('[data-comment-sticker]');if(commentSticker){const draft=draftFor(commentSticker.dataset.postId);const url=commentSticker.dataset.commentSticker;if(draft.stickers.has(url))draft.stickers.clear();else{draft.stickers.clear();draft.stickers.add(url);rememberSticker(url);}renderPostDetail();return;}
    const removeCommentSticker=event.target.closest('[data-comment-sticker-remove]');if(removeCommentSticker){draftFor(removeCommentSticker.dataset.commentStickerRemove).stickers.clear();renderPostDetail();return;}
    const removeCommentImage=event.target.closest('[data-comment-image-remove]');if(removeCommentImage){releasePreview(draftFor(removeCommentImage.dataset.commentImageRemove));renderPostDetail();return;}
    const react=event.target.closest('[data-react]');if(react){try{const added=await feedStore.toggleReaction(react.dataset.postId,react.dataset.react);toast(added?'已收到。':'已撤回。');}catch(error){toast(error.message||'互动失败。');}return;}
    const reply=event.target.closest('[data-reply-comment]');if(reply){const post=feedState.posts.find(row=>String(row.id)===String(feedState.openPostId));const comment=post?.comments.find(row=>String(row.id)===String(reply.dataset.replyComment));if(comment){feedStore.setReply(comment);requestAnimationFrame(()=>$('[data-comment-form] textarea')?.focus());}return;}
    if(event.target.closest('[data-clear-reply]')){feedStore.clearReply();return;}
    const deletePost=event.target.closest('[data-delete-post]');if(deletePost){if(!window.confirm('确定删除这条帖子吗？'))return;try{await feedStore.deletePost(deletePost.dataset.deletePost);toast('帖子已删除。');}catch(error){toast(error.message||'删除失败。');}return;}
    const deleteComment=event.target.closest('[data-delete-comment]');if(deleteComment){if(!window.confirm('确定删除这条评论吗？'))return;try{await feedStore.deleteComment(deleteComment.dataset.deleteComment);toast('评论已删除。');}catch(error){toast(error.message||'删除失败。');}return;}
    const report=event.target.closest('[data-report-post]');if(report){const reason=window.prompt('请填写举报原因（至少 2 个字）');if(reason==null)return;try{await feedStore.report('post',report.dataset.reportPost,reason);toast('举报已提交，管理员会处理。');}catch(error){toast(error.message||'举报失败。');}return;}
    if(event.target.closest('[data-close-post]')){feedStore.closePost();return;}
    const openPost=event.target.closest('[data-open-post]');if(openPost){feedStore.openPost(openPost.dataset.openPost);socialStore.loadStickers().catch(()=>{});return;}
    if(event.target.closest('[data-echo-refresh]')){socialStore.loadEcho(true);return;}
    if(event.target.closest('[data-echo-mark-all]')){try{await socialStore.markAllEchoRead();}catch(error){toast(error.message||'全部已读失败。');}return;}
    const echoPost=event.target.closest('[data-echo-post]');if(echoPost){const item=echoPost.closest('[data-echo-item]');try{if(item)await socialStore.markEchoRead([item.dataset.echoItem]);await feedStore.openPostById(echoPost.dataset.echoPost);socialStore.loadStickers().catch(()=>{});}catch(error){toast(error.message||'帖子读取失败。');}return;}
    const tab=event.target.closest('[data-buddy-tab]');if(tab){socialStore.setBuddyTab(tab.dataset.buddyTab);return;}
    const chat=event.target.closest('[data-open-chat]');if(chat&&!event.target.closest('[data-remove-friend]')){try{await socialStore.openChat(chat.dataset.openChat);$('[data-chat-compose] input')?.focus();}catch(error){toast(error.message||'私聊打开失败。');}return;}
    const add=event.target.closest('[data-add-friend]');if(add){try{const result=await socialStore.sendFriendRequest(add.dataset.addFriend);toast(result==='already_accepted'?'你们已经是搭子了。':result==='already_pending'?'搭子申请已经发出，等待对方处理。':result==='blocked'?'当前不能发送搭子申请。':'搭子申请已发出。');}catch(error){toast(error.message||'发送申请失败。');}return;}
    const accept=event.target.closest('[data-accept-friend]');if(accept){try{await socialStore.respondFriendship(accept.dataset.acceptFriend,true);toast('已同意搭子申请。');socialStore.setBuddyTab('friends');}catch(error){toast(error.message||'处理失败。');}return;}
    const reject=event.target.closest('[data-reject-friend]');if(reject){try{await socialStore.respondFriendship(reject.dataset.rejectFriend,false);toast('已拒绝搭子申请。');}catch(error){toast(error.message||'处理失败。');}return;}
    const remove=event.target.closest('[data-remove-friend]');if(remove){if(!window.confirm('确定处理这个搭子关系吗？'))return;try{await socialStore.removeFriendship(remove.dataset.removeFriend);toast('已处理搭子关系。');}catch(error){toast(error.message||'操作失败。');}return;}
    if(event.target.closest('[data-close-chat]')){socialStore.closeChat();return;}
    if(event.target.closest('[data-emoji-toggle]')){const panel=$('[data-emoji-panel]');panel.hidden=!panel.hidden;if(!panel.hidden)renderEmojiPanel();return;}
    const emojiSwitch=event.target.closest('[data-emoji-tab]');if(emojiSwitch){emojiTab=emojiSwitch.dataset.emojiTab;if(emojiTab==='stickers')socialStore.loadStickers().catch(error=>toast(error.message));renderEmojiPanel();return;}
    const emoji=event.target.closest('[data-insert-emoji]');if(emoji){const input=$('[data-chat-compose] input');input.value+=emoji.dataset.insertEmoji;input.focus();return;}
    const sticker=event.target.closest('[data-send-sticker]');if(sticker){try{rememberSticker(sticker.dataset.sendSticker);await socialStore.sendMessage('',{stickerUrl:sticker.dataset.sendSticker});$('[data-emoji-panel]').hidden=true;}catch(error){toast(error.message||'发送失败。');}return;}
    if(event.target.closest('[data-upload-sticker]')){$('[data-sticker-file]').click();return;}
    const deleteSticker=event.target.closest('[data-delete-sticker]');if(deleteSticker){event.stopPropagation();try{await socialStore.deleteSticker(deleteSticker.dataset.deleteSticker);toast('表情已删除。');}catch(error){toast(error.message||'删除失败。');}return;}
  });
  $('[data-account-modal]').addEventListener('click',event=>{if(event.target.matches('[data-account-modal]'))closeAccount();});
  window.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(!$('[data-media-lightbox]')?.hidden){closeLightbox();return;}if(!$('[data-account-modal]').hidden)closeAccount();});
}

async function runForm(form,action,success){setFormStatus('正在处理…');try{const value=await action(new FormData(form));setFormStatus('');await success?.(value);}catch(error){setFormStatus(error.message||'操作失败，请稍后重试。',true);}}
function bindForms(){
  $('[data-auth-view="login"]').addEventListener('submit',event=>{event.preventDefault();runForm(event.currentTarget,fd=>authStore.signIn(fd.get('email'),fd.get('password')),()=>{toast('登录成功。');closeAccount();});});
  $('[data-auth-view="register"]').addEventListener('submit',event=>{event.preventDefault();runForm(event.currentTarget,fd=>authStore.beginRegistration({email:fd.get('email'),password:fd.get('password'),password2:fd.get('password2'),labCode:fd.get('labCode')}),result=>{$('[data-verify-tip]').textContent=`验证码已发送至 ${result.email}。`;showAuth('verify');});});
  $('[data-auth-view="verify"]').addEventListener('submit',event=>{event.preventDefault();runForm(event.currentTarget,fd=>authStore.finishRegistration(fd.get('token')),()=>{toast('注册成功，请登录。');showAuth('login');});});
  $('[data-auth-view="reset"]').addEventListener('submit',event=>{event.preventDefault();runForm(event.currentTarget,fd=>authStore.sendPasswordReset(fd.get('email')),()=>{toast('找回密码邮件已发送。');showAuth('login');});});
  $('[data-auth-view="profile"]').addEventListener('submit',event=>{event.preventDefault();runForm(event.currentTarget,fd=>authStore.updateProfile({nickname:fd.get('nickname'),avatarFile:fd.get('avatar')}),()=>{toast('资料已保存。');closeAccount();});});
  $('[data-resend-code]').addEventListener('click',()=>runForm($('[data-auth-view="verify"]'),()=>authStore.resendRegistration(),result=>{toast(`验证码已重新发送至 ${result.email}。`);}));
  $('[data-sign-out]').addEventListener('click',()=>runForm($('[data-auth-view="profile"]'),()=>authStore.signOut(),()=>{toast('已退出登录。');showAuth('login');}));
  $('[data-buddy-search]').addEventListener('submit',event=>{event.preventDefault();socialStore.searchProfiles(new FormData(event.currentTarget).get('q')).catch(error=>toast(error.message||'搜索失败。'));});
  $('[data-chat-compose]').addEventListener('submit',async event=>{event.preventDefault();const input=event.currentTarget.elements.message;const text=input.value;try{const targetId=await socialStore.sendMessage(text);if(String(socialStore.state.chat.targetId)===String(targetId)){input.value='';input.focus();}}catch(error){toast(error.message||'发送失败。');}});
  $('[data-sticker-file]').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{await socialStore.uploadSticker(file);toast('表情已添加。');}catch(error){toast(error.message||'添加表情失败。');}});
  document.addEventListener('input',event=>{
    const birdForm=event.target.closest?.('[data-bird-compose-form]');if(birdForm){if(event.target.name==='title')birdDraft.title=event.target.value;if(event.target.name==='content')birdDraft.content=event.target.value;if(event.target.name==='penName')birdDraft.penName=event.target.value;return;}
    if(event.target.matches('[data-compose-form] textarea')){composeDraft.text=event.target.value;const count=$('.compose-count');if(count)count.textContent=`${composeDraft.text.length}/500`;return;}
    const form=event.target.closest?.('[data-comment-form]');if(form&&event.target.matches('textarea'))draftFor(form.dataset.commentForm).text=event.target.value;
  });
  document.addEventListener('change',event=>{
    if(event.target.matches('[data-auth-view="profile"] input[name="avatar"]')){const file=event.target.files?.[0];if(avatarPreviewUrl){URL.revokeObjectURL(avatarPreviewUrl);avatarPreviewUrl='';}if(!file){setAvatar($('[data-profile-avatar]'),accountState.user);return;}if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){event.target.value='';setAvatar($('[data-profile-avatar]'),accountState.user);setFormStatus('头像请选择 JPG、PNG 或 WebP，原图不超过 10MB。',true);return;}avatarPreviewUrl=URL.createObjectURL(file);const preview=$('[data-profile-avatar]');preview.textContent='';preview.style.backgroundImage=`url("${avatarPreviewUrl}")`;preview.classList.add('has-image');setFormStatus('将按中心裁剪为正方形，并自动压缩到适合头像的大小。');return;}
    if(event.target.matches('[data-bird-files]')){const requested=Array.from(event.target.files||[]).filter(file=>/^image\//i.test(file.type||''));const incoming=requested.slice(0,20-birdDraft.files.length);birdDraft.files.push(...incoming);birdDraft.previews.push(...incoming.map(file=>URL.createObjectURL(file)));event.target.value='';if(incoming.length<requested.length)toast('最多上传 20 张图片。');renderBirdCompose();return;}
    if(event.target.matches('[data-bird-compose-form] input[name="displayMode"]')){birdDraft.displayMode=event.target.value;renderBirdCompose();return;}
    if(event.target.matches('[data-compose-image]')){const file=event.target.files?.[0];if(!file)return;releasePreview(composeDraft);composeDraft.imageFile=file;composeDraft.imagePreview=URL.createObjectURL(file);renderCompose();return;}
    if(event.target.matches('[data-comment-image]')){const file=event.target.files?.[0];if(!file)return;const draft=draftFor(event.target.dataset.commentImage);releasePreview(draft);draft.imageFile=file;draft.imagePreview=URL.createObjectURL(file);renderPostDetail();}
  });
  document.addEventListener('submit',async event=>{
    const birdCompose=event.target.closest?.('[data-bird-compose-form]');if(birdCompose){event.preventDefault();try{await birdStore.createPost({title:birdDraft.title,content:birdDraft.content,displayMode:birdDraft.displayMode,penName:birdDraft.penName,files:birdDraft.files});releaseBirdFiles();birdDraft.title='';birdDraft.content='';birdDraft.displayMode='profile';birdDraft.penName='';birdComposeOpen=false;toast('内容已发布。');renderBird();}catch(error){toast(error.message||'发布失败。');}return;}
    const birdComment=event.target.closest?.('[data-bird-comment-form]');if(birdComment){event.preventDefault();try{await birdStore.createComment(birdComment.dataset.birdCommentForm,new FormData(birdComment).get('content'));toast('评论已发送。');}catch(error){toast(error.message||'评论失败。');}return;}
    const createPoll=event.target.closest?.('[data-poll-create-form]');if(createPoll){event.preventDefault();const fd=new FormData(createPoll);try{await pollStore.createPoll({title:fd.get('title'),options:[1,2,3,4].map(index=>fd.get(`option${index}`)),isOfficial:fd.get('official')==='on'});pollCreateOpen=false;pollFilter=accountState.user?.role==='admin'&&fd.get('official')==='on'?'official':'user';toast('投票课题已发布。');renderPolls();}catch(error){toast(error.message||'发布失败。');}return;}
    const addOption=event.target.closest?.('[data-poll-add-option]');if(addOption){event.preventDefault();try{await pollStore.addOption(addOption.dataset.pollAddOption,new FormData(addOption).get('label'));toast('新选项已加入并投票。');}catch(error){toast(error.message||'新增选项失败。');}return;}
    const compose=event.target.closest?.('[data-compose-form]');if(compose){event.preventDefault();try{await feedStore.createPost({text:composeDraft.text,imageFile:composeDraft.imageFile,stickerUrls:Array.from(composeDraft.stickers)});releasePreview(composeDraft);composeDraft.text='';composeDraft.stickers.clear();toast('已投递到精神广场。');navigate('square');}catch(error){toast(error.message||'发布失败。');}return;}
    const comment=event.target.closest?.('[data-comment-form]');if(comment){event.preventDefault();const postId=comment.dataset.commentForm;const draft=draftFor(postId);try{await feedStore.createComment({postId,text:draft.text,imageFile:draft.imageFile,stickerUrls:Array.from(draft.stickers)});releasePreview(draft);draft.text='';draft.stickers.clear();toast('评论已发送。');renderPostDetail();}catch(error){toast(error.message||'评论失败。');}}
  });
}
bindSidebarMore();bindNavigation();bindForms();homeWidgets.init({toast,openAccount});gamePartyUi.init({toast});authStore.subscribe(renderAccount);membershipStore.subscribe(renderMembership);membershipStore.start();socialStore.subscribe(renderSocial);feedStore.subscribe(renderFeed);pollStore.subscribe(renderPolls);birdStore.subscribe(renderBird);archiveStore.subscribe(renderArchive);authStore.boot();
