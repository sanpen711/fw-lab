// Keep unchanged rows in the DOM when a list grows, moves or updates.
export function reconcileChildren(container,rows,{key,signature,render}){
  const existing=new Map();
  for(const node of Array.from(container.children)){
    if(node.dataset.rowKey==null)node.remove();
    else existing.set(node.dataset.rowKey,node);
  }
  let cursor=container.firstElementChild;
  for(let index=0;index<rows.length;index++){
    const row=rows[index],id=key(row,index),version=signature(row,index);
    let node=existing.get(id);existing.delete(id);
    if(!node||node.dataset.rowSignature!==version){
      const template=document.createElement('template');template.innerHTML=render(row,index);
      const next=template.content.firstElementChild;next.dataset.rowKey=id;next.dataset.rowSignature=version;
      if(node){const wasCursor=node===cursor;node.replaceWith(next);if(wasCursor)cursor=next;}node=next;
    }
    if(node!==cursor)container.insertBefore(node,cursor);cursor=node.nextElementSibling;
  }
  existing.forEach(node=>node.remove());
}
