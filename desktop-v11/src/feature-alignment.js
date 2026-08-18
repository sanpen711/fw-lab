import {authStore} from './auth-store.js';
import {feedStore} from './feed-store.js';
import {socialStore} from './social-store.js';
import {pollStore} from './poll-store.js';
import {birdStore} from './bird-store.js';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const client=authStore.client;
const videoDrafts={compose:false,comments:new Set()};
let activeExtraView='';
let enhanceTimer=0;
let chatMediaBusy=false;
let publicLogsCache=[];

function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[char]));}
function toast(message){
  const node=$('[data-toast]');
  if(!node)return;
  node.textContent=String(message||'');node.classList.add('show');
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),3000);
}
function currentUser(){const user=authStore.state.user;return user&&!user.cached?user:null;}
function requireUser(){const user=currentUser();if(!user)throw new Error('请先登录。');if(user.disabled)throw new Error('这个账号已被停用。');return user;}
function safeUrl(encoded){try{const url=new URL(atob(String(encoded||'')));return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return'';}}
function marker(kind,url){return `[[${kind}:${btoa(String(url||''))}]]`;}
function fileKind(file){
  const type=String(file?.type||'').toLowerCase();const name=String(file?.name||'').toLowerCase();
  if(type.startsWith('image/')||/\.(jpe?g|png|webp|gif)$/i.test(name))return'image';
  if(type.startsWith('video/')||/\.(mp4|mov|webm|m4v)$/i.test(name))return'video';
  return'';
}
function isGif(file){return /gif/i.test(String(file?.type||''))||/\.gif$/i.test(String(file?.name||''));}
function extension(file,fallback='bin'){
  const match=String(file?.name||'').match(/\.([a-z0-9]+)$/i);if(match)return match[1].toLowerCase()==='jpeg'?'jpg':match[1].toLowerCase();
  const type=String(file?.type||'').toLowerCase();if(type.includes('jpeg'))return'jpg';if(type.includes('png'))return'png';if(type.includes('webp'))return'webp';if(type.includes('gif'))return'gif';if(type.includes('mp4'))return'mp4';if(type.includes('quicktime'))return'mov';if(type.includes('webm'))return'webm';return fallback;
}
async function videoDuration(file){
  const url=URL.createObjectURL(file);
  try{return await new Promise((resolve,reject)=>{const video=document.createElement('video');const timer=setTimeout(()=>reject(new Error('视频读取超时，请换一个视频。')),10000);video.preload='metadata';video.onloadedmetadata=()=>{clearTimeout(timer);resolve(Number(video.duration||0));};video.onerror=()=>{clearTimeout(timer);reject(new Error('视频读取失败，请换一个视频。'));};video.src=url;});}
  finally{URL.revokeObjectURL(url);}
}
async function prepareImage(file){
  if(isGif(file)){if(file.size>3*1024*1024)throw new Error('GIF 不能超过 3MB。');return{file,kind:'image',ext:'gif'};}
  if(file.size<=800*1024)return{file,kind:'image',ext:extension(file,'jpg')};
  const url=URL.createObjectURL(file);
  try{
    const image=await new Promise((resolve,reject)=>{const node=new Image();node.onload=()=>resolve(node);node.onerror=()=>reject(new Error('图片读取失败，请换一张图片。'));node.src=url;});
    const width=image.naturalWidth||image.width;const height=image.naturalHeight||image.height;const scale=Math.min(1,1280/Math.max(width,height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const context=canvas.getContext('2d',{alpha:true});if(!context)throw new Error('当前环境无法处理这张图片。');context.drawImage(image,0,0,canvas.width,canvas.height);
    let quality=.84;let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
    while(blob&&blob.size>800*1024&&quality>.42){quality=Math.max(.42,quality-.08);blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));}
    if(!blob||blob.size>800*1024)throw new Error('图片压缩后仍超过 800KB，请换一张图片。');
    return{file:new File([blob],`fw_media_${Date.now().toString(36)}.webp`,{type:'image/webp'}),kind:'image',ext:'webp'};
  }finally{URL.revokeObjectURL(url);}
}
async function prepareMedia(file){
  const kind=fileKind(file);if(!kind)throw new Error('只支持图片、GIF 或视频。');if(kind==='image')return prepareImage(file);
  if(file.size>20*1024*1024)throw new Error('视频不能超过 20MB。');const duration=await videoDuration(file);if(duration>31)throw new Error('视频请控制在 30 秒以内。');return{file,kind:'video',ext:extension(file,'mp4')};
}
async function uploadMedia(file,scope){
  const user=requireUser();const prepared=await prepareMedia(file);const path=`${user.id}/${scope}/${prepared.kind}/${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}.${prepared.ext}`;
  const uploaded=await client.storage.from('chat-media').upload(path,prepared.file,{upsert:false,cacheControl:'31536000',contentType:prepared.file.type||undefined});
  if(uploaded.error)throw new Error(`媒体上传失败：${uploaded.error.message}`);const url=client.storage.from('chat-media').getPublicUrl(path).data.publicUrl;if(!url)throw new Error('媒体地址生成失败。');return{url,kind:prepared.kind};
}

