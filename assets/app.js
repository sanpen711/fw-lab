window.FW_USE_SUPABASE_AUTH = true;
const STORE_KEY = "fw_lab_posts_v1";

const defaultPosts = [
  {id:1,status:"精神离岗",content:"今天开了三个会，最后决定下次再讨论。",time:"3分钟前",resonance:128,same:67,tissue:42,comments:["这句话应该打印出来贴会议室。"]},
  {id:2,status:"今日无效",content:"忙了一天，成果是新增了两个待办。",time:"12分钟前",resonance:96,same:41,tissue:20,comments:[]},
  {id:3,status:"低功耗运行",content:"我不是不想工作，我只是正在以植物的方式参与项目。",time:"27分钟前",resonance:204,same:102,tissue:63,comments:["植物至少还会光合作用。"]},
  {id:4,status:"想发牢骚",content:"每次说同步一下，我都感觉我们只是把混乱换了个更正式的名字。",time:"43分钟前",resonance:77,same:35,tissue:16,comments:[]}
];

function usingSupabase(){
  return Boolean(window.fwDb && window.fwDb.enabled);
}

function getPosts(){
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
  localStorage.setItem(STORE_KEY, JSON.stringify(posts));
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]));
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
        <button data-action="resonance">共鸣 ${post.resonance || 0}</button>
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
      const textarea = form.querySelector("textarea");
      const content = textarea.value.trim();
      if(!content){ textarea.focus(); return; }
      const posts = getPosts();
      posts.unshift({id:Date.now(), status:selected, content, time:"刚刚", resonance:0, same:0, tissue:0, comments:[]});
      savePosts(posts);
      textarea.value = "";
      renderFeeds();
      const notice = form.querySelector("[data-notice]");
      if(notice){
        notice.textContent = "已匿名投递。它现在被研究所收纳了。";
        setTimeout(() => { notice.textContent = ""; }, 2200);
      }
    });
  });
}

function initInteractions(){
  document.body.addEventListener("click", e => {
    if(usingSupabase()) return;
    const btn = e.target.closest("button[data-action]");
    if(!btn) return;
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
  if(btn && nav) btn.addEventListener("click", () => nav.classList.toggle("show"));
}

document.addEventListener("DOMContentLoaded", () => {
  initMenu();
  initPostForm();
  initFilters();
  initInteractions();
  renderFeeds();
});

(function loadSupabaseBridge(){
  const scripts = [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    "assets/supabase-config.js",
    "assets/supabase-db.js",
    "assets/supabase-live.js?v=auth-clean-20260510-7"
  ];
  function loadNext(i){
    if(i >= scripts.length) return;
    const s = document.createElement("script");
    s.src = scripts[i];
    s.defer = false;
    s.onload = () => loadNext(i + 1);
    s.onerror = () => console.warn("Supabase bridge failed to load:", scripts[i]);
    document.head.appendChild(s);
  }
  loadNext(0);
})();

(function loadFwSocialModules(){
  if(window.__FW_SOCIAL_LOADER_CLEAN__) return;
  window.__FW_SOCIAL_LOADER_CLEAN__ = true;

  function loadCss(href){
    if(document.querySelector('link[href="' + href + '"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function loadJs(src){
    if(document.querySelector('script[src="' + src + '"]')) return;
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.defer = false;
    document.body.appendChild(s);
  }

  loadCss('assets/fw-social.css?v=wechat-buddy-center-20260511-4');
  loadJs('assets/fw-site-final-tweaks.js?v=site-final-tweaks-20260512-1');
  loadJs('assets/fw-rooms-chat.js?v=rooms-chat-20260512-1');
  loadJs('assets/fw-social.js?v=social-clean-private-chat-20260510-2');
  loadJs('assets/fw-floating-panels.js?v=floating-panels-20260511-2');
  loadJs('assets/fw-notification-jump.js?v=notification-jump-20260511-1');
  loadJs('assets/fw-buddy-wechat.js?v=wechat-buddy-center-20260511-2');
  loadJs('assets/fw-buddy-actions-menu.js?v=buddy-actions-menu-20260511-2');
  loadJs('assets/fw-echo-post-preview.js?v=echo-post-preview-20260512-1');
  loadJs('assets/fw-stable-core.js?v=stable-core-20260512-1');

  if(document.querySelector('[data-weekly-grid]')){
    loadJs('assets/fw-archive-enhance.js?v=archive-leaderboard-20260511-1');
  }
})();
