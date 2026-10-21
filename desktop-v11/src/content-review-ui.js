import {authStore} from './auth-store.js';
import {openDialog,closeDialog} from './dialog-focus.js';
const client=authStore.client;
const hidden=new Map();let notify=()=>{},channel=null,checking=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const selectors=[['post','[data-open-post]','openPost'],['post','[data-post-id]','postId'],['comment','[data-comment-id]','commentId'],['private_message','[data-chat-message-id]','chatMessageId'],['room_message','[data-room-message]','roomMessage'],['room','[data-room-open]','roomOpen'],['poll','[data-review-poll]','reviewPoll'],['poll_option','[data-option-id]','optionId'],['game_party','[data-party-open]','partyOpen'],['party_message','[data-review-party-message]','reviewPartyMessage']];
function hideKnown(){for(const [kind,selector,key] of selectors)for(const node of document.querySelectorAll(selector)){
 const id=node.dataset[key];
 const row=kind==='post'?(node.closest('.square-post,.post-card,.detail-post')||node):kind==='poll_option'?(node.closest('.poll-option-row')||node):node;
 if(hidden.has(`${kind}:${id}`)){row.hidden=true;row.dataset.reviewHidden='1';row.setAttribute('aria-hidden','true');}else if(row.dataset.reviewHidden){row.hidden=false;delete row.dataset.reviewHidden;row.removeAttribute('aria-hidden');}
}}
function apply(event){const key=`${event.kind}:${event.target_id}`;if(event.visible)hidden.delete(key);else hidden.set(key,true);hideKnown();window.dispatchEvent(new CustomEvent('fw:content-review-change',{detail:event}));}
async function check(){if(checking||document.hidden)return;checking=true;try{
 const refs=new Map();for(const [kind,selector,key] of selectors)for(const n of document.querySelectorAll(selector)){const id=n.dataset[key];if(id&&!id.startsWith('pending-'))refs.set(`${kind}:${id}`,{kind,id});}
 const values=[...refs.values()];for(let i=0;i<values.length;i+=300){const r=await client.rpc('fw_content_review_visibility',{p_refs:values.slice(i,i+300)});if(r.error)break;for(const item of r.data||[]){const key=`${item.kind}:${item.target_id}`;if(!item.visible&&!hidden.has(key))apply(item);else if(item.visible&&hidden.has(key))apply(item);}}
 }finally{checking=false;}}
function showReport(kind,id){if(!authStore.state.user){notify('请先登录后再举报。');return;}
 const element=document.createElement('dialog');element.className='review-report-dialog';element.innerHTML=`<form><h3>举报内容</h3><label>举报原因<select name="category" required>${['辱骂攻击或骚扰','泄露他人隐私','威胁人身安全','色情或暴力','赌博或诈骗','广告引流或刷屏','其他违规'].map(x=>`<option>${x}</option>`).join('')}</select></label><label>补充说明（选填）<textarea name="details" maxlength="200" rows="3"></textarea></label><p>同一账号重复举报不会增加次数，请如实说明。</p><div class="row-actions"><button type="button" data-report-cancel>取消</button><button class="primary" type="submit">提交举报</button></div></form>`;document.body.append(element);
 const close=()=>{closeDialog(element);element.close();element.remove();};element.querySelector('[data-report-cancel]').onclick=close;element.addEventListener('cancel',event=>{event.preventDefault();close();});
 element.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=element.querySelector('[type="submit"]');button.disabled=true;try{const fd=new FormData(event.currentTarget);const result=await client.rpc('fw_submit_report',{p_target_type:kind,p_target_id:String(id),p_reason:`${fd.get('category')} ${fd.get('details')||''}`.trim()});if(result.error)throw result.error;close();notify('举报已提交，管理员会核查。');await check();}catch(e){notify(e.message||'举报失败，请重试。');button.disabled=false;}};
 element.showModal();openDialog(element,{close});
}
export function installContentReviewUi({toast}){notify=toast;
 document.addEventListener('click',event=>{const b=event.target.closest('[data-review-report]');if(!b)return;event.preventDefault();event.stopImmediatePropagation();showReport(b.dataset.reviewReport,b.dataset.reviewId);},true);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)check().catch(()=>{});});
 new MutationObserver(hideKnown).observe(document.body,{subtree:true,childList:true});
 let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>check().catch(()=>{}),600);}).observe(document.body,{subtree:true,childList:true});
 channel=client.channel('content-review-visibility').on('postgres_changes',{event:'INSERT',schema:'public',table:'content_review_events'},p=>apply(p.new)).subscribe();
 setInterval(()=>check().catch(()=>{}),15000);check().catch(()=>{});
}
export function reportButton(kind,id){return `<button type="button" class="detail-quiet-action" data-review-report="${esc(kind)}" data-review-id="${esc(id)}">举报</button>`;}
