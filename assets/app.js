(function redirectLegacyMobilePagesToPwa(){
  var params = new URLSearchParams(window.location.search || '');
  if(params.get('desktop') === '1' || params.get('app') === '0') return;
  if(/\/app\//.test(window.location.pathname || '')) return;

  var page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var viewMap = {
    'index.html':'nav',
    'square.html':'square',
    'rooms.html':'rooms',
    'bird.html':'bird',
    'archive.html':'archive',
    'rules.html':'rules',
    'admin.html':'moderation',
    'buddy.html':'buddy',
    'echo.html':'echo'
  };
  var view = viewMap[page];
  if(!view) return;

  var ua = navigator.userAgent || '';
  var isMobileUa = /Android|iPhone|iPod|Mobile|Windows Phone/i.test(ua);
  var isSmallTouch = false;
  try{
    isSmallTouch = window.matchMedia('(max-width: 820px)').matches && navigator.maxTouchPoints > 0;
  }catch(e){}
  if(!isMobileUa && !isSmallTouch) return;

  var base = (window.location.pathname || '/').replace(/[^/]*$/, '');
  var target = base + 'app/index.html' + (view === 'nav' ? '' : '#' + view);
  window.location.replace(target);
})();

window.FW_USE_SUPABASE_AUTH = true;
const STORE_KEY = "fw_lab_posts_v1";
let supabaseBridgeFailed = false;

const defaultPosts = [
  {id:1,status:"精神离岗",content:"今天开了三个会，最后决定下次再讨论。",time:"3分钟前",resonance:128,same:67,tissue:42,comments:["这句话应该打印出来贴会议室。"]},
  {id:2,status:"今日无效",content:"忙了一天，成果是新增了两个待办。",time:"12分钟前",resonance:96,same:41,tissue:20,comments:[]},
  {id:3,status:"低功耗运行",content:"我不是不想工作，我只是正在以植物的方式参与项目。",time:"27分钟前",resonance:204,same:102,tissue:63,comments:["植物至少还会光合作用。"]},
  {id:4,status:"想发牢骚",content:"每次说同步一下，我都感觉我们只是把混乱换了个更正式的名字。",time:"43分钟前",resonance:77,same:35,tissue:16,comments:[]}
];

function usingSupabase(){
  return Boolean(window.fwDb && window.fwDb.enabled && window.fwDb.client);
}

function isLocalFallbackAllowed(){
  const host = window.location.hostname || "";
  return window.FW_ALLOW_LOCAL_FALLBACK === true ||
    window.location.protocol === "file:" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1";
}

function requiresSupabaseData(){
  return window.FW_USE_SUPABASE_AUTH !== false && !isLocalFallbackAllowed();
}

function dataUnavailableText(){
  return supabaseBridgeFailed
    ? "数据连接失败，请刷新页面后重试。"
    : "数据连接中，请稍后再试。";
}

function toast(msg){
  let t = document.querySelector(".fw-toast");

  if(!t){
    t = document.createElement("div");
    t.className = "fw-toast";
    document.body.appendChild(t);
  }

  t.textContent = msg;
  t.classList.add("show");

  clearTimeout(window.__fwAppToast);
  window.__fwAppToast = setTimeout(() => {
    t.classList.remove("show");
  }, 3200);
}

function showDataUnavailable(target){
  const msg = dataUnavailableText();

  if(target && target.querySelector){
    const notice = target.querySelector("[data-notice]");

    if(notice){
      notice.textContent = msg;
      return;
    }
  }

  toast(msg);
}

function renderDataUnavailableFeeds(){
  document.querySelectorAll("[data-feed]").forEach(container => {
    container.innerHTML = `<div class="empty">${escapeHtml(dataUnavailableText())}</div>`;
  });
}

function isSquarePage(){
  return (window.location.pathname.split("/").pop() || "").toLowerCase() === "square.html";
}

function getPosts(){
  if(requiresSupabaseData() && !usingSupabase()){
    return [];
  }

  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw){
      localStorage.setItem(STORE_KEY, JSON.stringify(defaultPosts));
      return [...defaultPosts];
    }
    return JSON.parse(raw);
  }catch(e){
    return [...defaultPosts];
  }
}

function savePosts(posts){
  if(requiresSupabaseData()) return;
  localStorage.setItem(STORE_KEY, JSON.stringify(posts));
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[s]));
}

function renderPost(post){
  const comments = (post.comments || []).map(c => `<li>${escapeHtml(c)}</li>`).join("");
  return `
    <article class="post-card" data-id="${post.id}" data-status="${escapeHtml(post.status)}">
      <div class="post-top">
        <span class="status">${escapeHtml(post.status)}</span>
        <span class="time">${escapeHtml(post.time || "刚刚")}</span>
      </div>
      <p class="post-content">${escapeHtml(post.content)}</p>
      <div class="interactions">
        <button data-action="resonance">点赞 ${post.resonance || 0}</button>
        <button data-action="comment-toggle">评论 ${(post.comments || []).length}</button>
        <button data-action="same">俺也一样 ${post.same || 0}</button>
        <button data-action="tissue">递纸巾 ${post.tissue || 0}</button>
      </div>
      <div class="comment-box">
        <ul class="comment-list">${comments}</ul>
        <input placeholder="留一句回声，不必很有道理" />
        <button class="btn dark full" data-action="comment-submit" style="margin-top:10px">发送回声</button>
      </div>
    </article>
  `;
}

