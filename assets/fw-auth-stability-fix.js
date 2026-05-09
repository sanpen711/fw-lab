// F.w 研究所：注册 / 退出稳定补丁
// 作用：修复注册第二步“保存中...”卡住、退出按钮卡住、未完成注册默认放弃。
(function(){
  if(window.__FW_AUTH_STABILITY_FIX__) return;
  window.__FW_AUTH_STABILITY_FIX__ = true;

  function $(s){ return document.querySelector(s); }
  function $$(s){ return Array.from(document.querySelectorAll(s)); }

  function toast(msg){
    let t=document.querySelector('.fw-toast');
    if(!t){
      t=document.createElement('div');
      t.className='fw-toast';
      document.body.appendChild(t);
    }
    t.textContent=msg;
    t.classList.add('show');
    clearTimeout(window.__fwAuthStableToast);
    window.__fwAuthStableToast=setTimeout(function(){ t.classList.remove('show'); },3200);
  }

  function sleep(ms){ return new Promise(function(resolve){ setTimeout(resolve,ms); }); }

  function withTimeout(promise, ms, message){
    return Promise.race([
      promise,
      new Promise(function(_, reject){
        setTimeout(function(){ reject(new Error(message || '操作超时，请稍后重试。')); }, ms || 15000);
      })
    ]);
  }

  function waitForDb(){
    return new Promise(function(resolve){
      if(window.fwDb?.enabled) return resolve(true);
      let count=0;
      const timer=setInterval(function(){
        count++;
        if(window.fwDb?.enabled){
          clearInterval(timer);
          resolve(true);
        }
        if(count>120){
          clearInterval(timer);
          resolve(false);
        }
      },100);
    });
  }

  function normalizeCode(value){
    return String(value||'').trim().replace(/\s+/g,'').toUpperCase();
  }

  function validCode(value){
    return /^[A-Z0-9]{7}$/.test(normalizeCode(value));
  }

  function validNickname(value){
    const n=String(value||'').trim();
    return n.length>=2 && n.length<=12;
  }

  function visibleAuthView(){
    const modal=$('[data-sb-auth]');
    if(!modal || !modal.classList.contains('show')) return '';
    const view=modal.querySelector('[data-view].show');
    return view?.dataset?.view || '';
  }

  function isRegisterMidway(){
    const view=visibleAuthView();
    return view==='register2' || view==='register3';
  }

  function setAuthCopy(viewName){
    const map={
      login:['账号登录','输入邮箱和密码，进入研究所。'],
      register1:['注册账号','第一步：先验证邮箱。'],
      register2:['注册账号','第二步：设置以后登录用的密码。'],
      register3:['注册账号','第三步：设置昵称、实验品编号和头像。'],
      profile:['个人资料','修改昵称、头像或密码。']
    };
    const pair=map[viewName]||map.login;
    const title=$('[data-title]');
    const desc=$('[data-desc]');
    if(title) title.textContent=pair[0];
    if(desc) desc.textContent=pair[1];

    const progress=$('[data-progress]');
    if(progress){
      progress.style.display=/register/.test(viewName)?'grid':'none';
      if(/register/.test(viewName)){
        const idx={register1:0,register2:1,register3:2}[viewName]||0;
        Array.from(progress.children).forEach(function(x,i){
          x.classList.toggle('on', i<=idx);
        });
      }
    }
  }

  function showAuthView(viewName){
    const modal=$('[data-sb-auth]');
    if(!modal) return;
    modal.classList.add('show');
    modal.querySelectorAll('[data-view]').forEach(function(view){
      view.classList.toggle('show', view.dataset.view===viewName);
    });
    setAuthCopy(viewName);

    setTimeout(function(){
      modal.querySelector('[data-view="'+viewName+'"] input')?.focus();
      if(typeof window.__fwReinstallLabCode === 'function'){
        window.__fwReinstallLabCode();
      }
    },80);
  }

  function setLoading(btn, loading, text){
    if(!btn) return;
    if(loading){
      if(!btn.dataset.oldText) btn.dataset.oldText=btn.textContent;
      btn.textContent=text || '保存中...';
      btn.disabled=true;
      btn.classList.add('fw-btn-loading');
    }else{
      btn.textContent=btn.dataset.oldText || '保存资料';
      btn.disabled=false;
      btn.classList.remove('fw-btn-loading');
    }
  }

  function clearSupabaseLocalSession(){
    try{
      [localStorage, sessionStorage].forEach(function(store){
        Object.keys(store).forEach(function(k){
          if(/^sb-/.test(k) || k.includes('supabase') || k.includes('auth-token')){
            store.removeItem(k);
          }
        });
      });
    }catch(e){}
  }

  async function signOutFast(message){
    if(window.__FW_SIGNING_OUT_FAST__) return;
    window.__FW_SIGNING_OUT_FAST__=true;

    toast(message || '已退出。');

    try{
      const signOutPromise = window.fwDb?.signOut ? window.fwDb.signOut() : window.fwDb?.client?.auth?.signOut?.();
      if(signOutPromise) await withTimeout(signOutPromise, 3500, '退出超时');
    }catch(e){
      // 即使 Supabase signOut 超时，也清本地会话并刷新。
    }

    clearSupabaseLocalSession();
    setTimeout(function(){ window.location.reload(); },450);
  }

  async function currentProfileDirect(){
    if(!window.fwDb?.client) return null;
    const sessionRes=await window.fwDb.client.auth.getSession().catch(function(){ return null; });
    const user=sessionRes?.data?.session?.user;
    if(!user?.id) return null;

    const res=await window.fwDb.client
      .from('profiles')
      .select('id,nickname,lab_code')
      .eq('id',user.id)
      .maybeSingle()
      .catch(function(){ return null; });

    return {auth:user, profile:res?.data || null};
  }

  async function isIncompleteRegistration(){
    const info=await currentProfileDirect();
    if(!info?.auth) return false;
    const p=info.profile || {};
    return !p.lab_code && (!p.nickname || p.nickname === '临时研究员');
  }

  async function abandonIncompleteRegistration(){
    const incomplete=await isIncompleteRegistration().catch(function(){ return false; });
    if(incomplete){
      signOutFast('本次注册未完成，已默认放弃。');
    }
  }

  async function handleRegisterStep2(form){
    if(window.__FW_REG2_SAVING__) return;
    window.__FW_REG2_SAVING__=true;

    const btn=form.querySelector('button[type="submit"]');
    setLoading(btn,true,'保存中...');

    try{
      const ok=await waitForDb();
      if(!ok) throw new Error('数据库连接还没准备好，请刷新后重试。');

      const d=new FormData(form);
      const p=String(d.get('password')||'').trim();
      const p2=String(d.get('password2')||'').trim();

      if(p.length<6) throw new Error('密码至少 6 位。');
      if(p!==p2) throw new Error('两次密码不一致。');

      const me=await withTimeout(window.fwDb.getCurrentUser(), 10000, '登录状态同步超时，请返回第一步重新验证邮箱。');
      if(!me) throw new Error('登录状态未同步，请返回第一步重新验证邮箱。');

      await withTimeout(window.fwDb.updatePassword({password:p}), 16000, '密码保存超时，请检查网络后重试。');

      window.__FW_REGISTER_STEP2_DONE__=true;
      showAuthView('register3');
      toast('密码已保存，请完善资料。');
    }catch(e){
      toast(e.message || '密码保存失败。');
    }finally{
      setLoading(btn,false);
      window.__FW_REG2_SAVING__=false;
    }
  }

  async function handleRegisterStep3(form){
    if(window.__FW_REG3_SAVING__) return;
    window.__FW_REG3_SAVING__=true;

    const btn=form.querySelector('button[type="submit"]');
    setLoading(btn,true,'完成中...');

    try{
      const ok=await waitForDb();
      if(!ok) throw new Error('数据库连接还没准备好，请刷新后重试。');

      const me=await withTimeout(window.fwDb.getCurrentUser(), 10000, '登录状态同步超时，请重新验证邮箱。');
      if(!me) throw new Error('登录状态未同步，请重新验证邮箱。');

      const d=new FormData(form);
      const nickname=String(d.get('nickname')||'').trim();
      const labInput=form.querySelector('input[name="lab_code"]');
      const labCode=labInput ? normalizeCode(labInput.value) : '';
      const avatarFile=form.querySelector('[name="avatar"]')?.files?.[0];

      if(!validCode(labCode)) throw new Error('请填写 7 位实验品编号。');
      if(!validNickname(nickname)) throw new Error('请填写 2-12 个字符的昵称。');

      await withTimeout(
        window.fwDb.updateProfile({nickname:nickname, lab_code:labCode, labCode:labCode, avatarFile:avatarFile}),
        18000,
        '资料保存超时，请检查网络后重试。'
      );

      const email=me.email || '';
      await window.fwDb.signOut().catch(function(){});
      clearSupabaseLocalSession();

      toast('注册成功，请登录。');
      const modal=$('[data-sb-auth]');
      if(modal) modal.classList.remove('show');

      setTimeout(function(){
        const m=$('[data-sb-auth]');
        if(!m) return;
        showAuthView('login');
        m.classList.add('show');
        const emailInput=m.querySelector('[data-login] input[name="email"]');
        const passInput=m.querySelector('[data-login] input[name="password"]');
        if(emailInput) emailInput.value=email;
        passInput?.focus();
      },550);
    }catch(e){
      toast(e.message || '注册完成失败。');
    }finally{
      setLoading(btn,false);
      window.__FW_REG3_SAVING__=false;
    }
  }

  // 抢在原 supabase-auth-flow.js 的 document 捕获监听之前处理，避免原逻辑卡住。
  window.addEventListener('submit', function(e){
    const reg2=e.target?.closest?.('[data-reg2]');
    const reg3=e.target?.closest?.('[data-reg3]');
    if(!reg2 && !reg3) return;

    const visible=e.target.closest('[data-view]');
    if(visible && !visible.classList.contains('show')) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if(reg2) handleRegisterStep2(reg2);
    if(reg3) handleRegisterStep3(reg3);
  }, true);

  // 退出按钮兜底：不再无限卡在“退出中...”
  window.addEventListener('pointerdown', function(e){
    const logout=e.target?.closest?.('[data-sb-logout]');
    if(logout){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      signOutFast('已退出。');
      return;
    }

    const closeRegister=e.target?.closest?.('[data-sb-close], [data-go="login"]') || e.target?.matches?.('[data-sb-auth]');
    if(closeRegister && isRegisterMidway()){
      e.preventDefault();
      e.stopPropagation();
      abandonIncompleteRegistration();
    }
  }, true);

  // 如果已经生成了“临时研究员”但没完成资料，离开注册流程后自动退出。
  let guardBusy=false;
  async function guardIncomplete(){
    if(guardBusy) return;
    guardBusy=true;
    try{
      const modal=$('[data-sb-auth]');
      const view=visibleAuthView();
      if(modal?.classList.contains('show') && ['register1','register2','register3'].includes(view)) return;

      const incomplete=await isIncompleteRegistration().catch(function(){ return false; });
      if(incomplete){
        signOutFast('上次注册未完成，已默认放弃，请重新注册。');
      }
    }finally{
      guardBusy=false;
    }
  }

  setTimeout(guardIncomplete, 2200);
  setInterval(guardIncomplete, 6000);
})();