function injectStyles(){
  if($('#fw-align-style'))return;const style=document.createElement('style');style.id='fw-align-style';style.textContent=`
    .align-chat-media-trigger{width:42px;height:42px;min-width:42px;border:1px solid rgba(28,28,24,.16);border-radius:999px;background:#fffdf7;color:#171715;font-size:22px;font-weight:950;cursor:pointer;display:grid;place-items:center;padding:0}.align-chat-media-trigger:disabled{opacity:.45;cursor:not-allowed}
    .chat-compose.align-media-ready{grid-template-columns:auto auto minmax(0,1fr) auto!important}.chat-bubble.align-media{padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important}.chat-bubble.align-media img,.chat-bubble.align-media video{display:block;max-width:260px;max-height:320px;object-fit:contain;border-radius:12px;background:#111}.chat-bubble.align-media img{background:#fffdf7;border:1px solid rgba(0,0,0,.08)}
    .rich-media .align-video{display:block;max-width:320px;max-height:360px;border-radius:12px;background:#111;margin-top:10px}.image-preview video{display:block;max-width:100%;max-height:320px;border-radius:12px;background:#111}.image-preview.small video{max-height:190px}
    .align-more-wrap{position:relative;display:inline-flex}.align-more-button{min-width:34px;height:34px;border:1px solid rgba(28,28,24,.16);border-radius:999px;background:#fffdf7;color:#171715;font-size:20px;line-height:1;cursor:pointer}.align-more-menu{display:none;position:absolute;right:0;top:40px;z-index:80;min-width:150px;padding:6px;border:1px solid rgba(28,28,24,.15);border-radius:12px;background:#fffdf7;box-shadow:0 18px 48px rgba(0,0,0,.18)}.align-more-wrap.open .align-more-menu{display:grid}.align-more-menu button{height:34px;border:0;border-radius:8px;background:transparent;text-align:left;padding:0 10px;font:inherit;font-size:12px;font-weight:900;cursor:pointer}.align-more-menu button:hover{background:#f3efe7}.align-more-menu button.danger{color:#a14747}
    .align-profile-modal{position:fixed;inset:0;z-index:15000;display:grid;place-items:center;padding:24px;background:rgba(14,15,13,.55);backdrop-filter:blur(5px)}.align-profile-card{position:relative;width:min(430px,100%);padding:28px;border:1px solid rgba(217,121,121,.38);border-radius:18px;background:#fffdf7;box-shadow:0 30px 90px rgba(0,0,0,.28)}.align-profile-card>button{position:absolute;right:14px;top:14px;width:34px;height:34px;border:1px solid rgba(28,28,24,.14);border-radius:999px;background:#fff;font-size:20px}.align-profile-avatar{width:76px;height:76px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#171715;color:#fff;font-size:22px;font-weight:950}.align-profile-avatar img{width:100%;height:100%;object-fit:cover}.align-profile-card h2{margin:16px 0 4px;font-size:30px}.align-profile-card p{margin:6px 0;color:#6b665d;font-weight:760;line-height:1.65}
    .align-extra-page{padding:34px;overflow:auto}.align-extra-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:22px}.align-extra-head small{display:block;color:#a14f4f;font-weight:950;letter-spacing:.12em}.align-extra-head h1{margin:7px 0 0;font-size:44px;letter-spacing:-.06em}.align-extra-head p{margin:9px 0 0;color:#6c675e;font-weight:760;line-height:1.7}.align-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.align-card{border:1px solid rgba(28,28,24,.12);border-radius:15px;background:#fffdf7;padding:20px}.align-card b{display:block;margin-bottom:9px;font-size:18px}.align-card p,.align-card li{color:#625d55;line-height:1.72;font-weight:740}.align-card ul{margin:8px 0 0;padding-left:20px}.align-section{margin-top:18px;border:1px solid rgba(28,28,24,.12);border-radius:15px;background:#fffdf7;padding:22px}.align-section h2{margin:0 0 10px;font-size:25px}.align-privacy-grid{display:grid;gap:12px}.align-privacy-grid details{border-top:1px solid rgba(28,28,24,.09);padding:12px 0}.align-privacy-grid details:first-child{border-top:0}.align-privacy-grid summary{cursor:pointer;font-weight:950}.align-privacy-grid p,.align-privacy-grid li{color:#625d55;line-height:1.7}.align-public-list{display:grid;gap:10px}.align-log{display:grid;grid-template-columns:120px minmax(0,1fr) auto;gap:14px;align-items:center;padding:16px;border:1px solid rgba(28,28,24,.1);border-radius:12px;background:#fffdf7}.align-log time{font-size:12px;font-weight:900;color:#a14f4f}.align-log b{display:block;margin-bottom:4px}.align-log span{color:#6b665d;font-size:13px;line-height:1.55}.align-chip{display:inline-grid;place-items:center;min-height:28px;padding:0 10px;border-radius:999px;background:#171715;color:#fff!important;font-size:12px!important;font-weight:950}.align-chip.warn{background:#994747}.align-empty{padding:24px;border:1px dashed rgba(28,28,24,.18);border-radius:12px;text-align:center;color:#726d65;font-weight:850;background:#fffdf7}
    .comment-actions [data-align-report-comment]{color:#9d4a4a}.nav-item[data-align-nav]{width:100%}
    @media(max-width:900px){.align-card-grid{grid-template-columns:1fr}.align-log{grid-template-columns:1fr}.align-extra-page{padding:24px}.align-extra-head{align-items:flex-start;flex-direction:column}}
  `;document.head.appendChild(style);
}

