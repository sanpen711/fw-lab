// Browser-only adaptations. The Windows sources remain the shared implementation.
// Exact replacements fail the build when an upstream contract changes.
import assert from 'node:assert/strict';

function once(source, before, after, label){
  assert.equal(source.split(before).length-1,1,`Web adaptation no longer matches: ${label}`);
  return source.replace(before,after);
}
export function adaptModule(name,source){
  const change=(before,after)=>{source=once(source,before,after,name);};
  if(name==='config.js'){
    change("export const ACCOUNT_CACHE_KEY = 'fw:desktop:v11:account';","export const ACCOUNT_CACHE_KEY = 'fw:web:account';");
  }
  if(name==='auth-store.js'){
    change("detectSessionInUrl:false, storageKey:'fw-lab-auth-token'","detectSessionInUrl:true, storageKey:'sb-ekbovsmxbiplhyrzxoyw-auth-token'");
    change("platform:'windows'","platform:'web'");
  }
  if(name==='alignment-nav-fix.js'){
    change("import './square-scroll-fix.js';",'// Browser document scrolling is managed by web.css.');
  }
  if(name==='desktop-persistent-cache.js'){
    change("if(typeof invoke!=='function')return{enabled:false,entries:0,bytes:0,path:'',fallback:true};","if(typeof invoke!=='function')return{enabled:true,entries:memory.size,bytes:[...memory.values()].reduce((total,value)=>total+new TextEncoder().encode(JSON.stringify(value)).byteLength,0),path:'',fallback:true};");
  }
  if(name==='app.js'){
    const start=source.indexOf('function renderAuthGate(next){'),end=source.indexOf('function renderAccount(next){',start);
    assert(start>=0&&end>start);
    source=source.slice(0,start)+`let webSignedIn=false;
function renderAuthGate(next){
  const app=$('#app'),modal=$('[data-account-modal]'),signed=Boolean(authenticatedUser(next));
  authGateLocked=false;document.body.classList.remove('auth-required');app.hidden=false;app.inert=false;app.setAttribute('aria-hidden','false');
  modal.dataset.authLocked='false';modal.classList.remove('auth-gate-modal','auth-gate-checking');
  $('[data-close-account]').hidden=false;$('[data-auth-checking]').hidden=true;$('[data-auth-content]').hidden=false;
  const message=$('[data-auth-gate-message]');message.hidden=!next.error;message.textContent=next.error||'';
  if(signed&&!webSignedIn){modal.hidden=true;document.body.classList.remove('modal-open');setFormStatus('');}
  webSignedIn=signed;if(next.ready)startProtectedApp();
}
`+source.slice(end);
    change("if(view==='buddy')socialStore.loadBuddy();","if(view==='buddy'&&authenticatedUser())socialStore.loadBuddy();");
    change("if(view==='chatrooms')chatRoomUi.activate()","if(view==='chatrooms'&&authenticatedUser())chatRoomUi.activate()");
    change('feedStore.openPost(pending.id);',"feedStore.openPostById(pending.id).catch(error=>toast(error.message||'帖子读取失败。'));");
    change("if(view==='settings')desktopSettings.activate();","if(view==='settings')desktopSettings.activate();\n  window.dispatchEvent(new CustomEvent('fw:web-view',{detail:{view,mode:squareMode}}));");
    source+=`\nwindow.__FW_WEB_APP__={navigate,openAccount,openPost:id=>feedStore.openPost(id),openView(view){if(view==='shop'){membershipTab='shop';navigate('membership');return;}if(['rules','moderation'].includes(view)){document.querySelector('[data-align-nav="'+view+'"]').click();return;}navigate(view);}};\n`;
  }
  if(name==='home-content.js'){
    change("String(auth.user.id):'';if(id===userId)","String(auth.user.id):'public';if(id===userId)");
  }
  if(name==='membership-shop.js'){
    change("if(!state.userId||state.ordersLoading","if(!authStore.state.user?.id||state.ordersLoading");
    change('function paymentSection(product){',`function paymentSection(product){
  if(!authStore.state.user||authStore.state.user.cached)return '<div class="shop-payment-state"><p>登录后填写收货信息并下单。</p><button type="button" class="primary" data-open-account>登录后下单</button></div>';`);
    change("String(auth.user.id):'';if(id===state.userId)","String(auth.user.id):'public';if(id===state.userId)");
    change('shopPayment.newOrder();shopPayment.loadConfig();','shopPayment.newOrder();if(authStore.state.user?.id)shopPayment.loadConfig();');
  }
  if(name==='membership-store.js'){
    change('if(!user?.id){reset();return snapshot();}',`if(!user?.id){
    reset();const token=generation;
    try{const result=await client.from('membership_plans').select('id,name,duration_months,price_cents,compare_at_price_cents,is_recommended,sort_order').eq('is_active',true).order('sort_order',{ascending:true});
      if(token===generation&&!currentUser()){if(result.error)throw result.error;state.plans=result.data||[];emit();}
    }catch{if(token===generation){state.error='会员套餐暂时无法读取，请刷新重试。';emit();}}
    return snapshot();
  }`);
    change('if(!user){reset();return;}','if(!user){load().catch(()=>{});return;}');
  }
  if(name==='feature-alignment.js'){
    change('function showExtraView(name){',"function showExtraView(name){\n  window.dispatchEvent(new CustomEvent('fw:web-view',{detail:{view:name}}));");
  }
  if(['membership-payment.js','shop-payment.js'].includes(name)){
    change("else if(!window.open(url,'_blank','noopener,noreferrer'))throw new Error('请点击“打开支付宝付款页”；浏览器可能拦截了新窗口。');",`else {
      const popup=window.__FW_WEB_PAYMENT_WINDOW__||window.open('about:blank','_blank');
      if(!popup)throw new Error('浏览器拦截了付款窗口，请允许弹出窗口后点击继续支付。');
      popup.opener=null;popup.location.replace(url);window.__FW_WEB_PAYMENT_WINDOW__=null;
    }`);
  }
  if(name==='game-center.js'){
    const start=source.indexOf('const nesGames='),end=source.indexOf('const games=',start);
    assert(start>=0&&end>start);source=source.slice(0,start)+'const nesGames={};\n'+source.slice(end);
    source=source.replace("import {NES_GAMES} from './nes-games.js';",'');
    change('const target=game.page||`./games/${game.path}/index.html`;','const target=game.page||`/web/games/${game.path}/index.html`;');
  }
  // Root-relative bundled assets must work from both / and legacy *.html URLs.
  source=source.replace(/(["'`(])\/(app-icons|emoji|nav-icons|games)\//g,'$1/web/$2/')
    .replace(/(["'`(])\/(ui-icons\.svg|hero-fufu-office-banner\.webp|mascot-fufu[^"'` )]*\.webp)/g,'$1/web/$2');
  return source;
}

export function adaptHtml(source){
  source=once(source,'<body class="auth-required">','<body class="fw-browser">','body');
  source=once(source,'<div class="modal auth-gate-modal auth-gate-checking" data-account-modal data-auth-locked="true">','<div class="modal" data-account-modal data-auth-locked="false" hidden>','optional sign-in dialog');
  source=once(source,'hidden inert aria-hidden="true"','aria-hidden="false"','guest shell');
  // Keep the shared feature hooks, but give the website its own horizontal shell.
  const sidebarStart=source.indexOf('    <aside class="sidebar"'),sidebarEnd=source.indexOf('    </aside>',sidebarStart);
  assert(sidebarStart>=0&&sidebarEnd>sidebarStart);
  const sidebar=source.slice(sidebarStart,sidebarEnd);
  const nav=sidebar.match(/<nav class="nav-list">[\s\S]*?<\/nav>/)?.[0];
  const account=sidebar.slice(sidebar.indexOf('      <div class="account-menu-wrap">'));
  assert(nav&&account.includes('data-open-account'));
  source=source.slice(0,sidebarStart)+`    <a class="web-skip-link" href="#web-main">跳到主要内容</a>
    <header class="web-header">
      <div class="web-header-inner">
        <div class="web-header-top">
          <button class="brand web-brand" type="button" data-nav="home" aria-label="F.w 研究所首页"><strong>F.W</strong><span>研究所</span></button>
          <span class="web-brand-note">允许低功耗运行的精神休息室</span>
          <div class="web-header-actions">
            <a class="web-download" href="/download/fw-lab-windows-latest.exe" download>下载客户端 ↗</a>
            <button class="primary web-compose" type="button" data-nav="compose">＋ 发牢骚</button>
            ${account}
          </div>
        </div>
        ${nav.replace('<nav class="nav-list">','<nav class="nav-list web-nav" aria-label="网站主导航">')}
      </div>
    </header>`+source.slice(sidebarEnd+'    </aside>'.length);
  source=once(source,'<main class="main-content">',`<main class="main-content" id="web-main" tabindex="-1">
      <header class="web-page-intro" data-web-page-intro hidden><p>F.w 研究所 <span>/</span> <span data-web-page-crumb></span></p><h1 data-web-page-title></h1><div data-web-page-description></div></header>`,'website main');
  source=once(source,'    </main>','    </main>\n    <footer class="web-site-footer"><div><strong>F.w 研究所</strong><span>允许低功耗运行</span></div><nav aria-label="网站信息"><a href="/privacy.html" target="_blank" rel="noopener">隐私政策</a><a href="/download/fw-lab-windows-latest.exe" download>客户端下载</a></nav><a class="web-filing" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">黑ICP备2026012853号-1</a></footer>','website footer');
  const start=source.indexOf('            <section class="settings-card">\n              <header><div><h2>应用显示'),end=source.indexOf('            <section class="settings-card settings-cache-card">',start);
  assert(start>=0&&end>start);source=source.slice(0,start)+source.slice(end);
  source=source.replace('管理当前账号和这台电脑上的客户端显示。','管理个人资料和当前浏览器。')
    .replace('清理帖子、图片等本机临时缓存，不会删除账号、登录状态、表情、游戏文件或应用显示设置。','清理网页临时缓存，保留登录状态、个人资料和已上传的表情。')
    .replace('软件说明','网站说明').replace('data-check-updates>检查更新','data-web-reload>刷新网页')
    .replace(/<p class="phase-note">[^<]*<\/p>/,'');
  source=source.replace(/<button[^>]+data-game-open="contra"[^>]*>[\s\S]*?<\/button>/,'');
  source=source.replace(/<script type="module" src="\/src\/(app|alignment-nav-fix|feature-alignment|game-center)\.js"><\/script>\s*/g,'');
  source=source.replace('</head>',`<meta name="description" content="F.w 研究所：允许低功耗运行的精神休息室。"><link rel="icon" href="/assets/icons/icon-192.png"><link rel="stylesheet" href="/web.css"></head>`)
    .replace('</body>','<script type="module" src="/src/web-entry.js"></script></body>');
  // Browser sessions on phones continue to use the existing independent PWA.
  source=source.replace('<head>',`<head><script>(function(){if(new URLSearchParams(location.search).get('desktop')==='1')return;if(/Android|iPhone|iPod|Mobile|Windows Phone/i.test(navigator.userAgent)){location.replace('/app/index.html'+location.search+location.hash);}})();</script>`);
  return source;
}
