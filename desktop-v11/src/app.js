import {authStore} from './auth-store.js';
import {socialStore} from './social-store.js';
import {APP_VERSION} from './config.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>Array.from(document.querySelectorAll(selector));
const routes={
  home:['首页','活动、公告和每天一句话都会放在这里'],compose:['发牢骚','把今天想说的话单独放在这里'],square:['精神广场','匿名说点真话，也听听别人的今天'],rooms:['学术研讨','一本正经地研究不太正经的问题'],bird:['观鸟台','看看研究所里此刻发生了什么'],echo:['回声','评论、回复和互动都在这里'],buddy:['搭子','左边选人，右边直接聊天'],archive:['废话档案','翻一翻被留下来的研究记录']
};
const EMOJIS=['😀','😄','😂','🤣','😊','🥰','😍','😘','😋','😎','🤔','🙃','😴','🥱','😭','🥺','😤','😡','🤯','😱','👍','👎','👏','🙏','💪','🤝','❤️','💔','✨','🎉','☕','🍉','🐟','🫠','🫡','🤡'];
let accountState={ready:false,busy:false,user:null};
let socialState=socialStore.state;
let currentAuthView='login';
let currentView='home';
let emojiTab='emoji';
let lastChatSignature='';

window.__FW_DESKTOP_V11__={version:APP_VERSION,architecture:'local-frontend',contentRequests:0,socialContentRequests:0,realtimeChat:true,pollingTimers:0};

function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function initials(name){return String(name||'FW').trim().slice(0,2).toUpperCase();}
function avatarHtml(profile,className='social-avatar'){
  const name=profile?.nickname||'研究员';const url=profile?.avatar_url||profile?.avatarUrl||'';
  return url?`<span class="${className} has-image"><img src="${esc(url)}" alt="${esc(name)}"></span>`:`<span class="${className}">${esc(initials(name))}</span>`;
}
function setAvatar(element,user){
  if(!element)return;element.textContent='';element.style.backgroundImage='';
  if(user?.avatarUrl){element.style.backgroundImage=`url("${String(user.avatarUrl).replace(/["\\]/g,'')}")`;element.classList.add('has-image');}
  else{element.textContent=initials(user?.nickname);element.classList.remove('has-image');}
}
function toast(message){const node=$('[data-toast]');node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2800);}
function setFormStatus(message,error=false){const node=$('[data-form-status]');node.textContent=message||'';node.classList.toggle('error',error);}
function timeText(value){
  if(!value)return'刚刚';const date=new Date(value);if(Number.isNaN(date.getTime()))return'刚刚';const minutes=Math.floor(Math.max(0,Date.now()-date.getTime())/60000);if(minutes<1)return'刚刚';if(minutes<60)return`${minutes}分钟前`;const hours=Math.floor(minutes/60);if(hours<24)return`${hours}小时前`;const days=Math.floor(hours/24);return days<7?`${days}天前`:date.toLocaleDateString('zh-CN');
}
function noticeText(type){return({like:'点赞了你的帖子',same:'对你说：俺也一样',tissue:'给你递了纸巾',comment:'评论了你的帖子',comment_reply:'回复了你的评论',chat_agree:'赞同了你的房间消息',system:'发送了一条系统通知'})[type]||'给你发来一条回声';}
function previewText(value){return String(value||'对你的低功耗发言产生了回应。').replace(/\[\[FW_USER_STICKER:[A-Za-z0-9+/=]+\]\]/g,'动画表情').replace(/\[\[FW_MEDIA_IMAGE:[A-Za-z0-9+/=]+\]\]/g,'图片').replace(/\[\[FW_MEDIA_VIDEO:[A-Za-z0-9+/=]+\]\]/g,'视频').replace(/\s+/g,' ').trim()||'对你的低功耗发言产生了回应。';}
function decodeSticker(value){const match=String(value||'').trim().match(/^\[\[FW_USER_STICKER:([A-Za-z0-9+/=]+)\]\]$/);if(!match)return'';try{return atob(match[1]);}catch{return'';}}

