const urlPattern=/(?:https?:\/\/|www\.)[^\s<>"`，。！？；：、（）【】《》“”‘’]+/gi;

function escapeHtml(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}

export function webUrl(value){
  const text=String(value||'');
  if(text.length>4096||/[\u0000-\u0020\u007f\\]/.test(text)||!/^(?:https?:\/\/|www\.)/i.test(text))return '';
  try{const url=new URL(/^www\./i.test(text)?'https://'+text:text);return ['http:','https:'].includes(url.protocol)&&url.hostname&&!url.username&&!url.password?url.href:'';}catch{return '';}
}

function trimUrl(value){
  let text=value.replace(/[.,;!?]+$/g,'');
  for(;;){
    const end=text.at(-1),open={')':'(',']':'[','}':'{'}[end];
    if(!open||text.split(end).length<=text.split(open).length)break;
    text=text.slice(0,-1).replace(/[.,;!?]+$/g,'');
  }
  return text;
}

export function renderWebLinks(value,renderText=escapeHtml){
  const text=String(value||'');let result='',cursor=0;
  for(const match of text.matchAll(urlPattern)){
    if(match.index&&/[a-z0-9_@]/i.test(text[match.index-1]))continue;
    const label=trimUrl(match[0]),url=webUrl(label);if(!url)continue;
    result+=renderText(text.slice(cursor,match.index));
    result+=`<a class="external-web-link" href="${escapeHtml(url)}" data-external-link="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="在默认浏览器打开">${escapeHtml(label)}</a>`;
    cursor=match.index+label.length;
  }
  return result+renderText(text.slice(cursor));
}

export async function openWebUrl(value){
  const url=webUrl(value);if(!url)throw new Error('网址无效。');
  if(window.__TAURI__?.core?.invoke)await window.__TAURI__.core.invoke('desktop_open_web_url',{url});
  else window.open(url,'_blank','noopener,noreferrer');
}

export function bindExternalLinks({onError=()=>{}}={}){
  const open=async event=>{
    if(event.type==='auxclick'&&event.button!==1)return;
    const link=event.target.closest?.('a[data-external-link]');if(!link)return;
    event.preventDefault();event.stopImmediatePropagation();
    try{await openWebUrl(link.dataset.externalLink);}catch{onError('打开失败，请复制网址到浏览器。');}
  };
  document.addEventListener('click',open,true);document.addEventListener('auxclick',open,true);
}
