(function(){
  if(window.FWAppProfile) return;

  var bound = false;

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function esc(value){ return app().esc(value); }

  function loggedInHtml(user){
    return '<section class="profile-card">' +
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
    '</section>';
  }

  function loggedOutHtml(){
    return '<section class="login-card">' +
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
    '</section>';
  }

  function render(){
    var panel = $('[data-profile-panel]');
    if(!panel) return;
    panel.innerHTML = app().state.user ? loggedInHtml(app().state.user) : loggedOutHtml();
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
    return msg || fallback;
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
          app().toast('已登录');
          app().setView('nav');
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
          app().toast('已进入研究所');
          app().setView('nav');
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
          app().toast('资料已保存');
        }catch(err){
          app().toast(safeMessage(err, '资料保存失败。'));
        }finally{
          setBusy(save, false);
        }
      }
    });

    document.addEventListener('click', async function(e){
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
    bind();
    render();
  }

  window.FWAppProfile = {init:init, render:render};
})();
