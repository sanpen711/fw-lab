// F.w 研究所：个人资料保存、头像预览、头像自动压缩修复
// 功能：
// 1. 用户选择头像后，前端自动裁剪成 300×300 正方形
// 2. 优先转成 webp；如果浏览器不支持 webp，则转成 jpg
// 3. 上传前替换 input 里的文件，所以注册头像和个人资料头像都会用压缩后的图片
// 4. 个人资料保存成功后自动关闭弹窗
(function(){
  const AVATAR_SIZE = 300;
  const WEBP_QUALITY = 0.82;
  const JPG_QUALITY = 0.86;

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

  function safeText(value){
    return String(value||'').replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function avatarHtml(name,url){
    if(url){
      return '<span class="fw-avatar"><img src="'+url+'" alt="'+safeText(name||'头像')+'"></span>';
    }
    return '<span class="fw-avatar">'+initials(name)+'</span>';
  }

  function canvasToBlob(canvas,type,quality){
    return new Promise(function(resolve){
      canvas.toBlob(function(blob){ resolve(blob); }, type, quality);
    });
  }

  function loadImage(file){
    return new Promise(function(resolve,reject){
      const url=URL.createObjectURL(file);
      const img=new Image();
      img.onload=function(){
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror=function(){
        URL.revokeObjectURL(url);
        reject(new Error('头像图片读取失败，请换一张图片。'));
      };
      img.src=url;
    });
  }

  async function compressAvatar(file){
    if(!file) return null;

    const allowed=['image/jpeg','image/jpg','image/png','image/webp'];
    if(!allowed.includes(String(file.type||'').toLowerCase())){
      throw new Error('头像只支持 jpg、png、webp 格式。');
    }

    const img=await loadImage(file);
    const canvas=document.createElement('canvas');
    canvas.width=AVATAR_SIZE;
    canvas.height=AVATAR_SIZE;

    const ctx=canvas.getContext('2d');
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';

    // 中心裁剪成正方形，避免头像变形
    const side=Math.min(img.width,img.height);
    const sx=(img.width-side)/2;
    const sy=(img.height-side)/2;
    ctx.drawImage(img,sx,sy,side,side,0,0,AVATAR_SIZE,AVATAR_SIZE);

    // 优先 webp，失败则 jpg
    let type='image/webp';
    let ext='webp';
    let blob=await canvasToBlob(canvas,type,WEBP_QUALITY);

    if(!blob){
      type='image/jpeg';
      ext='jpg';
      blob=await canvasToBlob(canvas,type,JPG_QUALITY);
    }

    if(!blob){
      throw new Error('头像压缩失败，请换一张图片。');
    }

    return new File([blob],'avatar_'+Date.now()+'.'+ext,{type});
  }

  function replaceInputFile(input,file){
    const dt=new DataTransfer();
    dt.items.add(file);
    input.files=dt.files;
  }

  async function compressInputAvatar(input){
    const original=input.files&&input.files[0];
    if(!original) return null;

    const oldTitle=input.title||'';
    try{
      input.title='头像处理中...';
      toast('头像处理中...');
      const compressed=await compressAvatar(original);
      replaceInputFile(input,compressed);

      const url=URL.createObjectURL(compressed);
      previewAvatar(input,url);

      toast('头像已自动压缩为 300×300。');
      return compressed;
    }catch(e){
      toast(e.message||'头像处理失败。');
      input.value='';
      return null;
    }finally{
      input.title=oldTitle;
    }
  }

  function previewAvatar(input,url){
    const profilePreview=document.querySelector('[data-profile-preview]');
    const registerPreview=input.closest('[data-reg3]')?.querySelector('.fw-profile-preview');
    const preview=registerPreview||profilePreview;

    const nickFromProfile=document.querySelector('[data-profile] input[name="nickname"]')?.value;
    const nickFromRegister=document.querySelector('[data-reg3] input[name="nickname"]')?.value;
    const nick=nickFromRegister||nickFromProfile||'头像';

    if(preview){
      const oldEmail=preview.querySelector('span')?.textContent||'';
      preview.innerHTML=avatarHtml(nick,url)+'<div><b>'+safeText(nick)+'</b><span>'+safeText(oldEmail)+'</span></div>';
    }
  }

  async function refreshHeaderAndProfile(user){
    if(!user && window.fwDb?.enabled){
      user=await window.fwDb.getCurrentUser().catch(()=>null);
    }
    if(!user) return;

    document.querySelectorAll('[data-fw-current]').forEach(function(x){
      x.textContent=user.nickname||'个人资料';
    });
    document.querySelectorAll('[data-fw-avatar-slot]').forEach(function(x){
      x.innerHTML=avatarHtml(user.nickname,user.avatar_url);
    });
    document.querySelectorAll('[data-fw-card-avatar]').forEach(function(x){
      x.innerHTML=avatarHtml(user.nickname,user.avatar_url);
    });
    document.querySelectorAll('[data-fw-card-name]').forEach(function(x){
      x.textContent=user.nickname||'个人资料';
    });
    document.querySelectorAll('[data-fw-card-email]').forEach(function(x){
      x.textContent=user.email||'未绑定';
    });

    const preview=document.querySelector('[data-profile-preview]');
    if(preview){
      preview.innerHTML=avatarHtml(user.nickname,user.avatar_url)+'<div><b>'+safeText(user.nickname||'个人资料')+'</b><span>'+safeText(user.email||'已绑定邮箱')+'</span></div>';
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
      const avatarInput=form.querySelector('input[name="avatar"]');
      let avatarFile=avatarInput?.files?.[0];

      // 兜底：如果用户选了头像但 change 事件没压缩成功，这里保存前再压缩一次
      if(avatarFile && !String(avatarFile.name||'').startsWith('avatar_')){
        avatarFile=await compressAvatar(avatarFile);
        if(avatarInput) replaceInputFile(avatarInput,avatarFile);
      }

      if(nickname||avatarFile){
        await window.fwDb.updateProfile({nickname,avatarFile});
      }
      if(password){
        await window.fwDb.updatePassword({password});
      }

      const user=await window.fwDb.getCurrentUser().catch(()=>null);
      await refreshHeaderAndProfile(user);

      toast('资料已保存。');
      setTimeout(function(){
        document.querySelector('[data-sb-auth]')?.classList.remove('show');
      },350);
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

  // 个人资料头像、注册第三步头像，都自动压缩并预览
  document.addEventListener('change',function(e){
    const input=e.target.closest('[data-profile] input[name="avatar"], [data-reg3] input[name="avatar"]');
    if(!input) return;
    compressInputAvatar(input);
  },true);

  // 接管个人资料保存：保存成功后关闭弹窗
  document.addEventListener('submit',function(e){
    const form=e.target.closest('[data-profile]');
    if(!form) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    saveProfile(form);
  },true);
})();