function setFirstText(label,text){if(!label)return;const node=Array.from(label.childNodes).find(item=>item.nodeType===Node.TEXT_NODE);if(node)node.nodeValue=text;}
function enhancePostMediaInputs(){
  const compose=$('[data-compose-image]');if(compose){compose.accept='image/*,video/*';setFirstText(compose.closest('label'),'添加图片 / 视频');const hint=compose.closest('.media-tools')?.querySelector('span');if(hint)hint.textContent='图片会自动压缩；GIF 最大 3MB；视频最大 20MB、30 秒；表情最多 6 个。';}
  $$('[data-comment-image]').forEach(input=>{input.accept='image/*,video/*';setFirstText(input.closest('label'),'图片 / 视频');const hint=input.closest('.media-tools')?.querySelector('span');if(hint)hint.textContent='也可以只发送图片、视频或表情';});
  if(videoDrafts.compose){const image=$('[data-compose-form] .image-preview img');if(image)replacePreviewWithVideo(image);}
  videoDrafts.comments.forEach(postId=>{const image=$(`[data-comment-form="${CSS.escape(String(postId))}"] .image-preview img`);if(image)replacePreviewWithVideo(image);});
}
function replacePreviewWithVideo(image){const video=document.createElement('video');video.src=image.src;video.controls=true;video.preload='metadata';video.playsInline=true;image.replaceWith(video);}

