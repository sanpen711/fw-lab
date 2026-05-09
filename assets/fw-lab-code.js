// F.w 研究所：实验品编号注册增强模块（最终规则版）
// 功能：注册时增加“实验品编号”；实验品编号唯一且注册后不能修改；昵称唯一且每年最多改 5 次；头像换新后自动删除旧头像。
// 依赖：assets/app.js 已加载 Supabase bridge，window.fwDb 可用。
(function(){
  if(window.__FW_LAB_CODE_MODULE_LOADED__) return;
  window.__FW_LAB_CODE_MODULE_LOADED__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function toast(msg){
    let t=document.querySelector('.fw-toast');
    if(!t){t=document.createElement('div');t.className='fw-toast';document.body.appendChild(t)}
    t.textContent=msg;
    t.classList.add('show');
    clearTimeout(window.__fwLabCodeToast);
    window.__fwLabCodeToast=setTimeout(()=>t.classList.remove('show'),3200);
  }

  function normalizeCode(value){
    return String(value||'').trim().replace(/\s+/g,'').toUpperCase();
  }
  function validCode(value){
    return /^[A-Z0-9]{7}$/.test(normalizeCode(value));
  }
  function normalizeNickname(value){
    return String(value||'').trim();
  }
  function validNickname(value){
    const n=normalizeNickname(value);
    return n.length>=2 && n.length<=12;
  }
  function waitForDb(){
    return new Promise(resolve=>{
      if(window.fwDb?.enabled) return resolve(true);
      let count=0;
      const timer=setInterval(()=>{
        count++;
        if(window.fwDb?.enabled){clearInterval(timer);resolve(true)}
        if(count>120){clearInterval(timer);resolve(false)}
      },100);
    });
  }
  function safeText(value){
    return String(value||'').replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function hintAfter(input,msg,type){
    if(!input) return;
    let h=input.parentElement?.querySelector('.fw-lab-hint[data-for="'+input.name+'"]');
    if(!h){
      h=document.createElement('p');
      h.className='fw-lab-hint';
      h.dataset.for=input.name;
      input.insertAdjacentElement('afterend',h);
    }
    h.textContent=msg||'';
    h.classList.toggle('ok',type==='ok');
    h.classList.toggle('bad',type==='bad');
  }

  function injectRegisterFields(){
    const form=$('[data-reg3]');
    if(!form || form.querySelector('input[name="lab_code"]')) return;
    const nick=form.querySelector('input[name="nickname"]');
    if(!nick) return;

    const label=document.createElement('label');
    label.textContent='实验品编号';

    const input=document.createElement('input');
    input.name='lab_code';
    input.maxLength=7;
    input.placeholder='7 位字母或数字，例如 FW2026A';
    input.autocomplete='off';

    const tip=document.createElement('p');
    tip.className='form-tip fw-lab-code-tip';
    tip.textContent='实验品编号用于搜索加搭子，全站唯一，注册后不能修改。';

    const nickLabel=nick.previousElementSibling;
    form.insertBefore(label,nickLabel || nick);
    form.insertBefore(input,nickLabel || nick);
    form.insertBefore(tip,nickLabel || nick);
  }

  function injectProfileFields(){
    const form=$('[data-profile]');
    if(!form || form.querySelector('input[name="lab_code"]')) return;
    const nick=form.querySelector('input[name="nickname"]');
    if(!nick) return;

    const label=document.createElement('label');
    label.textContent='实验品编号';

    const input=document.createElement('input');
    input.name='lab_code';
    input.maxLength=7;
    input.placeholder='7 位字母或数字';
    input.autocomplete='off';

    const tip=document.createElement('p');
    tip.className='form-tip fw-lab-code-tip';
    tip.dataset.labCodeProfileTip='1';

    const nickTip=document.createElement('p');
    nickTip.className='form-tip fw-nickname-change-tip';
    nickTip.dataset.nicknameChangeTip='1';

    const nickLabel=nick.previousElementSibling;
    form.insertBefore(label,nickLabel || nick);
    form.insertBefore(input,nickLabel || nick);
    form.insertBefore(tip,nickLabel || nick);
    nick.insertAdjacentElement('afterend',nickTip);

    fillProfileCode();
  }

  async function getMe(){
    if(!window.fwDb?.enabled) return null;
    return await window.fwDb.getCurrentUser().catch(()=>null);
  }

  async function fillProfileCode(){
    const form=$('[data-profile]');
    if(!form) return;
    const input=form.querySelector('input[name="lab_code"]');
    const tip=form.querySelector('[data-lab-code-profile-tip]');
    const nickTip=form.querySelector('[data-nickname-change-tip]');
    if(!input && !nickTip) return;

    const me=await getMe();
    if(!me) return;

    if(input){
      input.value=me.lab_code||'';
      if(me.lab_code){
        input.disabled=true;
        input.title='实验品编号注册后不能修改';
        if(tip) tip.textContent='实验品编号是唯一编号，注册后不能修改。';
      }else{
        input.disabled=false;
        if(tip) tip.textContent='旧账号还没有实验品编号，请设置 7 位字母或数字。设置后不能修改。';
      }
    }

    if(nickTip){
      const year=new Date().getFullYear();
      const y=Number(me.nickname_change_year||year);
      const c=(y===year)?Number(me.nickname_change_count||0):0;
      nickTip.textContent='昵称全站唯一，每年最多修改 5 次。本年度已修改 '+c+'/5 次。';
    }
  }

  async function checkAvailable(){
    if(!window.fwDb?.enabled) return;
    const visibleReg = $('[data-view="register3"].show, [data-reg3]');
    const codeInput = $('[data-reg3] input[name="lab_code"], [data-profile] input[name="lab_code"]');
    const nickInput = $('[data-reg3] input[name="nickname"], [data-profile] input[name="nickname"]');

    const code=codeInput?normalizeCode(codeInput.value):'';
    const nick=nickInput?normalizeNickname(nickInput.value):'';

    if(codeInput && !codeInput.disabled && code){
      if(!validCode(code)){
        hintAfter(codeInput,'实验品编号必须是 7 位字母或数字。','bad');
      }else{
        const {data}=await window.fwDb.client.rpc('fw_check_profile_identity',{check_lab_code:code,check_nickname:null}).catch(()=>({data:null}));
        if(data?.lab_code_taken) hintAfter(codeInput,'该编号已被注册。','bad');
        else hintAfter(codeInput,'这个实验品编号可以使用。','ok');
      }
    }

    if(nickInput && nick){
      if(!validNickname(nick)){
        hintAfter(nickInput,'昵称需要 2-12 个字符。','bad');
      }else{
        const {data}=await window.fwDb.client.rpc('fw_check_profile_identity',{check_lab_code:null,check_nickname:nick}).catch(()=>({data:null}));
        if(data?.nickname_taken) hintAfter(nickInput,'这个昵称已经被占用。','bad');
        else hintAfter(nickInput,'这个昵称可以使用。','ok');
      }
    }
  }

  function avatarPathFromUrl(url){
    const raw=String(url||'');
    if(!raw) return '';
    const marker='/storage/v1/object/public/avatars/';
    const idx=raw.indexOf(marker);
    if(idx<0) return '';
    return decodeURIComponent(raw.slice(idx+marker.length).split('?')[0]);
  }

  async function deleteOldAvatar(oldUrl,newUrl){
    if(!window.fwDb?.client) return;
    if(!oldUrl || oldUrl===newUrl) return;
    const path=avatarPathFromUrl(oldUrl);
    if(!path) return;
    try{
      await window.fwDb.client.storage.from('avatars').remove([path]);
    }catch(e){
      // 删除旧头像失败不影响新头像使用；通常是 storage delete policy 没开。
      console.warn('old avatar remove failed', e);
    }
  }

  function formatDbError(msg){
    const text=String(msg||'');
    if(text.includes('profiles_lab_code_key_unique')) return '该编号已被注册。';
    if(text.includes('profiles_nickname_key_unique')) return '这个昵称已经被占用。';
    if(text.includes('实验品编号')) return text;
    if(text.includes('昵称')) return text;
    return text || '资料保存失败。';
  }

  function patchFwDb(){
    if(!window.fwDb?.enabled || window.fwDb.__labCodeFinalPatched) return;
    const db=window.fwDb;
    db.__labCodeFinalPatched=true;

    const oldGet=db.getCurrentUser.bind(db);
    db.getCurrentUser=async function(){
      const user=await oldGet();
      if(!user) return user;
      try{
        const {data}=await db.client
          .from('profiles')
          .select('lab_code,nickname_key,email_search,nickname_change_year,nickname_change_count')
          .eq('id',user.id)
          .maybeSingle();
        if(data) Object.assign(user,data);
      }catch(e){}
      return user;
    };

    const oldUpdate=db.updateProfile.bind(db);
    db.updateProfile=async function(payload={}){
      const regVisible=$('[data-view="register3"].show [data-reg3], [data-reg3]');
      const profileForm=$('[data-profile]');
      const labInput = (regVisible && $('[data-reg3] input[name="lab_code"]')) || (profileForm && $('[data-profile] input[name="lab_code"]'));
      const nickInput = (regVisible && $('[data-reg3] input[name="nickname"]')) || (profileForm && $('[data-profile] input[name="nickname"]'));

      let labCode = payload.labCode ?? payload.lab_code;
      if((labCode===undefined || labCode===null || labCode==='') && labInput && !labInput.disabled){
        labCode=labInput.value;
      }
      if(payload.nickname===undefined && nickInput){
        payload.nickname=nickInput.value;
      }

      const isRegister = !!($('[data-view="register3"].show') || (regVisible && !profileForm?.closest('[data-view="profile"].show')));

      if(labCode!==undefined && labCode!==null && String(labCode).trim()!==''){
        labCode=normalizeCode(labCode);
        if(!validCode(labCode)) throw new Error('实验品编号必须是 7 位字母或数字。');
      }else if(isRegister){
        throw new Error('请填写 7 位实验品编号。');
      }

      if(payload.nickname!==undefined && String(payload.nickname||'').trim()!==''){
        payload.nickname=normalizeNickname(payload.nickname);
        if(!validNickname(payload.nickname)) throw new Error('昵称需要 2-12 个字符。');
      }else if(isRegister){
        throw new Error('请填写 2-12 个字符的昵称。');
      }

      const userBefore=await db.getCurrentUser().catch(()=>null);
      let oldProfile=null;
      if(userBefore?.id){
        try{
          const {data}=await db.client
            .from('profiles')
            .select('avatar_url,lab_code')
            .eq('id',userBefore.id)
            .maybeSingle();
          oldProfile=data||null;
        }catch(e){}
      }

      try{
        const result=await oldUpdate(payload);
        const user=await db.getCurrentUser().catch(()=>null);
        let finalResult=result;

        if(user){
          const patch={updated_at:new Date().toISOString()};
          if(labCode && !oldProfile?.lab_code) patch.lab_code=labCode;
          if(user.email) patch.email_search=String(user.email).trim().toLowerCase();

          if(Object.keys(patch).length>1){
            const r=await db.client
              .from('profiles')
              .update(patch)
              .eq('id',user.id)
              .select('id,nickname,avatar_url,role,is_banned,lab_code,nickname_change_year,nickname_change_count')
              .maybeSingle();
            if(r.error) throw new Error(formatDbError(r.error.message));
            finalResult=r.data||finalResult;
          }

          // 新头像上传成功后，自动删除旧头像。
          if(payload.avatarFile || payload.avatar_file){
            const latest=await db.client.from('profiles').select('avatar_url').eq('id',user.id).maybeSingle();
            const newUrl=latest?.data?.avatar_url || finalResult?.avatar_url || '';
            await deleteOldAvatar(oldProfile?.avatar_url,newUrl);
          }
        }

        setTimeout(fillProfileCode,200);
        return finalResult;
      }catch(e){
        throw new Error(formatDbError(e.message));
      }
    };
  }

  function install(){
    injectRegisterFields();
    injectProfileFields();
    injectRegisterDisclaimer();
    patchFwDb();
  }

  document.addEventListener('input',function(e){
    const input=e.target.closest('input[name="lab_code"], input[name="nickname"]');
    if(!input) return;
    if(input.name==='lab_code') input.value=normalizeCode(input.value).slice(0,7);
    clearTimeout(window.__fwLabCheckTimer);
    window.__fwLabCheckTimer=setTimeout(checkAvailable,420);
  },true);

  document.addEventListener('click',function(e){
    if(e.target.closest('[data-fw-open], [data-login-cta], [data-sb-open], [data-go]')){
      setTimeout(()=>{install();fillProfileCode();},120);
      setTimeout(()=>{install();fillProfileCode();},650);
    }
  },true);

  const mo=new MutationObserver(()=>install());
  mo.observe(document.documentElement,{childList:true,subtree:true});

  async function boot(){
    await waitForDb();
    install();
    setInterval(()=>{install();fillProfileCode();},2200);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();

  /* 注册第一步：F.w 研究所声明确认
     作用：用户必须勾选声明，才能点击“验证邮箱，下一步”。
  */
  function ensureStatementModal(){
    if(document.querySelector('[data-fw-statement-modal]')) return;

    const modal = document.createElement('div');
    modal.className = 'fw-statement-modal';
    modal.dataset.fwStatementModal = '1';
    modal.innerHTML = `
      <div class="fw-statement-panel" role="dialog" aria-modal="true" aria-label="F.w研究所声明">
        <header class="fw-statement-head">
          <div>
            <small>FW LAB STATEMENT</small>
            <h2>F.w研究所声明</h2>
          </div>
          <button type="button" class="fw-statement-close" data-fw-statement-close>×</button>
        </header>
        <div class="fw-statement-body">
          <section>
            <h3>一、平台定位</h3>
            <p>F.w 研究所是一个供用户低功耗交流、发牢骚、摸鱼、放置情绪和进行轻量社交的社区空间。这里不是心理咨询、医疗服务、法律咨询、职业顾问或紧急求助平台。</p>
          </section>
          <section>
            <h3>二、内容责任</h3>
            <p>你需要对自己发布的内容负责。请不要发布违法违规、攻击辱骂、骚扰威胁、歧视仇恨、色情低俗、暴力血腥、诈骗引流、广告营销、侵犯他人权益或诱导他人危险行为的内容。</p>
          </section>
          <section>
            <h3>三、隐私保护</h3>
            <p>请不要在帖子、评论、房间消息或私聊里公开真实姓名、电话、住址、身份证件、公司全称、工号、客户信息、聊天截图等敏感信息。你发布在公共区域的内容可能被其他用户看到、引用、互动或进入榜单统计。</p>
          </section>
          <section>
            <h3>四、账号与实验品编号</h3>
            <p>实验品编号用于识别和搜索用户，全站唯一，注册后不可修改。昵称全站唯一，每年最多修改 5 次。请勿冒充管理员、官方账号或其他用户。</p>
          </section>
          <section>
            <h3>五、搭子与私聊</h3>
            <p>搭子和私聊功能用于轻量交流。请勿骚扰、刷屏、引流、索要隐私、发送不适内容或绕过平台规则。平台可以根据举报或异常情况限制搭子申请、私聊、发言或账号使用。</p>
          </section>
          <section>
            <h3>六、内容处理</h3>
            <p>如果内容被举报、触发风控或明显不适合展示，平台可以进行隐藏、删除、限制互动、禁言、封禁账号等处理。部分互动数据可能用于“废话档案”等榜单展示。</p>
          </section>
          <section>
            <h3>七、重要提醒</h3>
            <p>如果你正在经历严重焦虑、抑郁、伤害自己或他人的想法，或遇到现实紧急危险，请立即联系身边可信任的人、当地紧急服务或专业机构。F.w 研究所不能替代现实中的专业帮助。</p>
          </section>
          <section>
            <h3>八、确认</h3>
            <p>勾选注册页面的确认框，即表示你已阅读并理解本声明，并愿意遵守 F.w 研究所的基本规则。</p>
          </section>
        </div>
        <footer class="fw-statement-foot">
          <button type="button" data-fw-statement-close>我知道了</button>
        </footer>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function openStatementModal(){
    ensureStatementModal();
    document.querySelector('[data-fw-statement-modal]')?.classList.add('show');
  }

  function closeStatementModal(){
    document.querySelector('[data-fw-statement-modal]')?.classList.remove('show');
  }

  function injectRegisterDisclaimer(){
    const form = document.querySelector('[data-reg1]');
    if(!form) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    if(!submitBtn) return;

    const existing = form.querySelector('[data-fw-disclaimer]');
    // 如果已经是新版声明，不要重复插入，也不要重置用户已勾选状态。
    if(existing && existing.querySelector('[data-fw-statement-open]') && existing.querySelector('[data-fw-disclaimer-check]')){
      return;
    }

    // 只清掉旧版残留的免责声明。
    if(existing) existing.remove();

    const box = document.createElement('div');
    box.className = 'fw-disclaimer';
    box.dataset.fwDisclaimer = '1';
    box.innerHTML = `
      <label class="fw-disclaimer-line">
        <input type="checkbox" data-fw-disclaimer-check>
        <span class="fw-disclaimer-text">我已阅读并同意 <button type="button" data-fw-statement-open>《F.w研究所声明》</button></span>
      </label>
      <p>注册前请先阅读声明。勾选后，才能继续验证邮箱并创建账号。</p>
    `;

    form.insertBefore(box, submitBtn);
    submitBtn.disabled = true;
    submitBtn.classList.add('fw-btn-disabled');

    const check = box.querySelector('[data-fw-disclaimer-check]');
    check.addEventListener('change', function(){
      submitBtn.disabled = !check.checked;
      submitBtn.classList.toggle('fw-btn-disabled', !check.checked);
    });
  }

  function disclaimerChecked(){
    const form = document.querySelector('[data-reg1]');
    if(!form) return true;
    const visibleView = form.closest('[data-view]');
    if(visibleView && !visibleView.classList.contains('show')) return true;
    const check = form.querySelector('[data-fw-disclaimer-check]');
    return !!check?.checked;
  }

  window.addEventListener('submit', function(e){
    const form = e.target.closest && e.target.closest('[data-reg1]');
    if(!form) return;
    const visibleView = form.closest('[data-view]');
    if(visibleView && !visibleView.classList.contains('show')) return;
    if(!disclaimerChecked()){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      toast('请先阅读并勾选 F.w研究所声明。');
      form.querySelector('[data-fw-disclaimer-check]')?.focus();
    }
  }, true);

  document.addEventListener('click', function(e){
    if(e.target.closest('[data-fw-statement-open]')){
      e.preventDefault();
      e.stopPropagation();
      openStatementModal();
      return;
    }

    if(e.target.closest('[data-fw-statement-close]') || e.target.matches('[data-fw-statement-modal]')){
      e.preventDefault();
      closeStatementModal();
      return;
    }

    if(e.target.closest('[data-go="register1"], [data-login-cta], [data-fw-open], [data-sb-open]')){
      setTimeout(injectRegisterDisclaimer, 120);
      setTimeout(injectRegisterDisclaimer, 650);
    }
  }, true);


  /* F.w 研究所：退出修复 + 未完成注册默认放弃
     说明：
     1. 修复个人资料卡里的“退出”按钮偶发点不动的问题。
     2. 如果用户已经通过邮箱验证，但没有完成第三步资料设置，关闭注册流程后默认放弃本次注册状态。
     3. 前端不能删除 Supabase Auth 后台用户，这里会退出当前临时登录状态；用户可重新走注册流程完成资料。
  */
  function visibleAuthViewName(){
    const modal=document.querySelector('[data-sb-auth]');
    if(!modal || !modal.classList.contains('show')) return '';
    const view=modal.querySelector('[data-view].show');
    return view?.dataset?.view || '';
  }

  function isRegisterMidway(){
    const view=visibleAuthViewName();
    return view==='register2' || view==='register3';
  }

  async function getCurrentProfileDirect(){
    if(!window.fwDb?.client) return null;
    const sessionRes=await window.fwDb.client.auth.getSession().catch(()=>null);
    const user=sessionRes?.data?.session?.user;
    if(!user?.id) return null;
    const res=await window.fwDb.client
      .from('profiles')
      .select('id,nickname,lab_code')
      .eq('id',user.id)
      .maybeSingle()
      .catch(()=>null);
    return res?.data ? {auth:user, profile:res.data} : {auth:user, profile:null};
  }

  async function isIncompleteRegistrationAccount(){
    const info=await getCurrentProfileDirect();
    if(!info?.auth) return false;
    const p=info.profile || {};
    return !p.lab_code && (!p.nickname || p.nickname === '临时研究员');
  }

  async function signOutAndRefresh(message){
    if(window.__fwSigningOutNow) return;
    window.__fwSigningOutNow=true;
    try{
      if(window.fwDb?.enabled){
        await window.fwDb.signOut();
      }
      toast(message || '已退出。');
    }catch(e){
      toast('退出时遇到问题，请刷新页面。');
    }finally{
      setTimeout(function(){ window.location.reload(); }, 450);
    }
  }

  async function abandonIncompleteRegistration(message){
    const incomplete=await isIncompleteRegistrationAccount().catch(()=>false);
    if(!incomplete) return;
    await signOutAndRefresh(message || '本次注册未完成，已默认放弃。');
  }

  document.addEventListener('pointerdown', function(e){
    const logoutBtn=e.target.closest && e.target.closest('[data-sb-logout]');
    if(logoutBtn){
      e.preventDefault();
      e.stopPropagation();
      signOutAndRefresh('已退出。');
      return;
    }

    const closeRegister=e.target.closest && (
      e.target.closest('[data-sb-close]') ||
      e.target.closest('[data-go="login"]') ||
      e.target.matches('[data-sb-auth]')
    );

    if(closeRegister && isRegisterMidway()){
      abandonIncompleteRegistration('本次注册未完成，已默认放弃。');
    }
  }, true);

  let __fwIncompleteCheckBusy=false;
  async function guardIncompleteRegistration(){
    if(__fwIncompleteCheckBusy) return;
    __fwIncompleteCheckBusy=true;
    try{
      const modal=document.querySelector('[data-sb-auth]');
      const view=visibleAuthViewName();
      const modalShowing=modal?.classList.contains('show');
      if(modalShowing && (view==='register1' || view==='register2' || view==='register3')) return;

      const incomplete=await isIncompleteRegistrationAccount().catch(()=>false);
      if(incomplete){
        await signOutAndRefresh('上次注册未完成，已默认放弃，请重新注册。');
      }
    }finally{
      __fwIncompleteCheckBusy=false;
    }
  }

  setInterval(guardIncompleteRegistration, 5000);
  setTimeout(guardIncompleteRegistration, 1800);

})();
