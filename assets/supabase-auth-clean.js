// F.w 研究所：干净版账号控制器 v7
// 单一职责：注册、验证码、资料保存、登录、退出、右上角用户信息、发帖互动。
(function(){
  if(window.__FW_SUPABASE_AUTH_CLEAN_V7__) return;
  window.__FW_SUPABASE_AUTH_CLEAN_V7__ = true;

  const db = () => window.fwDb;
  const on = () => !!(db() && db().enabled && db().client);
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  let me = null;
  let registerState = { email:'', password:'', labCode:'' };
  let busy = false;
  let lastFocused = null;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));

  const normEmail = v => String(v || '').trim().toLowerCase();
  const normCode = v => String(v || '').trim().replace(/\s+/g, '').toUpperCase();
  const validCode = v => /^[A-Z0-9]{7}$/.test(normCode(v));
  const nicknameFromCode = code => '研究员' + normCode(code);

  const avatar = (name, url, m = '') => {
    if(url){
      return `<span class="fw-avatar ${m}"><img src="${esc(url)}" alt="${esc(name)}"></span>`;
    }
    return `<span class="fw-avatar ${m}">${esc(String(name || 'FW').slice(0, 2).toUpperCase())}</span>`;
  };

  function toast(msg){
    let t = $('.fw-toast');

    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }

    t.textContent = msg;
    t.classList.add('show');

    clearTimeout(window.__fwAuthCleanToast);
    window.__fwAuthCleanToast = setTimeout(() => {
      t.classList.remove('show');
    }, 3200);
  }

  function waitForDb(){
    return new Promise(resolve => {
      if(on()) return resolve(true);

      let n = 0;

      const timer = setInterval(() => {
        n += 1;

        if(on()){
          clearInterval(timer);
          resolve(true);
        }

        if(n > 120){
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  function withTimeout(promise, ms, message){
    return Promise.race([
      promise,
      new Promise(function(_, reject){
        setTimeout(function(){
          reject(new Error(message || '操作超时，请稍后重试。'));
        }, ms || 15000);
      })
    ]);
  }

  function authMsg(err){
    const msg = String((err && err.message) || err || '');

    if(/permission denied for table profiles/i.test(msg)){
      return '资料保存权限异常。请确认已运行资料保存权限修复 SQL，并刷新页面。';
    }

    if(/invalid login credentials/i.test(msg)) return '邮箱或密码不正确。';
    if(/email not confirmed/i.test(msg)) return '邮箱还没有验证，请先完成邮箱验证码验证。';
    if(/token/i.test(msg) && /expired/i.test(msg)) return '验证码已过期，请重新发送验证码。';
    if(/duplicate|unique/i.test(msg)) return '该资料已被占用，请换一个。';
    if(/rate limit|too many/i.test(msg)) return '尝试次数过多，请稍后再试。';
    if(msg.includes('实验品编号') || msg.includes('昵称')) return msg;
    if(msg.includes('User already registered')) return '这个邮箱已经注册过，请直接登录。';
    if(msg.includes('Email rate limit exceeded')) return '验证码发送太频繁，请稍后再试。';

    return msg || '操作失败，请稍后重试。';
  }

  function setLoading(btn, loading, text){
    if(!btn) return;

    if(loading){
      if(!btn.dataset.oldText){
        btn.dataset.oldText = btn.textContent;
      }

      btn.textContent = text || '处理中...';
      btn.disabled = true;
      btn.classList.add('fw-btn-loading');
    }else{
      btn.textContent = btn.dataset.oldText || '提交';
      btn.disabled = false;
      btn.classList.remove('fw-btn-loading');
    }
  }

  function css(){
    if($('#fw-auth-clean-style')) return;

    const s = document.createElement('style');
    s.id = 'fw-auth-clean-style';
    s.textContent = `
      .fw-auth-view{display:none}
      .fw-auth-view.show{display:block}
      .fw-auth-progress{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:18px 0}
      .fw-auth-progress span{border:1px solid var(--line-soft);padding:8px;border-radius:999px;text-align:center;font-size:12px;font-weight:900;color:var(--muted)}
      .fw-auth-progress span.on{background:var(--text);color:var(--white)}
      .fw-auth-links{display:flex;gap:14px;flex-wrap:wrap}
      .fw-auth-links button{border:0;background:transparent;color:var(--accent-dark);font-weight:950;text-decoration:underline;cursor:pointer}
      .fw-auth-view h3{margin:8px 0 16px;font-size:24px;letter-spacing:-.04em}
      .fw-auth-panel input{box-sizing:border-box}
      .fw-btn-loading{opacity:.65;pointer-events:none}
      body.fw-auth-open{overflow:hidden}
    `;

    document.head.appendChild(s);
  }

  function modal(){
    if($('[data-sb-auth]')) return;

    css();

    const m = document.createElement('div');
    m.className = 'fw-auth sb-auth';
    m.dataset.sbAuth = '1';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-labelledby', 'fw-auth-title');
    m.setAttribute('aria-hidden', 'true');

    m.innerHTML = `
      <div class="fw-auth-panel">
        <button class="fw-close" data-sb-close type="button" aria-label="关闭账号窗口">×</button>

        <p class="fw-kicker">FW ACCOUNT</p>
        <h2 id="fw-auth-title" data-title>账号登录</h2>
        <p class="fw-muted" data-desc>输入邮箱和密码，进入研究所。</p>

        <div class="fw-auth-progress" data-progress style="display:none">
          <span>1 填写信息</span>
          <span>2 验证邮箱</span>
        </div>

        <section class="fw-auth-view show" data-view="login">
          <form data-login class="fw-form show">
            <label>邮箱</label>
            <input name="email" type="email" placeholder="your@email.com" autocomplete="email">

            <label>密码</label>
            <input name="password" type="password" placeholder="输入账号密码" autocomplete="current-password">

            <button class="btn dark full" type="submit">登录</button>

            <p class="form-tip fw-auth-links">
              <button type="button" data-go="register1">没有账号？去注册</button>
              <button type="button" data-go="reset">忘记密码？</button>
            </p>
          </form>
        </section>

        <section class="fw-auth-view" data-view="register1">
          <form data-reg1 class="fw-form show">
            <h3>第一步：填写注册信息</h3>

            <label>邮箱</label>
            <input name="email" type="email" placeholder="用于登录和找回密码" autocomplete="email">

            <label>实验品编号</label>
            <input name="lab_code" maxlength="7" placeholder="必须 7 位，可用字母或数字，例如 FW2026A" autocomplete="off">
            <p class="form-tip">实验品编号全站唯一，注册后不可修改。</p>

            <label>密码</label>
            <input name="password" type="password" placeholder="至少 6 位，以后用它登录" autocomplete="new-password">

            <label>确认密码</label>
            <input name="password2" type="password" placeholder="再输入一次密码" autocomplete="new-password">

            <div class="fw-disclaimer">
              <label class="fw-disclaimer-line">
                <input type="checkbox" data-fw-disclaimer-check>
                <span class="fw-disclaimer-text">我已阅读并同意《F.w研究所声明》</span>
              </label>
              <p>勾选后，才能发送邮箱验证码并继续注册。</p>
            </div>

            <button class="btn dark full" type="submit">下一步，验证邮箱</button>

            <p class="form-tip fw-auth-links">
              <button type="button" data-go="login">已有账号？返回登录</button>
            </p>
          </form>
        </section>

        <section class="fw-auth-view" data-view="register2">
          <form data-reg2 class="fw-form show">
            <h3>第二步：验证邮箱</h3>
            <p class="form-tip" data-reg-email-tip>验证码已发送至你的邮箱，请输入邮件中的验证码。</p>

            <label>验证码</label>
            <input name="token" inputmode="numeric" autocomplete="one-time-code" placeholder="填写邮件里的验证码">

            <button class="btn dark full" type="submit">确认验证码，完成注册</button>

            <p class="form-tip fw-auth-links">
              <button type="button" data-resend-signup-code>重新发送验证码</button>
              <button type="button" data-go="register1">返回修改注册信息</button>
            </p>
          </form>
        </section>

        <section class="fw-auth-view" data-view="reset">
          <form data-reset class="fw-form show">
            <h3>找回密码</h3>

            <label>邮箱</label>
            <input name="email" type="email" placeholder="输入绑定邮箱">

            <button class="btn dark full" type="submit">发送找回密码邮件</button>

            <p class="form-tip fw-auth-links">
              <button type="button" data-go="login">返回登录</button>
            </p>
          </form>
        </section>

        <section class="fw-auth-view" data-view="profile">
          <form data-profile class="fw-form show">
            <h3>个人资料</h3>

            <div class="fw-profile-preview" data-profile-preview></div>

            <label>实验品编号</label>
            <input name="lab_code" maxlength="7" placeholder="7 位字母或数字">
            <p class="form-tip" data-lab-code-tip></p>

            <label>昵称</label>
            <input name="nickname" maxlength="12">
            <p class="form-tip" data-nickname-tip></p>

            <label>头像</label>
            <input name="avatar" type="file" accept="image/*">


            <button class="btn dark full" type="submit">保存资料</button>
            <button class="btn full" data-sb-logout type="button" style="margin-top:10px">退出登录</button>
            <p class="form-tip" style="margin-top:14px"><a href="rules.html" target="_blank" rel="noopener">用户规则</a> · <a href="privacy.html" target="_blank" rel="noopener">隐私政策</a></p>
            <button class="btn full" data-delete-own-account type="button" style="margin-top:10px;border-color:#9d3d3d;color:#8f3636">永久注销账号</button>
          </form>
        </section>
      </div>
    `;

    document.body.appendChild(m);
  }

  function closeAuth(){
    const authModal = $('[data-sb-auth]');
    if(!authModal) return;
    authModal.classList.remove('show');
    authModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('fw-auth-open');
    if(lastFocused && document.contains(lastFocused) && typeof lastFocused.focus === 'function'){
      lastFocused.focus();
    }
    lastFocused = null;
  }

  function show(view){
    modal();

    const authModal = $('[data-sb-auth]');

    if(authModal){
      if(!authModal.classList.contains('show')) lastFocused = document.activeElement;
      authModal.classList.add('show');
      authModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('fw-auth-open');
    }

    $$('[data-view]').forEach(x => {
      x.classList.toggle('show', x.dataset.view === view);
    });

    const map = {
      login: ['账号登录', '输入邮箱和密码，进入研究所。'],
      register1: ['注册账号', '第一步：填写注册信息。'],
      register2: ['注册账号', '第二步：验证邮箱，完成注册。'],
      reset: ['找回密码', '输入邮箱，接收找回密码邮件。'],
      profile: ['个人资料', '修改昵称、实验品编号和头像。修改密码稍后单独处理。']
    };

    const [title, desc] = map[view] || map.login;

    const titleEl = $('[data-title]');
    const descEl = $('[data-desc]');

    if(titleEl) titleEl.textContent = title;
    if(descEl) descEl.textContent = desc;

    const p = $('[data-progress]');

    if(p){
      p.style.display = /^register/.test(view) ? 'grid' : 'none';

      if(/^register/.test(view)){
        Array.from(p.children).forEach((x, i) => {
          x.classList.toggle('on', i <= (view === 'register2' ? 1 : 0));
        });
      }
    }

    if(view === 'profile'){
      fillProfile();
    }

    setTimeout(() => {
      const input = $(`[data-view="${view}"] input`);
      if(input && !input.disabled){
        input.focus();
      }
    }, 80);
  }

  function openAuth(){
    show(me ? 'profile' : 'login');
  }

  window.__FW_OPEN_AUTH__ = openAuth;

  function userbar(){
    $$('.header').forEach(h => {
      if(h.querySelector('.fw-userbar')) return;

      const b = document.createElement('div');
      b.className = 'fw-userbar fw-userbar-supabase';

      b.innerHTML = `
        <button type="button" class="fw-login-pill" data-fw-open>
          <span data-fw-avatar-slot></span>
          <span data-fw-current>注册 / 登录</span>
        </button>

        <div class="fw-profile-popover">
          <div class="fw-profile-card-head">
            <span data-fw-card-avatar></span>
            <div>
              <b data-fw-card-name>未登录</b>
              <span data-fw-card-status>点击注册 / 登录</span>
            </div>
          </div>

          <p><strong>绑定邮箱：</strong><span data-fw-card-email>未绑定</span></p>
          <p><strong>实验品编号：</strong><span data-fw-card-code>未设置</span></p>
          <p><strong>账号状态：</strong><span data-fw-card-role>游客</span></p>

          <div class="fw-profile-card-actions">
            <button type="button" data-fw-open>编辑资料</button>
            <button type="button" data-sb-logout>退出</button>
          </div>
        </div>
      `;

      h.appendChild(b);
    });
  }

  async function getCurrentUser(){
    if(!on()) return null;

    try{
      const user = await db().getCurrentUser();
      return user || null;
    }catch(e){
      console.warn('[FW auth] get user failed', e);
      return null;
    }
  }

  async function refreshUser(){
    userbar();

    me = await getCurrentUser();

    $$('[data-fw-current]').forEach(x => {
      x.textContent = me ? (me.nickname || '研究员') : '注册 / 登录';
    });

    $$('[data-fw-avatar-slot]').forEach(x => {
      x.innerHTML = me ? avatar(me.nickname, me.avatar_url, 'mini') : '';
    });

    $$('[data-fw-card-avatar]').forEach(x => {
      x.innerHTML = me ? avatar(me.nickname, me.avatar_url) : avatar('FW', '');
    });

    $$('[data-fw-card-name]').forEach(x => {
      x.textContent = me ? (me.nickname || '研究员') : '未登录';
    });

    $$('[data-fw-card-status]').forEach(x => {
      x.textContent = me ? '已进入研究所' : '点击注册 / 登录';
    });

    $$('[data-fw-card-email]').forEach(x => {
      x.textContent = me?.email || '未绑定';
    });

    $$('[data-fw-card-code]').forEach(x => {
      x.textContent = me?.lab_code || '未设置';
    });

    $$('[data-fw-card-role]').forEach(x => {
      x.textContent = me ? (me.isAdmin ? '管理员' : (me.disabled ? '已停用' : '正常')) : '游客';
    });

    $$('.fw-profile-card-actions').forEach(x => {
      x.style.display = me ? 'flex' : 'none';
    });

    updatePostNotice();

    return me;
  }

  function fillProfile(){
    const form = $('[data-profile]');

    if(!form || !me) return;

    const box = $('[data-profile-preview]');

    if(box){
      box.innerHTML = `
        ${avatar(me.nickname, me.avatar_url)}
        <div>
          <b>${esc(me.nickname || '研究员')}</b>
          <span>${esc(me.email || '')}</span>
        </div>
      `;
    }

    form.nickname.value = me.nickname || '';
    form.lab_code.value = me.lab_code || '';
    form.lab_code.disabled = !!me.lab_code;

    const tip = $('[data-lab-code-tip]');

    if(tip){
      tip.textContent = me.lab_code ? '实验品编号注册后不能修改。' : '仅未设置时可填写一次。';
    }
  }

  function updatePostNotice(){
    $$('[data-post-form]').forEach(form => {
      const notice = form.querySelector('[data-notice]');

      if(notice){
        notice.textContent = me
          ? '已登录，可以发布和互动。'
          : '登录后才能发布；未登录只能浏览，不能点赞、评论、俺也一样或递纸巾。';
      }
    });
  }

  async function loadRemotePosts(){
    if(!on()) return;

    try{
      const posts = await db().loadPosts();

      if(typeof savePosts === 'function'){
        savePosts(posts);
      }

      if(typeof renderFeeds === 'function'){
        renderFeeds();
      }
    }catch(e){
      console.warn('[FW auth] load posts failed', e);
    }
  }

  function renderOverride(){
    if(typeof window.renderPost !== 'function') return;

    window.renderPost = function(p){
      const comments = (p.comments || []).map(c => {
        return `
          <li data-comment-id="${esc(c.id)}">
            ${avatar(c.authorName, c.authorAvatar, 'mini')}
            <strong>${esc(c.authorName || '匿名回声')}</strong>
            <span>${esc(c.content)}</span>
          </li>
        `;
      }).join('');

      return `
        <article class="post-card" data-id="${p.id}" data-status="${esc(p.status)}">
          <div class="post-top">
            <span class="status">${esc(p.status)}</span>
            <span class="time">${esc(p.time || '刚刚')}</span>
          </div>

          <p class="fw-author">
            ${avatar(p.authorName, p.authorAvatar, 'mini')}
            <span>${esc(p.authorName || '匿名研究员')}</span>
          </p>

          <p class="post-content">${esc(p.content)}</p>

          <div class="interactions">
            <button data-sb-action="resonance">点赞 ${p.resonance || 0}</button>
            <button data-sb-action="comment-toggle">评论 ${(p.comments || []).length}</button>
            <button data-sb-action="same">俺也一样 ${p.same || 0}</button>
            <button data-sb-action="tissue">递纸巾 ${p.tissue || 0}</button>
          </div>

          <div class="comment-box">
            <ul class="comment-list">
              ${comments || '<li><span>还没有回声，可以先留一句。</span></li>'}
            </ul>
            <input placeholder="留一句回声，评论不限量" />
            <button class="btn dark full" data-sb-action="comment-submit" style="margin-top:10px">发送回声</button>
          </div>
        </article>
      `;
    };
  }

  async function registerStep1(form){
    if(busy) return;

    busy = true;

    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, '发送中...');

    try{
      const ok = await waitForDb();

      if(!ok){
        throw new Error('数据库连接未就绪，请刷新页面后重试。');
      }

      const fd = new FormData(form);

      const email = normEmail(fd.get('email'));
      const password = String(fd.get('password') || '').trim();
      const password2 = String(fd.get('password2') || '').trim();
      const labCode = normCode(fd.get('lab_code'));

      if(!email) throw new Error('请填写邮箱。');
      if(!validCode(labCode)) throw new Error('实验品编号必须是 7 位字母或数字。');
      if(password.length < 6) throw new Error('密码至少 6 位。');
      if(password !== password2) throw new Error('两次密码不一致。');

      if(!form.querySelector('[data-fw-disclaimer-check]')?.checked){
        throw new Error('请先勾选声明。');
      }

      const nickname = nicknameFromCode(labCode);

      const chk = await withTimeout(
        db().client.rpc('fw_check_profile_identity', {
          check_lab_code:labCode,
          check_nickname:nickname
        }),
        10000,
        '检查编号是否重复超时，请稍后重试。'
      );

      if(chk.error) throw chk.error;
      if(chk.data?.lab_code_taken) throw new Error('该编号已被注册。');
      if(chk.data?.nickname_taken) throw new Error('该昵称已被注册。');

      registerState = {
        email:email,
        password:password,
        labCode:labCode
      };

      sessionStorage.setItem('fw_register_state', JSON.stringify(registerState));

      const r = await withTimeout(
        db().client.auth.signUp({
          email:email,
          password:password,
          options:{
            data:{
              nickname:nickname,
              lab_code:labCode
            },
            emailRedirectTo:window.location.href.split('#')[0]
          }
        }),
        18000,
        '验证码发送超时，请稍后重试。'
      );

      if(r.error) throw r.error;

      const tip = $('[data-reg-email-tip]');

      if(tip){
        tip.textContent = '验证码已发送至 ' + email + '，请输入邮件中的验证码。';
      }

      show('register2');
      toast('验证码已发送。');

    }catch(e){
      toast(authMsg(e));
    }finally{
      setLoading(btn, false);
      busy = false;
    }
  }

  async function registerStep2(form){
    if(busy) return;

    busy = true;

    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, '验证中...');

    try{
      const ok = await waitForDb();

      if(!ok){
        throw new Error('数据库连接未就绪，请刷新页面后重试。');
      }

      try{
        registerState = {
          ...registerState,
          ...(JSON.parse(sessionStorage.getItem('fw_register_state') || '{}'))
        };
      }catch(e){}

      const token = String(new FormData(form).get('token') || '').trim().replace(/\s+/g, '');

      if(!registerState.email || !validCode(registerState.labCode)){
        throw new Error('注册信息丢失，请返回第一步重新填写。');
      }

      if(!token){
        throw new Error('请填写验证码。');
      }

      const verified = await withTimeout(
        db().client.auth.verifyOtp({
          email:registerState.email,
          token:token,
          type:'signup'
        }),
        18000,
        '验证码验证超时，请稍后重试。'
      );

      if(verified.error) throw verified.error;

      let user = verified.data?.user || null;

      if(!user){
        const sessionRes = await withTimeout(
          db().client.auth.getSession(),
          8000,
          '读取登录状态超时，请刷新后登录。'
        );

        user = sessionRes.data?.session?.user || null;
      }

      if(!user?.id){
        throw new Error('邮箱已验证，但登录状态未同步，请刷新后登录。');
      }

      const patch = {
        nickname:nicknameFromCode(registerState.labCode),
        lab_code:registerState.labCode,
        email_search:registerState.email,
        updated_at:new Date().toISOString()
      };

      const saved = await withTimeout(
        db().client
          .from('profiles')
          .update(patch)
          .eq('id', user.id)
          .select('id,lab_code,nickname')
          .maybeSingle(),
        10000,
        '保存实验品编号超时，请稍后重试。'
      );

      if(saved.error) throw saved.error;

      const registeredEmail = registerState.email;

      sessionStorage.removeItem('fw_register_state');

      await db().client.auth.signOut().catch(() => {});

      toast('注册成功，请登录。');

      show('login');

      const login = $('[data-login]');

      if(login){
        login.email.value = registeredEmail;
        login.password.value = '';
      }

    }catch(e){
      toast(authMsg(e));
    }finally{
      setLoading(btn, false);
      busy = false;
    }
  }

  async function login(form){
    if(busy) return;

    busy = true;

    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, '登录中...');

    try{
      const ok = await waitForDb();

      if(!ok){
        throw new Error('数据库连接未就绪，请刷新页面后重试。');
      }

      const fd = new FormData(form);
      const email = normEmail(fd.get('email'));
      const password = String(fd.get('password') || '').trim();

      if(!email || !password){
        throw new Error('请填写邮箱和密码。');
      }

      const r = await withTimeout(
        db().client.auth.signInWithPassword({
          email:email,
          password:password
        }),
        30000,
        '登录请求超时，请检查网络后重试。'
      );

      if(r.error) throw r.error;

      toast('登录成功，正在进入研究所。');

      closeAuth();

      setTimeout(() => {
        window.location.reload();
      }, 450);

    }catch(e){
      toast(authMsg(e));
      setLoading(btn, false);
      busy = false;
    }
  }

  async function logout(){
    toast('正在退出...');

    try{
      if(on()){
        await db().client.auth.signOut();
      }
    }catch(e){}

    try{
      Object.keys(localStorage).forEach(k => {
        if(/^sb-|supabase|fw_register_state/i.test(k)){
          localStorage.removeItem(k);
        }
      });

      Object.keys(sessionStorage).forEach(k => {
        if(/^sb-|supabase|fw_register_state/i.test(k)){
          sessionStorage.removeItem(k);
        }
      });
    }catch(e){}

    setTimeout(() => {
      window.location.href = window.location.origin + window.location.pathname.replace(/[^/]*$/, 'index.html') + '?logout=' + Date.now();
    }, 300);
  }

  async function saveProfile(form){
    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, '保存中...');

    try{
      const fd = new FormData(form);
      const nick = String(fd.get('nickname') || '').trim();
      const avatarFile = fd.get('avatar');

      await withTimeout(
        db().updateProfile({
          nickname:nick,
          avatarFile:avatarFile && avatarFile.size ? avatarFile : null
        }),
        20000,
        '资料保存超时，请稍后重试。'
      );

      toast('资料已保存。');
      await refreshUser();

      closeAuth();

    }catch(e){
      toast(authMsg(e));
    }finally{
      setLoading(btn, false);
    }
  }

  async function handlePostSubmit(form){
    if(!on()) return;

    try{
      if(!me){
        toast('请先登录再发布。');
        show('login');
        return;
      }

      const textarea = form.querySelector('textarea');
      const content = String(textarea?.value || '').trim();

      if(!content){
        textarea?.focus();
        return;
      }

      const active = form.querySelector('.chip.active[data-status]');
      const status = active?.dataset.status || '今日无效';

      await db().createPost({
        content:content,
        status:status
      });

      if(textarea){
        textarea.value = '';
      }

      toast('已投递到研究所。');
      await loadRemotePosts();

    }catch(e){
      toast(authMsg(e));
    }
  }

  async function handlePostAction(btn){
    const card = btn.closest('.post-card');

    if(!card) return;

    if(!me){
      toast('请先登录再互动。');
      show('login');
      return;
    }

    const postId = Number(card.dataset.id);
    const action = btn.dataset.sbAction;

    try{
      if(action === 'comment-toggle'){
        card.querySelector('.comment-box')?.classList.toggle('show');
        return;
      }

      if(action === 'comment-submit'){
        const input = card.querySelector('.comment-box input');
        const content = String(input?.value || '').trim();

        if(!content){
          input?.focus();
          return;
        }

        await db().createComment({
          postId:postId,
          content:content
        });

        if(input){
          input.value = '';
        }

        toast('回声已发送。');
        await loadRemotePosts();
        return;
      }

      const map = {
        resonance:'resonance',
        same:'same',
        tissue:'tissue'
      };

      if(map[action]){
        const r = await db().react({
          postId:postId,
          type:map[action]
        });

        toast(r && r.already ? '你已经表达过了。' : '已收到。');
        await loadRemotePosts();
      }

    }catch(e){
      toast(authMsg(e));
    }
  }

  function bind(){
    document.body.addEventListener('click', e => {
      if(e.target.closest('[data-fw-open], [data-login-cta]')){
        openAuth();
      }

      if(e.target.closest('[data-sb-close]')){
        closeAuth();
      }

      if(e.target.matches && e.target.matches('[data-sb-auth].show')) closeAuth();

      if(e.target.closest('[data-sb-logout]')){
        e.preventDefault();
        e.stopPropagation();
        logout();
      }

      const deleteAccountButton = e.target.closest('[data-delete-own-account]');

      if(deleteAccountButton){
        e.preventDefault();
        e.stopPropagation();
        deleteOwnAccount(deleteAccountButton);
        return;
      }

      const go = e.target.closest('[data-go]');

      if(go){
        show(go.dataset.go);
      }

      if(e.target.closest('[data-resend-signup-code]')){
        const f = $('[data-reg1]');

        if(f){
          registerStep1(f);
        }
      }

      const btn = e.target.closest('button[data-sb-action]');

      if(btn){
        e.preventDefault();
        handlePostAction(btn);
      }
    });

    document.body.addEventListener('submit', e => {
      const loginForm = e.target.closest('[data-login]');
      const reg1 = e.target.closest('[data-reg1]');
      const reg2 = e.target.closest('[data-reg2]');
      const reset = e.target.closest('[data-reset]');
      const profile = e.target.closest('[data-profile]');
      const postForm = e.target.closest('[data-post-form]');

      if(loginForm){
        e.preventDefault();
        login(loginForm);
        return;
      }

      if(reg1){
        e.preventDefault();
        registerStep1(reg1);
        return;
      }

      if(reg2){
        e.preventDefault();
        registerStep2(reg2);
        return;
      }

      if(reset){
        e.preventDefault();
        resetPassword(reset);
        return;
      }

      if(profile){
        e.preventDefault();
        saveProfile(profile);
        return;
      }

      if(postForm && on()){
        e.preventDefault();
        handlePostSubmit(postForm);
      }
    });
  }

  async function resetPassword(form){
    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, '发送中...');

    try{
      const email = normEmail(new FormData(form).get('email'));

      if(!email){
        throw new Error('请填写邮箱。');
      }

      await db().sendPasswordReset({
        email:email
      });

      toast('找回密码邮件已发送。');
      show('login');

    }catch(e){
      toast(authMsg(e));
    }finally{
      setLoading(btn, false);
    }
  }

  async function deleteOwnAccount(btn){
    if(!me){
      toast('请先登录。');
      return;
    }

    if(me.isAdmin){
      toast('管理员账号不能直接注销，请先转移管理员身份。');
      return;
    }

    if(!window.confirm('注销后，账号、帖子、评论、互动、搭子关系和个人文件将被永久删除。是否继续？')) return;
    const phrase = window.prompt('请输入“删除账号”确认永久注销：', '');
    if(String(phrase || '').trim() !== '删除账号'){
      toast('确认文字不正确，已取消注销。');
      return;
    }

    setLoading(btn, true, '注销中...');
    try{
      if(!db().deleteOwnAccount){
        throw new Error('账号注销功能尚未启用，请更新数据库补丁。');
      }
      await db().deleteOwnAccount();
      me = null;
      closeAuth();
      await refreshUser();
      await loadRemotePosts();
      toast('账号已注销。');
    }catch(e){
      toast(authMsg(e));
    }finally{
      setLoading(btn, false);
    }
  }

  document.addEventListener('keydown', e => {
    const authModal = $('[data-sb-auth].show');
    if(!authModal) return;
    if(e.key === 'Escape'){
      e.preventDefault();
      closeAuth();
      return;
    }
    if(e.key !== 'Tab') return;
    const focusable = $$('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled])')
      .filter(x => authModal.contains(x) && x.offsetParent !== null);
    if(!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if(e.shiftKey && document.activeElement === first){
      e.preventDefault();
      last.focus();
    }else if(!e.shiftKey && document.activeElement === last){
      e.preventDefault();
      first.focus();
    }
  });

  async function boot(){
    css();
    modal();
    userbar();
    renderOverride();
    bind();

    if(window.__FW_AUTH_OPEN_PENDING__){
      window.__FW_AUTH_OPEN_PENDING__ = false;
      openAuth();
    }

    const ok = await waitForDb();

    if(!ok){
      await refreshUser();
      return;
    }

    await refreshUser();
    await loadRemotePosts();

    if(on() && db().onAuthChange){
      db().onAuthChange(async () => {
        await refreshUser();
        await loadRemotePosts();
      });
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }else{
    boot();
  }
})();
