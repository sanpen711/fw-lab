let level='easy';
const levels={easy:[9,9,10],medium:[16,16,40]};
const status=document.getElementById('status');
const flagMode=document.getElementById('flagMode');
window.minesweeperFlagMode=false;

window.setMinesweeperStatus=function(message,won=false){
  status.textContent=message;
  status.classList.toggle('won',won);
};

function startGame(){
  const [cols,rows,count]=levels[level];
  clearInterval(gametimer);gametimer=null;timer=0;end=false;win=false;numberofmines=count;
  canvas.width=c*cols+20;canvas.height=c*rows+2*c+20;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  jsminesweeper(cols,rows,count);
  setMinesweeperStatus('安全摸鱼中');
}

init();
document.querySelectorAll('[data-level]').forEach(button=>button.addEventListener('click',()=>{
  level=button.dataset.level;
  document.querySelectorAll('[data-level]').forEach(item=>item.classList.toggle('active',item===button));
  startGame();
}));
document.getElementById('restart').addEventListener('click',startGame);
flagMode.addEventListener('click',()=>{
  window.minesweeperFlagMode=!window.minesweeperFlagMode;
  flagMode.classList.toggle('active',window.minesweeperFlagMode);
  flagMode.setAttribute('aria-pressed',String(window.minesweeperFlagMode));
  flagMode.textContent=window.minesweeperFlagMode?'插旗：开':'插旗：关';
});
startGame();