function renderAccount(next){
  accountState=next;const user=next.user;
  $('[data-account-label]').textContent=user?user.nickname:(next.ready?'注册 / 登录':'正在连接…');
  setAvatar($('[data-account-avatar]'),user);setAvatar($('[data-profile-avatar]'),user);
  $('[data-profile-name]').textContent=user?.nickname||'研究员';$('[data-profile-email]').textContent=user?.email||'';
  const profile=$('[data-auth-view="profile"]');if(profile&&user){profile.elements.labCode.value=user.labCode||'';profile.elements.nickname.value=user.nickname||'';}
  $$('[data-account-modal] button, [data-account-modal] input').forEach(node=>{if(!node.matches('[data-close-account]'))node.disabled=Boolean(next.busy);});
  if(next.ready&&!user&&(currentView==='echo'||currentView==='buddy'))renderSocial();
}

function showAuth(view){
  currentAuthView=view;const labels={login:['账号登录','输入邮箱和密码，进入研究所。'],register:['注册账号','填写信息后，我们会向邮箱发送验证码。'],verify:['验证邮箱','输入邮件中的验证码，完成注册。'],reset:['找回密码','输入邮箱，接收找回密码邮件。'],profile:['个人资料','修改昵称和头像，账号数据继续与网页、手机端共用。']};
  const [title,copy]=labels[view]||labels.login;$('[data-account-title]').textContent=title;$('[data-account-copy]').textContent=copy;
  $$('[data-auth-view]').forEach(panel=>panel.hidden=panel.dataset.authView!==view);setFormStatus('');requestAnimationFrame(()=>{$(`[data-auth-view="${view}"] input:not([disabled])`)?.focus();});
}
function openAccount(){const modal=$('[data-account-modal]');modal.hidden=false;document.body.classList.add('modal-open');showAuth(accountState.user?'profile':'login');}
function closeAccount(){$('[data-account-modal]').hidden=true;document.body.classList.remove('modal-open');setFormStatus('');}

