import {authStore} from './auth-store.js';
import {APP_VERSION} from './config.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>Array.from(document.querySelectorAll(selector));
const routes={
  home:['首页','活动、公告和每天一句话都会放在这里'],
  compose:['发牢骚','把今天想说的话单独放在这里'],
  square:['精神广场','匿名说点真话，也听听别人的今天'],
  rooms:['学术研讨','一本正经地研究不太正经的问题'],
  bird:['观鸟台','看看研究所里此刻发生了什么'],
  echo:['回声','评论、回复和互动都在这里'],
  buddy:['搭子','左边选人，右边直接聊天'],
  archive:['废话档案','翻一翻被留下来的研究记录']
};
let accountState={ready:false,busy:false,user:null};
let currentAuthView='login';

window.__FW_DESKTOP_V11__={version:APP_VERSION,architecture:'local-frontend',contentRequests:0};

function initials(name){return String(name || 'FW').trim().slice(0,2).toUpperCase();}

function setAvatar(element,user){
  if(!element) return;
  element.textContent='';
  element.style.backgroundImage='';
  if(user?.avatarUrl){element.style.backgroundImage=`url("${String(user.avatarUrl).replace(/["\\]/g,'')}")`;element.classList.add('has-image');}
  else {element.textContent=initials(user?.nickname);element.classList.remove('has-image');}
}

function toast(message){
  const node=$('[data-toast]');
  node.textContent=message;node.classList.add('show');
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2800);
}

function setFormStatus(message,error=false){
  const node=$('[data-form-status]');
  node.textContent=message || '';node.classList.toggle('error',error);
}

function renderAccount(state){
  accountState=state;
  const user=state.user;
  $('[data-account-label]').textContent=user ? user.nickname : (state.ready ? '注册 / 登录' : '正在连接…');
  setAvatar($('[data-account-avatar]'),user);
  setAvatar($('[data-profile-avatar]'),user);
  $('[data-profile-name]').textContent=user?.nickname || '研究员';
  $('[data-profile-email]').textContent=user?.email || '';
  const profile=$('[data-auth-view="profile"]');
  if(profile && user){profile.elements.labCode.value=user.labCode || '';profile.elements.nickname.value=user.nickname || '';}
  $$('[data-account-modal] button, [data-account-modal] input').forEach(node=>{
    if(!node.matches('[data-close-account]')) node.disabled=Boolean(state.busy);
  });
}

function showAuth(view){
  currentAuthView=view;
  const labels={login:['账号登录','输入邮箱和密码，进入研究所。'],register:['注册账号','填写信息后，我们会向邮箱发送验证码。'],verify:['验证邮箱','输入邮件中的验证码，完成注册。'],reset:['找回密码','输入邮箱，接收找回密码邮件。'],profile:['个人资料','修改昵称和头像，账号数据继续与网页、手机端共用。']};
  const [title,copy]=labels[view] || labels.login;
  $('[data-account-title]').textContent=title;$('[data-account-copy]').textContent=copy;
  $$('[data-auth-view]').forEach(panel=>panel.hidden=panel.dataset.authView !== view);
  setFormStatus('');
  requestAnimationFrame(()=>{$(`[data-auth-view="${view}"] input:not([disabled])`)?.focus();});
}

function openAccount(){
  const modal=$('[data-account-modal]');
  modal.hidden=false;document.body.classList.add('modal-open');
  showAuth(accountState.user ? 'profile' : 'login');
}

function closeAccount(){
  $('[data-account-modal]').hidden=true;document.body.classList.remove('modal-open');setFormStatus('');
}

function navigate(view){
  const route=routes[view] || routes.home;
  $('#app').dataset.view=view;
  $('[data-page-title]').textContent=route[0];$('[data-page-subtitle]').textContent=route[1];
  $$('[data-nav]').forEach(node=>node.classList.toggle('active',node.dataset.nav===view));
  const home=view==='home';
  $('[data-view-panel="home"]').classList.toggle('active',home);
  $('[data-view-panel="pending"]').classList.toggle('active',!home);
  if(!home){$('[data-pending-title]').textContent=route[0] + '正在迁移';$('[data-pending-copy]').textContent=`${route[0]}会在后续阶段直接接入共用数据库，不再加载网页版对应页面。当前 1.0.5 的原有功能不受影响。`;}
}

function bindNavigation(){
  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-nav]');
    if(nav){navigate(nav.dataset.nav);return;}
    if(event.target.closest('[data-open-account]')) openAccount();
    if(event.target.closest('[data-close-account]')) closeAccount();
    const switcher=event.target.closest('[data-show-auth]');
    if(switcher) showAuth(switcher.dataset.showAuth);
  });
  $('[data-account-modal]').addEventListener('click',event=>{if(event.target.matches('[data-account-modal]')) closeAccount();});
  window.addEventListener('keydown',event=>{if(event.key==='Escape' && !$('[data-account-modal]').hidden) closeAccount();});
}

async function runForm(form,action,success){
  setFormStatus('正在处理…');
  try{const value=await action(new FormData(form));setFormStatus('');await success?.(value);}
  catch(error){setFormStatus(error.message || '操作失败，请稍后重试。',true);}
}

function bindForms(){
  $('[data-auth-view="login"]').addEventListener('submit',event=>{
    event.preventDefault();runForm(event.currentTarget,fd=>authStore.signIn(fd.get('email'),fd.get('password')),()=>{toast('登录成功。');closeAccount();});
  });
  $('[data-auth-view="register"]').addEventListener('submit',event=>{
    event.preventDefault();runForm(event.currentTarget,fd=>authStore.beginRegistration({email:fd.get('email'),password:fd.get('password'),password2:fd.get('password2'),labCode:fd.get('labCode')}),result=>{$('[data-verify-tip]').textContent=`验证码已发送至 ${result.email}。`;showAuth('verify');});
  });
  $('[data-auth-view="verify"]').addEventListener('submit',event=>{
    event.preventDefault();runForm(event.currentTarget,fd=>authStore.finishRegistration(fd.get('token')),()=>{toast('注册成功，请登录。');showAuth('login');});
  });
  $('[data-auth-view="reset"]').addEventListener('submit',event=>{
    event.preventDefault();runForm(event.currentTarget,fd=>authStore.sendPasswordReset(fd.get('email')),()=>{toast('找回密码邮件已发送。');showAuth('login');});
  });
  $('[data-auth-view="profile"]').addEventListener('submit',event=>{
    event.preventDefault();runForm(event.currentTarget,fd=>authStore.updateProfile({nickname:fd.get('nickname'),avatarFile:fd.get('avatar')}),()=>{toast('资料已保存。');closeAccount();});
  });
  $('[data-resend-code]').addEventListener('click',()=>runForm($('[data-auth-view="verify"]'),()=>authStore.resendRegistration(),result=>{toast(`验证码已重新发送至 ${result.email}。`);}));
  $('[data-sign-out]').addEventListener('click',()=>runForm($('[data-auth-view="profile"]'),()=>authStore.signOut(),()=>{toast('已退出登录。');showAuth('login');}));
}

function bindConnection(){
  const render=()=>{const online=navigator.onLine !== false;const node=$('[data-connection-state]');node.textContent=online?'已连接':'网络已断开';node.classList.toggle('offline',!online);};
  window.addEventListener('online',render);window.addEventListener('offline',render);render();
}

bindNavigation();bindForms();bindConnection();
authStore.subscribe(renderAccount);
authStore.boot();
