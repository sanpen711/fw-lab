const dialogs=[];
const visible=element=>element?.isConnected&&!element.hidden&&element.getClientRects().length>0;
const current=()=>dialogs.findLast(entry=>visible(entry.element));
const controls=element=>[...element.querySelectorAll('button,input,textarea,select,a[href],[tabindex]')].filter(node=>!node.disabled&&node.tabIndex>=0&&!node.closest('[hidden],[inert]')&&visible(node));

export function openDialog(element,{close,initialFocus}={}){
  if(!dialogs.some(entry=>entry.element===element))dialogs.push({element,close,trigger:document.activeElement});
  requestAnimationFrame(()=>{
    if(current()?.element!==element)return;
    const target=initialFocus?.()||controls(element)[0];
    if(target)target.focus({preventScroll:true});else{element.tabIndex=-1;element.focus({preventScroll:true});}
  });
}

export function closeDialog(element){
  const index=dialogs.findIndex(entry=>entry.element===element);if(index<0)return;
  const [{trigger}]=dialogs.splice(index,1);
  if(visible(trigger)&&!trigger.closest('[hidden],[inert]'))trigger.focus({preventScroll:true});
}

document.addEventListener('keydown',event=>{
  const entry=current();if(!entry)return;
  if(event.key==='Escape'&&entry.close){event.preventDefault();event.stopImmediatePropagation();entry.close();return;}
  if(event.key!=='Tab')return;
  const targets=controls(entry.element);event.preventDefault();event.stopPropagation();
  if(!targets.length){entry.element.tabIndex=-1;entry.element.focus();return;}
  const index=targets.indexOf(document.activeElement);
  targets[(index+(event.shiftKey?-1:1)+targets.length)%targets.length].focus();
},true);

document.addEventListener('focusin',event=>{
  const entry=current();if(entry&&!entry.element.contains(event.target))(controls(entry.element)[0]||entry.element).focus({preventScroll:true});
},true);
