export function installNetworkStatus(retry){
  const banner=document.createElement('div');banner.className='network-banner';banner.hidden=true;banner.setAttribute('role','status');
  const text=document.createElement('span'),button=document.createElement('button');button.type='button';button.textContent='重试';banner.append(text,button);document.body.append(banner);
  let busy=false;
  async function sync(){
    if(busy)return;
    banner.hidden=false;
    if(!navigator.onLine){text.textContent='网络已断开，已加载的内容仍可查看；未发送内容会保留。';return;}
    busy=true;button.disabled=true;text.textContent='网络已连接，正在同步当前页面…';
    try{await retry();banner.hidden=true;}catch{text.textContent='暂时无法同步，当前显示已加载内容，请稍后重试。';}
    finally{busy=false;button.disabled=false;}
  }
  button.addEventListener('click',sync);window.addEventListener('online',sync);window.addEventListener('offline',sync);
  if(!navigator.onLine)sync();
}
