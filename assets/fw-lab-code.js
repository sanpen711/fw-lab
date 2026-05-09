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
})();
