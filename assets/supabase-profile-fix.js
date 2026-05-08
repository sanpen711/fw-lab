// F.w 研究所：个人资料保存与头像预览修复
(function(){
  function toast(msg){
    let t=document.querySelector('.fw-toast');
    if(!t){
      t=document.createElement('div');
      t.className='fw-toast';
      document.body.appendChild(t);
    }
    t.textContent=msg;
    t.classList.add('show');
    clearTimeout(window.__fwProfileToast);
    window.__fwProfileToast=setTimeout(()=>t.classList.remove('show'),2600);
  }

  function initials(name){
    return String(name||'FW').trim().slice(0,2).toUpperCase();
  }

  function avatarHtml(name,url){
    if(url){
      return '<span class="fw-avatar"><img src="'+url+'" alt="'+String(name||'头像').replace(/"/g,'')+'"></span>';
    }
    return '<span class="fw-avatar">'+initials(name)+'</span>';
  }

  async function refreshHeaderAndProfile(user){
    if(!user && window.fwDb?.enabled){
      user=await window.fwDb.getCurrentUser().catch(()=>null);
    }
    if(!user) return;
    document.querySelectorAll('[data-fw-current]').forEach(x=>x.textContent=user.nickname||'个人资料');
    document.querySelectorAll('[data-fw-avatar-slot]').forEach(x=>x.innerHTML=avatarHtml(user.nickname,user.avatar_url));
    document.querySelectorAll('[data-fw-card-avatar]').forEach(x=>x.innerHTML=avatarHtml(user.nickname,user.avatar_url));
    document.querySelectorAll('[data-fw-card-name]').forEach(x=>x.textContent=user.nickname||'个人资料');
    document.querySelectorAll('[data-fw-card-email]').forEach(x=>x.textContent=user.email||'未绑定');

    const preview=document.querySelector('[data-profile-preview]');
    if(preview){
      preview.innerHTML=avatarHtml(user.nickname,user.avatar_url)+'<div><b>'+(user.nickname||'个人资料')+'</b><span>'+(user.email||'已绑定邮箱')+'</span></div>';
    }
  }

  function previewLocalAvatar(input){
    const file=input.files&&input.files[0];
    if(!file) return;
    const url=URL.createObjectURL(file);
    const preview=document.querySelector('[data-profile-preview]');
    const nick=document.querySelector('[data-profile] input[name="nickname"]')?.value||'头像';
    if(preview){
      const email=preview.querySelector('span')?.textContent||'';
      preview.innerHTML=avatarHtml(nick,url)+'<div><b>'+nick+'</b><span>'+email+'</span></div>';
    }
  }

  async function saveProfile(form){
    if(!window.fwDb?.enabled){
      toast('数据库连接未就绪，请刷新后再试。');
      return;
    }
    const btn=form.querySelector('button[type="submit"]');
    const old=btn?btn.textContent:'';
    try{
      if(btn){
        btn.textContent='保存中...';
        btn.disabled=true;
        btn.style.opacity='.65';
      }
      const data=new FormData(form);
      const nickname=String(data.get('nickname')||'').trim();
      const password=String(data.get('password')||'').trim();
      const avatarFile=form.querySelector('input[name="avatar"]')?.files?.[0];

      if(nickname||avatarFile){
        await window.fwDb.updateProfile({nickname,avatarFile});
      }
      if(password){
        await window.fwDb.updatePassword({password});
      }

      const user=await window.fwDb.getCurrentUser().catch(()=>null);
      await refreshHeaderAndProfile(user);
      toast('资料已保存。');
      setTimeout(()=>document.querySelector('[data-sb-auth]')?.classList.remove('show'),350);
    }catch(e){
      toast(e.message||'资料保存失败。');
    }finally{
      if(btn){
        btn.textContent=old||'保存资料';
        btn.disabled=false;
        btn.style.opacity='';
      }
    }
  }

  document.addEventListener('change',function(e){
    const input=e.target.closest('[data-profile] input[name="avatar"]');
    if(!input) return;
    previewLocalAvatar(input);
  },true);

  document.addEventListener('submit',function(e){
    const form=e.target.closest('[data-profile]');
    if(!form) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    saveProfile(form);
  },true);
})();
