const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const scoreNode=document.getElementById('score'),timeNode=document.getElementById('time'),bestNode=document.getElementById('best'),startButton=document.getElementById('start');
let catcher={x:390,y:475,w:120,h:18},items=[],score=0,left=45,running=false,last=0,spawn=0,second=0,raf=0;
let best=Number(localStorage.getItem('fw-game-catch-best')||0);bestNode.textContent=best;

function pointer(clientX){const rect=canvas.getBoundingClientRect();catcher.x=Math.max(0,Math.min(canvas.width-catcher.w,(clientX-rect.left)*canvas.width/rect.width-catcher.w/2));}
canvas.addEventListener('mousemove',event=>pointer(event.clientX));
canvas.addEventListener('touchmove',event=>{event.preventDefault();pointer(event.touches[0].clientX);},{passive:false});

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#f7f2eb';for(let y=36;y<canvas.height;y+=48){ctx.fillRect(0,y,canvas.width,1);}
  ctx.fillStyle='#173d33';ctx.beginPath();ctx.roundRect(catcher.x,catcher.y,catcher.w,catcher.h,9);ctx.fill();
  items.forEach(item=>{ctx.fillStyle=item.color;ctx.beginPath();ctx.roundRect(item.x,item.y,item.s,item.s*.78,7);ctx.fill();ctx.fillStyle='rgba(255,255,255,.7)';ctx.fillRect(item.x+7,item.y+8,item.s-14,3);ctx.fillRect(item.x+7,item.y+15,item.s-20,3);});
}

function finish(){running=false;cancelAnimationFrame(raf);startButton.textContent='再来一局';if(score>best){best=score;localStorage.setItem('fw-game-catch-best',String(best));bestNode.textContent=best;}draw();}
function loop(now){
  if(!running)return;const dt=Math.min(32,now-last||16);last=now;spawn+=dt;second+=dt;
  if(spawn>520){spawn=0;const s=24+Math.random()*17;items.push({x:Math.random()*(canvas.width-s),y:-40,s,v:2.5+Math.random()*2,color:Math.random()>.35?'#ff8994':'#d8b179'});}
  items.forEach(item=>item.y+=item.v*dt/16);
  items=items.filter(item=>{if(item.y+item.s*.78>=catcher.y&&item.y<catcher.y+catcher.h&&item.x+item.s>catcher.x&&item.x<catcher.x+catcher.w){score++;scoreNode.textContent=score;return false;}return item.y<canvas.height+50;});
  if(second>=1000){const elapsed=Math.floor(second/1000);second-=elapsed*1000;left=Math.max(0,left-elapsed);timeNode.textContent=left;if(!left){finish();return;}}
  draw();raf=requestAnimationFrame(loop);
}
function start(){cancelAnimationFrame(raf);items=[];score=0;left=45;last=spawn=second=0;running=true;scoreNode.textContent=0;timeNode.textContent=45;startButton.textContent='重新开始';draw();raf=requestAnimationFrame(loop);}
startButton.addEventListener('click',start);draw();