function renderVideoMarkers(){
  $$('.rich-text').forEach(textBox=>{
    const videos=[];const walker=document.createTreeWalker(textBox,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{node.nodeValue=String(node.nodeValue||'').replace(/\[\[FW_MEDIA_VIDEO:([A-Za-z0-9+/=]+)\]\]/g,(_,encoded)=>{const url=safeUrl(encoded);if(url)videos.push(url);return'';});});
    if(!videos.length)return;let media=textBox.nextElementSibling?.classList.contains('rich-media')?textBox.nextElementSibling:null;if(!media){media=document.createElement('div');media.className='rich-media';textBox.after(media);}
    videos.forEach(url=>{if(media.querySelector(`video[data-align-url="${CSS.escape(url)}"]`))return;const video=document.createElement('video');video.className='align-video';video.dataset.alignUrl=url;video.src=url;video.controls=true;video.preload='metadata';video.playsInline=true;media.appendChild(video);});
  });
}
function exactMedia(value){const match=String(value||'').trim().match(/^\[\[(FW_MEDIA_IMAGE|FW_MEDIA_VIDEO):([A-Za-z0-9+/=]+)\]\]$/);if(!match)return null;const url=safeUrl(match[2]);return url?{kind:match[1]==='FW_MEDIA_VIDEO'?'video':'image',url}:null;}
function renderChatMedia(){
  $$('.chat-bubble:not(.sticker)').forEach(bubble=>{if(bubble.dataset.alignMedia==='1')return;const media=exactMedia(bubble.textContent);if(!media)return;bubble.dataset.alignMedia='1';bubble.classList.add('align-media');bubble.textContent='';const node=document.createElement(media.kind==='video'?'video':'img');node.src=media.url;if(media.kind==='video'){node.controls=true;node.preload='metadata';node.playsInline=true;}else node.alt='聊天图片';bubble.appendChild(node);});
  $$('.buddy-main > span').forEach(node=>{const media=exactMedia(node.textContent.replace(/^我：/,''));if(media)node.textContent=(node.textContent.startsWith('我：')?'我：':'')+(media.kind==='video'?'视频':'图片');});
}

function enhanceChatUploader(){
  const form=$('[data-chat-compose]');if(!form)return;form.classList.add('align-media-ready');let button=$('[data-align-chat-media]',form);if(!button){button=document.createElement('button');button.type='button';button.className='align-chat-media-trigger';button.dataset.alignChatMedia='1';button.setAttribute('aria-label','发送图片、GIF或视频');button.textContent='＋';const emoji=$('[data-emoji-toggle]',form);form.insertBefore(button,emoji||form.firstChild);const input=document.createElement('input');input.type='file';input.accept='image/*,video/*';input.hidden=true;input.dataset.alignChatMediaFile='1';form.appendChild(input);}
  const textInput=$('input[name="message"]',form);button.disabled=chatMediaBusy||!textInput||textInput.disabled;
}
async function sendChatMedia(file){
  if(chatMediaBusy)return;const targetId=String(socialStore.state.chat.targetId||'');if(!targetId)throw new Error('先选择一个搭子。');chatMediaBusy=true;enhanceChatUploader();
  try{toast('正在处理媒体...');const uploaded=await uploadMedia(file,'private');const payload=marker(uploaded.kind==='video'?'FW_MEDIA_VIDEO':'FW_MEDIA_IMAGE',uploaded.url);const result=await client.rpc('fw_send_private_message_to_user',{target_user_id:targetId,message_text:payload});if(result.error)throw new Error(`发送失败：${result.error.message}`);await socialStore.openChat(targetId);await socialStore.loadBuddy(true);toast(uploaded.kind==='video'?'视频已发送。':'图片已发送。');}
  finally{chatMediaBusy=false;enhanceChatUploader();}
}

function enhanceCommentReports(){
  $$('.post-comment[data-comment-id]').forEach(row=>{const actions=$('.comment-actions',row);if(!actions||$('[data-delete-comment]',actions)||$('[data-align-report-comment]',actions))return;const button=document.createElement('button');button.type='button';button.dataset.alignReportComment=row.dataset.commentId;button.textContent='举报';actions.appendChild(button);});
}

