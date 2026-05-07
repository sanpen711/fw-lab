(function(){
  const USER_KEY = "fw_lab_users_v2";
  const SESSION_KEY = "fw_lab_session_v2";
  const ADMIN_KEY = "fw_lab_admin_v2";
  const REACTION_KEY = "fw_lab_reactions_v2";
  const WX_KEY = "fw_lab_wechat_demo_v2";
  const lines = [
    "这不是摸鱼，是精神系统散热。",
    "你不是拖延，你是在给任务培养时间感。",
    "今天不是没产出，是产出过于抽象。",
    "会议结束了，问题也成功升级了。",
    "工作不是没有进展，只是进展到了看不见的地方。",
    "不是效率低，是灵魂正在低功耗运行。",
    "同步一下，等于把混乱放进共享文件夹。"
  ];

  function parse(raw, fallback){
    try { return raw ? JSON.parse(raw) : fallback; } catch(e){ return fallback; }
  }
  function save(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
  function esc(str){
    return String(str ?? "").replace(/[&<>"']/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]));
  }
  function id(prefix){ return prefix + "_" + Date.now() + "_" + Math.random().toString(16).slice(2); }
  function memberNo(){ return String(Math.floor(100 + Math.random() * 899)); }
  function users(){ return parse(localStorage.getItem(USER_KEY), []); }
  function setUsers(list){ save(USER_KEY, list); }
  function session(){ return parse(localStorage.getItem(SESSION_KEY), null); }
  function setSession(s){ save(SESSION_KEY, s); refreshAuth(); renderAdmin(); rerender(); }
  function clearSession(){ localStorage.removeItem(SESSION_KEY); refreshAuth(); renderAdmin(); rerender(); }
  function admin(){ return parse(localStorage.getItem(ADMIN_KEY), null); }
  function setAdmin(a){ save(ADMIN_KEY, a); }
  function currentUser(){
    const s = session();
    if(!s) return null;
    if(s.type === "admin") return { id:"admin", nickname:"站长 FW", isAdmin:true };
    const u = users().find(x => x.id === s.userId);
    return u && !u.disabled ? u : null;
  }
  function isAdmin(){ return session()?.type === "admin"; }
  function toast(msg){
    let t = document.querySelector(".fw-toast");
    if(!t){ t = document.createElement("div"); t.className = "fw-toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(window.__fwToast);
    window.__fwToast = setTimeout(()=>t.classList.remove("show"), 2400);
  }
  function getReactions(){ return parse(localStorage.getItem(REACTION_KEY), {}); }
  function setReactions(r){ save(REACTION_KEY, r); }

  function ensureCommentObjects(){
    if(typeof getPosts !== "function" || typeof savePosts !== "function") return;
    const list = getPosts();
    let changed = false;
    list.forEach(post => {
      post.authorName = post.authorName || "匿名研究员";
      post.authorId = post.authorId || "seed";
      post.comments = (post.comments || []).map((c, i) => {
        if(typeof c === "string"){
          changed = true;
          return { id:id("comment"), authorName:"匿名回声", content:c, time:"此前", userId:"seed" };
        }
        if(!c.id){ c.id = id("comment_" + i); changed = true; }
        return c;
      });
    });
    if(changed) savePosts(list);
  }

  function openAuth(tab){
    const modal = document.querySelector("[data-fw-auth]");
    if(!modal) return;
    modal.classList.add("show");
    selectTab(tab || "phone");
  }
  function closeAuth(){ document.querySelector("[data-fw-auth]")?.classList.remove("show"); }
  function selectTab(tab){
    document.querySelectorAll("[data-fw-tab]").forEach(b => b.classList.toggle("active", b.dataset.fwTab === tab));
    document.querySelectorAll("[data-fw-form]").forEach(f => f.classList.toggle("show", f.dataset.fwForm === tab));
  }

  function injectAuth(){
    if(!document.querySelector("[data-fw-auth]")){
      const modal = document.createElement("div");
      modal.className = "fw-auth";
      modal.dataset.fwAuth = "1";
      modal.innerHTML = `
        <div class="fw-auth-panel">
          <button class="fw-close" data-fw-close type="button">×</button>
          <p class="fw-kicker">FW LAB ACCESS</p>
          <h2>加入研究所</h2>
          <p class="fw-muted">登录后可以发布、评论、点赞。页面只展示匿名研究员编号。</p>
          <div class="fw-tabs">
            <button class="active" data-fw-tab="phone" type="button">手机号</button>
            <button data-fw-tab="wechat" type="button">微信</button>
            <button data-fw-tab="admin" type="button">站长</button>
          </div>
          <form data-fw-form="phone" class="fw-form show">
            <label>手机号</label>
            <input name="phone" inputmode="tel" placeholder="当前仅保存在本机浏览器" />
            <label>昵称 / 可不填</label>
            <input name="nickname" placeholder="例如：临时研究员 711" />
            <label>验证码</label>
            <input name="code" inputmode="numeric" placeholder="演示版输入任意 4 位数字" />
            <button class="btn dark full" type="submit">注册 / 登录</button>
            <p class="form-tip">真实短信验证码需要后端和短信接口，这里先做流程演示。</p>
          </form>
          <form data-fw-form="wechat" class="fw-form">
            <div class="fw-qr">WeChat</div>
            <p class="fw-muted">静态版无法真正调起微信授权，点击后会生成一个微信演示账号。</p>
            <button class="btn dark full" type="submit">模拟微信登录</button>
          </form>
          <form data-fw-form="admin" class="fw-form">
            <label>管理账号</label>
            <input name="account" placeholder="建议：fw_admin" />
            <label>管理口令</label>
            <input name="password" type="password" placeholder="首次输入即创建本机管理账号" />
            <button class="btn dark full" type="submit">进入管理</button>
            <p class="form-tip">首次进入会创建本机管理账号；正式上线需要后端权限。</p>
          </form>
        </div>`;
      document.body.appendChild(modal);
    }

    document.querySelectorAll(".header").forEach(h => {
      if(h.querySelector(".fw-userbar")) return;
      const bar = document.createElement("div");
      bar.className = "fw-userbar";
      bar.innerHTML = `<span data-fw-current>游客</span><button type="button" data-fw-open>加入 / 登录</button><a href="admin.html">管理</a>`;
      h.appendChild(bar);
    });
    refreshAuth();
  }

  function refreshAuth(){
    const u = currentUser();
    document.querySelectorAll("[data-fw-current]").forEach(x => x.textContent = u ? u.nickname : "游客");
    document.querySelectorAll("[data-fw-open]").forEach(x => x.textContent = u ? (u.isAdmin ? "站长已登录" : "切换账号") : "加入 / 登录");
  }

  function loginPhone(form){
    const data = new FormData(form);
    const phone = String(data.get("phone") || "").replace(/[^\d]/g, "");
    const code = String(data.get("code") || "").trim();
    const nickname = String(data.get("nickname") || "").trim();
    if(phone.length < 6){ toast("手机号格式太短。"); return; }
    if(code.length < 4){ toast("验证码至少 4 位。"); return; }
    let list = users();
    let u = list.find(x => x.provider === "phone" && x.phone === phone);
    if(u?.disabled){ toast("这个账号已被停用。"); return; }
    if(!u){
      u = { id:id("user"), provider:"phone", phone, phoneMasked:phone.replace(/^(\d{3})\d+(\d{2})$/, "$1****$2"), nickname:nickname || ("临时研究员 " + memberNo()), createdAt:new Date().toLocaleString("zh-CN"), disabled:false };
      list.push(u);
    }else if(nickname){ u.nickname = nickname; }
    setUsers(list);
    setSession({ type:"user", userId:u.id });
    closeAuth();
    toast("欢迎，" + u.nickname);
  }

  function loginWechat(){
    let list = users();
    let wxId = localStorage.getItem(WX_KEY);
    let u = wxId ? list.find(x => x.id === wxId) : null;
    if(u?.disabled){ toast("这个账号已被停用。"); return; }
    if(!u){
      u = { id:id("wx"), provider:"wechat", nickname:"微信研究员 " + memberNo(), createdAt:new Date().toLocaleString("zh-CN"), disabled:false };
      list.push(u); setUsers(list); localStorage.setItem(WX_KEY, u.id);
    }
    setSession({ type:"user", userId:u.id });
    closeAuth();
    toast("微信演示账号已登录。");
  }

  function loginAdmin(form){
    const data = new FormData(form);
    const account = String(data.get("account") || "").trim();
    const password = String(data.get("password") || "").trim();
    if(account.length < 3 || password.length < 4){ toast("账号至少 3 位，口令至少 4 位。"); return; }
    let a = admin();
    if(!a){
      a = { account, password, createdAt:new Date().toLocaleString("zh-CN") };
      setAdmin(a);
      setSession({ type:"admin", account });
      closeAuth();
      toast("管理账号已创建。");
      if(!location.pathname.endsWith("admin.html")) setTimeout(()=>location.href="admin.html", 300);
      return;
    }
    if(a.account === account && a.password === password){
      setSession({ type:"admin", account });
      closeAuth();
      toast("站长已进入。");
      if(!location.pathname.endsWith("admin.html")) setTimeout(()=>location.href="admin.html", 300);
    }else{
      toast("管理账号或口令不对。");
    }
  }

  function requireUser(){
    const u = currentUser();
    if(u && !u.isAdmin) return u;
    openAuth("phone");
    toast(u?.isAdmin ? "站长账号只用于管理，请切换普通账号互动。" : "先加入研究所，再继续。");
    return null;
  }

  function overrideRenderPost(){
    if(typeof renderPost !== "function") return;
    window.renderPost = function(post){
      const u = currentUser();
      const uid = u && !u.isAdmin ? u.id : "";
      const all = getReactions();
      const done = all[post.id]?.[uid] || {};
      const comments = (post.comments || []).map(c => `
        <li data-comment-id="${esc(c.id || "")}">
          <strong>${esc(c.authorName || "匿名回声")}</strong>
          <span>${esc(c.content || c)}</span>
          ${isAdmin() ? `<button type="button" class="fw-text-danger" data-fw-admin="delete-comment" data-post-id="${post.id}" data-comment-id="${esc(c.id || "")}">删除</button>` : ""}
        </li>`).join("");
      return `
        <article class="post-card" data-id="${post.id}" data-status="${esc(post.status)}">
          <div class="post-top"><span class="status">${esc(post.status)}</span><span class="time">${esc(post.time || "刚刚")}</span></div>
          <p class="fw-author">${esc(post.authorName || "匿名研究员")}</p>
          <p class="post-content">${esc(post.content)}</p>
          <div class="interactions">
            <button data-fw-action="resonance" class="${done.resonance ? "done" : ""}">${done.resonance ? "已点赞" : "点赞"} ${post.resonance || 0}</button>
            <button data-fw-action="comment-toggle">评论 ${(post.comments || []).length}</button>
            <button data-fw-action="same" class="${done.same ? "done" : ""}">${done.same ? "已俺也一样" : "俺也一样"} ${post.same || 0}</button>
            <button data-fw-action="tissue" class="${done.tissue ? "done" : ""}">${done.tissue ? "已递纸巾" : "递纸巾"} ${post.tissue || 0}</button>
            ${isAdmin() ? `<button class="fw-danger-pill" data-fw-admin="delete-post" data-post-id="${post.id}">删帖</button>` : ""}
          </div>
          <div class="comment-box">
            <ul class="comment-list">${comments || "<li><span>还没有回声，可以先留一句。</span></li>"}</ul>
            <input placeholder="留一句回声，评论不限量" />
            <button class="btn dark full" data-fw-action="comment-submit" style="margin-top:10px">发送回声</button>
          </div>
        </article>`;
    };
  }

  function rerender(){
    ensureCommentObjects();
    overrideRenderPost();
    if(typeof renderFeeds === "function") renderFeeds();
  }

  function interceptPostSubmit(e){
    const form = e.target.closest("[data-post-form]");
    if(!form) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const u = requireUser(); if(!u) return;
    const text = form.querySelector("textarea");
    const content = text.value.trim();
    if(!content){ text.focus(); return; }
    const active = form.querySelector(".chip.active[data-status]");
    const list = getPosts();
    list.unshift({ id:Date.now(), status:active?.dataset.status || "今日无效", content, time:"刚刚", authorId:u.id, authorName:u.nickname, resonance:0, same:0, tissue:0, comments:[] });
    savePosts(list);
    text.value = "";
    rerender();
    form.querySelector("[data-notice]") && (form.querySelector("[data-notice]").textContent = "已匿名投递。它现在被研究所收纳了。");
    toast("已投递。");
  }

  function handleFeedClick(e){
    const btn = e.target.closest("[data-fw-action]");
    if(!btn) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const card = btn.closest(".post-card");
    const postId = Number(card?.dataset.id);
    const list = getPosts();
    const post = list.find(p => Number(p.id) === postId);
    if(!post) return;
    const action = btn.dataset.fwAction;
    if(action === "comment-toggle"){
      card.querySelector(".comment-box")?.classList.toggle("show");
      return;
    }
    if(action === "comment-submit"){
      const u = requireUser(); if(!u) return;
      const input = card.querySelector(".comment-box input");
      const val = input.value.trim();
      if(!val) return;
      post.comments = post.comments || [];
      post.comments.push({ id:id("comment"), userId:u.id, authorName:u.nickname, content:val, time:"刚刚" });
      savePosts(list);
      rerender();
      document.querySelector(`.post-card[data-id="${postId}"] .comment-box`)?.classList.add("show");
      return;
    }
    const u = requireUser(); if(!u) return;
    const all = getReactions();
    all[postId] = all[postId] || {};
    all[postId][u.id] = all[postId][u.id] || {};
    if(all[postId][u.id][action]){
      toast("同一个账号，这个按钮只能点一次。");
      return;
    }
    post[action] = Number(post[action] || 0) + 1;
    all[postId][u.id][action] = true;
    savePosts(list);
    setReactions(all);
    rerender();
  }

  function handleAdminClick(e){
    const btn = e.target.closest("[data-fw-admin]");
    if(!btn) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if(!isAdmin()){ openAuth("admin"); return; }
    let list = getPosts();
    let us = users();
    const act = btn.dataset.fwAdmin;
    if(act === "delete-post"){
      list = list.filter(p => Number(p.id) !== Number(btn.dataset.postId));
      savePosts(list); toast("帖子已删除。"); rerender(); renderAdmin(); return;
    }
    if(act === "delete-comment"){
      const p = list.find(x => Number(x.id) === Number(btn.dataset.postId));
      if(p){ p.comments = (p.comments || []).filter(c => String(c.id) !== String(btn.dataset.commentId)); savePosts(list); toast("评论已删除。"); rerender(); renderAdmin(); }
      return;
    }
    if(act === "disable-user"){
      us = us.map(u => u.id === btn.dataset.userId ? {...u, disabled:true} : u);
      setUsers(us); toast("账号已停用。"); renderAdmin(); refreshAuth(); return;
    }
    if(act === "restore-user"){
      us = us.map(u => u.id === btn.dataset.userId ? {...u, disabled:false} : u);
      setUsers(us); toast("账号已恢复。"); renderAdmin(); return;
    }
    if(act === "reset-demo"){
      localStorage.removeItem(USER_KEY); localStorage.removeItem(SESSION_KEY); localStorage.removeItem(REACTION_KEY); localStorage.removeItem(WX_KEY);
      toast("演示数据已清理。"); refreshAuth(); rerender(); renderAdmin();
    }
  }

  function renderAdmin(){
    const panel = document.querySelector("[data-admin-panel]");
    if(!panel) return;
    if(!isAdmin()){
      panel.innerHTML = `<article class="fw-admin-card"><p class="fw-kicker">ADMIN ACCESS</p><h2>站长管理入口</h2><p>可停用用户账号、删除不合适评论、删除帖子。首次登录会创建本机管理账号。</p><button class="btn dark" data-fw-open-admin>输入管理口令 →</button></article>`;
      return;
    }
    const list = typeof getPosts === "function" ? getPosts() : [];
    const us = users();
    const commentCount = list.reduce((s,p)=>s+(p.comments||[]).length,0);
    panel.innerHTML = `
      <div class="fw-admin-head">
        <div><p class="fw-kicker">ADMIN PANEL</p><h2>站长控制台</h2><p>当前管理本浏览器中的演示数据。真实多人版需要数据库和后端权限。</p></div>
        <div><button class="btn light-line" data-fw-logout>退出</button><button class="btn danger" data-fw-admin="reset-demo">清理演示数据</button></div>
      </div>
      <div class="fw-stats"><div><b>${us.length}</b><span>账号</span></div><div><b>${list.length}</b><span>帖子</span></div><div><b>${commentCount}</b><span>评论</span></div></div>
      <section class="fw-admin-section"><h3>用户管理</h3>${us.length ? us.map(u => `<div class="fw-admin-row ${u.disabled ? "off" : ""}"><div><b>${esc(u.nickname)}</b><span>${u.provider === "wechat" ? "微信" : "手机号"} · ${esc(u.phoneMasked || "无手机号展示")}</span></div>${u.disabled ? `<button class="btn small" data-fw-admin="restore-user" data-user-id="${esc(u.id)}">恢复</button>` : `<button class="btn danger small" data-fw-admin="disable-user" data-user-id="${esc(u.id)}">停用账号</button>`}</div>`).join("") : "<p>暂无注册用户。</p>"}</section>
      <section class="fw-admin-section"><h3>帖子与评论</h3>${list.map(p => `<article class="fw-admin-post"><div><span>${esc(p.status)}</span><button class="btn danger small" data-fw-admin="delete-post" data-post-id="${p.id}">删除帖子</button></div><h4>${esc(p.content)}</h4><p>${esc(p.authorName || "匿名研究员")} · ${esc(p.time || "刚刚")}</p><ul>${(p.comments||[]).map(c => `<li><span><b>${esc(c.authorName || "匿名回声")}：</b>${esc(c.content || c)}</span><button class="fw-text-danger" data-fw-admin="delete-comment" data-post-id="${p.id}" data-comment-id="${esc(c.id || "")}">删除评论</button></li>`).join("") || "<li>暂无评论</li>"}</ul></article>`).join("")}</section>`;
  }

  function polishCopy(){
    document.querySelectorAll(".form-tip").forEach(p => {
      if(p.textContent.includes("数据库")){
        p.textContent = "需要先登录/注册；站内只展示匿名研究员编号。当前先保存在你的浏览器里。";
      }
    });
    const squareTip = [...document.querySelectorAll(".side-card.light p")].find(p => p.textContent.includes("信息流"));
    if(squareTip) squareTip.textContent = "每个登录账号对同一条内容只能点赞一次、“俺也一样”一次、“递纸巾”一次；评论不限量。";
  }

  function injectRandom(){
    const hero = document.querySelector(".hero-actions");
    if(hero && !document.querySelector(".fw-random-card")){
      const card = document.createElement("div");
      card.className = "fw-random-card";
      card.innerHTML = `<small>今日无效结论</small><p data-fw-line>${lines[0]}</p><button class="btn light" data-fw-random type="button">换一条废话 →</button>`;
      hero.insertAdjacentElement("afterend", card);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureCommentObjects();
    injectAuth();
    injectRandom();
    polishCopy();
    overrideRenderPost();
    rerender();
    renderAdmin();

    document.addEventListener("submit", interceptPostSubmit, true);
    document.addEventListener("click", handleFeedClick, true);
    document.addEventListener("click", handleAdminClick, true);

    document.body.addEventListener("click", e => {
      if(e.target.closest("[data-fw-open], [data-login-cta]")) openAuth("phone");
      if(e.target.closest("[data-fw-open-admin]")) openAuth("admin");
      if(e.target.closest("[data-fw-close]") || e.target.matches("[data-fw-auth]")) closeAuth();
      const tab = e.target.closest("[data-fw-tab]");
      if(tab) selectTab(tab.dataset.fwTab);
      if(e.target.closest("[data-fw-logout]")){ clearSession(); toast("已退出。"); }
      if(e.target.closest("[data-fw-random]")){
        const line = document.querySelector("[data-fw-line]");
        if(line) line.textContent = lines[Math.floor(Math.random()*lines.length)];
      }
    });

    document.querySelector('[data-fw-form="phone"]')?.addEventListener("submit", e => { e.preventDefault(); loginPhone(e.currentTarget); });
    document.querySelector('[data-fw-form="wechat"]')?.addEventListener("submit", e => { e.preventDefault(); loginWechat(); });
    document.querySelector('[data-fw-form="admin"]')?.addEventListener("submit", e => { e.preventDefault(); loginAdmin(e.currentTarget); });
  });
})();
