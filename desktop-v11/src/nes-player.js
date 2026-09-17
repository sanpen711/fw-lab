import './nes-player.css';

const base=new URL('./',document.baseURI);
const boot=document.querySelector('[data-nes-boot]');

function showError(message){
  document.documentElement.dataset.emulatorState='error';
  if(!boot)return;
  boot.hidden=false;
  boot.classList.add('error');
  boot.innerHTML=`<b>NES 播放器没有启动</b><span>${message}</span>`;
}

window.EJS_player='#game';
window.EJS_gameName='魂斗罗 1代 无限人＋散弹枪';
window.EJS_gameID='fw-contra-1-infinite-spread';
window.EJS_gameUrl=new URL('games/nes/roms/contra-infinite-spread.nes',base).href;
window.EJS_core='nes';
window.EJS_pathtodata=new URL('emulatorjs/',base).href;
window.EJS_color='#ff969e';
window.EJS_backgroundColor='#111613';
window.EJS_language='zh-CN';
window.EJS_startOnLoaded=false;
window.EJS_startButtonName='开始游戏';
window.EJS_alignStartButton='center';
window.EJS_threads=false;
window.EJS_forceLegacyCores=true;
window.EJS_DEBUG_XX=true;
window.EJS_disableAutoLang=false;
window.EJS_noAutoFocus=false;
window.EJS_defaultOptions={retroarch_core:'fceumm'};
window.EJS_ready=()=>{
  document.documentElement.dataset.emulatorState='ready';
  if(boot)boot.hidden=true;
};
window.EJS_onGameStart=()=>{
  document.documentElement.dataset.gameState='running';
};

const loader=document.createElement('script');
loader.src=new URL('emulatorjs/loader.js',base).href;
loader.addEventListener('error',()=>showError('本地模拟器文件读取失败，请重新打开游戏。'));
document.head.appendChild(loader);

window.addEventListener('error',event=>{
  if(document.documentElement.dataset.emulatorState!=='ready')showError(event.message||'模拟器加载失败，请重新打开游戏。');
});
