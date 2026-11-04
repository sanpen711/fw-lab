import {NES_GAMES} from './nes-games.js';
import {APP_VERSION} from './config.js';

const nesGames=Object.fromEntries(Object.entries(NES_GAMES).map(([id,game])=>[id,{
  title:game.title,
  tip:game.controls,
  page:`./nes-player.html?game=${encodeURIComponent(id)}`,
}]));

const games={
  ...nesGames,
  '2048':{title:'2048',tip:'使用方向键移动数字方块',path:'2048'},
  minesweeper:{title:'扫雷',tip:'左键翻开，右键插旗',path:'minesweeper'},
  sudoku:{title:'数独',tip:'选择难度后点击格子填写数字',path:'sudoku'},
  reaction:{title:'反应测试',tip:'画面变绿后尽快点击',path:'reaction'}
};

const $=selector=>document.querySelector(selector);
let current='';

function frameUrl(game){
  const target=game.page||`./games/${game.path}/index.html`;
  const url=new URL(target,document.baseURI);
  url.searchParams.set('v',APP_VERSION);
  return url.href;
}

function saveCurrentProgress(){
  const frame=$('[data-game-frame]');
  try{
    const saved=frame?.contentWindow?.__FW_NES_PROGRESS__?.save();
    if(saved)$('[data-game-save-warning]')?.remove();
  }catch{
    let warning=$('[data-game-save-warning]');
    if(!warning){warning=document.createElement('p');warning.dataset.gameSaveWarning='';warning.className='game-save-warning';warning.setAttribute('role','alert');$('[data-game-hall]')?.prepend(warning);}
    warning.textContent='本次游戏进度保存失败，上次成功保存的进度仍然保留。可重新打开游戏后重试。';
  }
}

function open(id){
  const game=games[id];if(!game)return;
  saveCurrentProgress();
  current=id;
  $('[data-game-hall]').hidden=true;
  $('[data-game-stage]').hidden=false;
  $('[data-game-title]').textContent=game.title;
  $('[data-game-tip]').textContent=game.tip;
  const frame=$('[data-game-frame]');frame.title=game.title;frame.src=frameUrl(game);
  frame.focus({preventScroll:true});frame.contentWindow?.focus();
  try{localStorage.setItem('fw:desktop:v11:last-game',id);}catch{}
}

function close(){
  saveCurrentProgress();
  const previous=current;
  current='';
  const frame=$('[data-game-frame]');
  if(frame)frame.src='about:blank';
  const stage=$('[data-game-stage]');if(stage)stage.hidden=true;
  const hall=$('[data-game-hall]');if(hall)hall.hidden=false;
  if(previous&&hall?.closest('.view.active'))$(`[data-game-open="${previous}"]`)?.focus({preventScroll:true});
}

function reload(){if(current){saveCurrentProgress();const frame=$('[data-game-frame]');const url=frame.src;frame.src='about:blank';requestAnimationFrame(()=>{frame.src=url;});}}

function activate(){
  if(!$('[data-game-stage]')?.hidden&&current)return;
  close();
}

document.addEventListener('click',event=>{
  const card=event.target.closest?.('[data-game-open]');if(card){open(card.dataset.gameOpen);return;}
  if(event.target.closest?.('[data-game-back]')){close();return;}
  if(event.target.closest?.('[data-game-reload]')){reload();return;}
  const nav=event.target.closest?.('[data-nav]');if(nav&&nav.dataset.nav!=='games')close();
});

window.addEventListener('beforeunload',saveCurrentProgress);
window.__FW_GAMES__={activate,close,open};
$('[data-game-frame]')?.addEventListener('load',()=>{const frame=$('[data-game-frame]');if(current&&frame.src!=='about:blank'&&frame.closest('.view.active')){frame.focus({preventScroll:true});frame.contentWindow?.focus();}});
