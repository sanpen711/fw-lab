const arena=document.getElementById('arena');
const title=document.getElementById('title');
const copy=document.getElementById('copy');
const bestNode=document.getElementById('best');
let state='idle',timer=0,started=0;
let best=Number(localStorage.getItem('fw-game-reaction-best')||0);

function showBest(){bestNode.textContent=best?`${best} ms`:'--';}
function reset(){clearTimeout(timer);state='idle';arena.className='arena idle';title.textContent='再测一次';copy.textContent='点击开始，画面变绿后尽快再点一下';}

arena.addEventListener('click',()=>{
  if(state==='idle'||state==='result'){
    state='waiting';arena.className='arena waiting';title.textContent='先别点';copy.textContent='等画面变绿……';
    timer=setTimeout(()=>{state='ready';started=performance.now();arena.className='arena ready';title.textContent='现在点！';copy.textContent='';},1000+Math.random()*2500);return;
  }
  if(state==='waiting'){
    clearTimeout(timer);state='result';arena.className='arena result';title.textContent='点早了';copy.textContent='休息一下，再点一次重新开始';return;
  }
  if(state==='ready'){
    const value=Math.round(performance.now()-started);state='result';
    if(!best||value<best){best=value;localStorage.setItem('fw-game-reaction-best',String(best));showBest();}
    arena.className='arena result';title.textContent=`${value} ms`;copy.textContent=value<220?'今天状态不错':'还能上班，但建议喝口水';
  }
});
showBest();
