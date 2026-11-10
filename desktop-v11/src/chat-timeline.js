// Reconcile keyed bubbles in place. New messages do not restart existing media
// or discard selection; older pages can be prepended without replacing history.
export function reconcileChatTimeline(timeline,rows,{key,signature,render}){
  const existing=new Map(Array.from(timeline.children).map(node=>[node.dataset.timelineKey,node]));
  let cursor=timeline.firstElementChild;
  for(let index=0;index<rows.length;index++){
    const row=rows[index],id=key(row,index),version=signature(row,index);
    let node=existing.get(id);existing.delete(id);
    if(!node||node.dataset.timelineSignature!==version){
      const template=document.createElement('template');template.innerHTML=render(row,index);
      const next=template.content.firstElementChild;next.dataset.timelineKey=id;next.dataset.timelineSignature=version;
      if(node){const wasCursor=node===cursor;node.replaceWith(next);if(wasCursor)cursor=next;}node=next;
    }
    if(node!==cursor)timeline.insertBefore(node,cursor);cursor=node.nextElementSibling;
  }
  existing.forEach(node=>node.remove());
}
