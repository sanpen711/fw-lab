import './nes-player.css';
import {DEFAULT_NES_GAME_ID,NES_GAMES} from './nes-games.js';

const base=new URL('./',document.baseURI);
const boot=document.querySelector('[data-nes-boot]');
const requestedGame=new URLSearchParams(location.search).get('game')||DEFAULT_NES_GAME_ID;
const game=NES_GAMES[requestedGame]||NES_GAMES[DEFAULT_NES_GAME_ID];
let startTimer=0;

function showError(message){
  document.documentElement.dataset.emulatorState='error';
  if(!boot)return;
  boot.hidden=false;
  boot.classList.add('error');
  boot.innerHTML=`<b>NES 播放器没有启动</b><span>${message}</span>`;
}

window.EJS_player='#game';
document.title=`${game.title}｜F.w 研究所`;
document.querySelector('#game')?.setAttribute('aria-label',`${game.title} NES 播放器`);
window.EJS_gameName=game.emulatorName;
window.EJS_gameID=game.storageId;
window.EJS_gameUrl=new URL(game.rom,base).href;
window.EJS_core='nes';
window.EJS_pathtodata=new URL('emulatorjs/',base).href;
window.EJS_unpackedCorePath='cores/unpacked/fceumm/';
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
  window.EJS_emulator?.on('start-clicked',()=>{
    document.documentElement.dataset.gameState='loading';
    window.clearTimeout(startTimer);
    startTimer=window.setTimeout(()=>showError('本地游戏核心响应超时，请关闭游戏后重新打开。'),20000);
  });
};
window.EJS_onGameStart=()=>{
  window.clearTimeout(startTimer);
  document.documentElement.dataset.gameState='running';
};

const loader=document.createElement('script');
loader.src=new URL('emulatorjs/loader.js',base).href;
loader.addEventListener('error',()=>showError('本地模拟器文件读取失败，请重新打开游戏。'));
document.head.appendChild(loader);

window.addEventListener('error',event=>{
  if(document.documentElement.dataset.emulatorState!=='ready')showError(event.message||'模拟器加载失败，请重新打开游戏。');
});
window.addEventListener('unhandledrejection',event=>{
  if(document.documentElement.dataset.gameState==='loading')showError(event.reason?.message||'模拟器加载失败，请重新打开游戏。');
});
