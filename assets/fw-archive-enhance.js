// F.w 研究所：废话档案榜单增强脚本
// 作用：渲染上周荣誉榜、昨日榜、历史归档预览；如果上周/昨日没有数据，自动用最近数据兜底。
(function(){
  if(window.__FW_ARCHIVE_ENHANCE__) return;
  window.__FW_ARCHIVE_ENHANCE__ = true;

  const AWARDS = {
    like: {title:'点赞之王', en:'LIKE KING', medal:'赞', quote:'代表废话', color:['gold','silver','bronze']},
    same: {title:'共鸣王', en:'RESONANCE KING', medal:'鸣', quote:'代表共鸣', color:['gold','silver','bronze']},
    tissue: {title:'纸巾王', en:'TISSUE KING', medal:'纸', quote:'代表破防', color:['gold','silver','bronze']}
  };

  let dailyRankings = {like:[], same:[], tissue:[]};
  let weeklyRankings = {like:[], same:[], tissue:[]};
  let currentDailyType = 'like';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function initials(name){
    return String(name || 'FW').trim().slice(0, 2).toUpperCase();
  }

  function avatarHtml(user, cls){
    const name = user && user.nickname ? user.nickname : '匿名研究员';
    const url = user && user.avatar_url ? user.avatar_url : '';
    return url ? `<span class="${cls}"><img src="${esc(url)}" alt="${esc(name)}"></span>` : `<span class="${cls}">${esc(initials(name))}</span>`;
  }

  function crown(color){
    return `<svg class="crown ${color}" viewBox="0 0 64 44" aria-hidden="true"><path d="M8 36h48l4-26-16 12L32 4 20 22 4 10l4 26Zm2 3h44v5H10v-5Z"/></svg>`;
  }

  function waitForDb(){
    return new Promise(resolve => {
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      let count = 0;
      const timer = setInterval(() => {
        count += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(timer); resolve(true); }
        if(count > 120){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  function startOfDay(d){
    const x = new Date(d || new Date());
    x.setHours(0,0,0,0);
    return x;
  }

  function addDays(d, n){
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function getRanges(){
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const yesterday = addDays(today, -1);
    const weekday = today.getDay();
    const daysSinceMonday = (weekday + 6) % 7;
    const thisMonday = addDays(today, -daysSinceMonday);
    const lastMonday = addDays(thisMonday, -7);
    const recent7 = addDays(tomorrow, -7);
    const recent30 = addDays(tomorrow, -30);
    return {today, tomorrow, yesterday, thisMonday, lastMonday, recent7, recent30};
  }

  function fmtDate(d){
    return `${d.getMonth()+1}月${d.getDate()}日`;
  }

  function setNextUpdateText(){
    const {today, thisMonday} = getRanges();
    const nextDay = addDays(today, 1);
    const nextMonday = addDays(thisMonday, 7);
    const box = $('[data-next-update]');
    if(box){
      box.innerHTML = `周榜：${fmtDate(nextMonday)} 00:00<br>日榜：${fmtDate(nextDay)} 00:00`;
    }
  }

  async function fetchRankings(start, end, type, limit){
    const db = window.fwDb && window.fwDb.client;
    if(!db) return [];

    const postResult = await db
      .from('posts')
      .select('id,user_id,content,status_tag,created_at,is_deleted')
      .eq('is_deleted', false)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', {ascending:false})
      .limit(1000);

    if(postResult.error) throw postResult.error;
    const posts = postResult.data || [];
    if(!posts.length) return [];

    const postIds = posts.map(p => p.id);
    const userIds = Array.from(new Set(posts.map(p => p.user_id).filter(Boolean)));
    const postMap = {};
    posts.forEach(p => { postMap[p.id] = p; });

    const [profileResult, reactionResult] = await Promise.all([
      db.from('profiles').select('id,nickname,avatar_url').in('id', userIds),
      db.from('reactions').select('post_id,user_id,type').in('post_id', postIds).eq('type', type)
    ]);

    if(profileResult.error) throw profileResult.error;
    if(reactionResult.error) throw reactionResult.error;

    const profiles = {};
    (profileResult.data || []).forEach(p => { profiles[p.id] = p; });

    const users = {};
    const postScores = {};

    (reactionResult.data || []).forEach(r => {
      const post = postMap[r.post_id];
      if(!post || !post.user_id) return;
      if(r.user_id && r.user_id === post.user_id) return;

      postScores[post.id] = (postScores[post.id] || 0) + 1;

      if(!users[post.user_id]){
        users[post.user_id] = {
          user_id: post.user_id,
          nickname: profiles[post.user_id]?.nickname || '匿名研究员',
          avatar_url: profiles[post.user_id]?.avatar_url || '',
          score: 0,
          topPost: post,
          topPostScore: 0
        };
      }

      users[post.user_id].score += 1;
    });

    Object.values(users).forEach(u => {
      posts.filter(p => p.user_id === u.user_id).forEach(p => {
        const s = postScores[p.id] || 0;
        if(s > u.topPostScore){
          u.topPost = p;
          u.topPostScore = s;
        }
      });
    });

    return Object.values(users)
      .sort((a,b) => b.score - a.score || b.topPostScore - a.topPostScore || new Date(b.topPost.created_at) - new Date(a.topPost.created_at))
      .slice(0, limit || 10);
  }

  async function fetchWithFallback(primaryStart, primaryEnd, fallbackStart, fallbackEnd, type, limit){
    let rows = await fetchRankings(primaryStart, primaryEnd, type, limit);
    if(rows.length) return rows;
    return fetchRankings(fallbackStart, fallbackEnd, type, limit);
  }

  function emptyAward(title){
    return `<article class="award-card"><div class="award-head"><div><small>EMPTY</small><h3>${esc(title)}</h3></div><div class="medal">--</div></div><div class="empty-award">暂时没有可展示的榜单内容。先去精神广场贡献一点低功耗废话。</div><div class="quote"><b>提示：</b>有互动后这里会自动出现领奖台。</div></article>`;
  }

  function winnerHtml(user, index){
    const rankClass = index === 0 ? 'first' : index === 1 ? 'second' : 'third';
    const color = index === 0 ? 'gold' : index === 1 ? 'silver' : 'bronze';
    const status = user.topPost && user.topPost.status_tag ? user.topPost.status_tag : '精神广场';
    return `<div class="winner ${rankClass}">
      <div class="winner-meta">
        ${crown(color)}
        ${avatarHtml(user, 'winner-avatar')}
        <div class="winner-name">${esc(user.nickname)}</div>
        <div class="winner-room">${esc(status)}</div>
        <div class="winner-score">${Number(user.score || 0)}</div>
      </div>
      <div class="podium-block"><em>${index + 1}</em></div>
    </div>`;
  }

  function renderAward(type, rows){
    const cfg = AWARDS[type];
    if(!rows || !rows.length) return emptyAward(cfg.title);
    const top3 = rows.slice(0,3);
    const quotePost = top3[0]?.topPost;
    return `<article class="award-card">
      <div class="award-head"><div><small>${esc(cfg.en)}</small><h3>${esc(cfg.title)}</h3></div><div class="medal">${esc(cfg.medal)}</div></div>
      <div class="podium-stage">${top3.map(winnerHtml).join('')}</div>
      <div class="quote"><b>${esc(cfg.quote)}：</b>${esc(quotePost?.content || '暂无代表发言。')}</div>
    </article>`;
  }

  function renderWeekly(){
    const grid = $('[data-weekly-grid]');
    if(!grid) return;
    grid.innerHTML = ['like','same','tissue'].map(type => renderAward(type, weeklyRankings[type] || [])).join('');
  }

  function renderDaily(){
    const box = $('[data-daily-list]');
    if(!box) return;
    const rows = dailyRankings[currentDailyType] || [];
    if(!rows.length){
      box.innerHTML = '<div class="empty-list">昨日暂时没有产生榜单。今天多点几下，明天这里就热闹了。</div>';
      return;
    }
    box.innerHTML = rows.slice(0,10).map((u,i) => `<div class="daily-row">
      <div class="num">${i+1}</div>
      ${avatarHtml(u, 'small-avatar')}
      <div class="name">${esc(u.nickname)}</div>
      <div class="count">${Number(u.score || 0)}</div>
    </div>`).join('');
  }

  function renderHistory(){
    const box = $('[data-history-grid]');
    if(!box) return;
    const cards = ['like','same','tissue'].map(type => {
      const cfg = AWARDS[type];
      const top = (weeklyRankings[type] || [])[0];
      if(!top){
        return `<article class="history-card"><small>${esc(cfg.en)}</small><h4>${esc(cfg.title)}</h4><p>暂未入档。互动数量达到后会自动展示。</p></article>`;
      }
      return `<article class="history-card"><small>${esc(cfg.en)}</small><h4>${esc(top.nickname)}</h4><p>${esc(cfg.title)} · ${Number(top.score || 0)} 次<br>${esc(top.topPost?.content || '暂无代表发言。')}</p></article>`;
    });
    box.innerHTML = cards.join('') + `<article class="history-card"><small>NOTE</small><h4>归档规则</h4><p>当前先展示最近一轮榜首，后续会继续完善展示。</p></article>`;
  }

  function bindTabs(){
    $$('.tab[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.tab[data-type]').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        currentDailyType = btn.dataset.type || 'like';
        renderDaily();
      });
    });
  }

  async function boot(){
    if(!$('[data-weekly-grid]')) return;
    setNextUpdateText();
    bindTabs();
    const ok = await waitForDb();
    if(!ok){
      const grid = $('[data-weekly-grid]');
      if(grid) grid.innerHTML = '<div class="archive-loading">榜单暂时读取失败，请稍后刷新。</div>';
      return;
    }

    const {today, tomorrow, yesterday, thisMonday, lastMonday, recent7, recent30} = getRanges();

    try{
      const types = ['like','same','tissue'];
      for(const type of types){
        weeklyRankings[type] = await fetchWithFallback(lastMonday, thisMonday, recent7, tomorrow, type, 10);
        dailyRankings[type] = await fetchWithFallback(yesterday, today, today, tomorrow, type, 10);
        if(!dailyRankings[type].length){
          dailyRankings[type] = await fetchRankings(recent30, tomorrow, type, 10);
        }
      }
      renderWeekly();
      renderDaily();
      renderHistory();
    }catch(err){
      const grid = $('[data-weekly-grid]');
      const daily = $('[data-daily-list]');
      if(grid) grid.innerHTML = '<div class="archive-loading">榜单暂时读取失败，请稍后刷新。</div>';
      if(daily) daily.innerHTML = '<div class="empty-list">榜单暂时读取失败，请稍后刷新。</div>';
    }
  }

  window.addEventListener('load', () => setTimeout(boot, 350));
})();