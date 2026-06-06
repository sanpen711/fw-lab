(function(){
  if(window.__FW_MOBILE_PROFILE_LOGIN_UI__) return;
  window.__FW_MOBILE_PROFILE_LOGIN_UI__ = true;

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.from((root || document).querySelectorAll(selector)); }

  function injectStyle(){
    if($('#fwMobileLoginUiStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileLoginUiStyle';
    style.textContent = [
      '.mobile-login-ui{display:grid;gap:14px}',
      '.mobile-login-ui .subtle-line{display:none}',
      '.mobile-login-kicker{margin:0;color:var(--accent-dark);font-size:12px;font-weight:1000;letter-spacing:.18em;text-transform:uppercase}',
      '.mobile-login-title{margin:0;color:var(--deep);font-size:34px;line-height:.95;letter-spacing:-.08em;font-weight:1000}',
      '.mobile-login-desc{margin:0;color:var(--muted);font-size:15px;line-height:1.5;font-weight:900}',
      '.mobile-login-panel{display:none}',
      '.mobile-login-panel.show{display:block}',
      '.mobile-login-links{display:flex;gap:18px;flex-wrap:wrap;margin:6px 0 0}',
      '.mobile-login-links button{border:0;background:transparent;color:var(--accent-dark);padding:0;font-size:13px;font-weight:1000;text-decoration:underline}',
      '.mobile-login-note{margin:0;color:var(--muted);font-size:12px;line-height:1.55;font-weight:850}',
      '.mobile-login-ui .stack{gap:12px}',
      '.profile-login-entry{padding-bottom:calc(var(--tabbar-total-h,88px) + 12px)}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function setPanel(root, name){
    $$('[data-mobile-login-panel]', root).forEach(function(panel){
      panel.classList.toggle('show', panel.dataset.mobileLoginPanel === name);
    });
    var title = $('[data-mobile-login-title]', root);
    var desc = $('[data-mobile-login-desc]', root);
    var entry = root.closest('.profile-login-entry');
    var head = entry && $('[data-mobile-login-head]', entry);
    if(name === 'register'){
      if(head) head.textContent = '注册账号';
      if(title) title.textContent = '注册账号';
      if(desc) desc.textContent = '填写昵称和邮箱，接收验证码后进入研究所。';
    }else{
      if(head) head.textContent = '账号登录';
      if(title) title.textContent = '账号登录';
      if(desc) desc.textContent = '输入邮箱和密码，进入研究所。';
    }
  }

  function rebuild(entry){
    if(!entry || $('[data-mobile-login-ui]', entry)) return;
    var loginForm = $('[data-login-form]', entry);
    var otpForm = $('[data-otp-form]', entry);
    if(!loginForm || !otpForm) return;

    injectStyle();
    var headTitle = $('.profile-detail-head h2', entry);
    if(headTitle){
      headTitle.textContent = '账号登录';
      headTitle.setAttribute('data-mobile-login-head', '1');
    }

    var shell = document.createElement('div');
    shell.className = 'mobile-login-ui';
    shell.setAttribute('data-mobile-login-ui', '1');
    shell.innerHTML = '<p class="mobile-login-kicker">FW ACCOUNT</p>' +
      '<h1 class="mobile-login-title" data-mobile-login-title>账号登录</h1>' +
      '<p class="mobile-login-desc" data-mobile-login-desc>输入邮箱和密码，进入研究所。</p>';

    var loginPanel = document.createElement('section');
    loginPanel.className = 'mobile-login-panel show';
    loginPanel.dataset.mobileLoginPanel = 'login';
    loginPanel.appendChild(loginForm);
    var loginSubmit = loginForm.querySelector('button[type="submit"]');
    if(loginSubmit) loginSubmit.textContent = '登录';
    loginForm.insertAdjacentHTML('beforeend', '<p class="mobile-login-links"><button type="button" data-mobile-login-go="register">没有账号？去注册</button></p>');

    var regPanel = document.createElement('section');
    regPanel.className = 'mobile-login-panel';
    regPanel.dataset.mobileLoginPanel = 'register';
    var nickLabel = otpForm.querySelector('label[for="otpNickname"]');
    if(nickLabel) nickLabel.textContent = '昵称';
    var emailLabel = otpForm.querySelector('label[for="otpEmail"]');
    if(emailLabel) emailLabel.textContent = '邮箱验证码注册 / 登录';
    var token = otpForm.querySelector('input[name="token"]');
    if(token) token.placeholder = '输入邮箱验证码';
    var submit = otpForm.querySelector('button[type="submit"]');
    if(submit) submit.textContent = '验证进入';
    otpForm.insertAdjacentHTML('beforeend', '<p class="mobile-login-note">没有账号时，先填写昵称和邮箱，发送验证码后即可进入。</p><p class="mobile-login-links"><button type="button" data-mobile-login-go="login">已有账号？返回登录</button></p>');
    regPanel.appendChild(otpForm);

    var card = $('.login-card', entry);
    if(!card) return;
    card.innerHTML = '';
    shell.appendChild(loginPanel);
    shell.appendChild(regPanel);
    card.appendChild(shell);
  }

  function scan(){ rebuild($('.profile-login-entry')); }

  document.addEventListener('click', function(event){
    var btn = event.target.closest && event.target.closest('[data-mobile-login-go]');
    if(!btn) return;
    var root = btn.closest('[data-mobile-login-ui]');
    if(!root) return;
    event.preventDefault();
    event.stopPropagation();
    setPanel(root, btn.dataset.mobileLoginGo || 'login');
  }, true);

  function watch(){
    scan();
    var panel = $('[data-profile-panel]');
    if(panel && !panel.__fwMobileLoginUiObserver){
      panel.__fwMobileLoginUiObserver = new MutationObserver(scan);
      panel.__fwMobileLoginUiObserver.observe(panel, {childList:true, subtree:false});
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
  window.addEventListener('pageshow', watch);
  document.addEventListener('click', function(){ setTimeout(scan, 0); }, true);
})();