function ensureProfileModal(){
  let modal=$('[data-align-profile-modal]');if(modal)return modal;modal=document.createElement('div');modal.className='align-profile-modal';modal.dataset.alignProfileModal='1';modal.hidden=true;modal.innerHTML='<section class="align-profile-card"><button type="button" data-align-profile-close aria-label="关闭">×</button><div data-align-profile-body></div></section>';document.body.appendChild(modal);return modal;
}
async function openProfile(userId){
  const modal=ensureProfileModal();const body=$('[data-align-profile-body]',modal);modal.hidden=false;body.innerHTML='<div class="align-empty">正在读取资料...</div>';
  try{const result=await client.from('profiles').select('id,nickname,avatar_url,lab_code,created_at').eq('id',userId).maybeSingle();if(result.error)throw result.error;const p=result.data||{};const avatar=p.avatar_url?`<div class="align-profile-avatar"><img src="${esc(p.avatar_url)}" alt="头像"></div>`:`<div class="align-profile-avatar">${esc(String(p.nickname||'FW').slice(0,2).toUpperCase())}</div>`;body.innerHTML=`${avatar}<h2>${esc(p.nickname||'低功耗研究员')}</h2><p>实验品编号：${esc(p.lab_code||'未设置')}</p><p>加入研究所：${p.created_at?esc(new Date(p.created_at).toLocaleDateString('zh-CN')):'未知'}</p><p>公开资料仅展示昵称、头像和实验品编号，不展示邮箱。</p>`;}
  catch(error){body.innerHTML=`<div class="align-empty">${esc(error.message||'资料读取失败。')}</div>`;}
}
async function blockBuddy(userId){if(!window.confirm('确定拉黑这个搭子吗？拉黑后将不能继续正常互动。'))return;const result=await client.rpc('fw_block_user',{target_user_id:userId});if(result.error)throw new Error(`拉黑失败：${result.error.message}`);if(String(socialStore.state.chat.targetId)===String(userId))socialStore.closeChat();await socialStore.loadBuddy(true);await socialStore.refreshBadges(true);toast('已拉黑。');}
async function reportUser(userId){const reason=window.prompt('请输入举报原因（至少 2 个字）：','搭子骚扰 / 不适当内容 / 其他');if(reason==null)return;await feedStore.report('user',userId,reason);toast('举报已提交，管理员会处理。');}
function enhanceBuddyActions(){
  $$('.buddy-item[data-open-chat]').forEach(item=>{if(item.dataset.alignBuddyActions==='1')return;const userId=item.dataset.openChat;if(!userId)return;item.dataset.alignBuddyActions='1';let actions=$('.row-actions',item);if(!actions){actions=document.createElement('div');actions.className='row-actions';item.appendChild(actions);}const wrap=document.createElement('span');wrap.className='align-more-wrap';wrap.innerHTML=`<button class="align-more-button" type="button" data-align-buddy-more aria-label="更多操作">…</button><span class="align-more-menu"><button type="button" data-align-view-profile="${esc(userId)}">查看资料</button><button type="button" class="danger" data-align-report-user="${esc(userId)}">举报</button><button type="button" class="danger" data-align-block-user="${esc(userId)}">拉黑</button></span>`;actions.appendChild(wrap);});
}

