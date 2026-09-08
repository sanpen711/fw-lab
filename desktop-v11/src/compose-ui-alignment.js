let openPickerKey='';
let enhanceQueued=false;

function icon(name){return `<svg class="ui-symbol" aria-hidden="true"><use href="/ui-icons.svg#${name}"></use></svg>`;}

function ensureStyles(){
  if(document.getElementById('fw-compose-web-parity-style'))return;
  const style=document.createElement('style');
  style.id='fw-compose-web-parity-style';
  style.textContent=`
    [data-compose-form] .media-tools,[data-comment-form] .media-tools{display:none!important}
    .compose-compact-picker[hidden]{display:none!important}
    .compose-compact-tools{display:flex;align-items:center;gap:9px;margin:10px 0 2px}
    .compose-compact-tool{width:40px;height:40px;min-width:40px;border:1px solid rgba(27,27,24,.18);border-radius:999px;background:#fffdf7;color:#181916;display:grid;place-items:center;padding:0;cursor:pointer;box-shadow:none;transition:transform .12s ease,border-color .12s ease,background .12s ease}
    .compose-compact-tool:hover,.compose-compact-tool[aria-expanded="true"]{border-color:rgba(217,121,121,.55);background:#fff8f4;transform:translateY(-1px)}
    .compose-compact-tool .ui-symbol{width:20px;height:20px}
    .compose-compact-picker{margin-top:8px;padding:10px;border:1px solid rgba(27,27,24,.13);border-radius:14px;background:#fffaf3}
  `;
  document.head.appendChild(style);
}

function enhanceSurface(form,key){
  const fileInput=form.querySelector(key==='compose'?'[data-compose-image]':'[data-comment-image]');
  const picker=form.querySelector('.picker-block');
  if(picker){picker.classList.add('compose-compact-picker');picker.hidden=openPickerKey!==key;}
  let tools=form.querySelector('[data-compose-compact-tools]');
  if(!tools){
    tools=document.createElement('div');tools.className='compose-compact-tools';tools.dataset.composeCompactTools='1';tools.dataset.pickerSurface=key;
    const legacy=key==='compose'?' data-compose-compact-emoji':' data-comment-compact-emoji';
    const legacyMedia=key==='compose'?' data-compose-compact-media':' data-comment-compact-media';
    tools.innerHTML=`<button class="compose-compact-tool" type="button" data-compact-picker-toggle${legacy} aria-label="打开表情" aria-expanded="false">${icon('face')}</button><button class="compose-compact-tool" type="button" data-compact-media${legacyMedia} aria-label="添加图片或视频">${icon('media')}</button>`;
    const mediaTools=form.querySelector('.media-tools');
    if(mediaTools)mediaTools.before(tools);else form.querySelector('textarea')?.after(tools);
  }
  const toggle=form.querySelector('[data-compact-picker-toggle]');if(toggle)toggle.setAttribute('aria-expanded',String(openPickerKey===key));
  const media=form.querySelector('[data-compact-media]');if(media)media.disabled=!fileInput;
}

function enhanceCompose(){
  ensureStyles();
  const compose=document.querySelector('[data-compose-form]');if(compose)enhanceSurface(compose,'compose');
  document.querySelectorAll('[data-comment-form]').forEach(form=>enhanceSurface(form,`comment:${form.dataset.commentForm}`));
}

function scheduleEnhance(){if(enhanceQueued)return;enhanceQueued=true;queueMicrotask(()=>{enhanceQueued=false;enhanceCompose();});}

document.addEventListener('click',event=>{
  const pickerButton=event.target.closest?.('[data-compact-picker-toggle]');
  if(pickerButton){event.preventDefault();const key=pickerButton.closest('[data-picker-surface]')?.dataset.pickerSurface||'';openPickerKey=openPickerKey===key?'':key;enhanceCompose();return;}
  const mediaButton=event.target.closest?.('[data-compact-media]');
  if(mediaButton){event.preventDefault();const form=mediaButton.closest('[data-compose-form],[data-comment-form]');form?.querySelector('[data-compose-image],[data-comment-image]')?.click();return;}
  if(event.target.closest?.('[data-nav]')){openPickerKey='';scheduleEnhance();}
},true);

document.addEventListener('submit',event=>{if(event.target.matches?.('[data-compose-form],[data-comment-form]'))openPickerKey='';},true);

const observer=new MutationObserver(scheduleEnhance);
observer.observe(document.body,{childList:true,subtree:true});
enhanceCompose();
