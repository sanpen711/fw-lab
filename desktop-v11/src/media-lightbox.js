import {openDialog,closeDialog} from './dialog-focus.js';

let active=null;
const node=selector=>document.querySelector(selector);
function imageInfo(trigger){return{url:trigger.dataset.lightboxSrc||trigger.src,alt:trigger.querySelector?.('img')?.alt||trigger.alt||'图片'};}
function sourceFor(trigger,group,index){
  if(!group)return null;
  const comment=group.closest('[data-comment-id]');if(comment)return{kind:'comment',id:comment.dataset.commentId,index};
  const card=group.closest('.square-post[data-open-post]');if(card)return{kind:'post',id:card.dataset.openPost,index};
  const detail=group.closest('[data-post-detail]');if(detail)return{kind:'detail',id:detail.dataset.renderedPostId,index};
  return null;
}
function currentTrigger(source,url){
  if(!source)return null;
  const id=CSS.escape(String(source.id||''));let root=null;
  if(source.kind==='comment')root=node(`.post-comment[data-comment-id="${id}"]`);
  if(source.kind==='post')root=node(`.square-post[data-open-post="${id}"]`);
  if(source.kind==='detail'){const host=node('[data-post-detail]');if(host?.dataset.renderedPostId===source.id)root=host.querySelector('.detail-post');}
  const items=[...(root?.querySelectorAll('.media-gallery [data-lightbox-src]')||[])];
  return items[source.index]?.dataset.lightboxSrc===url?items[source.index]:items.find(item=>item.dataset.lightboxSrc===url);
}
function render(){
  if(!active)return;const modal=node('[data-media-lightbox]'),image=node('[data-media-lightbox-image]'),item=active.items[active.index],multiple=active.items.length>1;
  image.src=item.url;image.alt=multiple?`${item.alt}，第 ${active.index+1} 张，共 ${active.items.length} 张`:item.alt;
  modal.classList.toggle('sticker-preview',item.url.includes('/emoji/fufu1/'));modal.classList.toggle('has-gallery',multiple);
  modal.querySelectorAll('[data-media-lightbox-prev],[data-media-lightbox-next]').forEach(button=>button.hidden=!multiple);
  const counter=node('[data-media-lightbox-count]');counter.hidden=!multiple;counter.textContent=`${active.index+1} / ${active.items.length}`;
}
function step(delta){if(!active||active.items.length<2)return;active.index=(active.index+delta+active.items.length)%active.items.length;render();}
function close(){
  const modal=node('[data-media-lightbox]');if(!modal||modal.hidden)return;
  const previous=active;active=null;modal.hidden=true;modal.classList.remove('sticker-preview','has-gallery');node('[data-media-lightbox-image]')?.removeAttribute('src');document.body.classList.remove('lightbox-open');closeDialog(modal);
  if(previous?.trigger&&!previous.trigger.isConnected){const replacement=currentTrigger(previous.source,imageInfo(previous.trigger).url);replacement?.focus({preventScroll:true});}
}
function open(trigger){
  const modal=node('[data-media-lightbox]');if(!modal||!trigger)return;
  const group=trigger.closest?.('.media-gallery'),triggers=group?[...group.querySelectorAll('[data-lightbox-src]')]:[trigger];
  const index=Math.max(0,triggers.indexOf(trigger)),items=triggers.map(imageInfo);if(!items[index]?.url)return;
  active={items,index,trigger,source:sourceFor(trigger,group,index)};
  render();modal.hidden=false;document.body.classList.add('lightbox-open');openDialog(modal,{close});
}

document.addEventListener('click',event=>{
  const modal=event.target.closest?.('[data-media-lightbox]');if(!modal||modal.hidden)return;
  event.stopPropagation();
  if(event.target.closest('[data-media-lightbox-prev]')){event.preventDefault();step(-1);}
  else if(event.target.closest('[data-media-lightbox-next]')){event.preventDefault();step(1);}
  else if(event.target.closest('[data-media-lightbox-close]')||event.target===modal)close();
},true);
document.addEventListener('keydown',event=>{
  if(!active||node('[data-media-lightbox]')?.hidden||!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();event.stopImmediatePropagation();step(event.key==='ArrowLeft'?-1:1);
},true);

export const mediaLightbox={open,close};