function rulesViewHtml(){return `<div class="align-extra-page"><div class="align-extra-head"><div><small>FW LAB NOTICE</small><h1>入馆须知</h1><p>保持轻松表达，也保持基本边界。这里是轻量化表达、浏览和互动空间，不是现实纠纷处理平台。</p></div></div><div class="align-card-grid"><article class="align-card"><b>01 · 允许吐槽，不允许伤害他人</b><p>可以表达情绪和经历，但不要点名攻击、辱骂、造谣、挂人或引导他人围攻。</p></article><article class="align-card"><b>02 · 不要发布真实隐私</b><p>请勿公开真实姓名、电话、地址、公司内部资料、聊天截图、证件信息或其他敏感内容。</p></article><article class="align-card"><b>03 · 互动仅代表用户个人表达</b><p>点赞、评论、俺也一样、递纸巾等互动仅代表用户之间的轻量回应，不代表平台立场。</p></article><article class="align-card"><b>04 · 禁止广告、引流和风险内容</b><p>禁止发布广告营销、联系方式引流、诈骗、赌博、色情、暴力、违法或其他不适宜内容。</p></article><article class="align-card"><b>05 · 违规内容可能被处理</b><p>被举报或经管理员判断不合适的内容，可能会被隐藏、删除；相关账号可能被禁言或限制使用。</p></article><article class="align-card"><b>06 · 这里不替代专业帮助</b><p>如果遇到严重心理压力、现实冲突或安全问题，请优先联系身边可信任的人或寻求专业帮助。</p></article></div><section class="align-section"><h2>关于本站 / 制作支持</h2><p>F.w 研究所由 YSP启元工作室发起并制作。本站会持续根据使用情况调整内容、功能与管理规则，希望提供一个轻量、克制、相对安全的表达空间。</p></section><section class="align-section"><h2>隐私政策</h2><p>运营者：YSP启元工作室 · 生效日期：2026年7月10日 · 最近更新：2026年7月10日</p><div class="align-privacy-grid"><details open><summary>1. 我们处理哪些信息</summary><ul><li>账号信息：邮箱、实验品编号、昵称、头像和账号状态。</li><li>用户内容：帖子、评论、投票、观鸟记录、图片、表情和举报内容。</li><li>互动与社交数据：点赞、共鸣、递纸巾、通知、搭子关系及站内消息。</li><li>运行数据：为保持登录、缓存内容和排查故障所需的浏览器及本地缓存信息。</li></ul></details><details><summary>2. 使用目的</summary><p>这些信息仅用于注册登录、找回密码、展示用户资料、提供发布与互动功能、维持搭子与通知功能、处理举报、保障账号安全和改进稳定性。不会以出售个人信息为目的处理数据。</p></details><details><summary>3. 公开内容与第三方服务</summary><p>用户主动发布到精神广场、学术研讨或观鸟台的内容可能对其他访问者公开；私聊内容不作为公开内容展示。服务使用 Supabase 提供账号认证、数据库和文件存储。</p></details><details><summary>4. 保存与安全</summary><p>账号存续期间会保存提供服务所必需的数据。账号注销后，系统将删除账号及与账号直接关联的帖子、评论、互动、社交关系和个人文件；依法需要保留的安全记录仅在必要期限内保存。</p></details><details><summary>5. 你的权利</summary><p>可以查看和修改资料、退出登录，并通过账号端提供的设置处理账号相关操作；忘记密码时可使用“忘记密码”找回。</p></details><details><summary>6. 未成年人、政策更新与联系</summary><p>未成年人应在监护人指导下使用，不应发布能够识别本人或他人的敏感信息。政策发生重要变化时，会通过本页面或站内公告提示。</p></details></div></section></div>`;}
function moderationViewHtml(){return `<div class="align-extra-page"><div class="align-extra-head"><div><small>MODERATION NOTICE / PUBLIC</small><h1>处理公告</h1><p>这里只展示公开的违规处理结果，不包含站长后台管理功能。</p></div><button class="secondary compact" type="button" data-align-refresh-logs>刷新公告</button></div><section class="align-section"><div class="align-public-list" data-align-public-list><div class="align-empty">进入页面后读取公开处理公告。</div></div></section><div class="align-card-grid" style="margin-top:14px"><article class="align-card"><b>01 · 边界</b><p>可以吐槽，不要攻击。不要公开他人隐私或煽动围攻。</p></article><article class="align-card"><b>02 · 处理</b><p>不适合公开展示的帖子、评论等内容，可能被删除或归档。</p></article><article class="align-card"><b>03 · 后果</b><p>刷屏、广告、恶意骚扰、持续违规，可能触发禁言或停用账号。</p></article></div></div>`;}
function injectExtraViews(){
  const nav=$('.nav-list');const main=$('.main-content');if(!nav||!main||$('[data-align-nav="rules"]'))return;
  const rules=document.createElement('button');rules.className='nav-item';rules.type='button';rules.dataset.alignNav='rules';rules.innerHTML='<span aria-hidden="true">ⓘ</span><b>入馆须知</b>';
  const moderation=document.createElement('button');moderation.className='nav-item';moderation.type='button';moderation.dataset.alignNav='moderation';moderation.innerHTML='<span aria-hidden="true">▧</span><b>处理公告</b>';
  nav.append(rules,moderation);
  const rulesPanel=document.createElement('section');rulesPanel.className='view';rulesPanel.dataset.alignView='rules';rulesPanel.innerHTML=rulesViewHtml();
  const moderationPanel=document.createElement('section');moderationPanel.className='view';moderationPanel.dataset.alignView='moderation';moderationPanel.innerHTML=moderationViewHtml();
  main.append(rulesPanel,moderationPanel);
  const register=$('[data-auth-view="register"]');if(register&&!$('[data-align-open-rules]',register)){const button=document.createElement('button');button.type='button';button.dataset.alignOpenRules='1';button.className='secondary full';button.textContent='查看入馆须知 / 隐私政策';register.appendChild(button);}
}
function showExtraView(name){
  activeExtraView=name;$$('.view').forEach(panel=>panel.classList.remove('active'));const panel=$(`[data-align-view="${name}"]`);panel?.classList.add('active');$$('[data-nav]').forEach(node=>node.classList.remove('active'));$$('[data-align-nav]').forEach(node=>node.classList.toggle('active',node.dataset.alignNav===name));const app=$('#app');if(app)app.dataset.view=name;
  const title=$('[data-page-title]');const subtitle=$('[data-page-subtitle]');if(name==='rules'){if(title)title.textContent='入馆须知';if(subtitle)subtitle.textContent='用户规则、使用边界与隐私政策';}else{if(title)title.textContent='处理公告';if(subtitle)subtitle.textContent='公开违规处理结果与站内处理说明';}
  feedStore.deactivate();pollStore.deactivate();birdStore.deactivate();socialStore.closeChat();$('[data-emoji-panel]')?.setAttribute('hidden','');if(name==='moderation')loadPublicLogs();
}
async function loadPublicLogs(){
  const host=$('[data-align-public-list]');if(!host)return;host.innerHTML='<div class="align-empty">正在读取公开处理公告...</div>';
  try{const meta=await client.from('moderation_logs').select('id,created_at').eq('public_visible',true).eq('is_revoked',false).order('created_at',{ascending:false}).limit(50);if(meta.error)throw meta.error;const ids=(meta.data||[]).map(row=>row.id);if(!ids.length){publicLogsCache=[];host.innerHTML='<div class="align-empty">暂时没有处理公告。说明大家今天还算体面。</div>';return;}const result=await client.from('moderation_logs').select('id,target_type,target_display_name,action,reason,duration_text,created_at,expires_at').in('id',ids);if(result.error)throw result.error;const byId=new Map((result.data||[]).map(row=>[String(row.id),row]));publicLogsCache=ids.map(id=>byId.get(String(id))).filter(Boolean);renderPublicLogs();}
  catch(error){host.innerHTML=publicLogsCache.length?'':`<div class="align-empty">${esc(error.message||'处理公告暂时读取失败，请稍后刷新。')}</div>`;if(publicLogsCache.length)renderPublicLogs();}
}
function renderPublicLogs(){
  const host=$('[data-align-public-list]');if(!host)return;const actions={ban:'封号',unban:'解封',mute:'禁言',unmute:'解除禁言',delete_post:'删帖',restore_post:'恢复帖子',delete_comment:'删评论',restore_comment:'恢复评论',delete_chat_message:'删除房间消息',restore_chat_message:'恢复房间消息',resolve_report:'处理举报',ignore_report:'忽略举报',system_note:'系统记录'};const targets={user:'账号',post:'帖子',comment:'评论',chat_message:'房间消息',report:'举报',system:'系统'};const danger=new Set(['ban','mute','delete_post','delete_comment','delete_chat_message','resolve_report']);
  if(!publicLogsCache.length){host.innerHTML='<div class="align-empty">暂时没有处理公告。说明大家今天还算体面。</div>';return;}host.innerHTML=publicLogsCache.map(row=>{const action=actions[row.action]||row.action||'处理';const desc=[`对象：${targets[row.target_type]||row.target_type||'对象'}`,row.duration_text?`时长：${row.duration_text}`:'',row.reason?`原因：${row.reason}`:''].filter(Boolean).join(' · ');return `<article class="align-log"><time>${esc(new Date(row.created_at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}))}</time><div><b>${esc(row.target_display_name||'某位研究员')} 处理：${esc(action)}</b><span>${esc(desc)}</span></div><span class="align-chip ${danger.has(row.action)?'warn':''}">${esc(action)}</span></article>`;}).join('');
}

