(function(){
  if(window.FWAppProfile) return;

  var bound = false;
  var swipeBound = false;
  var swipeTracking = false;
  var swipeStartX = 0;
  var swipeStartY = 0;
  var swipeStartAt = 0;
  var mode = 'home';
  var authView = 'login';
  var stickers = [];
  var stickersLoaded = false;
  var stickersLoading = false;
  var stickerUploading = false;
  var recoveryBound = false;
  var recoveryRequested = /(?:[?#&])type=recovery(?:[&#]|$)/i.test(window.location.href);
  var registerState = readRegisterState();
  var loginDraftEmail = '';

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function esc(value){ return app().esc(value); }
  function db(){ return window.fwDb && window.fwDb.enabled ? window.fwDb : null; }
  function client(){ return db() && db().client; }
  function normEmail(value){ return String(value || '').trim().toLowerCase(); }
  function normCode(value){ return String(value || '').trim().replace(/\s+/g, '').toUpperCase(); }
  function validCode(value){ return /^[A-Z0-9]{7}$/.test(normCode(value)); }
  function nicknameFromCode(code){ return '研究员' + normCode(code); }

  function readRegisterState(){
    try{
      var raw = window.sessionStorage && sessionStorage.getItem('fw_mobile_register_state');
      if(!raw) return {email:'', password:'', labCode:''};
      var data = JSON.parse(raw);
      return {email:data.email || '', password:data.password || '', labCode:data.labCode || ''};
    }catch(e){
      return {email:'', password:'', labCode:''};
    }
  }

  function saveRegisterState(){
    try{
      if(window.sessionStorage) sessionStorage.setItem('fw_mobile_register_state', JSON.stringify(registerState));
    }catch(e){}
  }

  function clearRegisterState(){
    registerState = {email:'', password:'', labCode:''};
    try{
      if(window.sessionStorage) sessionStorage.removeItem('fw_mobile_register_state');
    }catch(e){}
  }

  function withTimeout(promise, ms, message){
    return Promise.race([
      promise,
      new Promise(function(_, reject){
        setTimeout(function(){ reject(new Error(message || '操作超时，请稍后重试。')); }, ms || 15000);
      })
    ]);
  }

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
      '.profile-card .stack label{color:var(--accent-dark);font-weight:1000}',
      '.mobile-auth-tabs{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px}',
      '.mobile-auth-tabs button{min-height:38px;border:1px solid rgba(16,23,15,.12);border-radius:999px;background:#fffaf1;color:var(--deep);font-size:13px;font-weight:1000}',
      '.mobile-auth-tabs button.active{background:var(--deep);color:#fffdf7}',
      '.mobile-register-steps{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:4px 0 12px}',
      '.mobile-register-steps span{border:1px solid rgba(16,23,15,.12);border-radius:999px;padding:8px 4px;text-align:center;font-size:12px;font-weight:1000;color:var(--muted)}',
      '.mobile-register-steps span.active{background:var(--deep);color:#fffdf7}',
      '.mobile-disclaimer{border:1px solid rgba(16,23,15,.10);border-radius:12px;background:#fffaf1;padding:10px;display:grid;gap:6px;color:var(--muted);font-size:12px;line-height:1.5;font-weight:850}',
      '.mobile-disclaimer label{display:flex;gap:8px;align-items:flex-start;color:var(--deep)!important}',
      '.mobile-disclaimer input{width:auto;margin-top:2px}',
      '.mobile-disclaimer a{color:var(--accent-dark);font-weight:1000;text-decoration:underline;text-underline-offset:3px}',
      '.mobile-auth-note{margin:0;color:var(--muted);font-size:12px;line-height:1.55;font-weight:850}',
      '.mobile-auth-link{border:0;background:transparent;color:var(--accent-dark);font-size:13px;font-weight:1000;text-decoration:underline;text-underline-offset:3px;padding:4px 0;text-align:left}',
      '.mobile-policy-links{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center}',
      '.mobile-policy-links a{color:var(--accent-dark);font-size:12px;font-weight:1000;text-decoration:underline;text-underline-offset:3px}',
      '.mobile-account-danger{border:1px solid rgba(157,61,61,.28);border-radius:12px;background:#fff5f1;padding:12px;display:grid;gap:9px}',
      '.mobile-account-danger b{color:#8f3636;font-size:14px}',
      '.mobile-account-danger p{margin:0;color:var(--muted);font-size:12px;line-height:1.55;font-weight:850}',
      '.mobile-account-danger .danger{background:#8f3636;color:#fff;border-color:#8f3636}'
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
        '<div class="mobile-policy-links"><a href="../rules.html" target="_blank" rel="noopener">用户规则</a><a href="../privacy.html" target="_blank" rel="noopener">隐私政策</a></div>' +
        (user.isAdmin ? '<div class="module-note">管理员账号不能直接注销，请先转移管理员身份。</div>' : '<div class="mobile-account-danger"><b>注销账号</b><p>账号、帖子、评论、互动、搭子关系和个人文件将被删除，操作不可恢复。</p><button class="app-btn danger" type="button" data-delete-own-account>永久注销账号</button></div>') +
        '<button class="app-btn" type="button" data-app-signout>退出登录</button>' +
      '</section>' +
    '</section>';
  }

  function authTabs(){
    return '<div class="mobile-auth-tabs">' +
      '<button type="button" data-auth-view="login" class="' + (authView === 'login' ? 'active' : '') + '">登录</button>' +
      '<button type="button" data-auth-view="register1" class="' + (/^register/.test(authView) ? 'active' : '') + '">注册</button>' +
    '</div>';
  }

  function loginFormHtml(){
    return '<form class="stack" data-login-form>' +
      '<label for="loginEmail">邮箱</label>' +
      '<input id="loginEmail" name="email" type="email" autocomplete="email" placeholder="you@example.com" value="' + esc(loginDraftEmail) + '" required>' +
      '<label for="loginPassword">密码</label>' +
      '<input id="loginPassword" name="password" type="password" autocomplete="current-password" placeholder="输入账号密码" required>' +
      '<button class="app-btn dark" type="submit">登录</button>' +
      '<button class="mobile-auth-link" type="button" data-auth-view="reset">忘记密码？</button>' +
      '<p class="mobile-auth-note">如果你已经在电脑端注册过，请直接用邮箱和密码登录。</p>' +
    '</form>';
  }

  function registerStep1Html(){
    return '<form class="stack" data-register-form>' +
      '<div class="mobile-register-steps"><span class="active">1 填写信息</span><span>2 验证邮箱</span></div>' +
      '<label for="regEmail">邮箱</label>' +
      '<input id="regEmail" name="email" type="email" autocomplete="email" placeholder="用于登录和找回密码" value="' + esc(registerState.email || '') + '" required>' +
      '<label for="regLabCode">实验品编号</label>' +
      '<input id="regLabCode" name="lab_code" maxlength="7" autocomplete="off" placeholder="7 位字母或数字，例如 FW2026A" value="' + esc(registerState.labCode || '') + '" required>' +
      '<p class="mobile-auth-note">实验品编号全站唯一，注册后不能修改。</p>' +
      '<label for="regPassword">密码</label>' +
      '<input id="regPassword" name="password" type="password" autocomplete="new-password" placeholder="至少 6 位，以后用它登录" required>' +
      '<label for="regPassword2">确认密码</label>' +
      '<input id="regPassword2" name="password2" type="password" autocomplete="new-password" placeholder="再输入一次密码" required>' +
      '<div class="mobile-disclaimer"><label><input type="checkbox" name="agree" value="1"><span>我已阅读并同意 <a href="../rules.html" target="_blank" rel="noopener">《用户规则》</a> 和 <a href="../privacy.html" target="_blank" rel="noopener">《隐私政策》</a></span></label><p>勾选后，才能发送邮箱验证码并继续注册。</p></div>' +
      '<button class="app-btn dark" type="submit">下一步，验证邮箱</button>' +
      '<p class="mobile-auth-note"><button class="profile-back-btn" type="button" data-auth-view="login">已有账号？返回登录</button></p>' +
    '</form>';
  }

  function registerStep2Html(){
    return '<form class="stack" data-register-verify-form>' +
      '<div class="mobile-register-steps"><span class="active">1 填写信息</span><span class="active">2 验证邮箱</span></div>' +
      '<p class="mobile-auth-note">验证码已发送至 ' + esc(registerState.email || '你的邮箱') + '，请输入邮件中的验证码。</p>' +
      '<label for="regToken">验证码</label>' +
      '<input id="regToken" name="token" inputmode="numeric" autocomplete="one-time-code" placeholder="填写邮件里的验证码" required>' +
      '<button class="app-btn dark" type="submit">确认验证码，完成注册</button>' +
      '<div class="split-actions"><button class="app-btn" type="button" data-resend-register-code>重新发送</button><button class="app-btn" type="button" data-auth-view="register1">返回修改</button></div>' +
    '</form>';
  }

  function resetFormHtml(){
    return '<form class="stack" data-reset-form>' +
      '<p class="mobile-auth-note">输入注册邮箱，我们会发送找回密码邮件。</p>' +
      '<label for="resetEmail">邮箱</label>' +
      '<input id="resetEmail" name="email" type="email" autocomplete="email" placeholder="输入绑定邮箱" value="' + esc(loginDraftEmail) + '" required>' +
      '<button class="app-btn dark" type="submit">发送找回密码邮件</button>' +
      '<button class="mobile-auth-link" type="button" data-auth-view="login">返回登录</button>' +
    '</form>';
  }

  function resetPasswordHtml(){
    return '<form class="stack" data-reset-password-form>' +
      '<p class="mobile-auth-note">邮箱验证成功，请设置新的登录密码。</p>' +
      '<label for="resetPassword">新密码</label>' +
      '<input id="resetPassword" name="password" type="password" autocomplete="new-password" placeholder="至少 8 位" required>' +
      '<label for="resetPassword2">确认新密码</label>' +
      '<input id="resetPassword2" name="password2" type="password" autocomplete="new-password" placeholder="再输入一次新密码" required>' +
      '<button class="app-btn dark" type="submit">确认修改密码</button>' +
    '</form>';
  }

  function loginHtml(){
    var isRegister = /^register/.test(authView);
    var isReset = /^reset/.test(authView);
    var body = authView === 'register2' ? registerStep2Html()
      : (authView === 'register1' ? registerStep1Html()
      : (authView === 'resetNew' ? resetPasswordHtml()
      : (authView === 'reset' ? resetFormHtml() : loginFormHtml())));
    var title = isRegister ? '注册账号' : (isReset ? '找回密码' : '账号登录');
    return '<section class="profile-detail-card profile-login-entry">' +
      '<div class="profile-detail-head"><button class="profile-back-btn" type="button" data-profile-back>‹ 返回</button><h2>' + title + '</h2></div>' +
      '<section class="login-card"><div class="stack">' +
        '<p class="mobile-login-kicker">FW ACCOUNT</p>' +
        '<h1 class="mobile-login-title">' + title + '</h1>' +
        '<p class="mobile-login-desc">' + (isRegister ? '填写账号信息并验证邮箱，完成正式注册。' : (isReset ? '验证邮箱并重新设置密码。' : '输入邮箱和密码，进入研究所。')) + '</p>' +
        (isReset ? '' : authTabs()) + body +
      '</div></section>' +
    '</section>';
  }

  function centerHtml(){
    return '<section class="profile-detail-card"><div class="profile-detail-head"><button class="profile-back-btn" type="button" data-profile-back>‹ 返回</button><h2>个人中心</h2></div><div class="profile-member-placeholder">个人中心先保留入口。后续可以放个人主页、成长记录、账号概览或其他个人相关功能。</div></section>';
  }

  function memberHtml(){
    return '<section class="profile-detail-card"><div class="profile-detail-head"><button class="profile-back-btn" type="button" data-profile-back>‹ 返回</button><h2>会员中心</h2></div><div class="profile-member-placeholder">会员中心先保留入口。后续可以放会员身份、专属标识、功能权益或其他设置；目前只展示文字，不接具体功能。</div></section>';
  }

  function shopHtml(){
    return '<section class="profile-detail-card"><div class="profile-detail-head"><button class="profile-back-btn" type="button" data-profile-back>‹ 返回</button><h2>周边商城</h2></div><div class="profile-member-placeholder">周边商城先保留入口。后续可以放研究所周边、虚拟纪念品或其它展示内容。</div></section>';
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
      var c = client();
      if(!c) throw new Error('db');
      var res = await c.from('user_stickers').select('id,image_url,storage_path,file_name,file_size,mime_type,created_at').eq('user_id', user.id).eq('is_deleted', false).order('created_at', {ascending:false}).limit(30);
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
    if(!user){ mode = 'login'; render(); return; }
    validateSticker(file);
    var c = client();
    if(!c || !c.storage) throw new Error('storage');
    stickerUploading = true;
    app().toast('正在添加表情...');
    try{
      var ext = extFromFile(file);
      var random = Math.random().toString(36).slice(2, 8);
      var path = String(user.id) + '/' + Date.now().toString(36) + '_' + random + '.' + ext;
      var uploaded = await c.storage.from('stickers').upload(path, file, {cacheControl:'3600', upsert:false, contentType:file.type || 'image/' + ext});
      if(uploaded.error) throw uploaded.error;
      var publicData = c.storage.from('stickers').getPublicUrl(path);
      var publicUrl = publicData && publicData.data && publicData.data.publicUrl;
      if(!publicUrl) throw new Error('public-url');
      var saved = await c.from('user_stickers').insert({user_id:user.id,image_url:publicUrl,storage_path:path,file_name:file.name || 'sticker',file_size:file.size || 0,mime_type:file.type || ''}).select('id,image_url,storage_path,file_name,file_size,mime_type,created_at').single();
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
    var c = client();
    if(!c) throw new Error('db');
    var res = await c.from('user_stickers').update({is_deleted:true}).eq('id', id).eq('user_id', app().state.user.id);
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
    var msg = err && err.message ? err.message : String(err || '');
    if(/token has expired|token.*invalid|expired or is invalid|otp.*expired|otp.*invalid/i.test(msg)) return '验证码错误或已失效';
    if(/invalid login credentials/i.test(msg)) return '邮箱或密码不正确。';
    if(/email not confirmed/i.test(msg)) return '邮箱还没有验证，请先完成邮箱验证码验证。';
    if(/User already registered/i.test(msg)) return '这个邮箱已经注册过，请直接登录。';
    if(/Email rate limit exceeded|rate limit|too many/i.test(msg)) return '验证码发送太频繁，请稍后再试。';
    if(/duplicate key|unique|duplicate/i.test(msg)) return '该资料已被占用，请换一个。';
    if(/fw_delete_own_account|function.*not found|could not find.*function/i.test(msg)) return '账号注销功能尚未启用，请先执行数据库注销补丁。';
    if(/Could not|relationship|schema|violates/i.test(msg)) return fallback;
    if(/bucket|storage|not found/i.test(msg)) return '表情存储还没初始化，请先检查表情包 SQL。';
    if(/row-level security|permission|policy|denied/i.test(msg)) return '没有权限执行这个操作，请检查登录状态。';
    return msg || fallback;
  }

  async function waitForDb(){
    if(app() && app().waitForDb){
      var ok = await app().waitForDb(10000);
      if(ok && db()) return true;
    }
    if(db()) return true;
    throw new Error('数据库连接未就绪，请刷新页面后重试。');
  }

  async function registerStep1(form){
    var btn = form.querySelector('button[type="submit"]');
    setBusy(btn, true, '发送中...');
    try{
      await waitForDb();
      var email = normEmail(form.email && form.email.value);
      var password = String(form.password && form.password.value || '').trim();
      var password2 = String(form.password2 && form.password2.value || '').trim();
      var labCode = normCode(form.lab_code && form.lab_code.value);
      if(!email) throw new Error('请填写邮箱。');
      if(!validCode(labCode)) throw new Error('实验品编号必须是 7 位字母或数字。');
      if(password.length < 6) throw new Error('密码至少 6 位。');
      if(password !== password2) throw new Error('两次密码不一致。');
      if(!form.agree || !form.agree.checked) throw new Error('请先勾选声明。');

      var nickname = nicknameFromCode(labCode);
      var c = client();
      var chk = await withTimeout(c.rpc('fw_check_profile_identity', {check_lab_code:labCode, check_nickname:nickname}), 10000, '检查编号是否重复超时，请稍后重试。');
      if(chk.error) throw chk.error;
      if(chk.data && chk.data.lab_code_taken) throw new Error('该编号已被注册。');
      if(chk.data && chk.data.nickname_taken) throw new Error('该昵称已被注册。');

      registerState = {email:email, password:password, labCode:labCode};
      saveRegisterState();

      var r = await withTimeout(c.auth.signUp({
        email:email,
        password:password,
        options:{
          data:{nickname:nickname, lab_code:labCode},
          emailRedirectTo:window.location.href.split('#')[0]
        }
      }), 18000, '验证码发送超时，请稍后重试。');
      if(r.error) throw r.error;

      authView = 'register2';
      render();
      app().toast('验证码已发送。');
    }catch(err){
      app().toast(safeMessage(err, '注册信息提交失败。'));
    }finally{
      setBusy(btn, false);
    }
  }

  async function resendRegisterCode(btn){
    setBusy(btn, true, '发送中...');
    try{
      await waitForDb();
      if(!registerState.email) throw new Error('注册信息丢失，请返回第一步重新填写。');
      var c = client();
      if(c.auth.resend){
        var resend = await withTimeout(c.auth.resend({type:'signup', email:registerState.email}), 15000, '验证码发送超时，请稍后重试。');
        if(resend.error) throw resend.error;
      }else{
        var again = await withTimeout(c.auth.signUp({email:registerState.email, password:registerState.password, options:{data:{nickname:nicknameFromCode(registerState.labCode), lab_code:registerState.labCode}, emailRedirectTo:window.location.href.split('#')[0]}}), 15000, '验证码发送超时，请稍后重试。');
        if(again.error) throw again.error;
      }
      app().toast('验证码已重新发送。');
    }catch(err){
      app().toast(safeMessage(err, '验证码重新发送失败。'));
    }finally{
      setBusy(btn, false);
    }
  }

  async function registerStep2(form){
    var btn = form.querySelector('button[type="submit"]');
    setBusy(btn, true, '验证中...');
    try{
      await waitForDb();
      registerState = readRegisterState();
      var token = String(form.token && form.token.value || '').trim().replace(/\s+/g, '');
      if(!registerState.email || !validCode(registerState.labCode)) throw new Error('注册信息丢失，请返回第一步重新填写。');
      if(!token) throw new Error('请填写验证码。');

      var c = client();
      var verified = await withTimeout(c.auth.verifyOtp({email:registerState.email, token:token, type:'signup'}), 18000, '验证码验证超时，请稍后重试。');
      if(verified.error) throw verified.error;

      var user = verified.data && verified.data.user || null;
      if(!user){
        var sessionRes = await withTimeout(c.auth.getSession(), 8000, '读取登录状态超时，请刷新后登录。');
        user = sessionRes.data && sessionRes.data.session && sessionRes.data.session.user || null;
      }
      if(!user || !user.id) throw new Error('邮箱已验证，但登录状态未同步，请刷新后登录。');

      var saved = await withTimeout(c.from('profiles').update({
        nickname:nicknameFromCode(registerState.labCode),
        lab_code:registerState.labCode,
        email_search:registerState.email,
        updated_at:new Date().toISOString()
      }).eq('id', user.id).select('id,lab_code,nickname').maybeSingle(), 10000, '保存实验品编号超时，请稍后重试。');
      if(saved.error) throw saved.error;

      var registeredEmail = registerState.email;
      clearRegisterState();
      await c.auth.signOut().catch(function(){});
      await app().refreshUser();
      loginDraftEmail = registeredEmail;
      authView = 'login';
      mode = 'login';
      render();
      app().toast('注册成功，请用邮箱和密码登录。');
    }catch(err){
      app().toast(safeMessage(err, '验证码验证失败。'));
    }finally{
      setBusy(btn, false);
    }
  }

  async function sendPasswordReset(form){
    var btn = form.querySelector('button[type="submit"]');
    setBusy(btn, true, '发送中...');
    try{
      await waitForDb();
      var email = normEmail(form.email && form.email.value);
      if(!email) throw new Error('请填写邮箱。');
      loginDraftEmail = email;
      await withTimeout(window.fwDb.sendPasswordReset({email:email}), 18000, '找回密码邮件发送超时，请稍后重试。');
      authView = 'login';
      render();
      app().toast('找回密码邮件已发送，请打开邮件继续。');
    }catch(err){
      app().toast(safeMessage(err, '找回密码邮件发送失败。'));
    }finally{
      setBusy(btn, false);
    }
  }

  async function saveResetPassword(form){
    var btn = form.querySelector('button[type="submit"]');
    setBusy(btn, true, '修改中...');
    try{
      await waitForDb();
      var password = String(form.password && form.password.value || '').trim();
      var password2 = String(form.password2 && form.password2.value || '').trim();
      if(password.length < 8) throw new Error('新密码至少 8 位。');
      if(password !== password2) throw new Error('两次密码不一致。');
      await withTimeout(window.fwDb.updatePassword({password:password}), 18000, '密码修改超时，请稍后重试。');
      await window.fwDb.signOut().catch(function(){});
      recoveryRequested = false;
      authView = 'login';
      mode = 'login';
      await app().refreshUser();
      render();
      app().toast('密码已修改，请重新登录。');
    }catch(err){
      app().toast(safeMessage(err, '密码修改失败。'));
    }finally{
      setBusy(btn, false);
    }
  }

  async function deleteOwnAccount(btn){
    var first = window.confirm('注销后，账号、帖子、评论、互动、搭子关系和个人文件将被永久删除。是否继续？');
    if(!first) return;
    var phrase = window.prompt('请输入“删除账号”确认永久注销：', '');
    if(String(phrase || '').trim() !== '删除账号'){
      app().toast('确认文字不正确，已取消注销。');
      return;
    }

    setBusy(btn, true, '注销中...');
    try{
      await waitForDb();
      if(!window.fwDb.deleteOwnAccount) throw new Error('账号注销功能尚未启用，请更新数据库补丁。');
      await withTimeout(window.fwDb.deleteOwnAccount(), 30000, '账号注销超时，请稍后重试。');
      stickers = [];
      stickersLoaded = false;
      mode = 'home';
      await app().refreshUser();
      render();
      app().setView('nav');
      app().toast('账号已注销。');
    }catch(err){
      app().toast(safeMessage(err, '账号注销失败。'));
    }finally{
      setBusy(btn, false);
    }
  }

  function bindRecoveryAuth(){
    if(recoveryBound || !db() || !window.fwDb.onAuthChange) return;
    recoveryBound = true;
    window.fwDb.onAuthChange(function(event){
      if(event !== 'PASSWORD_RECOVERY') return;
      recoveryRequested = true;
      authView = 'resetNew';
      mode = 'login';
      if(app() && app().setView) app().setView('profile');
      render();
    });
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
      if(touch.clientX > 44) return;
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
      if(dx >= 68 && Math.abs(dx) > Math.abs(dy) * 1.35 && elapsed <= 900){
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

      var registerForm = e.target.closest && e.target.closest('[data-register-form]');
      if(registerForm){
        e.preventDefault();
        await registerStep1(registerForm);
        return;
      }

      var verifyForm = e.target.closest && e.target.closest('[data-register-verify-form]');
      if(verifyForm){
        e.preventDefault();
        await registerStep2(verifyForm);
        return;
      }

      var resetForm = e.target.closest && e.target.closest('[data-reset-form]');
      if(resetForm){
        e.preventDefault();
        await sendPasswordReset(resetForm);
        return;
      }

      var resetPasswordForm = e.target.closest && e.target.closest('[data-reset-password-form]');
      if(resetPasswordForm){
        e.preventDefault();
        await saveResetPassword(resetPasswordForm);
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
      try{ await uploadSticker(file); }
      catch(err){ console.warn('[FW mobile app] sticker upload failed', err); app().toast(safeMessage(err, '表情添加失败。')); }
    });

    document.addEventListener('click', async function(e){
      var authBtn = e.target.closest && e.target.closest('[data-auth-view]');
      if(authBtn){
        e.preventDefault();
        authView = authBtn.dataset.authView || 'login';
        mode = 'login';
        render();
        return;
      }

      var resend = e.target.closest && e.target.closest('[data-resend-register-code]');
      if(resend){
        e.preventDefault();
        await resendRegisterCode(resend);
        return;
      }

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
        try{ await deleteSticker(del.dataset.stickerDelete); }
        catch(err){ console.warn('[FW mobile app] sticker delete failed', err); app().toast(safeMessage(err, '表情删除失败。')); }
        return;
      }

      var deleteAccount = e.target.closest && e.target.closest('[data-delete-own-account]');
      if(deleteAccount){
        e.preventDefault();
        await deleteOwnAccount(deleteAccount);
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
    bindRecoveryAuth();
    if(recoveryRequested){
      authView = 'resetNew';
      mode = 'login';
      setTimeout(function(){
        if(app() && app().setView) app().setView('profile');
        render();
      }, 0);
    }
    render();
  }

  window.FWAppProfile = {init:init, render:render};
})();