function renderFeeds(){
  const containers = document.querySelectorAll("[data-feed]");
  if(!containers.length) return;
  if(isSquarePage()){
    if(typeof window.__FW_SQUARE_RENDER__ === "function") window.__FW_SQUARE_RENDER__();
    return;
  }

  if(requiresSupabaseData() && !usingSupabase()){
    renderDataUnavailableFeeds();
    return;
  }

  const posts = getPosts();

  containers.forEach(container => {
    const limit = Number(container.dataset.limit || posts.length);
    const active = document.querySelector(".chip.filter.active")?.dataset.filter || "全部";

    let list = [...posts];

    if(container.dataset.filterable === "true" && active !== "全部"){
      list = list.filter(p => p.status === active || p.content.includes(active));
    }

    container.innerHTML = !list.length
      ? `<div class="empty">暂时没有这个状态的牢骚。可以先投递一条。</div>`
      : list.slice(0, limit).map(renderPost).join("");
  });
}

function initPostForm(){
  document.querySelectorAll("[data-post-form]").forEach(form => {
    const chips = form.querySelectorAll(".chip[data-status]");
    let selected = chips[0]?.dataset.status || "已疲惫";

    chips.forEach(ch => {
      ch.addEventListener("click", () => {
        chips.forEach(x => x.classList.remove("active"));
        ch.classList.add("active");
        selected = ch.dataset.status;
      });
    });

    form.addEventListener("submit", e => {
      if(usingSupabase()) return;

      e.preventDefault();

      if(requiresSupabaseData()){
        showDataUnavailable(form);
        return;
      }

      const textarea = form.querySelector("textarea");
      const content = textarea.value.trim();

      if(!content){
        textarea.focus();
        return;
      }

      const posts = getPosts();

      posts.unshift({
        id:Date.now(),
        status:selected,
        content,
        time:"刚刚",
        resonance:0,
        same:0,
        tissue:0,
        comments:[]
      });

      savePosts(posts);
      textarea.value = "";
      renderFeeds();

      const notice = form.querySelector("[data-notice]");
      if(notice){
        notice.textContent = "已匿名投递。它现在被研究所收纳了。";
        setTimeout(() => {
          notice.textContent = "";
        }, 2200);
      }
    });
  });
}

function initInteractions(){
  document.body.addEventListener("click", e => {
    if(usingSupabase()) return;

    const btn = e.target.closest("button[data-action]");
    if(!btn) return;

    if(requiresSupabaseData()){
      e.preventDefault();
      e.stopPropagation();
      showDataUnavailable();
      return;
    }

    const card = btn.closest(".post-card");
    if(!card) return;

    const id = Number(card.dataset.id);
    const posts = getPosts();
    const post = posts.find(p => p.id === id);

    if(!post) return;

    const action = btn.dataset.action;

    if(action === "resonance") post.resonance = (post.resonance || 0) + 1;
    if(action === "same") post.same = (post.same || 0) + 1;
    if(action === "tissue") post.tissue = (post.tissue || 0) + 1;

    if(action === "comment-toggle"){
      card.querySelector(".comment-box").classList.toggle("show");
      return;
    }

    if(action === "comment-submit"){
      const input = card.querySelector(".comment-box input");
      const val = input.value.trim();

      if(val){
        post.comments = post.comments || [];
        post.comments.push(val);
        input.value = "";
      }
    }

    savePosts(posts);
    renderFeeds();
  });
}

function initFilters(){
  document.querySelectorAll(".chip.filter").forEach(ch => {
    ch.addEventListener("click", () => {
      document.querySelectorAll(".chip.filter").forEach(x => x.classList.remove("active"));
      ch.classList.add("active");
      renderFeeds();
    });
  });
}

function initMenu(){
  const btn = document.querySelector(".menu-btn");
  const nav = document.querySelector(".mobile-nav");

  if(btn && nav){
    btn.addEventListener("click", () => nav.classList.toggle("show"));
  }
}

function initPublicTrialNav(){
  const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  const active = page === "admin.html";

  function ensure(nav){
    if(!nav) return;

    let link = nav.querySelector('a[href="admin.html"]');

    if(!link){
      link = document.createElement("a");
      link.href = "admin.html";
      nav.appendChild(link);
    }

    link.textContent = "处理公告";
    link.classList.toggle("active", active);
  }

  document.querySelectorAll(".nav").forEach(ensure);
  document.querySelectorAll(".mobile-nav").forEach(ensure);
}

