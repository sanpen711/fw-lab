// Follow the current conversation through async media and layout changes until
// the reader scrolls away. A queued frame always uses the latest rendered DOM.
export function createChatScroll(container,onAtBottom=()=>{}){
  let target='',following=false,frame=0,recordedTop=container.scrollTop,content=null;
  const nearBottom=()=>container.scrollHeight-container.clientHeight-container.scrollTop<70;
  const pause=()=>{following=false;if(frame)cancelAnimationFrame(frame);frame=0;};
  const schedule=()=>{
    if(frame||!following||!target)return;
    frame=requestAnimationFrame(()=>{
      frame=0;if(!following||container.dataset.target!==target||!container.clientHeight)return;
      container.scrollTop=container.scrollHeight;recordedTop=container.scrollTop;
      if(nearBottom())onAtBottom();
    });
  };
  const observer=new ResizeObserver(schedule);observer.observe(container);
  container.addEventListener('scroll',()=>{
    const top=container.scrollTop;
    // Height changes can leave the same scrollTop temporarily far from bottom.
    // Only a position change should stop following, not that temporary gap.
    if(Math.abs(top-recordedTop)>1){if(nearBottom())following=Boolean(target);else pause();}
    recordedTop=top;if(nearBottom())onAtBottom();
  },{passive:true});
  container.addEventListener('wheel',event=>{if(event.deltaY<0)pause();},{passive:true});
  container.addEventListener('touchstart',pause,{passive:true});
  container.addEventListener('keydown',event=>{if(['ArrowUp','PageUp','Home'].includes(event.key))pause();});
  container.addEventListener('pointerdown',event=>{
    if(event.clientX>=container.getBoundingClientRect().right-(container.offsetWidth-container.clientWidth))pause();
  },{passive:true});
  return{
    get following(){return following;},
    setTarget(value){const next=String(value||'');if(next===target)return;pause();target=next;following=Boolean(next);},
    follow(){following=Boolean(target);schedule();},
    pause,
    afterRender(){
      recordedTop=container.scrollTop;
      const next=container.querySelector('[data-chat-timeline]');
      if(next!==content){if(content)observer.unobserve(content);content=next;if(content)observer.observe(content);}
      schedule();
    }
  };
}
