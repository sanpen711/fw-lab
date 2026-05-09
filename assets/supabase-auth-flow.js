// F.w 研究所：Supabase 登录 / 注册 / 资料单一控制器（简化注册：信息填写 + 邮箱验证码｜profiles权限修复适配版）
// 说明：
// 1. 这个文件独立负责登录、注册三步、个人资料、退出。
// 2. 不再依赖 fw-lab-code.js / fw-auth-stability-fix.js / supabase-logout-fix.js 抢事件。
// 3. 注册第一步创建待确认账号并发送验证码；第二步验证成功后完善资料并返回登录页。
(function(){
  if(window.__FW_SUPABASE_AUTH_FLOW_CLEAN__) return;
  window.__FW_SUPABASE_AUTH_FLOW_CLEAN__ = true;

  const db = () => window.fwDb;
  const on = () => !!db()?.enabled;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  let me = null;
  let booted = false;
  let regEmail = '';
  let regPassword = '';
  let regLabCode = '';
  let regNickname = '';
  let recovery = false;
  let busy = false;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));

  const ini = v => String(v || 'FW').trim().slice(0, 2).toUpperCase();

  const av = (name, url, m='') => url
    ? `<span class="fw-avatar ${m}"><img src="${esc(url)}" alt="${esc(name)}"></span>`
    : `<span class="fw-avatar ${m}">${esc(ini(name))}</span>`;

  function toast(msg){
    let t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwToast);
    window.__fwToast = setTimeout(() => t.classList.remove('show'), 3200);
  }

  function waitForDb(){
    return new Promise(resolve => {
      if(on()) return resolve(true);
      let count = 0;
      const timer = setInterval(() => {
        count++;
        if(on()){
          clearInterval(timer);
          resolve(true);
        }
        if(count > 120){
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  function withTimeout(promise, ms, message){
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message || '操作超时，请稍后重试。')), ms || 15000);
      })
    ]);
  }

  function normalizeLabCode(value){
    return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
  }

  function validLabCode(value){
    return /^[A-Z0-9]{7}$/.test(normalizeLabCode(value));
  }

  function normalizeNickname(value){
    return String(value || '').trim();
  }

  function validNickname(value){
    const n = normalizeNickname(value);
    return n.length >= 2 && n.length <= 12;
  }

  function formatDbError(error){
    const text = String(error?.message || error || '');
    if(text.includes('profiles_lab_code_key_unique')) return '该编号已被注册。';
    if(text.includes('profiles_nickname_key_unique')) return '这个昵称已经被占用。';
    if(text.includes('实验品编号')) return text;
    if(text.includes('昵称')) return text;
    if(text.includes('duplicate')) return '该资料已被占用，请换一个。';
    return text || '操作失败。';
  }

  function setBtnLoading(btn, loading, text){
    if(!btn) return;
    if(loading){
      if(!btn.dataset.oldText) btn.dataset.oldText = btn.textContent;
      btn.textContent = text || '处理中...';
      btn.disabled = true;
      btn.classList.add('fw-btn-loading');
    }else{
      btn.textContent = btn.dataset.oldText || btn.textContent || '提交';
      btn.disabled = false;
      btn.classList.remove('fw-btn-loading');
    }
  }

  function clearSupabaseLocalSession(){
    try{
      [localStorage, sessionStorage].forEach(store => {
        Object.keys(store).forEach(k => {
          if(/^sb-/.test(k) || k.includes('supabase') || k.includes('auth-token')){
            store.removeItem(k);
          }
        });
      });
    }catch(e){}
  }

  function css(){
    if($('#fw-auth-flow-style')) return;
    const s = document.createElement('style');
    s.id = 'fw-auth-flow-style';
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
    `;
    document.head.appendChild(s);
  }

  async function getCurrentUserClean(){
    if(!on()) return null;

    const baseUser = await db().getCurrentUser().catch(() => null);
    if(!baseUser) return null;

    try{
      const {data} = await db().client
        .from('profiles')
        .select('id,nickname,avatar_url,role,is_banned,created_at,lab_code,email_search,nickname_change_year,nickname_change_count')
        .eq('id', baseUser.id)
        .maybeSingle();

      if(data){
        return {
          ...baseUser,
          nickname: data.nickname || baseUser.nickname || '临时研究员',
          avatar_url: data.avatar_url || baseUser.avatar_url || '',
          role: data.role || baseUser.role || 'user',
          isAdmin: data.role === 'admin',
          disabled: !!data.is_banned,
          lab_code: data.lab_code || '',
          email_search: data.email_search || '',
          nickname_change_year: data.nickname_change_year,
          nickname_change_count: data.nickname_change_count
        };
      }
    }catch(e){}

    return baseUser;
  }

  async function getSessionUser(){
    if(!db()?.client) return null;

    const {data, error} = await db().client.auth.getSession();
    if(error) throw error;
    if(data?.session?.user) return data.session.user;

    return null;
  }

  function avatarPathFromUrl(url){
    const raw = String(url || '');
    if(!raw) return '';
    const marker = '/storage/v1/object/public/avatars/';
    const idx = raw.indexOf(marker);
    if(idx < 0) return '';
    return decodeURIComponent(raw.slice(idx + marker.length).split('?')[0]);
  }

  async function deleteOldAvatar(oldUrl, newUrl){
    if(!oldUrl || !newUrl || oldUrl === newUrl) return;
    const path = avatarPathFromUrl(oldUrl);
    if(!path) return;
    try{
      await db().client.storage.from('avatars').remove([path]);
    }catch(e){
      console.warn('old avatar remove failed:', e);
    }
  }

  async function uploadAvatar(userId, file){
    if(!file || !file.size) return '';
    const safeName = String(file.name || 'avatar.png').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${userId}/${Date.now()}_${safeName}`;
    const uploaded = await db().client.storage.from('avatars').upload(path, file, {
      upsert: true,
      cacheControl: '3600'
    });

    if(uploaded.error) throw new Error('头像上传失败：' + uploaded.error.message);

    return db().client.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  }

  async function checkIdentity({labCode=null, nickname=null}){
    if(!on()) return {};
    const {data, error} = await db().client.rpc('fw_check_profile_identity', {
      check_lab_code: labCode,
      check_nickname: nickname
    });
    if(error) return {};
    return data || {};
  }

  async function saveProfileClean({nickname, labCode, avatarFile, password}={}){
    const user = await getSessionUser();
    if(!user) throw new Error('请先登录。');

    let oldProfile = null;
    try{
      const old = await db().client
        .from('profiles')
        .select('id,nickname,avatar_url,lab_code')
        .eq('id', user.id)
        .maybeSingle();
      oldProfile = old.data || null;
    }catch(e){}

    const patch = {updated_at: new Date().toISOString()};

    if(nickname !== undefined && String(nickname || '').trim() !== ''){
      nickname = normalizeNickname(nickname);
      if(!validNickname(nickname)) throw new Error('昵称需要 2-12 个字符。');
      patch.nickname = nickname;
    }

    if(labCode !== undefined && String(labCode || '').trim() !== ''){
      labCode = normalizeLabCode(labCode);
      if(!validLabCode(labCode)) throw new Error('实验品编号必须是 7 位字母或数字。');
      patch.lab_code = labCode;
    }

    if(avatarFile && avatarFile.size){
      patch.avatar_url = await uploadAvatar(user.id, avatarFile);
    }

    if(password && String(password).trim()){
      const pwd = String(password).trim();
      if(pwd.length < 6) throw new Error('密码至少 6 位。');
      const r = await withTimeout(
        db().client.auth.updateUser({password: pwd}),
        16000,
        '密码保存超时，请检查网络后重试。'
      );
      if(r.error) throw new Error(r.error.message);
    }

    let result = oldProfile;
    if(Object.keys(patch).length > 1){
      const res = await db().client
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .select('id,nickname,avatar_url,role,is_banned,lab_code,nickname_change_year,nickname_change_count')
        .maybeSingle();

      if(res.error) throw new Error(formatDbError(res.error));
      result = res.data || result;
    }

    if(patch.avatar_url){
      await deleteOldAvatar(oldProfile?.avatar_url, patch.avatar_url);
    }

    return result;
  }

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

  async function refreshUser(){
    if(!on()) return;
    userbar();

    me = await getCurrentUserClean().catch(() => null);

    $$('[data-fw-current]').forEach(x => x.textContent = me ? me.nickname : '注册 / 登录');
    $$('[data-fw-avatar-slot]').forEach(x => x.innerHTML = me ? av(me.nickname, me.avatar_url, 'mini') : '');
    $$('[data-fw-card-avatar]').forEach(x => x.innerHTML = me ? av(me.nickname, me.avatar_url) : av('FW',''));
    $$('[data-fw-card-name]').forEach(x => x.textContent = me ? me.nickname : '未登录');
    $$('[data-fw-card-status]').forEach(x => x.textContent = me ? '已进入研究所' : '点击注册 / 登录');
    $$('[data-fw-card-email]').forEach(x => x.textContent = me?.email || '未绑定');
    $$('[data-fw-card-code]').forEach(x => x.textContent = me?.lab_code || '未设置');
    $$('[data-fw-card-role]').forEach(x => x.textContent = me ? (me.isAdmin ? '管理员' : (me.disabled ? '已停用' : '正常')) : '游客');
    $$('.fw-profile-card-actions').forEach(x => x.style.display = me ? 'flex' : 'none');

    return me;
  }

  async function refreshPosts(){
    if(!on()) return;
    const posts = await db().loadPosts();
    if(typeof savePosts === 'function') savePosts(posts);
    if(typeof renderFeeds === 'function') renderFeeds();
  }

  function renderOverride(){
    if(!on() || typeof window.renderPost !== 'function') return;

    window.renderPost = function(p){
      const comments = (p.comments || []).map(c => `
        <li data-comment-id="${esc(c.id)}">
          ${av(c.authorName, c.authorAvatar, 'mini')}
          <strong>${esc(c.authorName || '匿名回声')}</strong>
          <span>${esc(c.content)}</span>
          ${me?.isAdmin ? `<button type="button" class="fw-text-danger" data-sb-admin="delete-comment" data-comment-id="${esc(c.id)}">删除</button>` : ''}
        </li>
      `).join('');

      return `
        <article class="post-card" data-id="${p.id}" data-status="${esc(p.status)}">
          <div class="post-top"><span class="status">${esc(p.status)}</span><span class="time">${esc(p.time || '刚刚')}</span></div>
          <p class="fw-author">${av(p.authorName, p.authorAvatar, 'mini')}<span>${esc(p.authorName || '匿名研究员')}</span></p>
          <p class="post-content">${esc(p.content)}</p>
          <div class="interactions">
            <button data-sb-action="resonance">点赞 ${p.resonance || 0}</button>
            <button data-sb-action="comment-toggle">评论 ${(p.comments || []).length}</button>
            <button data-sb-action="same">俺也一样 ${p.same || 0}</button>
            <button data-sb-action="tissue">递纸巾 ${p.tissue || 0}</button>
            ${me?.isAdmin ? `<button class="fw-danger-pill" data-sb-admin="delete-post" data-post-id="${p.id}">删帖</button>` : ''}
          </div>
          <div class="comment-box">
            <ul class="comment-list">${comments || '<li><span>还没有回声，可以先留一句。</span></li>'}</ul>
            <input placeholder="留一句回声，评论不限量" />
            <button class="btn dark full" data-sb-action="comment-submit" style="margin-top:10px">发送回声</button>
          </div>
        </article>
      `;
    };
  }

  function statementModalHtml(){
    return `
      <div class="fw-statement-modal" data-fw-statement-modal>
        <div class="fw-statement-panel" role="dialog" aria-modal="true" aria-label="F.w研究所声明">
          <header class="fw-statement-head">
            <div>
              <small>FW LAB STATEMENT</small>
              <h2>F.w研究所声明</h2>
            </div>
            <button type="button" class="fw-statement-close" data-fw-statement-close>×</button>
          </header>
          <div class="fw-statement-body">
            <section><h3>一、平台定位</h3><p>F.w 研究所是一个供用户低功耗交流、发牢骚、摸鱼、放置情绪和进行轻量社交的社区空间。这里不是心理咨询、医疗服务、法律咨询、职业顾问或紧急求助平台。</p></section>
            <section><h3>二、内容责任</h3><p>你需要对自己发布的内容负责。请不要发布违法违规、攻击辱骂、骚扰威胁、歧视仇恨、色情低俗、暴力血腥、诈骗引流、广告营销、侵犯他人权益或诱导他人危险行为的内容。</p></section>
            <section><h3>三、隐私保护</h3><p>请不要在帖子、评论、房间消息或私聊里公开真实姓名、电话、住址、身份证件、公司全称、工号、客户信息、聊天截图等敏感信息。你发布在公共区域的内容可能被其他用户看到、引用、互动或进入榜单统计。</p></section>
            <section><h3>四、账号与实验品编号</h3><p>实验品编号用于识别和搜索用户，全站唯一，注册后不可修改。昵称全站唯一，每年最多修改 5 次。请勿冒充管理员、官方账号或其他用户。</p></section>
            <section><h3>五、搭子与私聊</h3><p>搭子和私聊功能用于轻量交流。请勿骚扰、刷屏、引流、索要隐私、发送不适内容或绕过平台规则。平台可以根据举报或异常情况限制搭子申请、私聊、发言或账号使用。</p></section>
            <section><h3>六、内容处理</h3><p>如果内容被举报、触发风控或明显不适合展示，平台可以进行隐藏、删除、限制互动、禁言、封禁账号等处理。部分互动数据可能用于“废话档案”等榜单展示。</p></section>
            <section><h3>七、重要提醒</h3><p>如果你正在经历严重焦虑、抑郁、伤害自己或他人的想法，或遇到现实紧急危险，请立即联系身边可信任的人、当地紧急服务或专业机构。F.w 研究所不能替代现实中的专业帮助。</p></section>
            <section><h3>八、确认</h3><p>勾选注册页面的确认框，即表示你已阅读并理解本声明，并愿意遵守 F.w 研究所的基本规则。</p></section>
          </div>
          <footer class="fw-statement-foot">
            <button type="button" data-fw-statement-close>我知道了</button>
          </footer>
        </div>
      </div>
    `;
  }

  function modal(){
    if($('[data-sb-auth]')) return;

    css();

    const m = document.createElement('div');
    m.className = 'fw-auth sb-auth';
    m.dataset.sbAuth = '1';
    m.innerHTML = `
      <div class="fw-auth-panel">
        <button class="fw-close" data-sb-close type="button">×</button>
        <p class="fw-kicker">FW ACCOUNT</p>
        <h2 data-title>账号登录</h2>
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

            <div class="fw-disclaimer" data-fw-disclaimer>
              <label class="fw-disclaimer-line">
                <input type="checkbox" data-fw-disclaimer-check>
                <span class="fw-disclaimer-text">我已阅读并同意 <button type="button" data-fw-statement-open>《F.w研究所声明》</button></span>
              </label>
              <p>勾选后，才能发送邮箱验证码并继续注册。</p>
            </div>

            <button class="btn dark full" type="submit">下一步，验证邮箱</button>
            <p class="form-tip fw-auth-links"><button type="button" data-go="login">已有账号？返回登录</button></p>
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
            <p class="form-tip fw-auth-links"><button type="button" data-go="login">返回登录</button></p>
          </form>
        </section>

        <section class="fw-auth-view" data-view="newpass">
          <form data-newpass class="fw-form show">
            <h3>设置新密码</h3>
            <label>新密码</label>
            <input name="password" type="password" placeholder="至少 6 位" autocomplete="new-password">
            <label>确认新密码</label>
            <input name="password2" type="password" placeholder="再输入一次" autocomplete="new-password">
            <button class="btn dark full" type="submit">保存新密码</button>
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

            <label>修改密码 / 可选</label>
            <input name="password" type="password" placeholder="不修改就留空" autocomplete="new-password">
            <button class="btn dark full" type="submit">保存资料</button>
            <button class="btn full" data-sb-logout type="button" style="margin-top:10px">退出登录</button>
          </form>
        </section>
      </div>
      ${statementModalHtml()}
    `;

    document.body.appendChild(m);
  }

  function copy(viewName){
    const map = {
      login: ['账号登录','输入邮箱和密码，进入研究所。'],
      register1: ['注册账号','第一步：填写注册信息。'],
      register2: ['注册账号','第二步：验证邮箱，完成注册。'],
      register3: ['注册账号','第三步：完成。'],
      reset: ['找回密码','输入邮箱，接收找回密码邮件。'],
      newpass: ['设置新密码','请输入并确认新密码。'],
      profile: ['个人资料','修改昵称、实验品编号、头像或密码。']
    };

    const [title, desc] = map[viewName] || map.login;
    $('[data-title]').textContent = title;
    $('[data-desc]').textContent = desc;

    const p = $('[data-progress]');
    p.style.display = /register/.test(viewName) ? 'grid' : 'none';

    if(/register/.test(viewName)){
      const n = {register1:0, register2:1}[viewName] ?? 0;
      Array.from(p.children).forEach((x, i) => x.classList.toggle('on', i <= n));
    }
  }

  function show(viewName){
    modal();
    $$('[data-view]').forEach(x => x.classList.toggle('show', x.dataset.view === viewName));
    copy(viewName);
    setTimeout(() => $(`[data-view="${viewName}"] input`)?.focus(), 80);
  }

  function currentView(){
    const modal = $('[data-sb-auth]');
    if(!modal || !modal.classList.contains('show')) return '';
    return modal.querySelector('[data-view].show')?.dataset?.view || '';
  }

  function isRegisterMidway(){
    const v = currentView();
    return v === 'register2';
  }

  async function isIncompleteRegistration(){
    if(!on()) return false;

    const user = await getSessionUser().catch(() => null);
    if(!user) return false;

    const {data} = await db().client
      .from('profiles')
      .select('id,nickname,lab_code')
      .eq('id', user.id)
      .maybeSingle()
      .catch(() => ({data:null}));

    return !data?.lab_code && (!data?.nickname || data.nickname === '临时研究员');
  }

  async function signOutFast(message='已退出。'){
    if(window.__FW_SIGNING_OUT__) return;
    window.__FW_SIGNING_OUT__ = true;

    toast(message);

    try{
      if(db()?.client){
        await withTimeout(db().client.auth.signOut(), 4500, '退出超时');
      }
    }catch(e){}

    clearSupabaseLocalSession();
    me = null;

    $$('[data-fw-current]').forEach(x => x.textContent = '注册 / 登录');
    $$('[data-fw-avatar-slot]').forEach(x => x.innerHTML = '');

    setTimeout(() => window.location.reload(), 450);
  }

  async function abandonIncomplete(){
    const incomplete = await isIncompleteRegistration().catch(() => false);
    if(incomplete){
      await signOutFast('本次注册未完成，已默认放弃。');
    }
  }

  function closeModal(){
    if(isRegisterMidway()){
      abandonIncomplete();
    }
    $('[data-sb-auth]')?.classList.remove('show');
  }

  function fillProfile(){
    const box = $('[data-profile-preview]');
    const nick = $('[data-profile] input[name="nickname"]');
    const code = $('[data-profile] input[name="lab_code"]');
    const codeTip = $('[data-lab-code-tip]');
    const nickTip = $('[data-nickname-tip]');

    if(box){
      box.innerHTML = me
        ? `${av(me.nickname, me.avatar_url)}<div><b>${esc(me.nickname)}</b><span>${esc(me.email || '已绑定邮箱')}</span>${me.lab_code ? `<p class="fw-lab-code-line">实验品编号：${esc(me.lab_code)}</p>` : ''}</div>`
        : '<p class="fw-muted">登录后可以修改资料。</p>';
    }

    if(nick) nick.value = me?.nickname || '';

    if(code){
      code.value = me?.lab_code || '';
      code.disabled = !!me?.lab_code;
      code.title = me?.lab_code ? '实验品编号注册后不能修改' : '';
    }

    if(codeTip){
      codeTip.textContent = me?.lab_code
        ? '实验品编号是唯一编号，注册后不能修改。'
        : '旧账号还没有实验品编号，请设置 7 位字母或数字。设置后不能修改。';
    }

    if(nickTip){
      const year = new Date().getFullYear();
      const y = Number(me?.nickname_change_year || year);
      const c = (y === year) ? Number(me?.nickname_change_count || 0) : 0;
      nickTip.textContent = `昵称全站唯一，每年最多修改 5 次。本年度已修改 ${c}/5 次。`;
    }
  }

  function openModal(viewName, opts={}){
    modal();
    fillProfile();
    $('[data-sb-auth]').classList.add('show');

    const target = viewName || (recovery ? 'newpass' : (me ? 'profile' : 'login'));
    show(target);

    if(target === 'login'){
      const emailInput = $('[data-login] input[name="email"]');
      const passInput = $('[data-login] input[name="password"]');

      if(opts.email || regEmail) emailInput.value = opts.email || regEmail;
      if(opts.focusPassword) setTimeout(() => passInput?.focus(), 120);
    }
  }

  function needLogin(){
    if(me && !me.disabled) return true;
    openModal('login');
    toast('先注册 / 登录账号。');
    return false;
  }

  async function afterLogin(msg){
    me = await refreshUser();
    await refreshPosts();
    fillProfile();
    $('[data-sb-auth]')?.classList.remove('show');
    toast(msg || ('欢迎，' + (me?.nickname || '研究员')));
  }

  async function login(form){
    const d = new FormData(form);
    const email = String(d.get('email') || '').trim();
    const password = String(d.get('password') || '').trim();

    if(!email.includes('@')) return toast('请填写邮箱。');
    if(password.length < 6) return toast('请填写密码。');

    const btn = form.querySelector('button[type="submit"]');
    setBtnLoading(btn, true, '登录中...');

    try{
      await withTimeout(db().signInPassword({email, password}), 16000, '登录超时，请稍后重试。');
      await afterLogin();
    }catch(e){
      toast(e.message || '登录失败。');
    }finally{
      setBtnLoading(btn, false);
    }
  }

  async function sendCode(form){
    const d = new FormData(form);
    const email = String(d.get('email') || '').trim();

    if(!email.includes('@')) return toast('请填写邮箱。');

    const btn = form.querySelector('[data-send-code]');
    setBtnLoading(btn, true, '发送中...');

    try{
      await withTimeout(db().sendEmailOtp({email, nickname:''}), 16000, '发送验证码超时，请稍后重试。');
      regEmail = email;
      toast('验证码已发送，请查看邮箱。');
      form.querySelector('[name="token"]')?.focus();
    }catch(e){
      toast(String(e.message || '').includes('rate') ? '发送太频繁，请稍后再试。' : (e.message || '发送失败。'));
    }finally{
      setBtnLoading(btn, false);
    }
  }

  async function reg1(form){
    const d = new FormData(form);
    const email = String(d.get('email') || '').trim();
    const labCode = normalizeLabCode(d.get('lab_code'));
    const p = String(d.get('password') || '').trim();
    const p2 = String(d.get('password2') || '').trim();
    const statementOk = form.querySelector('[data-fw-disclaimer-check]')?.checked;

    if(!email.includes('@')) return toast('请填写正确邮箱。');
    if(!validLabCode(labCode)) return toast('实验品编号必须是 7 位字母或数字。');
    if(p.length < 6) return toast('密码至少 6 位。');
    if(p !== p2) return toast('两次密码不一致。');
    if(!statementOk) return toast('请先阅读并勾选 F.w研究所声明。');

    const btn = form.querySelector('button[type="submit"]');
    setBtnLoading(btn, true, '发送验证码中...');

    try{
      const check = await checkIdentity({labCode, nickname:null});
      if(check.lab_code_taken) throw new Error('该实验品编号已被注册，请更换。');

      const nickname = `临时研究员${labCode}`;

      const sign = await withTimeout(
        db().client.auth.signUp({
          email,
          password:p,
          options:{
            data:{
              nickname,
              lab_code:labCode
            }
          }
        }),
        20000,
        '发送验证码超时，请检查网络后重试。'
      );

      if(sign.error) throw sign.error;

      regEmail = email;
      regPassword = p;
      regLabCode = labCode;
      regNickname = nickname;

      const tip = $('[data-reg-email-tip]');
      if(tip) tip.textContent = `验证码已发送至 ${email}，请输入邮件中的验证码。`;

      show('register2');
      toast('验证码已发送，请查看邮箱。');
    }catch(e){
      const msg = String(e.message || e || '');
      if(msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists') || msg.includes('User already registered')){
        toast('该邮箱已注册，请直接登录或找回密码。');
      }else{
        toast(formatDbError(e));
      }
    }finally{
      setBtnLoading(btn, false);
    }
  }

  async function reg2(form){
    const d = new FormData(form);
    const token = String(d.get('token') || '').trim().replace(/\s/g, '');

    if(!regEmail || !regEmail.includes('@')) return toast('请先填写注册邮箱。');
    if(!token) return toast('请填写邮件里的验证码。');

    const btn = form.querySelector('button[type="submit"]');
    setBtnLoading(btn, true, '验证中...');

    try{
      let verified = await withTimeout(
        db().client.auth.verifyOtp({
          email:regEmail,
          token,
          type:'signup'
        }),
        20000,
        '邮箱验证超时，请稍后重试。'
      );

      // 不同 Supabase 邮件模板可能使用 email 类型验证码，signup 不通过时再试一次 email。
      if(verified.error){
        const fallback = await withTimeout(
          db().client.auth.verifyOtp({
            email:regEmail,
            token,
            type:'email'
          }),
          20000,
          '邮箱验证超时，请稍后重试。'
        );
        verified = fallback;
      }

      if(verified.error) throw verified.error;

      const session = verified.data?.session || null;
      const user = verified.data?.user || session?.user || await getSessionUser().catch(() => null);

      if(user?.id){
        const patch = {
          lab_code: regLabCode,
          nickname: regNickname || `临时研究员${regLabCode}`,
          updated_at: new Date().toISOString()
        };

        const res = await db().client
          .from('profiles')
          .upsert({id:user.id, ...patch}, {onConflict:'id'})
          .select('id,nickname,lab_code')
          .maybeSingle();

        if(res.error) throw new Error(formatDbError(res.error));
      }

      const email = regEmail;

      regEmail = '';
      regPassword = '';
      regLabCode = '';
      regNickname = '';

      await db().client.auth.signOut().catch(() => {});
      clearSupabaseLocalSession();

      me = null;
      await refreshUser();

      $('[data-sb-auth]')?.classList.remove('show');
      toast('注册成功，请登录。');
      setTimeout(() => openModal('login', {email, focusPassword:true}), 650);
    }catch(e){
      const msg = String(e.message || e || '');
      if(msg.toLowerCase().includes('expired') || msg.includes('invalid')){
        toast('验证码错误或已过期，请重新输入或重新发送。');
      }else{
        toast(msg || '验证失败。');
      }
    }finally{
      setBtnLoading(btn, false);
    }
  }

  async function reg3(form){
    return toast('当前注册流程已简化，请从第一步重新开始。');
  }

  async function reset(form){
    const email = String(new FormData(form).get('email') || '').trim();
    if(!email.includes('@')) return toast('请填写邮箱。');

    const btn = form.querySelector('button[type="submit"]');
    setBtnLoading(btn, true, '发送中...');

    try{
      await withTimeout(db().sendPasswordReset({email}), 16000, '发送超时，请稍后重试。');
      toast('找回密码邮件已发送，请查看邮箱。');
    }catch(e){
      toast(e.message || '发送失败。');
    }finally{
      setBtnLoading(btn, false);
    }
  }

  async function newpass(form){
    const d = new FormData(form);
    const p = String(d.get('password') || '').trim();
    const p2 = String(d.get('password2') || '').trim();

    if(p.length < 6) return toast('密码至少 6 位。');
    if(p !== p2) return toast('两次密码不一致。');

    const btn = form.querySelector('button[type="submit"]');
    setBtnLoading(btn, true, '保存中...');

    try{
      const r = await withTimeout(db().client.auth.updateUser({password:p}), 16000, '保存超时，请稍后重试。');
      if(r.error) throw new Error(r.error.message);

      recovery = false;
      await db().client.auth.signOut().catch(() => {});
      clearSupabaseLocalSession();

      me = null;
      await refreshUser();
      $('[data-sb-auth]')?.classList.remove('show');
      toast('新密码已保存，请登录。');
      setTimeout(() => openModal('login'), 550);
    }catch(e){
      toast(e.message || '保存失败。');
    }finally{
      setBtnLoading(btn, false);
    }
  }

  async function profile(form){
    if(!needLogin()) return;

    const d = new FormData(form);
    const nickname = normalizeNickname(d.get('nickname'));
    const password = String(d.get('password') || '').trim();
    const codeInput = form.querySelector('input[name="lab_code"]');
    const labCode = codeInput && !codeInput.disabled ? normalizeLabCode(codeInput.value) : undefined;
    const avatarFile = form.querySelector('[name="avatar"]')?.files?.[0];

    const btn = form.querySelector('button[type="submit"]');
    setBtnLoading(btn, true, '保存中...');

    try{
      if(labCode !== undefined && labCode && !validLabCode(labCode)){
        throw new Error('实验品编号必须是 7 位字母或数字。');
      }

      await withTimeout(
        saveProfileClean({nickname, labCode, avatarFile, password}),
        20000,
        '资料保存超时，请检查网络后重试。'
      );

      await refreshUser();
      await refreshPosts();
      fillProfile();
      toast('资料已保存。');
    }catch(e){
      toast(formatDbError(e));
    }finally{
      setBtnLoading(btn, false);
    }
  }

  async function post(form){
    if(!needLogin()) return;
    const text = form.querySelector('textarea');
    const content = text.value.trim();

    if(!content) return text.focus();

    const status = form.querySelector('.chip.active[data-status]')?.dataset.status || '今日无效';

    try{
      await db().createPost({content, status});
      text.value = '';
      await refreshPosts();
      toast('已发布到数据库。');
    }catch(e){
      toast(e.message || '发布失败。');
    }
  }

  async function feed(btn){
    const card = btn.closest('.post-card');
    const postId = Number(card?.dataset.id);
    const action = btn.dataset.sbAction;

    if(action === 'comment-toggle') return card.querySelector('.comment-box')?.classList.toggle('show');

    if(!needLogin()) return;

    try{
      if(action === 'comment-submit'){
        const input = card.querySelector('.comment-box input');
        const content = input.value.trim();
        if(!content) return;

        await db().createComment({postId, content});
        await refreshPosts();
        document.querySelector(`.post-card[data-id="${postId}"] .comment-box`)?.classList.add('show');
        return;
      }

      const r = await db().react({postId, type:action});
      if(r.already) return toast('同一个账号，这个按钮只能点一次。');
      await refreshPosts();
    }catch(e){
      toast(e.message || '操作失败。');
    }
  }

  async function renderAdmin(){
    const panel = $('[data-admin-panel]');
    if(!panel || !on()) return;

    if(!me?.isAdmin){
      panel.innerHTML = '<article class="fw-admin-card"><p class="fw-kicker">ADMIN ACCESS</p><h2>站长管理入口</h2><p>请先用管理员账号登录。</p><button class="btn dark" data-sb-open type="button">登录管理员账号 →</button></article>';
      return;
    }

    try{
      const users = await db().listUsers();
      const posts = typeof getPosts === 'function' ? getPosts() : [];
      const commentsCount = posts.reduce((sum, p) => sum + (p.comments || []).length, 0);

      panel.innerHTML = `
        <div class="fw-admin-head">
          <div>
            <p class="fw-kicker">ADMIN PANEL</p>
            <h2>站长控制台</h2>
            <p>当前管理数据库中的真实内容。</p>
          </div>
          <div><button class="btn light-line" data-sb-logout type="button">退出</button></div>
        </div>
        <div class="fw-stats">
          <div><b>${users.length}</b><span>账号</span></div>
          <div><b>${posts.length}</b><span>帖子</span></div>
          <div><b>${commentsCount}</b><span>评论</span></div>
        </div>
      `;
    }catch(e){
      panel.innerHTML = `<article class="fw-admin-card"><h2>读取失败</h2><p>${esc(e.message)}</p></article>`;
    }
  }

  async function admin(btn){
    if(!me?.isAdmin) return openModal('login');

    const action = btn.dataset.sbAdmin;

    try{
      if(action === 'delete-post') await db().deletePost(Number(btn.dataset.postId));
      if(action === 'delete-comment') await db().deleteComment(Number(btn.dataset.commentId));
      if(action === 'disable-user') await db().setUserBanned(btn.dataset.userId, true);
      if(action === 'restore-user') await db().setUserBanned(btn.dataset.userId, false);

      await refreshPosts();
      await renderAdmin();
      toast('管理操作已完成。');
    }catch(e){
      toast(e.message || '管理失败。');
    }
  }

  document.addEventListener('submit', e => {
    if(!on()) return;

    const target = e.target;
    const pf = target.closest('[data-post-form]');
    const lf = target.closest('[data-login]');
    const r1 = target.closest('[data-reg1]');
    const r2 = target.closest('[data-reg2]');
    const rf = target.closest('[data-reset]');
    const np = target.closest('[data-newpass]');
    const pr = target.closest('[data-profile]');

    if(pf || lf || r1 || r2 || rf || np || pr){
      e.preventDefault();
      e.stopImmediatePropagation();

      if(busy && !pf) return;
      busy = true;

      const done = () => { busy = false; };

      Promise.resolve()
        .then(() => {
          if(pf) return post(pf);
          if(lf) return login(lf);
          if(r1) return reg1(r1);
          if(r2) return reg2(r2);
          if(rf) return reset(rf);
          if(np) return newpass(np);
          if(pr) return profile(pr);
        })
        .finally(done);
    }
  }, true);

  document.addEventListener('click', e => {
    if(!on()) return;

    const open = e.target.closest('[data-login-cta],[data-fw-open],[data-sb-open]');
    const close = e.target.closest('[data-sb-close]');
    const go = e.target.closest('[data-go]');
    const resend = e.target.closest('[data-resend-signup-code]');
    const feedBtn = e.target.closest('[data-sb-action]');
    const adminBtn = e.target.closest('[data-sb-admin]');
    const logout = e.target.closest('[data-sb-logout]');
    const statementOpen = e.target.closest('[data-fw-statement-open]');
    const statementClose = e.target.closest('[data-fw-statement-close]');

    if(open || close || go || resend || feedBtn || adminBtn || logout || statementOpen || statementClose || e.target.matches('[data-sb-auth]') || e.target.matches('[data-fw-statement-modal]')){
      e.preventDefault();
      e.stopImmediatePropagation();

      if(statementOpen) return $('[data-fw-statement-modal]')?.classList.add('show');
      if(statementClose || e.target.matches('[data-fw-statement-modal]')) return $('[data-fw-statement-modal]')?.classList.remove('show');

      if(open) return openModal();
      if(close || e.target.matches('[data-sb-auth]')) return closeModal();
      if(go){
        if(go.dataset.go === 'login' && isRegisterMidway()) abandonIncomplete();
        return openModal(go.dataset.go);
      }
      if(resend){
        if(!regEmail) return toast('请先填写注册邮箱。');

        const oldText = resend.textContent;
        resend.disabled = true;
        resend.textContent = '发送中...';

        db().client.auth.resend({type:'signup', email:regEmail})
          .then(function(r){
            if(r.error) throw r.error;
            toast('验证码已重新发送。');
          })
          .catch(function(err){
            toast(err.message || '重新发送失败。');
          })
          .finally(function(){
            resend.disabled = false;
            resend.textContent = oldText;
          });
        return;
      }
      if(feedBtn) return feed(feedBtn);
      if(adminBtn) return admin(adminBtn);
      if(logout) return signOutFast('已退出。');
    }
  }, true);

  async function guardIncompleteRegistration(){
    if(!on()) return;
    const modal = $('[data-sb-auth]');
    const view = currentView();

    if(modal?.classList.contains('show') && ['register1','register2'].includes(view)) return;

    const incomplete = await isIncompleteRegistration().catch(() => false);
    if(incomplete) await signOutFast('上次注册未完成，已默认放弃，请重新注册。');
  }

  async function boot(){
    if(booted) return;

    const ok = await waitForDb();
    if(!ok) return;

    booted = true;
    modal();
    userbar();

    setTimeout(async () => {
      await refreshUser();
      await guardIncompleteRegistration();
      renderOverride();
      await refreshPosts();
      await renderAdmin();

      db().onAuthChange(async event => {
        if(event === 'PASSWORD_RECOVERY'){
          recovery = true;
          openModal('newpass');
        }

        await refreshUser();
        await guardIncompleteRegistration();
        renderOverride();
        await refreshPosts();
        await renderAdmin();
      });

      setInterval(guardIncompleteRegistration, 6000);
    }, 0);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