document.addEventListener("DOMContentLoaded", () => {
  initMenu();
  initPublicTrialNav();
  initPostForm();
  initFilters();
  initInteractions();
  renderFeeds();
});

(function loadSupabaseBridge(){
  const scripts = [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    "assets/supabase-config.js",
    "assets/supabase-db.js?v=critical-relations-20260710-1",
    "assets/supabase-live.js?v=critical-account-privacy-20260710-1"
  ];

  function fail(src){
    supabaseBridgeFailed = true;
    console.warn("Supabase bridge failed to load:", src);
    if(requiresSupabaseData()){
      renderDataUnavailableFeeds();
    }
  }

  function loadNext(i){
    if(i >= scripts.length) return;

    const s = document.createElement("script");
    s.src = scripts[i];
    s.defer = false;
    s.onload = () => loadNext(i + 1);
    s.onerror = () => fail(scripts[i]);

    document.head.appendChild(s);
  }

  loadNext(0);

  setTimeout(() => {
    if(requiresSupabaseData() && !usingSupabase()){
      supabaseBridgeFailed = true;
      renderDataUnavailableFeeds();
    }
  }, 12000);
})();

(function loadFwSocialModules(){
  if(window.__FW_SOCIAL_LOADER_CLEAN__) return;
  window.__FW_SOCIAL_LOADER_CLEAN__ = true;

  function loadCss(href){
    if(document.querySelector('link[href="' + href + '"]')) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;

    document.head.appendChild(link);
  }

  function loadJs(src){
    if(document.querySelector('script[src="' + src + '"]')) return;

    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.defer = false;

    document.body.appendChild(s);
  }

  const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  const isHome = !page || page === "index.html";
  const isAdmin = page === "admin.html";
  const hasFeedSurface = Boolean(document.querySelector("[data-post-form], [data-feed]"));

  loadCss("assets/fw-social.css?v=desktop-social-slim-20260702-1");

  loadJs("assets/fw-echo-stable-route.js?v=echo-stable-route-20260529-1");
  loadJs("assets/fw-social.js?v=social-desktop-echo-20260702-1");
  loadJs("assets/fw-logout-home-fix.js?v=logout-home-fix-20260513-1");
  loadJs("assets/fw-signup-complete-fix.js?v=signup-complete-fix-20260513-2");
  if(isHome) loadJs("assets/fw-home-intro.js?v=home-intro-20260513-1");
  loadJs("assets/fw-login-submit-fix.js?v=login-submit-fix-20260515-1");
  loadJs("assets/fw-register-disclaimer-link.js?v=privacy-consent-20260710-1");
  loadJs("assets/fw-avatar-mobile-fix.js?v=avatar-mobile-fix-20260514-2");
  loadJs("assets/fw-avatar-upload-stage-fix.js?v=avatar-upload-stage-fix-20260514-1");
  loadJs("assets/fw-avatar-save-guard.js?v=avatar-save-guard-20260514-1");
  loadJs("assets/fw-site-final-tweaks.js?v=site-final-tweaks-20260512-1");

  /*
    手机端已经迁移到 /app/ 独立 PWA。
    旧电脑端手机壳脚本不再加载，避免和 /app/ 的底部导航、搭子、回声、我的入口重复抢控制权。
    桌面端社交、登录、头像、房间聊天等模块保留。
  */
  loadJs("assets/fw-stable-core.js?v=stable-core-echo-notice-20260702-1");
  loadJs("assets/fw-buddy-wechat.js?v=wechat-buddy-unread-20260702-1");
  loadJs("assets/fw-desktop-echo-legacy-kill.js?v=desktop-fixes-lite-20260702-1");
  loadJs("assets/fw-emoji-panel.js?v=emoji-panel-20260521-buddy-mobile-1");
  loadJs("assets/fw-sticker-direct-render.js?v=home-feed-scope-20260713-1");
  loadJs("assets/fw-chat-media-upload.js?v=home-feed-scope-20260713-1");

  if(hasFeedSurface) loadJs("assets/fw-post-media-tools.js?v=post-media-tools-20260518-4");

  loadJs("assets/fw-floating-panels.js?v=floating-panels-20260511-2");
  loadJs("assets/fw-notification-jump.js?v=notification-jump-20260511-1");
  loadJs("assets/fw-buddy-actions-menu.js?v=buddy-actions-menu-20260511-2");
  loadJs("assets/fw-admin-buddy-lock.js?v=admin-buddy-lock-20260513-1");
  loadJs("assets/fw-report-rpc.js?v=report-rpc-20260513-1");
  if(isAdmin) loadJs("assets/fw-admin-polish.js?v=admin-polish-20260513-1");
  loadJs("assets/fw-echo-post-preview.js?v=echo-post-preview-20260512-1");
  loadJs("assets/fw-notification-split-fix.js?v=notification-split-fix-20260513-1");

  if(document.querySelector("[data-weekly-grid]")){
    loadJs("assets/fw-archive-enhance.js?v=archive-leaderboard-20260511-1");
  }
})();
