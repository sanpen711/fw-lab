// F.w 研究所：手机端废话档案榜单
(function(){
  if(window.FWAppArchive) return;

  var loaded = false;
  var loading = false;
  var currentDailyType = 'like';
  var dailyRankings = {like:[], same:[], tissue:[]};

  var AWARDS = {
    like:{title:'点赞之王', en:'LIKE KING', medal:'赞', tab:'点赞榜', quote:'代表废话', unit:'赞'},
    same:{title:'共鸣王', en:'RESONANCE KING', medal:'鸣', tab:'共鸣榜', quote:'代表共鸣', unit:'鸣'},
    tissue:{title:'纸巾王', en:'TISSUE KING', medal:'纸', tab:'纸巾榜', quote:'代表破防', unit:'纸'}
  };
  var roomName = {'已疲惫':'精神广场','摸鱼现场':'精神广场','精神离岗':'精神广场','今日无效':'精神广场','今日崩溃':'精神广场'};

  function app(){ return window.FWApp || null; }
  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function esc(value){
    var fw = app();
    if(fw && fw.esc) return fw.esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function initials(name){
    var fw = app();
    if(fw && fw.initials) return fw.initials(name);
    return String(name || 'FW').trim().slice(0, 2).toUpperCase() || 'FW';
  }
  function client(){
    var fw = app();
    var db = fw && fw.db && fw.db();
    return db && db.client;
  }
  function fail(result, message){
    if(result && result.error) throw new Error(message || result.error.message || '读取失败');
    return result ? result.data : null;
  }
  function avatarHtml(user, cls){
    user = user || {};
    var name = user.nickname || '匿名研究员';
    var url = user.avatar_url || '';
    cls = cls || 'archive-avatar';
    return url ? '<span class="' + cls + '"><img src="' + esc(url) + '" alt="' + esc(name) + '"></span>' : '<span class="' + cls + '">' + esc(initials(name)) + '</span>';
  }
  function shortText(text, max){
    text = String(text || '').replace(/\s+/g, ' ').trim();
    max = max || 70;
    return text.length > max ? text.slice(0, max) + '...' : text;
  }
  function startOfDay(date){
    var d = new Date(date || Date.now());
    d.setHours(0,0,0,0);
    return d;
  }
  function addDays(date, n){
    var d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }
  function getRanges(){
    var today = startOfDay(new Date());
    var yesterday = addDays(today, -1);
    var day = today.getDay();
    var daysSinceMonday = (day + 6) % 7;
    var thisMonday = addDays(today, -daysSinceMonday);
    var lastMonday = addDays(thisMonday, -7);
    return {today:today, yesterday:yesterday, thisMonday:thisMonday, lastMonday:lastMonday};
  }
  function fmtDate(d){ return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }

  function injectStyle(){
    if($('#fwMobileArchiveStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileArchiveStyle';
    style.textContent = [
      '[data-app-view="archive"]{padding-bottom:94px}',
      '.mobile-archive-shell{display:grid;gap:16px}',
      '.mobile-archive-hero{position:relative;overflow:hidden;border:1px solid rgba(16,23,15,.12);border-radius:24px;background:linear-gradient(145deg,#fffdf7,#f3ecdf);padding:18px;box-shadow:0 16px 40px rgba(16,23,15,.08)}',
      '.mobile-archive-hero:after{content:"";position:absolute;right:-54px;top:-64px;width:170px;height:170px;border-radius:999px;background:rgba(217,121,121,.16)}',
      '.mobile-archive-eyebrow{position:relative;z-index:1;color:var(--accent-dark);font-size:12px;font-weight:1000;letter-spacing:.11em;text-transform:uppercase}',
      '.mobile-archive-hero h2{position:relative;z-index:1;margin:10px 0 8px;color:var(--deep);font-size:34px;line-height:1.02;letter-spacing:-.08em;font-weight:1000}',
      '.mobile-archive-hero p{position:relative;z-index:1;margin:0;color:var(--muted);font-size:14px;line-height:1.65;font-weight:850}',
      '.mobile-archive-update{position:relative;z-index:1;margin-top:14px;padding:12px;border-radius:16px;background:rgba(16,23,15,.06);color:var(--deep);font-size:13px;line-height:1.55;font-weight:950}',
      '.mobile-archive-section{display:grid;gap:12px;border:1px solid rgba(16,23,15,.1);border-radius:22px;background:#fffdf7;padding:14px;box-shadow:0 12px 32px rgba(16,23,15,.06)}',
      '.mobile-archive-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}',
      '.mobile-archive-head h3{margin:0;color:var(--deep);font-size:23px;line-height:1.08;letter-spacing:-.06em;font-weight:1000}',
      '.mobile-archive-head p{margin:0;color:var(--muted);font-size:12px;font-weight:900;white-space:nowrap}',
      '.mobile-archive-grid{display:grid;gap:12px}',
      '.mobile-award-card{display:grid;gap:12px;border:1px solid rgba(16,23,15,.1);border-radius:18px;background:linear-gradient(180deg,#fffaf1,#fffdf7);padding:14px;overflow:hidden}',
      '.mobile-award-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}',
      '.mobile-award-title small{display:block;color:var(--accent-dark);font-size:11px;font-weight:1000;letter-spacing:.09em}',
      '.mobile-award-title b{display:block;margin-top:4px;color:var(--deep);font-size:22px;line-height:1.05;letter-spacing:-.05em}',
      '.mobile-medal{width:42px;height:42px;border-radius:999px;background:var(--deep);color:#fff;display:grid;place-items:center;font-size:14px;font-weight:1000;box-shadow:0 8px 18px rgba(16,23,15,.16)}',
      '.mobile-podium{display:grid;grid-template-columns:1fr 1.05fr 1fr;align-items:end;gap:8px;min-height:176px}',
      '.mobile-winner{display:grid;gap:7px;justify-items:center;text-align:center;min-width:0}',
      '.mobile-winner.first{order:2}.mobile-winner.second{order:1}.mobile-winner.third{order:3}',
      '.mobile-winner .archive-avatar{width:48px;height:48px;border-radius:999px;border:2px solid rgba(16,23,15,.4);background:#fff;display:grid;place-items:center;overflow:hidden;color:var(--deep);font-weight:1000}',
      '.mobile-winner.first .archive-avatar{width:58px;height:58px;border-color:#d8a84a;background:var(--deep);color:#fff}',
      '.archive-avatar img{width:100%;height:100%;object-fit:cover;display:block}',
      '.mobile-winner-name{width:100%;color:var(--deep);font-size:12px;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.mobile-winner-score{font-size:20px;letter-spacing:-.06em;font-weight:1000;color:var(--accent-dark)}',
      '.mobile-podium-block{width:100%;border-radius:12px 12px 4px 4px;display:grid;place-items:center;color:#fff;font-size:28px;font-weight:1000;text-shadow:0 2px 0 rgba(0,0,0,.2)}',
      '.mobile-winner.first .mobile-podium-block{height:82px;background:linear-gradient(180deg,#d8a84a,#9d6d1e)}',
      '.mobile-winner.second .mobile-podium-block{height:62px;background:linear-gradient(180deg,#c5c4bc,#7c7b75)}',
      '.mobile-winner.third .mobile-podium-block{height:50px;background:linear-gradient(180deg,#c48a5d,#7f4e31)}',
      '.mobile-archive-quote{border-left:4px solid rgba(217,121,121,.75);background:rgba(217,121,121,.08);border-radius:12px;padding:11px;color:var(--muted);font-size:13px;line-height:1.6;font-weight:850}',
      '.mobile-archive-quote b{color:var(--accent-dark)}',
      '.mobile-archive-tabs{display:flex;gap:8px;overflow:auto;-webkit-overflow-scrolling:touch}',
      '.mobile-archive-tabs button{flex:0 0 auto;min-height:36px;border:1px solid rgba(16,23,15,.13);border-radius:999px;background:#fffdf7;color:var(--muted);padding:0 13px;font-size:13px;font-weight:1000}',
      '.mobile-archive-tabs button.active{background:var(--deep);border-color:var(--deep);color:#fff}',
      '.mobile-daily-list{display:grid;gap:8px}',
      '.mobile-daily-row{display:grid;grid-template-columns:34px 42px minmax(0,1fr) 54px;gap:9px;align-items:center;padding:10px;border:1px solid rgba(16,23,15,.08);border-radius:14px;background:#fffaf1}',
      '.mobile-daily-row .num{color:var(--accent-dark);font-size:12px;font-weight:1000}',
      '.mobile-daily-row .archive-avatar{width:38px;height:38px;border-radius:999px;background:var(--deep);color:#fff;display:grid;place-items:center;overflow:hidden;font-size:12px;font-weight:1000}',
      '.mobile-daily-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--deep);font-size:14px;font-weight:1000}',
      '.mobile-daily-count{text-align:right;color:var(--accent-dark);font-size:19px;font-weight:1000;letter-spacing:-.05em}',
      '.mobile-history-grid{display:grid;gap:10px}',
      '.mobile-history-card{border:1px solid rgba(16,23,15,.1);border-radius:16px;background:#fffaf1;padding:13px}',
      '.mobile-history-card small{color:var(--accent-dark);font-size:11px;font-weight:1000;letter-spacing:.08em}',
      '.mobile-history-card h4{margin:7px 0 7px;color:var(--deep);font-size:20px;line-height:1.1;letter-spacing:-.05em}',
      '.mobile-history-card p{margin:0;color:var(--muted);font-size:13px;line-height:1.55;font-weight:850}',
      '.mobile-archive-rule{display:grid;gap:8px;border-radius:18px;background:var(--deep);color:#fff;padding:14px}',
      '.mobile-archive-rule b{font-size:18px;letter-spacing:-.04em}',
      '.mobile-archive-rule span{color:rgba(255,255,255,.72);font-size:13px;line-height:1.6;font-weight:850}',
      '.mobile-archive-empty{padding:18px;border:1px dashed rgba(16,23,15,.18);border-radius:16px;background:rgba(255,253,247,.75);color:var(--muted);text-align:center;font-size:13px;line-height:1.6;font-weight:900}',
      '.mobile-archive-actions{display:flex;gap:8px;flex-wrap:wrap}',
      '.mobile-archive-actions button{min-height:36px;border:1px solid rgba(16,23,15,.13);border-radius:999px;background:#fffdf7;color:var(--deep);padding:0 13px;font-size:13px;font-weight:1000}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureShell(){
    var view = $('[data-app-view="archive"]');
    if(!view) return null;
    if($('[data-mobile-archive-shell]', view)) return $('[data-mobile-archive-shell]', view);
    var grid = $('.rank-grid', view);
    var shell = document.createElement('div');
    shell.className = 'mobile-archive-shell';
    shell.dataset.mobileArchiveShell = 'true';
    shell.innerHTML = [
      '<section class="mobile-archive-hero">',
        '<div class="mobile-archive-eyebrow">WEEKLY / DAILY LOW POWER RANKING</div>',
        '<h2>废话档案</h2>',
        '<p>自动整理精神广场里的点赞、共鸣和纸巾数据。榜单不是为了竞争，是为了证明大家都在以不同方式坚持上班。</p>',
        '<div class="mobile-archive-update" data-mobile-archive-update>正在计算下次更新时间...</div>',
      '</section>',
      '<section class="mobile-archive-section">',
        '<div class="mobile-archive-head"><div><div class="mobile-archive-eyebrow">LAST WEEK HONOR WALL</div><h3>上周低功耗荣誉榜</h3></div><p>前三名</p></div>',
        '<div class="mobile-archive-grid" data-mobile-weekly-grid><div class="mobile-archive-empty">正在整理上周榜单...</div></div>',
      '</section>',
      '<section class="mobile-archive-section">',
        '<div class="mobile-archive-head"><div><div class="mobile-archive-eyebrow">YESTERDAY TOP 10</div><h3>昨日情绪残留榜</h3></div><p>0 点更新</p></div>',
        '<div class="mobile-archive-tabs" data-mobile-archive-tabs><button class="active" type="button" data-mobile-daily-type="like">点赞榜</button><button type="button" data-mobile-daily-type="same">共鸣榜</button><button type="button" data-mobile-daily-type="tissue">纸巾榜</button></div>',
        '<div class="mobile-daily-list" data-mobile-daily-list><div class="mobile-archive-empty">正在整理昨日榜单...</div></div>',
      '</section>',
      '<section class="mobile-archive-rule"><b>档案规则</b><span>自己给自己的反应可以显示，但不计入榜单；同一用户对同一条内容同一类型只统计 1 次；删除或被处理的内容不会进入榜单。</span></section>',
      '<section class="mobile-archive-section">',
        '<div class="mobile-archive-head"><div><div class="mobile-archive-eyebrow">PAST ARCHIVES</div><h3>历代废话档案</h3></div><p>预览</p></div>',
        '<div class="mobile-history-grid" data-mobile-history-grid><div class="mobile-archive-empty">正在整理归档预览...</div></div>',
      '</section>',
      '<div class="mobile-archive-actions"><button type="button" data-mobile-archive-refresh>刷新榜单</button></div>'
    ].join('');
    if(grid) grid.replaceWith(shell);
    else view.appendChild(shell);
    return shell;
  }

  function setNextUpdateText(){
    var ranges = getRanges();
    var nextDay = addDays(ranges.today, 1);
    var nextMonday = addDays(ranges.thisMonday, 7);
    var box = $('[data-mobile-archive-update]');
    if(box) box.innerHTML = '周榜：' + fmtDate(nextMonday) + ' 00:00 更新<br>日榜：' + fmtDate(nextDay) + ' 00:00 更新';
  }

  async function fetchRankings(start, end, type, limit){
    var db = client();
    if(!db) return [];
    var postResult = await db
      .from('posts')
      .select('id,user_id,content,status_tag,created_at,is_deleted')
      .eq('is_deleted', false)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', {ascending:false})
      .limit(1000);
    if(postResult.error) throw postResult.error;
    var posts = postResult.data || [];
    if(!posts.length) return [];
    var postIds = posts.map(function(p){ return p.id; });
    var userIds = Array.from(new Set(posts.map(function(p){ return p.user_id; }).filter(Boolean)));
    var postMap = {};
    posts.forEach(function(p){ postMap[p.id] = p; });
    var profileResult = await db.from('profiles').select('id,nickname,avatar_url').in('id', userIds);
    if(profileResult.error) throw profileResult.error;
    var reactionResult = await db.from('reactions').select('post_id,user_id,type').in('post_id', postIds).eq('type', type);
    if(reactionResult.error) throw reactionResult.error;
    var profiles = {};
    (profileResult.data || []).forEach(function(p){ profiles[p.id] = p; });
    var users = {};
    var postScores = {};
    (reactionResult.data || []).forEach(function(r){
      var post = postMap[r.post_id];
      if(!post) return;
      if(r.user_id && post.user_id && String(r.user_id) === String(post.user_id)) return;
      var uid = post.user_id;
      if(!uid) return;
      postScores[post.id] = (postScores[post.id] || 0) + 1;
      if(!users[uid]){
        users[uid] = {
          user_id:uid,
          nickname:profiles[uid] && profiles[uid].nickname || '匿名研究员',
          avatar_url:profiles[uid] && profiles[uid].avatar_url || '',
          score:0,
          topPost:post,
          topPostScore:0
        };
      }
      users[uid].score += 1;
    });
    Object.keys(users).forEach(function(uid){
      posts.filter(function(p){ return String(p.user_id) === String(uid); }).forEach(function(p){
        var score = postScores[p.id] || 0;
        if(score > users[uid].topPostScore){
          users[uid].topPost = p;
          users[uid].topPostScore = score;
        }
      });
    });
    return Object.keys(users).map(function(uid){ return users[uid]; }).sort(function(a,b){ return b.score - a.score; }).slice(0, limit);
  }

  function podiumWinner(item, cls, rankNo){
    item = item || {nickname:'暂无上榜', score:0, topPost:{status_tag:'', content:'暂无'}};
    return '<div class="mobile-winner ' + cls + '">' + avatarHtml(item, 'archive-avatar') + '<div class="mobile-winner-name">' + esc(item.nickname || '暂无上榜') + '</div><div class="mobile-winner-score">' + Number(item.score || 0) + '</div><div class="mobile-podium-block">' + rankNo + '</div></div>';
  }
  function renderAwardCard(type, items){
    var cfg = AWARDS[type];
    items = items || [];
    if(!items.length){
      return '<article class="mobile-award-card"><div class="mobile-award-title"><div><small>' + cfg.en + '</small><b>' + cfg.title + '</b></div><div class="mobile-medal">' + cfg.medal + '</div></div><div class="mobile-archive-empty">上周还没有产生' + cfg.title + '。多发一点废话，榜单就会动起来。</div><div class="mobile-archive-quote"><b>' + cfg.quote + '：</b>暂无。</div></article>';
    }
    var first = items[0] || {};
    var second = items[1] || {nickname:'暂无第二名', score:0, topPost:{}};
    var third = items[2] || {nickname:'暂无第三名', score:0, topPost:{}};
    var quote = first.topPost && first.topPost.content || '暂无代表废话。';
    var label = roomName[first.topPost && first.topPost.status_tag] || (first.topPost && first.topPost.status_tag) || '精神广场';
    return '<article class="mobile-award-card"><div class="mobile-award-title"><div><small>' + cfg.en + '</small><b>' + cfg.title + '</b></div><div class="mobile-medal">' + cfg.medal + '</div></div><div class="mobile-podium">' + podiumWinner(second, 'second', 2) + podiumWinner(first, 'first', 1) + podiumWinner(third, 'third', 3) + '</div><div class="mobile-archive-quote"><b>' + esc(label) + ' / ' + cfg.quote + '：</b>“' + esc(shortText(quote, 86)) + '”</div></article>';
  }
  function renderWeekly(rankings){
    var grid = $('[data-mobile-weekly-grid]');
    if(!grid) return;
    grid.innerHTML = ['like','same','tissue'].map(function(type){ return renderAwardCard(type, rankings[type] || []); }).join('');
  }
  function renderDaily(type){
    currentDailyType = type || currentDailyType;
    $$('.mobile-archive-tabs [data-mobile-daily-type]').forEach(function(button){ button.classList.toggle('active', button.dataset.mobileDailyType === currentDailyType); });
    var list = $('[data-mobile-daily-list]');
    if(!list) return;
    var rows = dailyRankings[currentDailyType] || [];
    if(!rows.length){
      list.innerHTML = '<div class="mobile-archive-empty">昨日还没有产生这个榜单。今天先去精神广场点一点。</div>';
      return;
    }
    list.innerHTML = rows.map(function(row, i){
      return '<div class="mobile-daily-row"><span class="num">' + String(i + 1).padStart(2, '0') + '</span>' + avatarHtml(row, 'archive-avatar') + '<span class="mobile-daily-name">' + esc(row.nickname) + '</span><span class="mobile-daily-count">' + Number(row.score || 0) + '</span></div>';
    }).join('');
  }
  function renderHistory(rankings){
    var box = $('[data-mobile-history-grid]');
    if(!box) return;
    var cards = ['like','same','tissue'].map(function(type){
      var cfg = AWARDS[type];
      var one = (rankings[type] || [])[0];
      if(!one) return '<article class="mobile-history-card"><small>上周 / ' + cfg.title + '</small><h4>暂无上榜</h4><p>还没有足够数据进入档案。</p></article>';
      return '<article class="mobile-history-card"><small>上周 / ' + cfg.title + '</small><h4>' + esc(one.nickname) + '</h4><p>' + esc(cfg.title + '：' + shortText(one.topPost && one.topPost.content || '暂无代表废话。', 92)) + '</p></article>';
    });
    cards.push('<article class="mobile-history-card"><small>归档说明</small><h4>自动整理中</h4><p>手机端先展示最近一周预览，后续可以继续扩展更多历史周期。</p></article>');
    box.innerHTML = cards.join('');
  }

  async function load(force){
    if(loading) return;
    if(loaded && !force) return;
    ensureShell();
    setNextUpdateText();
    loading = true;
    try{
      var fw = app();
      if(!fw || !(await fw.waitForDb())) throw new Error('db');
      var ranges = getRanges();
      var results = await Promise.all([
        fetchRankings(ranges.lastMonday, ranges.thisMonday, 'like', 3),
        fetchRankings(ranges.lastMonday, ranges.thisMonday, 'same', 3),
        fetchRankings(ranges.lastMonday, ranges.thisMonday, 'tissue', 3),
        fetchRankings(ranges.yesterday, ranges.today, 'like', 10),
        fetchRankings(ranges.yesterday, ranges.today, 'same', 10),
        fetchRankings(ranges.yesterday, ranges.today, 'tissue', 10)
      ]);
      var weekly = {like:results[0], same:results[1], tissue:results[2]};
      dailyRankings = {like:results[3], same:results[4], tissue:results[5]};
      renderWeekly(weekly);
      renderDaily(currentDailyType);
      renderHistory(weekly);
      loaded = true;
    }catch(e){
      console.warn('[FW mobile app] archive load failed', e);
      var weeklyGrid = $('[data-mobile-weekly-grid]');
      var dailyList = $('[data-mobile-daily-list]');
      var historyGrid = $('[data-mobile-history-grid]');
      if(weeklyGrid) weeklyGrid.innerHTML = '<div class="mobile-archive-empty">榜单暂时读取失败，请稍后刷新。</div>';
      if(dailyList) dailyList.innerHTML = '<div class="mobile-archive-empty">榜单暂时读取失败，请稍后刷新。</div>';
      if(historyGrid) historyGrid.innerHTML = '<div class="mobile-archive-empty">归档预览暂时读取失败。</div>';
    }finally{
      loading = false;
    }
  }

  function bind(){
    document.addEventListener('click', function(e){
      var tab = e.target.closest && e.target.closest('[data-mobile-daily-type]');
      if(tab){
        e.preventDefault();
        renderDaily(tab.dataset.mobileDailyType || 'like');
        return;
      }
      var refresh = e.target.closest && e.target.closest('[data-mobile-archive-refresh]');
      if(refresh){
        e.preventDefault();
        loaded = false;
        load(true);
      }
    });
  }

  function init(){
    injectStyle();
    ensureShell();
    bind();
    if(app() && app().state && app().state.view === 'archive') load(false);
  }
  function ensureLoaded(){ load(false); }

  window.FWAppArchive = {init:init, load:load, ensureLoaded:ensureLoaded};

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();