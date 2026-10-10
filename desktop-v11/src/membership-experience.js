import {authStore} from './auth-store.js';
import {membershipStore,DEFAULT_APPEARANCE} from './membership-store.js';
import {escapeHtml as esc} from './member-identity.js';
import {MEMBER_FRAMES,MEMBER_LAYOUTS} from './membership-levels.js';

let draft=null,draftUser='',dirty=false,featuredPosts=[],postsLoadedFor='',saving=false;
let notify=()=>{},refreshMembership=()=>{};
const $=(selector,root=document)=>root.querySelector(selector);
const choices=(field,items)=>`<div class="identity-options">${items.map(([value,label,required=1])=>{const locked=required>Math.max(1,membershipStore.state.growth?.level||0);return `<button type="button" data-member-identity-choice="${field}" data-value="${value}" class="${draft[field]===value?'selected':''}" aria-pressed="${draft[field]===value}" ${locked?'disabled':''}>${label}${required>1?` <small>V${required}${locked?' · 未解锁':''}</small>`:''}</button>`;}).join('')}</div>`;
function ensureDraft(){const id=authStore.state.user?.id||'';if(draftUser!==id){draftUser=id;draft=null;dirty=false;featuredPosts=[];postsLoadedFor='';}if(!draft||!dirty)draft={...DEFAULT_APPEARANCE,...membershipStore.state.appearance};}
function plain(value){return String(value||'').replace(/\[\[FW_[^\]]+\]\]/g,'[媒体]').replace(/\s+/g,' ').trim();}
function preview(){
  const user=authStore.state.user||{};const name=user.nickname||'研究员';
  const post=featuredPosts.find(row=>String(row.id)===String(draft.featured_post_id));
  return `<div class="member-identity-preview identity-layout-${draft.card_layout} vip-theme-${draft.theme}" data-member-identity-preview><small>资料卡预览</small><div class="member-identity-preview-head"><span class="social-avatar vip-identity vip-frame-${draft.frame}">${user.avatarUrl?`<img src="${esc(user.avatarUrl)}" alt="我的头像">`:esc(name.slice(0,2))}</span><div><b class="member-name member-color-${draft.nickname_color}">${esc(name)}</b><span class="vip-badge member-level-badge vip-level-${Math.max(1,membershipStore.state.growth?.level||0)}">V${Math.max(1,membershipStore.state.growth?.level||0)}</span>${draft.title?`<p class="member-title">${esc(draft.title)}</p>`:''}<p>实验品编号：${esc(user.labCode||user.lab_code||'未设置')}</p></div></div>${draft.intro?`<p class="identity-intro">${esc(draft.intro)}</p>`:''}${post?`<div class="identity-featured"><small>我的代表作</small><p>${esc(plain(post.content).slice(0,100))}</p></div>`:''}<span class="member-identity-preview-note">预览不会改动当前身份，保存后生效。</span></div>`;
}
function loadOwnPosts(){
  const id=authStore.state.user?.id;if(!id||postsLoadedFor===id)return;postsLoadedFor=id;
  authStore.client.from('posts').select('id,content').eq('user_id',id).eq('is_deleted',false).order('created_at',{ascending:false}).limit(100).then(result=>{if(authStore.state.user?.id!==id)return;if(result.error){postsLoadedFor='';notify('代表作列表读取失败，可刷新后重试。');return;}featuredPosts=result.data||[];refreshMembership();});
}
export function identityEditor(active){
  ensureDraft();loadOwnPosts();
  return `<section class="identity-editor"><header><h3>我的会员身份</h3><span>${active?'自由组合，保存后同步':'可预览，会员有效期内可保存'}</span></header><div class="identity-editor-grid"><form data-member-identity-form><label>配色${choices('theme',[['rose_gold','玫瑰金'],['black_gold','黑金'],['pink_starlight','粉色']])}</label><label>头像框${choices('frame',MEMBER_FRAMES)}</label><label>昵称颜色${choices('nickname_color',[['default','原色'],['rose_gold','玫瑰金'],['black_gold','黑金'],['pink_starlight','粉色']])}</label><label>资料卡${choices('card_layout',MEMBER_LAYOUTS)}</label><label>我的称号<input name="title" value="${esc(draft.title)}" maxlength="8" placeholder="最多 8 个字"></label><label>一句话介绍<textarea name="intro" maxlength="60" rows="2" placeholder="最多 60 个字">${esc(draft.intro)}</textarea></label><label>代表作<select name="featured_post_id"><option value="">暂不展示</option>${featuredPosts.map(row=>`<option value="${row.id}"${String(draft.featured_post_id)===String(row.id)?' selected':''}>${esc(plain(row.content).slice(0,38)||'[媒体帖子]')}</option>`).join('')}</select></label><div class="identity-save-row"><button type="submit" class="primary compact" ${!active||saving?'disabled':''}>${saving?'保存中…':'保存身份'}</button><button type="button" class="secondary compact" data-member-identity-reset>恢复已保存</button><span data-member-identity-status role="status">${dirty?'有未保存的修改':active?'当前设置已同步':'到期后保留设置，续期可继续使用'}</span></div></form>${preview()}</div></section>`;
}
function updateIdentityPreview(){
  const old=$('[data-member-identity-preview]');if(old)old.outerHTML=preview();
  const status=$('[data-member-identity-status]');if(status)status.textContent='有未保存的修改';
}
export const membershipExperience={init(options){
  notify=options.toast;refreshMembership=options.refreshMembership;
  document.addEventListener('input',event=>{const form=event.target.closest('[data-member-identity-form]');if(!form)return;ensureDraft();draft[event.target.name]=event.target.value;dirty=true;updateIdentityPreview();});
  document.addEventListener('click',async event=>{
    const node=event.target.closest('button');if(!node)return;
    if(node.hasAttribute('data-member-identity-choice')){
      if(node.disabled)return;ensureDraft();const field=node.dataset.memberIdentityChoice;draft[field]=node.dataset.value;dirty=true;
      node.closest('.identity-options').querySelectorAll('[data-member-identity-choice]').forEach(choice=>{const selected=choice.dataset.value===draft[field];choice.classList.toggle('selected',selected);choice.setAttribute('aria-pressed',String(selected));});
      updateIdentityPreview();return;
    }
    if(node.hasAttribute('data-member-identity-reset')){dirty=false;draft=null;refreshMembership();return;}
  });
  document.addEventListener('submit',async event=>{if(!event.target.matches('[data-member-identity-form]'))return;event.preventDefault();if(saving)return;saving=true;const value={...draft};refreshMembership();try{await membershipStore.setAppearance(value);dirty=false;draft=null;notify('身份设置已保存。');}catch(error){notify(error.message||'身份设置保存失败。');}finally{saving=false;refreshMembership();}});
}};