function enhanceAll(){injectStyles();injectExtraViews();enhancePostMediaInputs();renderVideoMarkers();renderChatMedia();enhanceChatUploader();enhanceCommentReports();enhanceBuddyActions();}
function scheduleEnhance(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(enhanceAll,35);}
function closeMenus(except=null){$$('.align-more-wrap.open').forEach(node=>{if(node!==except)node.classList.remove('open');});}
function bind(){
  document.addEventListener('change',event=>{
    if(event.target.matches('[data-compose-image]')){const file=event.target.files?.[0];videoDrafts.compose=fileKind(file)==='video';}
    if(event.target.matches('[data-comment-image]')){const file=event.target.files?.[0];const id=String(event.target.dataset.commentImage||'');if(fileKind(file)==='video')videoDrafts.comments.add(id);else videoDrafts.comments.delete(id);}
    if(event.target.matches('[data-align-chat-media-file]')){const file=event.target.files?.[0];event.target.value='';if(file)sendChatMedia(file).catch(error=>toast(error.message||'发送失败。'));}
  },true);
  document.addEventListener('click',async event=>{
    const regular=event.target.closest?.('[data-nav]');if(regular&&activeExtraView){activeExtraView='';$$('[data-align-nav]').forEach(node=>node.classList.remove('active'));}
    const extra=event.target.closest?.('[data-align-nav]');if(extra){event.preventDefault();event.stopPropagation();showExtraView(extra.dataset.alignNav);return;}
    if(event.target.closest?.('[data-align-open-rules]')){event.preventDefault();const modal=$('[data-account-modal]');if(modal)modal.hidden=true;document.body.classList.remove('modal-open');showExtraView('rules');return;}
    if(event.target.closest?.('[data-compose-image-remove]'))videoDrafts.compose=false;
    const commentRemove=event.target.closest?.('[data-comment-image-remove]');if(commentRemove)videoDrafts.comments.delete(String(commentRemove.dataset.commentImageRemove||''));
    const mediaButton=event.target.closest?.('[data-align-chat-media]');if(mediaButton){event.preventDefault();event.stopPropagation();$('[data-align-chat-media-file]')?.click();return;}
    const reportComment=event.target.closest?.('[data-align-report-comment]');if(reportComment){event.preventDefault();event.stopPropagation();const reason=window.prompt('请输入举报原因（至少 2 个字）：','评论内容不适当 / 骚扰 / 攻击他人 / 其他');if(reason==null)return;try{await feedStore.report('comment',reportComment.dataset.alignReportComment,reason);toast('举报已提交，管理员会处理。');}catch(error){toast(error.message||'举报失败。');}return;}
    const more=event.target.closest?.('[data-align-buddy-more]');if(more){event.preventDefault();event.stopPropagation();const wrap=more.closest('.align-more-wrap');closeMenus(wrap);wrap.classList.toggle('open');return;}
    const profile=event.target.closest?.('[data-align-view-profile]');if(profile){event.preventDefault();event.stopPropagation();closeMenus();openProfile(profile.dataset.alignViewProfile);return;}
    const report=event.target.closest?.('[data-align-report-user]');if(report){event.preventDefault();event.stopPropagation();closeMenus();try{await reportUser(report.dataset.alignReportUser);}catch(error){toast(error.message||'举报失败。');}return;}
    const block=event.target.closest?.('[data-align-block-user]');if(block){event.preventDefault();event.stopPropagation();closeMenus();try{await blockBuddy(block.dataset.alignBlockUser);}catch(error){toast(error.message||'拉黑失败。');}return;}
    if(event.target.closest?.('[data-align-profile-close]')||event.target.matches?.('[data-align-profile-modal]')){const modal=$('[data-align-profile-modal]');if(modal)modal.hidden=true;return;}
    if(event.target.closest?.('[data-align-refresh-logs]')){loadPublicLogs();return;}
    if(!event.target.closest?.('.align-more-wrap'))closeMenus();
  },true);
  const observer=new MutationObserver(scheduleEnhance);observer.observe(document.body,{childList:true,subtree:true});
  socialStore.subscribe(()=>scheduleEnhance());feedStore.subscribe(()=>scheduleEnhance());authStore.subscribe(()=>scheduleEnhance());
}

injectStyles();injectExtraViews();bind();enhanceAll();
