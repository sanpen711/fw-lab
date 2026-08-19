let pickerOpen=false;
let enhanceQueued=false;

function ensureStyles(){
  if(document.getElementById('fw-compose-web-parity-style'))return;
  const style=document.createElement('style');
  style.id='fw-compose-web-parity-style';
  style.textContent=`
    [data-compose-form] .media-tools{display:none!important}
    [data-compose-form] .picker-block.compose-compact-picker[hidden]{display:none!important}
    .compose-compact-tools{display:flex;align-items:center;gap:9px;margin:12px 0 4px}
    .compose-compact-tool{width:40px;height:40px;min-width:40px;border:1px solid rgba(27,27,24,.18);border-radius:999px;background:#fffdf7;color:#181916;display:grid;place-items:center;padding:0;cursor:pointer;font:inherit;font-size:20px;font-weight:900;box-shadow:none;transition:transform .12s ease,border-color .12s ease,background .12s ease}
    .compose-compact-tool:hover{border-color:rgba(217,121,121,.55);background:#fff8f4;transform:translateY(-1px)}
    .compose-compact-tool.media{font-size:23px;font-weight:500}
    [data-compose-form] .picker-block.compose-compact-picker{margin-top:10px;padding:10px;border:1px solid rgba(27,27,24,.13);border-radius:14px;background:#fffaf3}
    [data-compose-form] .picker-block.compose-compact-picker>b{display:block;margin:0 0 8px;font-size:12px}
  `;
  document.head.appendChild(style);
}

function enhanceCompose(){
  ensureStyles();
  const form=document.querySelector('[data-compose-form]');
  if(!form)return;
  const fileInput=form.querySelector('[data-compose-image]');
  const picker=form.querySelector('.picker-block');
  if(picker){
    picker.classList.add('compose-compact-picker');
    picker.hidden=!pickerOpen;
  }
  let tools=form.querySelector('[data-compose-compact-tools]');
  if(!tools){
    tools=document.createElement('div');
    tools.className='compose-compact-tools';
    tools.dataset.composeCompactTools='1';
    tools.innerHTML='<button class="compose-compact-tool" type="button" data-compose-compact-emoji aria-label="打开表情">😊</button><button class="compose-compact-tool media" type="button" data-compose-compact-media aria-label="添加图片或视频">＋</button>';
    const count=form.querySelector('.compose-count');
    const mediaTools=form.querySelector('.media-tools');
    if(mediaTools)mediaTools.before(tools);
    else if(count)count.after(tools);
    else form.querySelector('textarea')?.after(tools);
  }
  const mediaButton=form.querySelector('[data-compose-compact-media]');
  if(mediaButton)mediaButton.disabled=!fileInput;
}

function scheduleEnhance(){
  if(enhanceQueued)return;
  enhanceQueued=true;
  queueMicrotask(()=>{enhanceQueued=false;enhanceCompose();});
}

document.addEventListener('click',event=>{
  const emoji=event.target.closest?.('[data-compose-compact-emoji]');
  if(emoji){
    event.preventDefault();
    pickerOpen=!pickerOpen;
    enhanceCompose();
    return;
  }
  const media=event.target.closest?.('[data-compose-compact-media]');
  if(media){
    event.preventDefault();
    media.closest('[data-compose-form]')?.querySelector('[data-compose-image]')?.click();
    return;
  }
  if(event.target.closest?.('[data-nav]')&&!event.target.closest?.('[data-nav="compose"]'))pickerOpen=false;
},true);

const observer=new MutationObserver(scheduleEnhance);
observer.observe(document.body,{childList:true,subtree:true});

enhanceCompose();
