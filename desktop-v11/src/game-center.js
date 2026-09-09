const games={
  '2048':{title:'2048',tip:'使用方向键移动数字方块',path:'2048'},
  minesweeper:{title:'扫雷',tip:'左键翻开，右键插旗',path:'minesweeper'},
  snake:{title:'贪吃蛇',tip:'使用方向键控制方向',path:'snake'},
  sudoku:{title:'数独',tip:'选择难度后点击格子填写数字',path:'sudoku'},
  reaction:{title:'反应测试',tip:'画面变绿后尽快点击',path:'reaction'},
  catch:{title:'接住掉落物',tip:'移动鼠标控制下方托盘',path:'catch'}
};

const $=selector=>document.querySelector(selector);
let current='';

function frameUrl(game){return new URL(`./games/${game.path}/index.html?v=1.2.9`,document.baseURI).href;}

function open(id){
  const game=games[id];if(!game)return;
  current=id;
  $('[data-game-hall]').hidden=true;
  $('[data-game-stage]').hidden=false;
  $('[data-game-title]').textContent=game.title;
  $('[data-game-tip]').textContent=game.tip;
  const frame=$('[data-game-frame]');frame.title=game.title;frame.src=frameUrl(game);
  try{localStorage.setItem('fw:desktop:v11:last-game',id);}catch{}
}

function close(){
  current='';
  const frame=$('[data-game-frame]');
  if(frame)frame.src='about:blank';
  const stage=$('[data-game-stage]');if(stage)stage.hidden=true;
  const hall=$('[data-game-hall]');if(hall)hall.hidden=false;
}

function reload(){if(current){const frame=$('[data-game-frame]');const url=frame.src;frame.src='about:blank';requestAnimationFrame(()=>{frame.src=url;});}}

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

window.__FW_GAMES__={activate,close,open};
