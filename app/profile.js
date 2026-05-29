(function(){
  if(window.FWAppProfile) return;

  var bound = false;
  var swipeBound = false;
  var swipeTracking = false;
  var swipeStartX = 0;
  var swipeStartY = 0;
  var swipeStartAt = 0;
  var mode = 'home';
  var stickers = [];
  var stickersLoaded = false;
  var stickersLoading = false;
  var stickerUploading = false;

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function esc(value){ return app().esc(value); }

  function injectStyle(){
    if($('#fwMobileProfileHubStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileProfileHubStyle';
    style.textContent = [
      '[data-app-view="profile"]>.view-head{display:none!important}',
      '[data-profile-panel]{display:grid;gap:12px;padding-top:0}',
      '.profile-hub{display:grid;gap:12px}',
      '.profile-top-card{width:100%;border:1px solid rgba(16,23,15,.10);border-radius:12px;background:#fffdf7;box-shadow:0 8px 22px rgba(16,23,15,.05);padding:12px;display:flex;align-items:center;gap:14px;text-align:left;color:var(--deep)}',
      '.profile-top-card.clickable{cursor:pointer}',
      '.profile-top-avatar{width:78px;height:78px;border-radius:12px;overflow:hidden;background:#f1e9dc;display:grid;place-items:center;color:var(--deep);font-size:24px;font-weight:1000;flex:0 0 auto}',
      '.profile-top-avatar img{width:100%;height:100%;object-fit:cover;display:block}',
      '.profile-top-main{min-width:0;display:grid;gap:5px}',
      '.profile-top-main h2{margin:0;color:var(--deep);font-size:24px;line-height:1.08;letter-spacing:-.05em;font-weight:1000;word-break:break-word}',
      '.profile-top-main p{margin:0;color:var(--muted);font-size:14px;line-height:1.35;font-weight:900;word-break:break-word}',
      '.profile-top-main .login-title{font-size:24px;color:var(--deep)}',
      '.profile-menu{display:grid;gap:8px}',
      '.profile-menu-item{min-height:56px;width:100%;border:1px solid rgba(16,23,15,.10);border-radius:10px;background:#fffdf7;color:var(--deep);box-shadow:0 6px 16px rgba(16,23,15,.04);display:flex;align-items:center;gap:14px;padding:0 14px;text-align:left}',
      '.profile-menu-icon{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;flex:0 0 auto;font-size:18px;line-height:1;background:rgba(16,23,15,.045);color:var(--accent-dark)}',
      '.profile-menu-icon.green{color:#2aa875;background:rgba(42,168,117,.10)}',
      '.profile-menu-icon.blue{color:#2b8fc8;background:rgba(43,143,200,.10)}',
      '.profile-menu-icon.orange{color:#d18428;background:rgba(209,132,40,.12)}',
      '.profile-menu-icon.red{color:#d86d6d;background:rgba(216,109,109,.12)}',
      '.profile-menu-icon.yellow{color:#d0a925;background:rgba(208,169,37,.13)}',
      '.profile-menu-icon.cyan{color:#3aa4bd;background:rgba(58,164,189,.12)}',
      '.profile-menu-item b{font-size:17px;line-height:1;font-weight:900;letter-spacing:-.02em;flex:1}',
      '.profile-menu-item:after{content:"›";color:rgba(16,23,15,.32);font-size:26px;font-weight:500;line-height:1;margin-left:auto}',
      '.profile-detail-card{border:1px solid rgba(16,23,15,.10);border-radius:14px;background:#fffdf7;box-shadow:0 8px 22px rgba(16,23,15,.05);padding:14px;display:grid;gap:14px}',
      '.profile-detail-head{display:flex;align-items:center;justify-content:space-between;gap:10px}',
      '.profile-detail-head h2{margin:0;color:var(--deep);font-size:24px;letter-spacing:-.05em;line-height:1.1;font-weight:1000}',
      '.profile-back-btn{border:1px solid rgba(16,23,15,.12);background:#fffaf1;color:var(--deep);border-radius:999px;min-height:34px;padding:0 12px;font-size:13px;font-weight:1000}',
      '.profile-mini-note{margin:0;color:var(--muted);font-size:13px;line-height:1.6;font-weight:850}',
      '.profile-member-placeholder{border:1px dashed rgba(16,23,15,.16);border-radius:14px;background:#fffaf1;padding:18px;color:var(--muted);line-height:1.7;font-size:14px;font-weight:900}',
      '.profile-sticker-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px}',
      '.profile-sticker-toolbar b{color:var(--deep);font-size:16px;font-weight:1000}',
      '.profile-sticker-upload{position:relative;overflow:hidden;border:1px solid rgba(16,23,15,.12);background:var(--deep);color:#fffdf7;border-radius:999px;min-height:36px;padding:0 13px;font-size:13px;font-weight:1000}',
      '.profile-sticker-upload input{position:absolute;inset:0;opacity:0;width:100%;height:100%}',
      '.profile-sticker-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}',
      '.profile-sticker-card{position:relative;border:1px solid rgba(16,23,15,.10);border-radius:14px;background:#fffaf1;aspect-ratio:1/1;display:grid;place-items:center;overflow:hidden}',
      '.profile-sticker-card img{width:100%;height:100%;object-fit:contain;display:block;padding:6px;box-sizing:border-box}',
      '.profile-sticker-del{position:absolute;right:4px;top:4px;width:24px;height:24px;border:0;border-radius:999px;background:rgba(16,23,15,.75);color:#fff;font-size:16px;line-height:24px;font-weight:1000}',
      '.profile-empty{padding:18px;border:1px dashed rgba(16,23,15,.18);border-radius:14px;background:#fffaf1;color:var(--muted);text-align:center;font-size:13px;line-height:1.6;font-weight:900}',
      '.profile-login-entry{display:grid;gap:12px}',
      '.profile-login-entry .login-card{margin:0}',
      '.profile-card{box-shadow:none;border:0;padding:0;background:transparent}',
      '.profile-card .profile-head{padding:0}',
      '.profile-card .stack label{color:var(--accent-dark);font-weight:1000}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function avatarNode(user, cls){
    cls = cls || 'profile-top-avatar';
    return '<span class="' + cls + '">' + app().avatarHtml(user) + '</span>';
  }

  function menuButton(modeName, iconClass, icon, text){
    return '<button class="profile-menu-item" type="button" data-profile-mode="' + esc(modeName) + '"><span class="profile-menu-icon ' + esc(iconClass || '') + '">' + esc(icon) + '</span><b>' + esc(text) + '</b></button>';
  }

  function loggedInHomeHtml(user){
    return '<div class="profile-hub">' +
      '<button class="profile-top-card clickable" type="button" data-profile-mode="info">' +
        avatarNode(user) +
        '<div class="profile-top-main"><h2>' + esc(user.nickname || '临时研究员') + '</h2><p>实验品编号：' + esc(user.lab_code || '未设置') + '</p></div>' +
      '</button>' +
      '<div class="profile-menu">' +
        menuButton('center', 'green', '✓', '个人中心') +
        menuButton('member', 'blue', '◇', '会员中心') +
        menuButton('shop', 'orange', '▣', '周边商城') +
        menuButton('stickers', 'yellow', '☺', '表情管理') +
        menuButton('info', 'cyan', '⚙', '设置') +
      '</div>' +
    '</div>';
  }

  function loggedOutHomeHtml(){
    return '<div class="profile-hub">' +
      '<button class="profile-top-card clickable" type="button" data-profile-mode="login">' +
        '<span class="profile-top-avatar">F.w</span>' +
        '<div class="profile-top-main"><h2 class="login-title">注册 / 登录</h2><p>登录后可保存资料、添加表情和接收回声。</p></div>' +
      '</button>' +
      '<div class="profile-menu">' +
        menuButton('login', 'green', '✓', '个人中心') +
        menuButton('member', 'blue', '◇', '会员中心') +
        menuButton('shop', 'orange', '▣', '周边商城') +
        menuButton('login', 'yellow', '☺', '表情管理') +
        menuButton('login', 'cyan', '⚙', '设置') +
      '</div>' +
    '</div>';
  }

  function loggedInInfoHtml(user){
    return '<section class="profile-detail-card">' +
      '<div class="profile-detail-head"><button class="profile-back-btn" type="button" data-profile-back>‹ 返回</button><h2>设置</h2></div>' +
      '<section class="profile-card">' +
        '<div class="profile-head"><span class="profile-avatar">' + app().avatarHtml(user) + '</span><div><h2>' + esc(user.nickname || '临时研究员') + '</h2><p>' + esc(user.email || '') + '</p><p>' + (user.lab_code ? '实验品编号：' + esc(user.lab_code) : '实验品编号：未设置') + '</p></div></div>' +
        '<div class="subtle-line"></div>' +
        '<form class="stack" data-profile-form>' +
          '<label for="profileLabCode">实验品编号</label>' +
          '<input id="profileLabCode" value="' + esc(user.lab_code || '未设置') + '" readonly>' +
          '<label for="profileNickname">昵称</label>' +
          '<input id="profileNickname" name="nickname" maxlength="24" value="' + esc(user.nickname || '') + '" placeholder="给自己取个低功耗昵称">' +
          '<label for="profileAvatar">头像</label>' +
          '<input id="profileAvatar" name="avatar" type="file" accept="image/*">' +
          '<button class="app-btn dark" type="submit">保存资料</button>' +
        '</form>' +
        '<div class="subtle-line"></div>' +
        '<div class="module-note">修改密码稍后单独处理。</div>' +
        '<button class="app-btn" type="button" data-app-signout>退出登录</button>' +
      '</section>' +
    '</section>';
  }

  function loginHtml(){
    return '<section class="profile-detail-card profile-login-entry">' +
      '<div class="profile-detail-head"><button class="profile-back-btn" type="button" data-profile-back>‹ 返回</button><h2>注册 / 登录</h2></div>' +
      '<section class="login-card">' +
        '<div class="stack">' +
          '<form class="stack" data-login-form>' +
            '<label for="loginEmail">邮箱</label>' +
            '<input id="loginEmail" name="email" type="email" autocomplete="email" placeholder="you@example.com" required>' +
            '<label for="loginPassword">密码</label>' +
            '<input id="loginPassword" name="password" type="password" autocomplete="current-password" placeholder="至少 6 位" required>' +
            '<button class="app-btn dark" type="submit">邮箱密码登录</button>' +
          '</form>' +
          '<div class="subtle-line"></div>' +
          '<form class="stack" data-otp-form>' +
            '<label for="otpNickname">昵称</label>' +
            '<input id="otpNickname" name="nickname" maxlength="24" placeholder="临时研究员">' +
            '<label for="otpEmail">邮箱验证码登录 / 注册</label>' +
            '<input id="otpEmail" name="email" type="email" autocomplete="email" placeholder="you@example.com" required>' +
            '<div class="split-actions"><button class="app-btn" type="button" data-send-otp>发送验证码</button><button class="app-btn dark" type="submit">验证进入</button></div>' +
            '<input name="token" inputmode="numeric" autocomplete="one-time-code" placeholder="输入邮箱验证码">' +
          '</form>' +
          '<p class="form-note">如果你已经在电脑版登录过，同一浏览器环境通常会自动同步登录状态。</p>' +
        '</div>' +
      '</section>' +
    '</section>';
  }

  function centerHtml(){
    return '<section class="profile-detail-card">' +
      '<div class="profile-detail-head"><button class="profile-back-btn" type="button" data-profile-back>‹ 返回</button><h2>个人中心</h2></div>' +
      '<div class="profile-member-placeholder">个人中心先保留入口。后续可以放个人主页、成长记录、账号概览或其他个人相关功能。</div>' +
    '</section>';
  }

  function memberHtml(){
    return '<section class="profile-detail-card">' +
      '<div class="profile-detail-head"><button class="profile-back-btn" type="button" data-profile-back>‹ 返回</button><h2>会员中心</h2></div>' +
      '<div class="profile-member-placeholder">会员中心先保留入口。后续可以放会员身份、专属标识、功能权益或其他设置；目前只展示文字，不接具体功能。</div>' +
    '</section>';
  }

  function shopHtml(){
    return '<section class="profile-detail-card">' +
      '<div class="profile-detail-head"><button class="profile-back-btn" type="button" data-profile-back>‹ 返回</button><h2>周边商城</h2></div>' +
      '<div class="profile-member-placeholder">周边商城先保留入口。后续可以放研究所周边、虚拟纪念品或其它展示内容。</div>' +
    '</section>';
  }

  function stickersHtml(user){
    return '<section class="profile-detail-card">' +
      '<div class="profile-detail-head"><button class="profile-back-btn" type="button" data-profile-back>‹ 返回</button><h2>表情管理</h2></div>' +
      '<p class="profile-mini-note">这里管理你已经上传的“我的表情”。评论、发帖和聊天里的表情面板会读取这些表情。</p>' +
      '<div class="profile-sticker-toolbar"><b>我的表情</b><label class="profile-sticker-upload">添加表情<input type="file" accept="image/*" data-sticker-file></label></div>' +
      '<div data-sticker-list>' + renderStickerList() + '</div>' +
    '</section>';
  }

  function renderStickerList(){
    if(stickersLoading) return '<div class="profile-empty">正在读取我的表情...</div>';
    if(!stickersLoaded) return '<div class="profile-empty">进入后自动读取我的表情。</div>';
    if(!stickers.length) return '<div class="profile-empty">暂时没有表情。点击“添加表情”上传一张图片。</div>';
    return '<div class="profile-sticker-grid">' + stickers.map(function(row){
      var url = row.image_url || row.url || '';
      return '<div class="profile-sticker-card"><img src="' + esc(url) + '" alt="表情"><button class="profile-sticker-del" type="button" data-sticker-delete="' + esc(row.id) + '" aria-label="删除表情">×</button></div>';
    }).join('') + '</div>';
  }

  function refreshStickerList(){
    var box = $('[data-sticker-list]');
    if(box) box.innerHTML = renderStickerList();
  }

  async function loadStickers(force){
    if(stickersLoading) return;
    if(stickersLoaded && !force) return;
    var user = app().state.user;
    if(!user) return;
    stickersLoading = true;
    refreshStickerList();
    try{
      var db = app().db();
      var client = db && db.client;
      if(!client) throw new Error('db');
      var res = await client.from('user_stickers').select('id,image_url,storage_path,file_name,file_size,mime_type,created_at').eq('user_id', user.id).eq('is_deleted', false).order('created_at', {ascending:false}).limit(30);
      if(res.error) throw res.error;
      stickers = res.data || [];
      stickersLoaded = true;
    }catch(err){
      console.warn('[FW mobile app] stickers load failed', err);
      app().toast(safeMessage(err, '表情读取失败。'));
      stickers = [];
      stickersLoaded = true;
    }finally{
      stickersLoading = false;
      refreshStickerList();
    }
  }

  function validateSticker(file){
    if(!file) throw new Error('没有选择图片。');
    var type = String(file.type || '').toLowerCase();
    var name = String(file.name || '').toLowerCase();
    if(!/^image\/(jpeg|jpg|png|webp|gif)$/.test(type) && !/\.(jpg|jpeg|png|webp|gif)$/.test(name)) throw new Error('只支持 JPG、PNG、WebP、GIF 图片。');
    if(file.size > 1024 * 1024) throw new Error('表情图片不能超过 1MB。');
  }

  function extFromFile(file){
    var type = String(file.type || '').toLowerCase();
    var name = String(file.name || '').toLowerCase();
    var m = name.match(/\.([a-z0-9]+)$/);
    if(m) return m[1];
    if(type.indexOf('gif') >= 0) return 'gif';
    if(type.indexOf('png') >= 0) return 'png';
    if(type.indexOf('webp') >= 0) return 'webp';
    return 'jpg';
  }

  async function uploadSticker(file){
    if(stickerUploading) return;
    var user = app().state.user;
    if(!user){
      mode = 'login';
      render();
      return;
    }
    validateSticker(file);
    var db = app().db();
    var client = db && db.client;
    if(!client || !client.storage) throw new Error('storage');
    stickerUploading = true;
    app().toast('正在添加表情...');
    try{
      var ext = extFromFile(file);
      var random = Math.random().toString(36).slice(2, 8);
      var path = String(user.id) + '/' + Date.now().toString(36) + '_' + random + '.' + ext;
      var uploaded = await client.storage.from('stickers').upload(path, file, {cacheControl:'3600', upsert:false, contentType:file.type || 'image/' + ext});
      if(uploaded.error) throw uploaded.error;
      var publicData = client.storage.from('stickers').getPublicUrl(path);
      var publicUrl = publicData && publicData.data && publicData.data.publicUrl;
      if(!publicUrl) throw new Error('public-url');
      var saved = await client.from('user_stickers').insert({user_id:user.id,image_url:publicUrl,storage_path:path,file_name:file.name || 'sticker',file_size:file.size || 0,mime_type:file.type || ''}).select('id,image_url,storage_path,file_name,file_size,mime_type,created_at').single();
      if(saved.error) throw saved.error;
      stickers = [saved.data].concat(stickers).slice(0, 30);
      stickersLoaded = true;
      refreshStickerList();
      app().toast('表情已添加');
    }finally{
      stickerUploading = false;
    }
  }

  async function deleteSticker(id){
    if(!id) return;
    if(!window.confirm('确定删除这个表情吗？')) return;
    var db = app().db();
    var client = db && db.client;
    if(!client) throw new Error('db');
    var res = await client.from('user_stickers').update({is_deleted:true}).eq('id', id).eq('user_id', app().state.user.id);
    if(res.error) throw res.error;
    stickers = stickers.filter(function(row){ return String(row.id) !== String(id); });
    refreshStickerList();
    app().toast('已删除');
  }

  function render(){
    var panel = $('[data-profile-panel]');
    if(!panel) return;
    var user = app().state.user;
    if(!user && (mode === 'info' || mode === 'stickers' || mode === 'center')) mode = 'login';
    if(mode === 'login') panel.innerHTML = loginHtml();
    else if(mode === 'center') panel.innerHTML = centerHtml();
    else if(mode === 'member') panel.innerHTML = memberHtml();
    else if(mode === 'shop') panel.innerHTML = shopHtml();
    else if(mode === 'info' && user) panel.innerHTML = loggedInInfoHtml(user);
    else if(mode === 'stickers' && user){
      panel.innerHTML = stickersHtml(user);
      loadStickers(false);
    }else panel.innerHTML = user ? loggedInHomeHtml(user) : loggedOutHomeHtml();
  }

  function setBusy(btn, busy, text){
    if(!btn) return;
    if(busy){
      btn.dataset.oldText = btn.textContent;
      btn.textContent = text || '处理中...';
      btn.disabled = true;
    }else{
      btn.textContent = btn.dataset.oldText || btn.textContent;
      btn.disabled = false;
    }
  }

  function safeMessage(err, fallback){
    var msg = err && err.message ? err.message : '';
    if(/Could not|relationship|schema|duplicate key|violates/i.test(msg)) return fallback;
    if(/bucket|storage|not found/i.test(msg)) return '表情存储还没初始化，请先检查表情包 SQL。';
    if(/row-level security|permission|policy|denied/i.test(msg)) return '没有权限执行这个操作，请检查登录状态。';
    return msg || fallback;
  }

  function bindSwipeBack(){
    if(swipeBound) return;
    swipeBound = true;
    document.addEventListener('touchstart', function(e){
      var profileView = document.querySelector('[data-app-view="profile"].is-active');
      if(!profileView || !profileView.querySelector('[data-profile-back]')) return;
      if(!e.touches || e.touches.length !== 1) return;
      if(e.target && e.target.closest && e.target.closest('input, textarea, select, button, label, a')) return;
      var touch = e.touches[0];
      swipeStartX = touch.clientX;
      swipeStartY = touch.clientY;
      swipeStartAt = Date.now();
      swipeTracking = true;
    }, {passive:true});

    document.addEventListener('touchend', function(e){
      if(!swipeTracking) return;
      swipeTracking = false;
      var profileView = document.querySelector('[data-app-view="profile"].is-active');
      if(!profileView || !profileView.querySelector('[data-profile-back]')) return;
      if(!e.changedTouches || e.changedTouches.length !== 1) return;
      var touch = e.changedTouches[0];
      var dx = touch.clientX - swipeStartX;
      var dy = touch.clientY - swipeStartY;
      var elapsed = Date.now() - swipeStartAt;
      if(dx <= -68 && Math.abs(dx) > Math.abs(dy) * 1.45 && elapsed <= 700){
        mode = 'home';
        render();
      }
    }, {passive:true});
  }

  function bind(){
    if(bound) return;
    bound = true;

    document.addEventListener('submit', async function(e){
      var loginForm = e.target.closest && e.target.closest('[data-login-form]');
      if(loginForm){
        e.preventDefault();
        var btn = loginForm.querySelector('button[type="submit"]');
        setBusy(btn, true, '登录中...');
        try{
          await window.fwDb.signInPassword({email:loginForm.email.value, password:loginForm.password.value});
          await app().refreshUser();
          if(window.FWAppFeed) await window.FWAppFeed.load(true);
          mode = 'home';
          render();
          app().toast('已登录');
        }catch(err){
          app().toast(safeMessage(err, '登录失败，请检查邮箱和密码。'));
        }finally{
          setBusy(btn, false);
        }
        return;
      }

      var otpForm = e.target.closest && e.target.closest('[data-otp-form]');
      if(otpForm){
        e.preventDefault();
        var otpBtn = otpForm.querySelector('button[type="submit"]');
        setBusy(otpBtn, true, '验证中...');
        try{
          await window.fwDb.verifyEmailOtp({
            email:otpForm.email.value,
            token:otpForm.token.value,
            nickname:otpForm.nickname.value
          });
          await app().refreshUser();
          if(window.FWAppFeed) await window.FWAppFeed.load(true);
          mode = 'home';
          render();
          app().toast('已进入研究所');
        }catch(err){
          app().toast(safeMessage(err, '验证码验证失败。'));
        }finally{
          setBusy(otpBtn, false);
        }
        return;
      }

      var profileForm = e.target.closest && e.target.closest('[data-profile-form]');
      if(profileForm){
        e.preventDefault();
        var save = profileForm.querySelector('button[type="submit"]');
        setBusy(save, true, '保存中...');
        try{
          var file = profileForm.avatar.files && profileForm.avatar.files[0] || null;
          await window.fwDb.updateProfile({nickname:profileForm.nickname.value, avatarFile:file});
          await app().refreshUser();
          mode = 'home';
          render();
          app().toast('资料已保存');
        }catch(err){
          app().toast(safeMessage(err, '资料保存失败。'));
        }finally{
          setBusy(save, false);
        }
      }
    });

    document.addEventListener('change', async function(e){
      var fileInput = e.target.closest && e.target.closest('[data-sticker-file]');
      if(!fileInput) return;
      var file = fileInput.files && fileInput.files[0] || null;
      fileInput.value = '';
      if(!file) return;
      try{
        await uploadSticker(file);
      }catch(err){
        console.warn('[FW mobile app] sticker upload failed', err);
        app().toast(safeMessage(err, '表情添加失败。'));
      }
    });

    document.addEventListener('click', async function(e){
      var modeBtn = e.target.closest && e.target.closest('[data-profile-mode]');
      if(modeBtn){
        e.preventDefault();
        mode = modeBtn.dataset.profileMode || 'home';
        render();
        return;
      }

      var back = e.target.closest && e.target.closest('[data-profile-back]');
      if(back){
        e.preventDefault();
        mode = 'home';
        render();
        return;
      }

      var del = e.target.closest && e.target.closest('[data-sticker-delete]');
      if(del){
        e.preventDefault();
        try{
          await deleteSticker(del.dataset.stickerDelete);
        }catch(err){
          console.warn('[FW mobile app] sticker delete failed', err);
          app().toast(safeMessage(err, '表情删除失败。'));
        }
        return;
      }

      var send = e.target.closest && e.target.closest('[data-send-otp]');
      if(send){
        var form = send.closest('[data-otp-form]');
        if(!form.email.value.trim()){
          form.email.focus();
          app().toast('先填写邮箱。');
          return;
        }
        setBusy(send, true, '发送中...');
        try{
          await window.fwDb.sendEmailOtp({email:form.email.value, nickname:form.nickname.value});
          app().toast('验证码已发送，请查收邮箱。');
        }catch(err){
          app().toast(safeMessage(err, '验证码发送失败。'));
        }finally{
          setBusy(send, false);
        }
        return;
      }

      var signout = e.target.closest && e.target.closest('[data-app-signout]');
      if(signout){
        setBusy(signout, true, '退出中...');
        try{
          await window.fwDb.signOut();
          await app().refreshUser();
          if(window.FWAppFeed) await window.FWAppFeed.load(true);
          mode = 'home';
          stickers = [];
          stickersLoaded = false;
          render();
          app().toast('已退出');
        }catch(err){
          app().toast(safeMessage(err, '退出失败。'));
        }finally{
          setBusy(signout, false);
        }
      }
    });
  }

  function init(){
    injectStyle();
    bind();
    bindSwipeBack();
    render();
  }

  window.FWAppProfile = {init:init, render:render};
})();