function navigate(view){
  const route=routes[view]||routes.home;currentView=view;$('#app').dataset.view=view;$('[data-page-title]').textContent=route[0];$('[data-page-subtitle]').textContent=route[1];
  $$('[data-nav]').forEach(node=>node.classList.toggle('active',node.dataset.nav===view));
  $$('[data-view-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.viewPanel===(['home','echo','buddy'].includes(view)?view:'pending')));
  if(!['home','echo','buddy'].includes(view)){$('[data-pending-title]').textContent=route[0]+'正在迁移';$('[data-pending-copy]').textContent=`${route[0]}会直接接入共用数据库，不再加载网页版对应页面。当前 1.0.5 的原有功能不受影响。`;}
  $('[data-emoji-panel]').hidden=true;
  if(view!=='buddy')socialStore.closeChat();
  if(view==='echo')socialStore.loadEcho();
  if(view==='buddy')socialStore.loadBuddy();
}

function setBadge(kind,count){const badge=$(`[data-badge="${kind}"]`);const value=Number(count||0);badge.hidden=value<=0;badge.textContent=value>99?'99+':String(value||'');}
function echoPostId(row){if(row.__post_id)return String(row.__post_id);if(row.target_type==='post'&&row.target_id)return String(row.target_id);if(['like','same','tissue','comment'].includes(row.type)&&row.target_id)return String(row.target_id);return'';}

function renderEcho(){
  const list=$('[data-echo-list]');if(!list)return;
  const markAll=$('[data-echo-mark-all]');const rows=socialState.echo.rows||[];markAll.hidden=!rows.some(row=>!row.is_read);
  if(!accountState.user){list.innerHTML='<div class="state-card"><b>登录后查看回声</b><span>账号数据与网页和手机端共用。</span><button class="primary compact" type="button" data-open-account>注册 / 登录</button></div>';return;}
  if(socialState.echo.loading&&!socialState.echo.loaded){list.innerHTML='<div class="state-card">正在读取回声...</div>';return;}
  if(!rows.length){list.innerHTML='<div class="state-card"><b>暂时没有新的回声</b><span>安静也是一种运行状态。</span></div>';return;}
  list.innerHTML=rows.map(row=>{
    const profile=socialState.echo.profiles[row.actor_id]||{};const name=profile.nickname||'某位研究员';const postId=echoPostId(row);
    return `<article class="echo-item ${row.is_read?'':'unread'}" data-echo-item="${esc(row.id)}">${avatarHtml(profile)}<div class="echo-main"><b>${esc(name)} ${esc(noticeText(row.type))}</b><span>${esc(previewText(row.content))}</span><time>${esc(timeText(row.created_at))}</time></div><div class="row-actions">${postId?`<button class="primary compact" type="button" data-echo-post="${esc(postId)}" data-open-comments="${row.type==='comment'||row.type==='comment_reply'?'1':'0'}">查看帖子</button>`:''}${row.type==='chat_agree'?'<button class="secondary compact" type="button" data-nav="rooms">去学术研讨</button>':''}</div></article>`;
  }).join('');
}

function buddyRelation(userId){const me=accountState.user?.id;return(socialState.buddy.rows||[]).find(row=>(String(row.requester_id)===String(me)&&String(row.receiver_id)===String(userId))||(String(row.receiver_id)===String(me)&&String(row.requester_id)===String(userId)))||null;}
function buddyOtherId(row){return String(row.requester_id)===String(accountState.user?.id)?String(row.receiver_id):String(row.requester_id);}
function buddyCard(row,{mode='friend'}={}){
  const userId=buddyOtherId(row);const profile=socialState.buddy.profiles[userId]||{};const name=profile.nickname||'低功耗研究员';
  if(mode==='friend')return `<article class="buddy-item ${socialState.chat.targetId===userId?'active':''}" data-open-chat="${esc(userId)}">${avatarHtml(profile)}<div class="buddy-main"><b>${esc(name)}</b><span>实验品编号：${esc(profile.lab_code||'未设置')}</span></div><div class="row-actions"><button class="secondary compact danger" type="button" data-remove-friend="${esc(row.id)}">解除</button></div></article>`;
  const incoming=String(row.receiver_id)===String(accountState.user?.id);return `<article class="buddy-item">${avatarHtml(profile)}<div class="buddy-main"><b>${esc(name)}</b><span>实验品编号：${esc(profile.lab_code||'未设置')} · ${incoming?'对方想加你为搭子':'等待对方处理'}</span></div><div class="row-actions">${incoming?`<button class="primary compact" type="button" data-accept-friend="${esc(row.id)}">同意</button><button class="secondary compact danger" type="button" data-reject-friend="${esc(row.id)}">拒绝</button>`:`<button class="secondary compact danger" type="button" data-remove-friend="${esc(row.id)}">撤回</button>`}</div></article>`;
}

function messagePreview(value){return decodeSticker(value)?'动画表情':String(value||'[消息]').replace(/\s+/g,' ').trim();}
function renderMessageList(accepted){
  const rows=accepted.map(friend=>{const userId=buddyOtherId(friend);return{friend,userId,profile:socialState.buddy.profiles[userId]||{},latest:socialState.buddy.latest[userId]||null,unread:Number(socialState.buddy.unread[userId]||0)};}).sort((a,b)=>b.unread-a.unread||new Date(b.latest?.created_at||0)-new Date(a.latest?.created_at||0)||String(a.profile.nickname||'').localeCompare(String(b.profile.nickname||''),'zh-CN'));
  if(!rows.length)return'<div class="state-card">暂时还没有搭子消息。先去“新的搭子”加一个搭子吧。</div>';
  return rows.map(item=>{const mine=String(item.latest?.sender_id||'')===String(accountState.user?.id);return `<article class="buddy-item message-item ${item.unread?'unread':''} ${socialState.chat.targetId===item.userId?'active':''}" data-open-chat="${esc(item.userId)}">${avatarHtml(item.profile)}${item.unread?`<i class="unread-dot">${item.unread>99?'99+':item.unread}</i>`:''}<div class="buddy-main"><b>${esc(item.profile.nickname||'低功耗搭子')}</b><span>${esc(item.latest?(mine?'我：':'')+messagePreview(item.latest.content):'还没有消息，点这里打个招呼')}</span><time>${item.latest?esc(timeText(item.latest.created_at)):''}</time></div></article>`;}).join('');
}

function renderSearchResults(){
  const rows=socialState.buddy.search||[];if(socialState.buddy.searching)return'<div class="state-card">正在搜索实验品...</div>';if(!rows.length)return'';
  return `<section class="buddy-section"><h3>搜索结果</h3>${rows.map(profile=>{const relation=buddyRelation(profile.id);let actions=`<button class="primary compact" type="button" data-add-friend="${esc(profile.id)}">加为搭子</button>`;let text='可以发送搭子申请';if(relation?.status==='accepted'){actions=`<button class="primary compact" type="button" data-open-chat="${esc(profile.id)}">打开私聊</button>`;text='已是搭子';}else if(relation?.status==='pending'&&String(relation.requester_id)===String(accountState.user?.id)){actions='<button class="secondary compact" type="button" disabled>等待处理</button>';text='申请已发出';}else if(relation?.status==='pending'){actions=`<button class="primary compact" type="button" data-accept-friend="${esc(relation.id)}">同意</button><button class="secondary compact danger" type="button" data-reject-friend="${esc(relation.id)}">拒绝</button>`;text='对方想加你为搭子';}else if(relation?.status==='blocked'){actions='<button class="secondary compact" type="button" disabled>已拉黑</button>';text='当前不可添加';}return `<article class="buddy-item">${avatarHtml(profile)}<div class="buddy-main"><b>${esc(profile.nickname||'低功耗研究员')}</b><span>实验品编号：${esc(profile.lab_code||'未设置')} · ${esc(text)}</span></div><div class="row-actions">${actions}</div></article>`;}).join('')}</section>`;
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

function messageBubble(row){const mine=String(row.sender_id)===String(accountState.user?.id);const sticker=decodeSticker(row.content);return `<article class="chat-message ${mine?'mine':''}"><small>${mine?'你':esc(socialState.chat.profile?.nickname||'搭子')}</small><div class="chat-bubble ${sticker?'sticker':''}">${sticker?`<img src="${esc(sticker)}" alt="表情">`:esc(row.content)}</div><time>${esc(timeText(row.created_at))}</time></article>`;}
function renderChat(){
  const chat=socialState.chat;const messages=$('[data-chat-messages]');const input=$('[data-chat-compose] input');const submit=$('[data-chat-compose] button[type="submit"]');const emoji=$('[data-emoji-toggle]');
  $('[data-chat-title]').textContent=chat.targetId?`和 ${chat.profile?.nickname||'搭子'} 私聊`:'选择一个搭子';$('[data-chat-subtitle]').textContent=chat.targetId?(chat.profile?.lab_code?`实验品编号：${chat.profile.lab_code}`:'实验品编号：未设置'):'左边点一个消息或搭子，右边直接聊天。';$('[data-close-chat]').hidden=!chat.targetId;
  const enabled=Boolean(chat.targetId&&!chat.loading);input.disabled=!enabled;submit.disabled=!enabled||chat.sending;emoji.disabled=!enabled;input.placeholder=enabled?'说一句只给搭子看的话，最多 300 字...':'先从左侧选择一个搭子';submit.textContent=chat.sending?'发送中...':'发送';
  const signature=(chat.rows||[]).map(row=>row.id).join('|');const shouldScroll=signature!==lastChatSignature;lastChatSignature=signature;
  if(chat.loading){messages.innerHTML='<div class="state-card">正在打开私聊...</div>';return;}if(!chat.targetId){messages.innerHTML='<div class="state-card">还没有选择聊天对象。</div>';return;}if(!chat.rows.length){messages.innerHTML='<div class="state-card">还没有私聊消息。可以先低功耗地打个招呼。</div>';return;}
  messages.innerHTML=chat.rows.map(messageBubble).join('');if(shouldScroll)requestAnimationFrame(()=>{messages.scrollTop=messages.scrollHeight;});
}

function renderEmojiPanel(){
  const body=$('[data-emoji-body]');if(!body)return;$$('[data-emoji-tab]').forEach(button=>button.classList.toggle('active',button.dataset.emojiTab===emojiTab));
  if(emojiTab==='emoji'){body.innerHTML=`<div class="emoji-grid">${EMOJIS.map(item=>`<button type="button" data-insert-emoji="${esc(item)}">${esc(item)}</button>`).join('')}</div>`;return;}
  if(socialState.stickers.loading&&!socialState.stickers.loaded){body.innerHTML='<div class="state-card small">正在读取我的表情...</div>';return;}
  body.innerHTML=`<div class="sticker-toolbar"><button class="secondary compact" type="button" data-upload-sticker>＋ 添加表情</button><span>${socialState.stickers.rows.length}/80 · 最大 1MB</span></div>`+(socialState.stickers.rows.length?`<div class="sticker-grid">${socialState.stickers.rows.map(row=>`<div class="sticker-item"><button type="button" data-send-sticker="${esc(row.image_url)}"><img src="${esc(row.image_url)}" alt="表情"></button><button class="sticker-delete" type="button" data-delete-sticker="${esc(row.id)}" aria-label="删除表情">×</button></div>`).join('')}</div>`:'<div class="state-card small">还没有添加自定义表情；可以添加 JPG、PNG、WebP 或 GIF。</div>');
}

function renderSocial(next=socialState){socialState=next;setBadge('echo',next.badges.echo);setBadge('buddy',next.badges.buddy);renderEcho();renderBuddyList();renderChat();if(!$('[data-emoji-panel]').hidden)renderEmojiPanel();}

function bindNavigation(){
  document.addEventListener('click',async event=>{
    const nav=event.target.closest('[data-nav]');if(nav){navigate(nav.dataset.nav);return;}
    if(event.target.closest('[data-open-account]')){openAccount();return;}if(event.target.closest('[data-close-account]')){closeAccount();return;}
    const switcher=event.target.closest('[data-show-auth]');if(switcher){showAuth(switcher.dataset.showAuth);return;}
    if(event.target.closest('[data-echo-refresh]')){socialStore.loadEcho(true);return;}
    if(event.target.closest('[data-echo-mark-all]')){await socialStore.markEchoRead(socialState.echo.rows.filter(row=>!row.is_read).map(row=>row.id));return;}
    const echoItem=event.target.closest('[data-echo-item]');if(echoItem)await socialStore.markEchoRead([echoItem.dataset.echoItem]);
    const echoPost=event.target.closest('[data-echo-post]');if(echoPost){sessionStorage.setItem('fw:desktop:v11:pending-post',JSON.stringify({id:echoPost.dataset.echoPost,comments:echoPost.dataset.openComments==='1'}));navigate('square');return;}
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
    const sticker=event.target.closest('[data-send-sticker]');if(sticker){try{await socialStore.sendMessage('',{stickerUrl:sticker.dataset.sendSticker});$('[data-emoji-panel]').hidden=true;}catch(error){toast(error.message||'发送失败。');}return;}
    if(event.target.closest('[data-upload-sticker]')){$('[data-sticker-file]').click();return;}
    const deleteSticker=event.target.closest('[data-delete-sticker]');if(deleteSticker){event.stopPropagation();try{await socialStore.deleteSticker(deleteSticker.dataset.deleteSticker);toast('表情已删除。');}catch(error){toast(error.message||'删除失败。');}return;}
  });
  $('[data-account-modal]').addEventListener('click',event=>{if(event.target.matches('[data-account-modal]'))closeAccount();});
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('[data-account-modal]').hidden)closeAccount();});
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
  $('[data-chat-compose]').addEventListener('submit',async event=>{event.preventDefault();const input=event.currentTarget.elements.message;const text=input.value;try{await socialStore.sendMessage(text);input.value='';input.focus();}catch(error){toast(error.message||'发送失败。');}});
  $('[data-sticker-file]').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{await socialStore.uploadSticker(file);toast('表情已添加。');}catch(error){toast(error.message||'添加表情失败。');}});
}
function bindConnection(){const render=()=>{const online=navigator.onLine!==false;const node=$('[data-connection-state]');node.textContent=online?'已连接':'网络已断开';node.classList.toggle('offline',!online);};window.addEventListener('online',render);window.addEventListener('offline',render);render();}

bindNavigation();bindForms();bindConnection();authStore.subscribe(renderAccount);socialStore.subscribe(renderSocial);authStore.boot();
