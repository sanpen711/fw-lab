// Record foreground use only. Token refresh and idle timers never count as activity.
export function createUserActivityTracker({record,document:doc=globalThis.document,window:win=globalThis.window,now=()=>Date.now(),intervalMs=60000,retryMs=15000}){
  let userId=null,generation=0,inFlight=false,lastSuccess=-Infinity,lastAttempt=-Infinity;
  const interactions=['pointerdown','keydown','wheel','touchstart'];
  const foreground=()=>Boolean(doc&&!doc.hidden&&(!doc.hasFocus||doc.hasFocus()));

  async function recordActivity(){
    const time=now();
    if(!userId||!foreground()||inFlight||time-lastSuccess<intervalMs||time-lastAttempt<retryMs)return;
    const current=generation;
    inFlight=true;lastAttempt=time;
    try{
      const result=await record();
      if(result?.error)throw result.error;
      if(current===generation)lastSuccess=time;
    }catch{/* Activity reporting must never block login or normal use. */}
    finally{if(current===generation)inFlight=false;}
  }

  function onInteraction(event){if(event.isTrusted)void recordActivity();}
  function onForeground(event){if(event.isTrusted)void recordActivity();}
  function listen(add){
    const method=add?'addEventListener':'removeEventListener';
    interactions.forEach(type=>doc?.[method](type,onInteraction,{capture:true,passive:true}));
    doc?.[method]('visibilitychange',onForeground);
    win?.[method]('focus',onForeground);
  }

  function setUser(value){
    const next=value||null;
    if(next===userId)return;
    if(userId)listen(false);
    userId=next;generation++;inFlight=false;lastSuccess=-Infinity;lastAttempt=-Infinity;
    if(userId){listen(true);void recordActivity();}
  }

  return {setUser,stop:()=>setUser(null)};
}
