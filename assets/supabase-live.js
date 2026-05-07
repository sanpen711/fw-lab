(function(){
  const db = () => window.fwDb;
  const on = () => Boolean(db()?.enabled);
  let me = null;
  let booted = false;

  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const initials = v => String(v || 'FW').trim().slice(0,2).toUpperCase();
  const avatar = (name, url, mini='') => url ? `<span class="fw-avatar ${mini}"><img src="${esc(url)}" alt="${esc(name)}"></span>` : `<span class="fw-avatar ${mini}">${esc(initials(name))}</span>`;

  function toast(msg){
    let t = $('.fw-toast');
    if(!t){ t = document.createElement('div'); t.className = 'fw-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwSbToast);
    window.__fwSbToast = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function ensureUserbar(){
    document.querySelectorAll('.header').forEach(header => {
      if(header.querySelector('.fw-userbar')) return;
      const bar = document.createElement('div');
      bar.className = 'fw-userbar fw-userbar-supabase';
      bar.innerHTML = `
        <button type="button" class="fw-login-pill" data-fw-open>
          <span data-fw-avatar-slot></span>
          <span data-fw-current>注册 / 登录</span>
        </button>
        <div class="fw-profile-popover" data-fw-profile-card>
          <div class="fw-profile-card-head">
            <span data-fw-card-avatar></span>
            <div><b data-fw-card-name>未登录</b><span data-fw-card-status>点击注册 / 登录</span></div>
          </div>
          <p><strong>绑定邮箱：</strong><span data-fw-card-email>未绑定</span></p>
          <p><strong>账号状态：</strong><span data-fw-card-role>游客</span></p>
          <div class="fw-profile-card-actions">
            <button type="button" data-fw-open>编辑资料</button>
            <button type="button" data-sb-logout>退出</button>
          </div>
        </div>`;
      header.appendChild(bar);
    });
  }

  async function refreshUser(){
    if(!on()) return;
    ensureUserbar();
    me = await db().getCurrentUser().catch(() => null);
    document.querySelectorAll('[data-fw-current]').forEach(x => x.textContent = me ? me.nickname : '注册 / 登录');
    document.querySelectorAll('[data-fw-open]').forEach(x => { if(x.classList.contains('fw-login-pill')) x.setAttribute('aria-label', me ? '个人资料' : '注册 / 登录'); });
    document.querySelectorAll('[data-fw-avatar-slot]').forEach(x => x.innerHTML = me ? avatar(me.nickname, me.avatar_url, 'mini') : '');
    document.querySelectorAll('[data-fw-card-avatar]').forEach(x => x.innerHTML = me ? avatar(me.nickname, me.avatar_url) : avatar('FW', ''));
    document.querySelectorAll('[data-fw-card-name]').forEach(x => x.textContent = me ? me.nickname : '未登录');
    document.querySelectorAll('[data-fw-card-status]').forEach(x => x.textContent = me ? '已进入研究所' : '点击注册 / 登录');
    document.querySelectorAll('[data-fw-card-email]').forEach(x => x.textContent = me?.email || '未绑定');
    document.querySelectorAll('[data-fw-card-role]').forEach(x => x.textContent = me ? (me.isAdmin ? '管理员' : (me.disabled ? '已停用' : '正常')) : '游客');
    document.querySelectorAll('.fw-profile-card-actions').forEach(x => x.style.display = me ? 'flex' : 'none');
  }

  async function refreshPosts(){
    if(!on()) return;
    const posts = await db().loadPosts();
    if(typeof savePosts === 'function') savePosts(posts);
    if(typeof renderFeeds === 'function') renderFeeds();
  }

  function overrideRender(){
    if(!on() || typeof window.renderPost !== 'function') return;
    window.renderPost = function(post){
      const comments = (post.comments || []).map(c => `<li data-comment-id="${esc(c.id)}">${avatar(c.authorName, c.authorAvatar, 'mini')}<strong>${esc(c.authorName || '匿名回声')}</strong><span>${esc(c.content)}</span>${me?.isAdmin ? `<button type="button" class="fw-text-danger" data-sb-admin="delete-comment" data-comment-id="${esc(c.id)}">删除</button>` : ''}</li>`).join('');
      return `<article class="post-card" data-id="${post.id}" data-status="${esc(post.status)}"><div class="post-top"><span class="status">${esc(post.status)}</span><span class="time">${esc(post.time || '刚刚')}</span></div><p class="fw-author">${avatar(post.authorName, post.authorAvatar, 'mini')}<span>${esc(post.authorName || '匿名研究员')}</span></p><p class="post-content">${esc(post.content)}</p><div class="interactions"><button data-sb-action="resonance">点赞 ${post.resonance || 0}</button><button data-sb-action="comment-toggle">评论 ${(post.comments || []).length}</button><button data-sb-action="same">俺也一样 ${post.same || 0}</button><button data-sb-action="tissue">递纸巾 ${post.tissue || 0}</button>${me?.isAdmin ? `<button class="fw-danger-pill" data-sb-admin="delete-post" data-post-id="${post.id}">删帖</button>` : ''}</div><div class="comment-box"><ul class="comment-list">${comments || '<li><span>还没有回声，可以先留一句。</span></li>'}</ul><input placeholder="留一句回声，评论不限量" /><button class="btn dark full" data-sb-action="comment-submit" style="margin-top:10px">发送回声</button></div></article>`;
    };
  }

  function ensureModal(){
    if($('[data-sb-auth]')) return;
    const modal = document.createElement('div');
    modal.className = 'fw-auth sb-auth';
    modal.dataset.sbAuth = '1';
    modal.innerHTML = `<div class="fw-auth-panel"><button class="fw-close" data-sb-close type="button">×</button><p class="fw-kicker">EMAIL OTP ACCESS</p><h2>注册 / 登录</h2><p class="fw-muted">一个邮箱对应一个账号。先获取验证码，再填入验证码登录/注册。</p><form data-sb-send-otp class="fw-form show"><label>邮箱</label><input name="email" type="email" placeholder="your@email.com" /><label>昵称 / 首次注册时使用</label><input name="nickname" maxlength="24" placeholder="例如：低功耗研究员" /><button class="btn dark full" type="submit">发送邮箱验证码</button><p class="form-tip">验证码通常 6 位。发送后如需重发，请等待约 60 秒，避免触发频率限制。</p></form><form data-sb-verify-otp class="fw-form show" style="margin-top:20px;border-top:1px solid var(--line-soft);padding-top:18px"><label>邮箱</label><input name="email" type="email" placeholder="和上面一致" /><label>验证码</label><input name="token" inputmode="numeric" autocomplete="one-time-code" placeholder="填写邮件里的 6 位验证码" /><label>昵称 / 可选</label><input name="nickname" maxlength="24" placeholder="登录后也可以修改" /><button class="btn dark full" type="submit">验证并进入研究所</button></form><form data-sb-profile class="fw-form show" style="margin-top:20px;border-top:1px solid var(--line-soft);padding-top:18px"><div class="fw-profile-preview" data-sb-preview></div><label>昵称</label><input name="nickname" maxlength="24" placeholder="给自己起个不用解释的名字" /><label>头像</label><input name="avatar" type="file" accept="image/*" /><button class="btn dark full" type="submit">保存昵称 / 头像</button><button class="btn full" data-sb-logout type="button" style="margin-top:10px">退出登录</button></form></div>`;
    document.body.appendChild(modal);
  }

  function fillModal(){
    ensureModal();
    const box = $('[data-sb-preview]');
    const nick = $('[data-sb-profile] input[name="nickname"]');
    if(box) box.innerHTML = me ? `${avatar(me.nickname, me.avatar_url)}<div><b>${esc(me.nickname)}</b><span>${esc(me.email || '数据库账号')}</span></div>` : '<p class="fw-muted">登录后可以在这里修改昵称和头像。</p>';
    if(nick) nick.value = me?.nickname || '';
    const email = $('[data-sb-send-otp] input[name="email"]')?.value || '';
    const verifyEmail = $('[data-sb-verify-otp] input[name="email"]');
    if(email && verifyEmail && !verifyEmail.value) verifyEmail.value = email;
  }
  function openModal(){ fillModal(); $('[data-sb-auth]')?.classList.add('show'); }
  function closeModal(){ $('[data-sb-auth]')?.classList.remove('show'); }
  function requireLogin(){ if(me && !me.disabled) return true; openModal(); toast('先注册 / 登录账号。'); return false; }

  async function handleSendOtp(form){
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const nickname = String(data.get('nickname') || '').trim();
    if(!email.includes('@')) return toast('请填写邮箱。');
    try{
      await db().sendEmailOtp({ email, nickname });
      const verifyEmail = $('[data-sb-verify-otp] input[name="email"]');
      const verifyNick = $('[data-sb-verify-otp] input[name="nickname"]');
      if(verifyEmail) verifyEmail.value = email;
      if(verifyNick && nickname) verifyNick.value = nickname;
      toast('验证码已发送，请查看邮箱。');
    }catch(err){
      const msg = String(err.message || '验证码发送失败。');
      toast(msg.includes('rate') || msg.includes('Too Many') ? '发送太频繁，请等一会儿再试。' : msg);
    }
  }

  async function handleVerifyOtp(form){
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const token = String(data.get('token') || '').trim();
    const nickname = String(data.get('nickname') || '').trim();
    if(!email.includes('@')) return toast('请填写邮箱。');
    if(token.length < 6) return toast('请填写邮件里的 6 位验证码。');
    try{
      const res = await db().verifyEmailOtp({ email, token, nickname });
      me = res.user || await db().getCurrentUser().catch(() => null);
      await refreshUser(); await refreshPosts(); fillModal(); closeModal();
      toast('欢迎，' + (me?.nickname || '研究员'));
    }catch(err){ toast(err.message || '验证码验证失败。'); }
  }

  async function handleProfile(form){
    if(!requireLogin()) return;
    const data = new FormData(form);
    const nickname = String(data.get('nickname') || '').trim();
    const avatarFile = form.querySelector('input[name="avatar"]')?.files?.[0];
    try{ await db().updateProfile({ nickname, avatarFile }); await refreshUser(); await refreshPosts(); fillModal(); toast('资料已保存。'); }
    catch(err){ toast(err.message || '资料保存失败。'); }
  }

  async function handlePost(form){
    if(!requireLogin()) return;
    const text = form.querySelector('textarea');
    const content = text.value.trim();
    if(!content) return text.focus();
    const status = form.querySelector('.chip.active[data-status]')?.dataset.status || '今日无效';
    try{ await db().createPost({ content, status }); text.value = ''; await refreshPosts(); toast('已发布到数据库。'); }
    catch(err){ toast(err.message || '发布失败。'); }
  }

  async function handleFeed(btn){
    const card = btn.closest('.post-card');
    const postId = Number(card?.dataset.id);
    const action = btn.dataset.sbAction;
    if(action === 'comment-toggle') return card.querySelector('.comment-box')?.classList.toggle('show');
    if(!requireLogin()) return;
    try{
      if(action === 'comment-submit'){
        const input = card.querySelector('.comment-box input');
        const content = input.value.trim();
        if(!content) return;
        await db().createComment({ postId, content }); await refreshPosts();
        document.querySelector(`.post-card[data-id="${postId}"] .comment-box`)?.classList.add('show'); return;
      }
      const res = await db().react({ postId, type: action });
      if(res.already) return toast('同一个账号，这个按钮只能点一次。');
      await refreshPosts();
    }catch(err){ toast(err.message || '操作失败。'); }
  }

  async function renderAdmin(){
    const panel = $('[data-admin-panel]');
    if(!panel || !on()) return;
    if(!me?.isAdmin){ panel.innerHTML = `<article class="fw-admin-card"><p class="fw-kicker">ADMIN ACCESS</p><h2>站长管理入口</h2><p>请先用管理员邮箱验证码登录。登录后可删除帖子、删除评论、停用或恢复用户。</p><button class="btn dark" data-sb-open type="button">登录管理员账号 →</button></article>`; return; }
    try{
      const users = await db().listUsers();
      const posts = typeof getPosts === 'function' ? getPosts() : [];
      const commentCount = posts.reduce((s,p)=>s+(p.comments||[]).length,0);
      panel.innerHTML = `<div class="fw-admin-head"><div><p class="fw-kicker">ADMIN PANEL</p><h2>站长控制台</h2><p>当前管理 Supabase 数据库中的真实内容。</p></div><div><button class="btn light-line" data-sb-logout type="button">退出</button></div></div><div class="fw-stats"><div><b>${users.length}</b><span>账号</span></div><div><b>${posts.length}</b><span>帖子</span></div><div><b>${commentCount}</b><span>评论</span></div></div><section class="fw-admin-section"><h3>用户管理</h3>${users.map(u => `<div class="fw-admin-row ${u.is_banned ? 'off' : ''}"><div>${avatar(u.nickname, u.avatar_url, 'mini')}<b>${esc(u.nickname)}</b><span>${esc(u.role)} · ${esc(u.created_at || '')}</span></div>${u.role === 'admin' ? '<span class="status">管理员</span>' : (u.is_banned ? `<button class="btn small" data-sb-admin="restore-user" data-user-id="${u.id}">恢复</button>` : `<button class="btn danger small" data-sb-admin="disable-user" data-user-id="${u.id}">停用账号</button>`)}</div>`).join('') || '<p>暂无用户。</p>'}</section><section class="fw-admin-section"><h3>帖子与评论</h3>${posts.map(p => `<article class="fw-admin-post"><div><span>${esc(p.status)}</span><button class="btn danger small" data-sb-admin="delete-post" data-post-id="${p.id}">删除帖子</button></div><h4>${esc(p.content)}</h4><p>${esc(p.authorName)} · ${esc(p.time)}</p><ul>${(p.comments||[]).map(c => `<li><span><b>${esc(c.authorName)}：</b>${esc(c.content)}</span><button class="fw-text-danger" data-sb-admin="delete-comment" data-comment-id="${c.id}">删除评论</button></li>`).join('') || '<li>暂无评论</li>'}</ul></article>`).join('') || '<p>暂无帖子。</p>'}</section>`;
    }catch(err){ panel.innerHTML = `<article class="fw-admin-card"><h2>读取失败</h2><p>${esc(err.message)}</p></article>`; }
  }

  async function handleAdmin(btn){
    if(!me?.isAdmin) return openModal();
    const act = btn.dataset.sbAdmin;
    try{
      if(act === 'delete-post') await db().deletePost(Number(btn.dataset.postId));
      if(act === 'delete-comment') await db().deleteComment(Number(btn.dataset.commentId));
      if(act === 'disable-user') await db().setUserBanned(btn.dataset.userId, true);
      if(act === 'restore-user') await db().setUserBanned(btn.dataset.userId, false);
      await refreshPosts(); await renderAdmin(); toast('管理操作已完成。');
    }catch(err){ toast(err.message || '管理失败。'); }
  }

  document.addEventListener('submit', function(e){
    if(!on()) return;
    const postForm = e.target.closest('[data-post-form]');
    const sendOtpForm = e.target.closest('[data-sb-send-otp]');
    const verifyOtpForm = e.target.closest('[data-sb-verify-otp]');
    const profileForm = e.target.closest('[data-sb-profile]');
    if(postForm || sendOtpForm || verifyOtpForm || profileForm){ e.preventDefault(); e.stopImmediatePropagation(); if(postForm) handlePost(postForm); if(sendOtpForm) handleSendOtp(sendOtpForm); if(verifyOtpForm) handleVerifyOtp(verifyOtpForm); if(profileForm) handleProfile(profileForm); }
  }, true);

  document.addEventListener('click', function(e){
    if(!on()) return;
    const open = e.target.closest('[data-login-cta], [data-fw-open], [data-sb-open]');
    const close = e.target.closest('[data-sb-close]');
    const feed = e.target.closest('[data-sb-action]');
    const admin = e.target.closest('[data-sb-admin]');
    const logout = e.target.closest('[data-sb-logout]');
    if(open || close || feed || admin || logout || e.target.matches('[data-sb-auth]')){
      e.preventDefault(); e.stopImmediatePropagation();
      if(open) openModal();
      if(close || e.target.matches('[data-sb-auth]')) closeModal();
      if(feed) handleFeed(feed);
      if(admin) handleAdmin(admin);
      if(logout) db().signOut().then(async()=>{ me=null; await refreshUser(); await renderAdmin(); closeModal(); toast('已退出。'); });
    }
  }, true);

  async function boot(){
    if(booted || !on()) return;
    booted = true;
    ensureModal();
    ensureUserbar();
    setTimeout(async () => { await refreshUser(); overrideRender(); await refreshPosts(); await renderAdmin(); db().onAuthChange(async () => { await refreshUser(); overrideRender(); await refreshPosts(); await renderAdmin(); }); }, 0);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
