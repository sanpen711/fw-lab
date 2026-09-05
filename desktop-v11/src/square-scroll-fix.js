// Windows 双栏页面滚动修复：只监听 #app 的 data-view，避免全局 DOM 监听。
const app=document.getElementById('app');

function syncSquareScrollLock(){
  const view=app?.dataset.view;
  const squareActive=view==='square';
  const buddyActive=view==='buddy';
  document.body.classList.toggle('square-scroll-locked',squareActive);
  document.body.classList.toggle('buddy-scroll-locked',buddyActive);
  if((squareActive||buddyActive)&&document.scrollingElement?.scrollTop){document.scrollingElement.scrollTop=0;}
}

if(app){
  const style=document.createElement('style');
  style.id='fw-square-scroll-fix';
  style.textContent=`
    html body .phase-note::after{content:'Windows 1.1.23 本地前端 · 用户资料同步修复版'!important}
    body.square-scroll-locked{height:100vh;overflow:hidden!important}
    body.square-scroll-locked #app{height:100vh;min-height:0;overflow:hidden}
    body.square-scroll-locked .main-content{height:100vh;min-height:0;overflow:hidden}
    body.square-scroll-locked [data-view-panel="square"]{height:calc(100vh - 68px);min-height:0;overflow:hidden}
    body.square-scroll-locked .square-page{height:100%;min-height:0;overflow:hidden}
    body.square-scroll-locked .square-feed-column{height:100%;min-height:0;overflow:hidden}
    body.square-scroll-locked .square-feed{min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
    body.square-scroll-locked .post-detail-column{height:100%;min-height:0;overflow:hidden}
    body.square-scroll-locked .detail-scroll{height:100%;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
    body.buddy-scroll-locked{height:100vh;overflow:hidden!important}
    body.buddy-scroll-locked #app{height:100vh;min-height:0;overflow:hidden}
    body.buddy-scroll-locked .main-content{height:100vh;min-height:0;overflow:hidden}
    body.buddy-scroll-locked [data-view-panel="buddy"]{height:calc(100vh - 68px);min-height:0;overflow:hidden}
    body.buddy-scroll-locked .buddy-page{height:100%;min-height:0;overflow:hidden}
    body.buddy-scroll-locked .buddy-column,
    body.buddy-scroll-locked .chat-column{height:100%;min-height:0;overflow:hidden}
    body.buddy-scroll-locked .buddy-list,
    body.buddy-scroll-locked .chat-messages{min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
  `;
  document.head.appendChild(style);
  new MutationObserver(syncSquareScrollLock).observe(app,{attributes:true,attributeFilter:['data-view']});
  syncSquareScrollLock();
}
