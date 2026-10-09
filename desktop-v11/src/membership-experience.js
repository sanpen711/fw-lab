import {authStore} from './auth-store.js';
import {membershipStore,DEFAULT_APPEARANCE} from './membership-store.js';
import {postReadingStore} from './post-reading-store.js';
import {feedStore} from './feed-store.js';
import {escapeHtml as esc} from './member-identity.js';

let draft=null,draftUser='',dirty=false,featuredPosts=[],postsLoadedFor='',saving=false;
let notify=()=>{},navigate=()=>{},refreshMembership=()=>{},refreshReader=()=>{};
let detail=null,scrollTimer=null,readBaseline=0;
const $=(selector,root=document)=>root.querySelector(selector);
const choices=(field,items)=>`<div class="identity-options">${items.map(([value,label])=>`<button type="button" data-member-identity-choice="${field}" data-value="${value}" class="${draft[field]===value?'selected':''}" aria-pressed="${draft[field]===value}">${label}</button>`).join('')}</div>`;
function ensureDraft(){const id=authStore.state.user?.id||'';if(draftUser!==id){draftUser=id;draft=null;dirty=false;featuredPosts=[];postsLoadedFor='';}if(!draft||!dirty)draft={...DEFAULT_APPEARANCE,...membershipStore.state.appearance};}
function plain(value){return String(value||'').replace(/\[\[FW_[^\]]+\]\]/g,'[媒体]').replace(/\s+/g,' ').trim();}
function preview(){
  const user=authStore.state.user||{};const name=user.nickname||'研究员';
  const post=featuredPosts.find(row=>String(row.id)===String(draft.featured_post_id));
  return `<div class="member-identity-preview identity-layout-${draft.card_layout} vip-theme-${draft.theme}" data-member-identity-preview><small>资料卡预览</small><div class="member-identity-preview-head"><span class="social-avatar vip-identity vip-frame-${draft.frame}">${user.avatarUrl?`<img src="${esc(user.avatarUrl)}" alt="我的头像">`:esc(name.slice(0,2))}</span><div><b class="member-name member-color-${draft.nickname_color}">${esc(name)}</b><span class="vip-badge">VIP</span>${draft.title?`<p class="member-title">${esc(draft.title)}</p>`:''}<p>实验品编号：${esc(user.labCode||user.lab_code||'未设置')}</p></div></div>${draft.intro?`<p class="identity-intro">${esc(draft.intro)}</p>`:''}${post?`<div class="identity-featured"><small>我的代表作</small><p>${esc(plain(post.content).slice(0,100))}</p></div>`:''}<span class="member-identity-preview-note">预览不会改动当前身份，保存后生效。</span></div>`;
}
function loadOwnPosts(){
  const id=authStore.state.user?.id;if(!id||postsLoadedFor===id)return;postsLoadedFor=id;
  authStore.client.from('posts').select('id,content').eq('user_id',id).eq('is_deleted',false).order('created_at',{ascending:false}).limit(100).then(result=>{if(authStore.state.user?.id!==id)return;if(result.error){postsLoadedFor='';notify('代表作列表读取失败，可刷新后重试。');return;}featuredPosts=result.data||[];refreshMembership();});
}
export function identityEditor(active){
  ensureDraft();loadOwnPosts();
  return `<section class="identity-editor"><header><h3>我的会员身份</h3><span>${active?'自由组合，保存后同步':'可预览，会员有效期内可保存'}</span></header><div class="identity-editor-grid"><form data-member-identity-form><label>配色${choices('theme',[['rose_gold','玫瑰金'],['black_gold','黑金'],['pink_starlight','粉色']])}</label><label>头像框${choices('frame',[['double','双线圆环'],['corners','四角印记'],['ticket','票根边框']])}</label><label>昵称颜色${choices('nickname_color',[['default','原色'],['rose_gold','玫瑰金'],['black_gold','黑金'],['pink_starlight','粉色']])}</label><label>资料卡${choices('card_layout',[['classic','经典名片'],['pass','研究通行证']])}</label><label>我的称号<input name="title" value="${esc(draft.title)}" maxlength="8" placeholder="最多 8 个字"></label><label>一句话介绍<textarea name="intro" maxlength="60" rows="2" placeholder="最多 60 个字">${esc(draft.intro)}</textarea></label><label>代表作<select name="featured_post_id"><option value="">暂不展示</option>${featuredPosts.map(row=>`<option value="${row.id}"${String(draft.featured_post_id)===String(row.id)?' selected':''}>${esc(plain(row.content).slice(0,38)||'[媒体帖子]')}</option>`).join('')}</select></label><div class="identity-save-row"><button type="submit" class="primary compact" ${!active||saving?'disabled':''}>${saving?'保存中…':'保存身份'}</button><button type="button" class="secondary compact" data-member-identity-reset>恢复已保存</button><span data-member-identity-status role="status">${dirty?'有未保存的修改':active?'当前设置已同步':'到期后保留设置，续期可继续使用'}</span></div></form>${preview()}</div></section>`;
}
export function readingList(mode='following'){
  const state=postReadingStore.state;const rows=state.rows.filter(row=>mode==='saved'||row.following);
  const active=membershipStore.isActive();
  return `<section class="reading-library"><header><div><h3>${mode==='saved'?'我的收藏':'我追的帖子'}</h3><p>${mode==='saved'?'收藏免费，会员可升级为自动追更。':active?'同一帖子的新增评论合并显示，阅读位置会自动保存。':'已追帖子会保留，会员到期后暂停自动追更。'}</p></div><button type="button" class="secondary compact" data-reading-refresh>刷新</button></header>${state.loading&&!state.loaded?'<div class="state-card small">正在读取…</div>':state.error?`<div class="state-card small">${esc(state.error)}<button type="button" data-reading-refresh>重试</button></div>`:rows.length?`<div class="reading-list">${rows.map(row=>`<article><button type="button" data-reading-open="${row.post_id}" ${!row.available?'disabled':''}><b>${esc(row.available?plain(row.content).slice(0,95)||'[媒体帖子]':'帖子已删除或不可查看')}</b><span>${row.following?'自动追更':'已收藏'}${active&&row.following?` · ${Number(row.unread_count)||0} 条新评论`:''}${active&&row.anchor_comment_id?' · 已记住阅读位置':''}</span></button><div>${row.available&&!row.following&&active?`<button type="button" data-reading-follow="${row.post_id}">追更</button>`:''}${row.following?`<button type="button" data-reading-stop="${row.post_id}">停止追更</button>`:''}<button type="button" data-reading-remove="${row.post_id}">移除</button></div></article>`).join('')}</div>`:'<div class="state-card small">还没有帖子。在帖子详情中点击“收藏”或“追更”就会显示在这里。</div>'}</section>`;
}
export function readingActions(post){
  const row=postReadingStore.rowFor(post.id);const active=membershipStore.isActive();
  return `<div class="post-reading-actions"><button type="button" class="secondary compact" ${row?`data-reading-remove="${post.id}"`:`data-reading-save="${post.id}"`}>${row?'已收藏 · 取消':'收藏'}</button><button type="button" class="secondary compact ${row?.following?'active':''}" ${row?.following?`data-reading-stop="${post.id}"`:`data-reading-follow="${post.id}"`}>${row?.following?'追更中 · 停止':active?'追更':'会员追更'}</button>${row?.following&&active?'<button type="button" class="secondary compact" data-reading-jump>跳到新评论</button><button type="button" class="secondary compact" data-reading-seen>标记已读</button>':''}</div>`;
}
export function isNewComment(comment){return !!detail&&detail.id===String(comment.post_id)&&detail.following&&Number(comment.id)>readBaseline&&String(comment.user_id)!==String(authStore.state.user?.id);}
async function capture(seen=false){
  if(!detail||!membershipStore.isActive())return;const box=$('.detail-content-scroll',detail.host);if(!box)return;
  const bounds=box.getBoundingClientRect();const anchor=Array.from(box.querySelectorAll('[data-comment-id]')).find(node=>node.getBoundingClientRect().bottom>bounds.top);
  const row=postReadingStore.rowFor(detail.id);if(!row)return;
  const latest=Math.max(0,...detail.post.comments.map(comment=>Number(comment.id)));
  const last_seen_comment_id=seen?Math.max(Number(row.last_seen_comment_id||0),latest):Number(row.last_seen_comment_id||0);
  const value={anchor_comment_id:anchor?Number(anchor.dataset.commentId):null,anchor_offset:anchor?Math.round(anchor.getBoundingClientRect().top-bounds.top):0,scroll_top:Math.round(box.scrollTop),last_seen_comment_id,readChanged:last_seen_comment_id>Number(row.last_seen_comment_id||0)};
  const current=detail;
  await postReadingStore.position(current.id,value);
  if(value.readChanged&&detail===current){readBaseline=last_seen_comment_id;refreshReader();}
}
function savePosition(seen=false){return capture(seen).catch(error=>notify(`阅读位置未同步：${error.message}`));}
export function closeReadingDetail(){clearTimeout(scrollTimer);savePosition();detail=null;}
export function prepareReadingDetail(host,post,previousId){
  if(!post){closeReadingDetail();return;}
  if(detail&&detail.id!==String(post.id))closeReadingDetail();
  const row=postReadingStore.rowFor(post.id);const same=detail?.id===String(post.id);
  if(!same)readBaseline=Number(row?.last_seen_comment_id||0);
  detail={host,id:String(post.id),post,following:!!row?.following&&membershipStore.isActive()};
  return {restore:previousId!==String(post.id)&&!!row&&membershipStore.isActive()};
}
export function bindReadingDetail(restore){
  if(!detail)return;const box=$('.detail-content-scroll',detail.host);if(!box)return;
  if(restore){const row=postReadingStore.rowFor(detail.id);const anchor=row?.anchor_comment_id?$(`[data-comment-id="${row.anchor_comment_id}"]`,box):null;box.scrollTop=anchor?box.scrollTop+anchor.getBoundingClientRect().top-box.getBoundingClientRect().top-Number(row.anchor_offset||0):Number(row?.scroll_top||0);}
  const current=detail;let userScrolled=false;
  const interact=()=>{userScrolled=true;};
  ['wheel','pointerdown','keydown','touchstart'].forEach(type=>box.addEventListener(type,interact,{passive:true}));
  box.addEventListener('scroll',()=>{if(detail!==current)return;clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{if(detail===current)savePosition(userScrolled&&box.scrollHeight-box.clientHeight-box.scrollTop<16);},650);},{passive:true});
}
export const membershipExperience={init(options){
  notify=options.toast;navigate=options.navigate;refreshMembership=options.refreshMembership;refreshReader=options.refreshReader||(()=>{});postReadingStore.start();
  document.addEventListener('input',event=>{const form=event.target.closest('[data-member-identity-form]');if(!form)return;ensureDraft();draft[event.target.name]=event.target.value;dirty=true;const old=$('[data-member-identity-preview]');if(old)old.outerHTML=preview();const status=$('[data-member-identity-status]');if(status)status.textContent='有未保存的修改';});
  document.addEventListener('click',async event=>{
    const node=event.target.closest('button');if(!node)return;
    if(node.hasAttribute('data-member-identity-choice')){ensureDraft();draft[node.dataset.memberIdentityChoice]=node.dataset.value;dirty=true;refreshMembership();return;}
    if(node.hasAttribute('data-member-identity-reset')){dirty=false;draft=null;refreshMembership();return;}
    if(node.hasAttribute('data-reading-refresh')){await postReadingStore.load(true);return;}
    if(node.hasAttribute('data-reading-library')){navigate('membership');options.openReadingTab?.();return;}
    if(node.hasAttribute('data-reading-jump')){const first=$('.post-comment.is-new',detail?.host||document);if(first){first.scrollIntoView({block:'start'});}else notify('没有新的评论。');return;}
    if(node.hasAttribute('data-reading-seen')){node.disabled=true;try{await capture(true);notify('当前评论已标记为已读。');}catch(error){notify(`已读标记未同步：${error.message}`);}finally{if(node.isConnected)node.disabled=false;}return;}
    const action=['open','save','follow','stop','remove'].find(key=>node.hasAttribute(`data-reading-${key}`));if(!action)return;
    event.preventDefault();event.stopPropagation();const id=node.getAttribute(`data-reading-${action}`);
    try{
      if(action==='open'){navigate('square');await feedStore.openPostById(id);return;}
      if(action==='follow'&&!membershipStore.isActive()){navigate('membership');notify('会员有效期内可使用自动追更，收藏可直接使用。');return;}
      node.disabled=true;
      if(action==='remove')await postReadingStore.remove(id);else await postReadingStore.save(id,action==='follow');
      options.refreshReader?.();notify(({save:'帖子已收藏。',follow:'已开始追更，后续新评论会合并提醒。',stop:'已停止追更，保留为收藏。',remove:'已移除。'})[action]);
    }catch(error){notify(error.message||'操作失败。');}finally{if(node.isConnected)node.disabled=false;}
  });
  document.addEventListener('submit',async event=>{if(!event.target.matches('[data-member-identity-form]'))return;event.preventDefault();if(saving)return;saving=true;const value={...draft};refreshMembership();try{await membershipStore.setAppearance(value);dirty=false;draft=null;notify('身份设置已保存。');}catch(error){notify(error.message||'身份设置保存失败。');}finally{saving=false;refreshMembership();}});
}};
