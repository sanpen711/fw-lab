(function(){
  if(window.FWAppRooms) return;

  var MAX_OPTIONS = 20;
  var INITIAL_OPTION_COUNT = 4;
  var loaded = false;
  var loading = false;
  var polls = [];
  var renderTimer = null;

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function $$(selector, root){ return app().$$(selector, root); }
  function esc(value){ return app().esc(value); }
  function db(){ return app().db(); }

  function toast(message){ app().toast(message); }
  function client(){ return db() && db().client; }
  function fail(result, message){ if(result && result.error) throw new Error(message || result.error.message || '操作失败'); return result ? result.data : null; }
  function scrollNode(){ return $('#appMain') || $('.app-main') || document.scrollingElement || document.documentElement; }
  function snapshotScroll(){
    var node = scrollNode();
    return node ? {node:node, top:node.scrollTop || 0} : null;
  }
  function restoreScroll(snapshot){
    if(!snapshot || !snapshot.node) return;
    var node = snapshot.node;
    var top = snapshot.top || 0;
    requestAnimationFrame(function(){
      node.scrollTop = top;
      setTimeout(function(){ node.scrollTop = top; }, 0);
      setTimeout(function(){ node.scrollTop = top; }, 80);
    });
  }

  function isEnded(poll){ return !!poll.closed_at || new Date(poll.ends_at).getTime() <= Date.now(); }
  function dateText(value){ if(!value) return ''; return new Date(value).toLocaleDateString('zh-CN', {month:'2-digit', day:'2-digit'}); }
  function remainingText(value){
    var ms = new Date(value).getTime() - Date.now();
    if(!Number.isFinite(ms) || ms <= 0) return '已结束';
    var minutes = Math.ceil(ms / 60000);
    var days = Math.floor(minutes / 1440);
    var hours = Math.floor((minutes % 1440) / 60);
    var mins = minutes % 60;
    if(days > 0) return days + '天' + (hours ? ' ' + hours + '小时' : '');
    if(hours > 0) return hours + '小时' + (mins ? ' ' + mins + '分钟' : '');
    return mins + '分钟';
  }
  function getProfile(row){ return Array.isArray(row && row.profiles) ? row.profiles[0] : row && row.profiles || {}; }
  function authorName(row){ var profile = getProfile(row); return profile.nickname || '匿名研究员'; }
  function participantCount(poll){ return Number(poll.participantCount || 0); }
  function countVotes(options, poll){
    var stats = poll.stats || {};
    var counts = {};
    (options || []).forEach(function(option){ counts[option.id] = Number(stats[option.id] || 0); });
    return counts;
  }
  function conclusionText(poll, options){
    if(poll.conclusion) return poll.conclusion;
    var total = participantCount(poll);
    if(!total) return '样本量仍为 0，本课题暂时没有形成有效研究结论。';
    var counts = countVotes(options, poll);
    var max = Math.max.apply(null, options.map(function(option){ return counts[option.id] || 0; }));
    var winners = options.filter(function(option){ return (counts[option.id] || 0) === max; });
    if(winners.length > 1) return '样本显示「' + winners.map(function(w){ return w.label; }).join('」「') + '」并列领先，各获得 ' + max + ' 票。';
    var percent = Math.round((max / total) * 100);
    return '样本倾向于「' + winners[0].label + '」，获得 ' + max + ' 票，占参与样本的 ' + percent + '%。';
  }
  function canDeleteOption(poll, option){ return !!app().state.user && !isEnded(poll) && option.source === 'user' && String(option.user_id) === String(app().state.user.id); }
  function canPromotePoll(poll){ return !!(app().state.user && app().state.user.isAdmin) && !poll.is_official && !isEnded(poll); }

  function renderOptions(poll, options){
    var total = participantCount(poll);
    var counts = countVotes(options, poll);
    var ended = isEnded(poll);
    var myVote = poll.myVote || null;
    return (options || []).map(function(option){
      var count = counts[option.id] || 0;
      var percent = total ? Math.round((count / total) * 100) : 0;
      var selected = !!myVote && String(myVote.option_id) === String(option.id);
      var deleteButton = canDeleteOption(poll, option) ? '<button class="mobile-poll-delete-option" type="button" data-room-delete-option data-option-id="' + esc(option.id) + '">删除</button>' : '';
      return '<div class="mobile-poll-option-row">' +
        '<button class="mobile-poll-option' + (selected ? ' selected' : '') + '" type="button" data-room-vote data-poll-id="' + esc(poll.id) + '" data-option-id="' + esc(option.id) + '"' + (ended ? ' disabled' : '') + '>' +
          '<span class="mobile-poll-option-main"><span class="mobile-poll-option-label">' + esc(option.label) + '</span><span class="mobile-poll-option-count">' + count + '票 · ' + percent + '%</span></span>' +
          '<span class="mobile-poll-bar"><span style="width:' + percent + '%"></span></span>' +
        '</button>' + deleteButton + '</div>';
    }).join('');
  }

  function renderAddOption(poll, options){
    if(isEnded(poll)) return '<p class="mobile-poll-note">课题已截止，不能再新增选项。</p>';
    if((options || []).length >= MAX_OPTIONS) return '<p class="mobile-poll-note">选项已达 20 个上限。</p>';
    var user = app().state.user;
    var myAdded = !!user && (options || []).some(function(option){ return option.source === 'user' && String(option.user_id) === String(user.id); });
    if(myAdded) return '<p class="mobile-poll-note">你已经为这个课题补充过 1 个选项。</p>';
    return '<form class="mobile-poll-add" data-room-add-option data-poll-id="' + esc(poll.id) + '"><input name="option" maxlength="80" placeholder="补充一个新选项"><button type="submit">新增并投票</button></form>';
  }

  function renderCard(poll){
    var options = poll.options || [];
    var ended = isEnded(poll);
    var total = participantCount(poll);
    var myVote = poll.myVote || null;
    return '<article class="mobile-poll-card' + (poll.is_official ? ' is-official' : '') + (ended ? ' is-ended' : '') + '" data-poll-id="' + esc(poll.id) + '">' +
      '<div class="mobile-poll-head"><div><div class="mobile-poll-tags"><span class="mobile-poll-tag ' + (poll.is_official ? 'official' : '') + '">' + (poll.is_official ? '官方课题' : '用户课题') + '</span><span class="mobile-poll-tag ' + (ended ? 'ended' : 'live') + '">' + (ended ? '已结束' : '研究中') + '</span></div>' +
      '<h2>' + esc(poll.title) + '</h2><p class="mobile-poll-meta">由 ' + esc(authorName(poll)) + ' 发起 · ' + esc(dateText(poll.created_at)) + ' 发布 · 默认 7 天截止</p>' + (canPromotePoll(poll) ? '<button class="mobile-poll-promote" type="button" data-room-promote data-poll-id="' + esc(poll.id) + '">设为官方课题</button>' : '') + '</div>' +
      '<div class="mobile-poll-deadline"><b>' + esc(remainingText(poll.ends_at)) + '</b><span>' + (ended ? '截止状态' : '剩余时间') + '</span></div></div>' +
      '<div class="mobile-poll-options">' + renderOptions(poll, options) + '</div>' + renderAddOption(poll, options) +
      (ended ? '<div class="mobile-poll-conclusion"><b>研究结论</b><p>' + esc(conclusionText(poll, options)) + '</p></div>' : '') +
      '<div class="mobile-poll-metrics"><span><strong>' + total + '</strong>参与</span><span><strong>' + options.length + '</strong>选项</span><span><strong>' + total + '</strong>总票</span><span><strong>' + (myVote ? '已投' : '未投') + '</strong>状态</span></div>' +
    '</article>';
  }

  function render(){
    var list = $('[data-mobile-polls-list]');
    var count = $('[data-mobile-poll-count]');
    var active = $('[data-mobile-active-poll-count]');
    if(!list) return;
    var rows = polls.slice().sort(function(a, b){
      var official = Number(b.is_official) - Number(a.is_official); if(official) return official;
      var live = Number(!isEnded(b)) - Number(!isEnded(a)); if(live) return live;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    if(count) count.textContent = String(rows.length);
    if(active) active.textContent = String(rows.filter(function(poll){ return !isEnded(poll); }).length);
    list.innerHTML = rows.length ? rows.map(renderCard).join('') : '<div class="mobile-poll-empty">还没有投票课题。可以先发起一个 7 天研究。</div>';
  }

  async function updateTodayCount(){
    var node = $('[data-mobile-today-count]');
    if(!node) return;
    if(!app().state.user || !client()){ node.textContent = '登录后可见'; return; }
    try{
      var data = fail(await client().rpc('fw_my_poll_daily_count'), '今日次数读取失败');
      node.textContent = String(data || 0) + '/3';
    }catch(e){ node.textContent = '读取失败'; }
  }

  async function load(force, options){
    options = options || {};
    var scrollSnapshot = options.preserveScroll || null;
    if(loading) return;
    if(loaded && !force){ render(); if(scrollSnapshot) restoreScroll(scrollSnapshot); return; }
    loading = true;
    var status = $('[data-mobile-polls-status]');
    var list = $('[data-mobile-polls-list]');
    var shouldShowLoadingPlaceholder = !polls.length;
    if(status) status.textContent = '正在读取学术研讨课题...';
    if(list && shouldShowLoadingPlaceholder) list.innerHTML = '<div class="mobile-poll-empty">正在读取学术研讨课题...</div>';
    try{
      await app().refreshUser();
      if(!(await app().waitForDb())) throw new Error('暂时无法连接数据服务。');
      var c = client();
      var pollRows = fail(await c.from('polls').select('id,user_id,title,is_official,created_at,ends_at,closed_at,conclusion,is_deleted,profiles(nickname,avatar_url)').eq('is_deleted', false).order('is_official', {ascending:false}).order('created_at', {ascending:false}).limit(80), '课题读取失败') || [];
      var ids = pollRows.map(function(p){ return p.id; });
      if(!ids.length){ polls = []; loaded = true; render(); if(status) status.textContent = ''; await updateTodayCount(); if(scrollSnapshot) restoreScroll(scrollSnapshot); return; }
      var optionRows = fail(await c.from('poll_options').select('id,poll_id,user_id,label,source,created_at').in('poll_id', ids).order('created_at', {ascending:true}), '选项读取失败') || [];
      var statsRows = fail(await c.rpc('fw_poll_vote_stats'), '投票统计读取失败') || [];
      var myVoteRows = [];
      if(app().state.user) myVoteRows = fail(await c.rpc('fw_my_poll_votes'), '我的投票读取失败') || [];
      var idSet = {};
      ids.forEach(function(id){ idSet[String(id)] = true; });
      var optionsByPoll = {};
      optionRows.forEach(function(option){ (optionsByPoll[option.poll_id] = optionsByPoll[option.poll_id] || []).push(option); });
      var statsByPoll = {};
      var participantByPoll = {};
      statsRows.forEach(function(row){
        if(!idSet[String(row.poll_id)]) return;
        statsByPoll[row.poll_id] = statsByPoll[row.poll_id] || {};
        statsByPoll[row.poll_id][row.option_id] = Number(row.vote_count || 0);
        participantByPoll[row.poll_id] = Number(row.poll_participant_count || 0);
      });
      var myVotesByPoll = {};
      myVoteRows.forEach(function(row){ if(idSet[String(row.poll_id)]) myVotesByPoll[row.poll_id] = {poll_id:row.poll_id, option_id:row.option_id}; });
      polls = pollRows.map(function(poll){ poll.options = optionsByPoll[poll.id] || []; poll.stats = statsByPoll[poll.id] || {}; poll.participantCount = participantByPoll[poll.id] || 0; poll.myVote = myVotesByPoll[poll.id] || null; return poll; });
      loaded = true;
      render();
      await updateTodayCount();
      if(status) status.textContent = '';
      if(scrollSnapshot) restoreScroll(scrollSnapshot);
    }catch(e){
      console.warn('[FW mobile app] rooms load failed', e);
      if(!polls.length) render();
      if(status) status.textContent = '课题暂时读取失败，请稍后刷新';
      if(scrollSnapshot) restoreScroll(scrollSnapshot);
    }finally{ loading = false; }
  }

  function toggleCreate(show){
    var panel = $('[data-mobile-poll-create-panel]');
    if(!panel) return;
    panel.hidden = !show;
    if(show){
      var official = $('[data-mobile-official-wrap]');
      if(official) official.hidden = !(app().state.user && app().state.user.isAdmin);
      var title = $('[data-mobile-poll-form] input[name="title"]');
      if(title) setTimeout(function(){ title.focus(); }, 0);
    }
  }

  function validate(form){
    var title = String(form.title && form.title.value || '').trim();
    var inputs = $$('[data-mobile-option-input]', form);
    var options = inputs.map(function(input){ return String(input.value || '').trim(); });
    if(!title) return {error:'请先填写课题标题。'};
    if(title.length > 120) return {error:'课题标题最多 120 个字。'};
    if(options.some(function(option){ return !option; })) return {error:'创建投票必须填写 4 个初始选项。'};
    var normalized = options.map(function(option){ return option.toLowerCase(); });
    if((new Set(normalized)).size !== INITIAL_OPTION_COUNT) return {error:'初始选项不能重复。'};
    return {title:title, options:options};
  }

  async function createPoll(form){
    await app().refreshUser();
    if(!app().state.user){ toast('请先登录后再发起投票。'); app().setView('profile'); return; }
    var data = validate(form);
    var notice = $('[data-mobile-poll-form-notice]');
    if(data.error){ if(notice) notice.textContent = data.error; toast(data.error); return; }
    var button = form.querySelector('button[type="submit"]');
    var old = button.textContent;
    button.disabled = true;
    button.textContent = '提交中...';
    try{
      var officialInput = form.querySelector('[name="is_official"]');
      var isOfficial = !!(app().state.user && app().state.user.isAdmin && officialInput && officialInput.checked);
      fail(await client().rpc('fw_create_poll', {p_title:data.title, p_options:data.options, p_is_official:isOfficial}), '发布失败');
      form.reset();
      if(notice) notice.textContent = '';
      toggleCreate(false);
      toast(isOfficial ? '官方课题已置顶发布。' : '投票课题已发布。');
      loaded = false;
      await load(true);
    }catch(e){ if(notice) notice.textContent = e.message || '发布失败'; toast(e.message || '发布失败，请稍后再试。'); }
    finally{ button.disabled = false; button.textContent = old; }
  }

  async function vote(button){
    var scroll = snapshotScroll();
    await app().refreshUser();
    if(!app().state.user){ toast('登录后才能投票。'); app().setView('profile'); return; }
    button.disabled = true;
    try{
      fail(await client().rpc('fw_vote_poll', {p_poll_id:Number(button.dataset.pollId), p_option_id:Number(button.dataset.optionId)}), '投票失败');
      toast('投票已记录，截止前可以改票。');
      loaded = false;
      await load(true, {preserveScroll:scroll});
    }catch(e){ toast(e.message || '投票失败，请稍后再试。'); restoreScroll(scroll); }
    finally{ button.disabled = false; }
  }

  async function addOption(form){
    var scroll = snapshotScroll();
    await app().refreshUser();
    if(!app().state.user){ toast('登录后才能新增选项。'); app().setView('profile'); return; }
    var input = form.querySelector('input[name="option"]');
    var label = String(input && input.value || '').trim();
    if(!label){ toast('请先填写新增选项。'); if(input) input.focus(); return; }
    var button = form.querySelector('button');
    var old = button.textContent;
    button.disabled = true;
    button.textContent = '新增中...';
    try{
      var optionId = fail(await client().rpc('fw_add_poll_option', {p_poll_id:Number(form.dataset.pollId), p_label:label}), '新增选项失败');
      if(optionId) fail(await client().rpc('fw_vote_poll', {p_poll_id:Number(form.dataset.pollId), p_option_id:Number(optionId)}), '投票失败');
      toast('新选项已加入研究样本。');
      loaded = false;
      await load(true, {preserveScroll:scroll});
    }catch(e){ toast(e.message || '新增选项失败，请稍后再试。'); restoreScroll(scroll); }
    finally{ button.disabled = false; button.textContent = old; }
  }

  async function deleteOption(button){
    var scroll = snapshotScroll();
    await app().refreshUser();
    if(!app().state.user){ toast('登录后才能删除补充选项。'); return; }
    if(!window.confirm('确定删除这个补充选项吗？已有投票的选项不能删除。')) return;
    button.disabled = true;
    try{
      fail(await client().rpc('fw_delete_my_poll_option', {p_option_id:Number(button.dataset.optionId)}), '删除失败');
      toast('补充选项已删除。');
      loaded = false;
      await load(true, {preserveScroll:scroll});
    }catch(e){ toast(e.message || '删除失败，请稍后再试。'); restoreScroll(scroll); }
    finally{ button.disabled = false; }
  }

  async function promotePoll(button){
    var scroll = snapshotScroll();
    await app().refreshUser();
    if(!(app().state.user && app().state.user.isAdmin)){ toast('只有管理员可以设置官方课题。'); return; }
    if(!window.confirm('确定将这个课题设为官方课题并置顶吗？')) return;
    button.disabled = true;
    try{
      fail(await client().rpc('fw_promote_poll_to_official', {p_poll_id:Number(button.dataset.pollId)}), '设置失败');
      toast('已设为官方课题并置顶。');
      loaded = false;
      await load(true, {preserveScroll:scroll});
    }catch(e){ toast(e.message || '设为官方课题失败，请稍后再试。'); restoreScroll(scroll); }
    finally{ button.disabled = false; }
  }

  function bind(){
    document.addEventListener('click', function(e){
      var open = e.target.closest && e.target.closest('[data-mobile-poll-open-create]');
      if(open){ e.preventDefault(); app().refreshUser().then(function(){ if(!app().state.user){ toast('请先登录后再发起投票。'); app().setView('profile'); return; } toggleCreate(true); }); return; }
      var close = e.target.closest && e.target.closest('[data-mobile-poll-close-create]');
      if(close){ e.preventDefault(); toggleCreate(false); return; }
      var refresh = e.target.closest && e.target.closest('[data-mobile-poll-refresh]');
      if(refresh){ e.preventDefault(); loaded = false; load(true, {preserveScroll:snapshotScroll()}); return; }
      var voteBtn = e.target.closest && e.target.closest('[data-room-vote]');
      if(voteBtn){ e.preventDefault(); vote(voteBtn); return; }
      var del = e.target.closest && e.target.closest('[data-room-delete-option]');
      if(del){ e.preventDefault(); deleteOption(del); return; }
      var promote = e.target.closest && e.target.closest('[data-room-promote]');
      if(promote){ e.preventDefault(); promotePoll(promote); }
    });
    document.addEventListener('submit', function(e){
      var form = e.target.closest && e.target.closest('[data-mobile-poll-form]');
      if(form){ e.preventDefault(); createPoll(form); return; }
      var add = e.target.closest && e.target.closest('[data-room-add-option]');
      if(add){ e.preventDefault(); addOption(add); }
    });
  }

  function init(){
    bind();
    clearInterval(renderTimer);
    renderTimer = setInterval(render, 60000);
  }
  function ensureLoaded(){ load(false); }

  window.FWAppRooms = {init:init, load:load, ensureLoaded:ensureLoaded};
})();
