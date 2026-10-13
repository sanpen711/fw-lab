const composing=new Set();
const deferred=new Map();

document.addEventListener('compositionstart',event=>composing.add(event.target),true);
document.addEventListener('compositionend',event=>{
  composing.delete(event.target);
  setTimeout(()=>{
    for(const [host,render] of deferred){
      if([...composing].some(element=>host.contains(element)))continue;
      deferred.delete(host);
      if(host.isConnected)render();
    }
  },0);
},true);

export function deferWhileComposing(host,render){
  if(![...composing].some(element=>host.contains(element)))return false;
  deferred.set(host,render);
  return true;
}

export function captureUiState(host,scrollSelectors=[]){
  const focused=host.contains(document.activeElement)?document.activeElement:null;
  return {
    name:focused?.name||'',
    selection:typeof focused?.selectionStart==='number'?[focused.selectionStart,focused.selectionEnd,focused.selectionDirection]:null,
    scroll:scrollSelectors.map(selector=>[selector,host.querySelector(selector)?.scrollTop||0]),
  };
}

export function restoreUiState(host,state){
  for(const [selector,top] of state.scroll){const element=host.querySelector(selector);if(element)element.scrollTop=top;}
  const target=state.name?host.querySelector(`[name="${CSS.escape(state.name)}"]`):null;
  if(target&&!target.disabled){target.focus({preventScroll:true});if(state.selection&&target.setSelectionRange)try{target.setSelectionRange(...state.selection);}catch{}}
}

export function readFormValues(form){
  const values={};
  for(const field of form?.elements||[]){if(field.name&&field.type!=='file')values[field.name]=field.type==='checkbox'?field.checked:field.value;}
  return values;
}

export function restoreFormValues(form,values={}){
  for(const field of form?.elements||[]){if(!Object.hasOwn(values,field.name)||field.type==='file')continue;if(field.type==='checkbox')field.checked=values[field.name];else field.value=values[field.name];}
}
