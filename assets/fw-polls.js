// F.w 研究所 学术研讨投票区
(function(){
  const MAX_OPTIONS = 20;
  const INITIAL_OPTION_COUNT = 4;

  const state = {
    user:null,
    polls:[],
    ready:false,
    renderTimer:null
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  const els = {
    form:$('[data-poll-form]'),
    notice:$('[data-poll-form-notice]'),
    list:$('[data-polls-list]'),
    status:$('[data-polls-status]'),
    pollCount:$('[data-poll-count]'),
    activeCount:$('[data-active-poll-count]'),
    todayCount:$('[data-today-count]'),
    officialWrap:$('[data-official-wrap]'),
    refresh:$('[data-poll-refresh]')
  };

  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[ch]));
  }

  function escapeAttr(value){
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function toast(message){
    let node = document.querySelector('.fw-toast');
    if(!node){
      node = document.createElement('div');
      node.className = 'fw-toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(window.__fwPollToastTimer);
    window.__fwPollToastTimer = setTimeout(() => node.classList.remove('show'), 2600);
  }

  function setStatus(message){
    if(els.status) els.status.textContent = message || '';
  }

  function openLogin(){
    const loginBtn = document.querySelector('[data-fw-open], [data-login-cta], [data-sb-open]');
    if(loginBtn) loginBtn.click();
    else toast('请先注册 / 登录。');
  }

  function waitForFwDb(){
    return new Promise(resolve => {
      if(window.fwDb?.enabled) return resolve(true);
      let count = 0;
      const timer = setInterval(() => {
        count++;
        if(window.fwDb?.enabled){
          clearInterval(timer);
          resolve(true);
        }
        if(count > 80){
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  async function refreshUser(){
    if(!window.fwDb?.enabled) return null;
    state.user = await window.fwDb.getCurrentUser().catch(() => null);
    document.body.classList.toggle('polls-admin', !!state.user?.isAdmin);
    if(els.officialWrap){
      els.officialWrap.hidden = !state.user?.isAdmin;
    }
    await updateTodayCount();
    return state.user;
  }

  async function updateTodayCount(){
    if(!els.todayCount) return;
    if(!state.user || !window.fwDb?.client){
      els.todayCount.textContent = '登录后可见';
      return;
    }

    const result = await window.fwDb.client.rpc('fw_my_poll_daily_count').catch(err => ({error:err}));
    if(result.error){
      els.todayCount.textContent = '待配置';
      return;
    }
    els.todayCount.textContent = `${result.data || 0}/3`;
  }

  function getProfile(row){
    const profile = Array.isArray(row?.profiles) ? row.profiles[0] : row?.profiles;
    return profile || {};
  }

  function authorName(row){
    const profile = getProfile(row);
    return profile.nickname || '匿名研究员';
  }

  function isEnded(poll){
    return !!poll.closed_at || new Date(poll.ends_at).getTime() <= Date.now();
  }

  function remainingText(endsAt){
    const ms = new Date(endsAt).getTime() - Date.now();
    if(!Number.isFinite(ms) || ms <= 0) return '已结束';

    const totalMinutes = Math.ceil(ms / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if(days > 0) return `${days}天${hours ? ` ${hours}小时` : ''}`;
    if(hours > 0) return `${hours}小时${minutes ? ` ${minutes}分钟` : ''}`;
    return `${minutes}分钟`;
  }

  function dateText(value){
    if(!value) return '';
    return new Date(value).toLocaleDateString('zh-CN', {month:'2-digit', day:'2-digit'});
  }

  function participantCount(votes){
    return new Set((votes || []).map(v => v.user_id).filter(Boolean)).size;
  }

  function countVotes(options, votes){
    const counts = {};
    options.forEach(option => { counts[option.id] = 0; });
    (votes || []).forEach(vote => {
      counts[vote.option_id] = (counts[vote.option_id] || 0) + 1;
    });
    return counts;
  }

  function conclusionText(poll, options, votes){
    if(poll.conclusion) return poll.conclusion;

    const total = participantCount(votes);
    if(!total) return '样本量仍为 0，本课题暂时没有形成有效研究结论。';

    const counts = countVotes(options, votes);
    const max = Math.max(...options.map(option => counts[option.id] || 0));
    const winners = options.filter(option => (counts[option.id] || 0) === max);

    if(winners.length > 1){
      return `样本显示「${winners.map(w => w.label).join('」「')}」并列领先，各获得 ${max} 票。`;
    }

    const percent = Math.round((max / total) * 100);
    return `样本倾向于「${winners[0].label}」，获得 ${max} 票，占参与样本的 ${percent}%。`;
  }

  function pollTag(poll){
    if(poll.is_official) return '<span class="poll-tag official">官方课题</span>';
    return '<span class="poll-tag">用户课题</span>';
  }

  function renderOptions(poll, options, votes){
    const total = participantCount(votes);
    const counts = countVotes(options, votes);
    const myVote = state.user ? votes.find(v => v.user_id === state.user.id) : null;
    const ended = isEnded(poll);

    return options.map(option => {
      const count = counts[option.id] || 0;
      const percent = total ? Math.round((count / total) * 100) : 0;
      const selected = myVote?.option_id === option.id;
      const disabled = ended ? ' disabled' : '';
      const aria = ended ? '投票已结束' : selected ? '当前选择' : '选择这个选项';

      return `
        <button class="poll-option${selected ? ' selected' : ''}" type="button" data-vote-option data-poll-id="${poll.id}" data-option-id="${option.id}" aria-label="${escapeAttr(aria)}"${disabled}>
          <span class="poll-option-main">
            <span class="poll-option-label">${escapeHtml(option.label)}</span>
            <span class="poll-option-count">${count}票 · ${percent}%</span>
          </span>
          <span class="poll-bar"><span style="width:${percent}%"></span></span>
        </button>
      `;
    }).join('');
  }

  function renderAddOption(poll, options){
    const ended = isEnded(poll);
    if(ended) return '<p class="poll-small-note">课题已截止，不能再新增选项。</p>';
    if(options.length >= MAX_OPTIONS) return '<p class="poll-small-note">选项已达 20 个上限。</p>';

    const myAdded = !!state.user && options.some(option => option.user_id === state.user.id && option.source === 'user');
    if(myAdded) return '<p class="poll-small-note">你已经为这个课题补充过 1 个选项。</p>';

    return `
      <form class="poll-add-option" data-add-option-form data-poll-id="${poll.id}">
        <input name="option" maxlength="80" placeholder="补充一个新选项，最多 80 字" autocomplete="off" />
        <button type="submit">新增并投票</button>
      </form>
    `;
  }

  function renderPollCard(poll){
    const options = poll.options || [];
    const votes = poll.votes || [];
    const total = participantCount(votes);
    const ended = isEnded(poll);
    const myVote = state.user ? votes.find(v => v.user_id === state.user.id) : null;

    return `
      <article class="poll-card${poll.is_official ? ' is-official' : ''}${ended ? ' is-ended' : ''}" data-poll-card data-poll-id="${poll.id}">
        <div class="poll-card-head">
          <div>
            <div class="poll-tags">
              ${pollTag(poll)}
              <span class="poll-tag ${ended ? 'ended' : 'live'}">${ended ? '已结束' : '研究中'}</span>
            </div>
            <h2>${escapeHtml(poll.title)}</h2>
            <p>由 ${escapeHtml(authorName(poll))} 发起 · ${dateText(poll.created_at)} 发布 · 默认 7 天截止</p>
          </div>
          <div class="poll-deadline">
            <strong>${remainingText(poll.ends_at)}</strong>
            <span>${ended ? '截止状态' : '剩余时间'}</span>
          </div>
        </div>

        <div class="poll-metrics" aria-label="投票统计">
          <span><strong>${total}</strong>参与人数</span>
          <span><strong>${options.length}</strong>选项</span>
          <span><strong>${votes.length}</strong>总票数</span>
          <span><strong>${myVote ? '已投' : '未投'}</strong>我的状态</span>
        </div>

        <div class="poll-options">
          ${renderOptions(poll, options, votes)}
        </div>

        ${renderAddOption(poll, options)}

        ${ended ? `
          <div class="poll-conclusion">
            <b>研究结论</b>
            <p>${escapeHtml(conclusionText(poll, options, votes))}</p>
          </div>
        ` : ''}
      </article>
    `;
  }

  function renderPolls(){
    if(!els.list) return;

    const polls = [...state.polls].sort((a, b) => {
      const official = Number(b.is_official) - Number(a.is_official);
      if(official) return official;
      const live = Number(!isEnded(b)) - Number(!isEnded(a));
      if(live) return live;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const activeCount = polls.filter(poll => !isEnded(poll)).length;
    if(els.pollCount) els.pollCount.textContent = String(polls.length);
    if(els.activeCount) els.activeCount.textContent = String(activeCount);

    if(!polls.length){
      els.list.innerHTML = '<div class="poll-empty">还没有投票课题。可以先发起一个 7 天研究。</div>';
      return;
    }

    els.list.innerHTML = polls.map(renderPollCard).join('');
  }

  async function loadPolls(){
    if(!window.fwDb?.client){
      setStatus('投票系统需要 Supabase。请先确认全站 Supabase 配置已加载。');
      return;
    }

    setStatus('正在读取学术研讨课题...');

    const pollResult = await window.fwDb.client
      .from('polls')
      .select('id,user_id,title,is_official,created_at,ends_at,closed_at,conclusion,is_deleted,profiles(nickname,avatar_url)')
      .eq('is_deleted', false)
      .order('is_official', {ascending:false})
      .order('created_at', {ascending:false})
      .limit(80);

    if(pollResult.error){
      state.polls = [];
      renderPolls();
      setStatus('投票数据表还没上线。请先在 Supabase 执行 supabase/patch-20260519-polls.sql。');
      return;
    }

    const polls = pollResult.data || [];
    const ids = polls.map(poll => poll.id);

    if(!ids.length){
      state.polls = [];
      renderPolls();
      setStatus('');
      return;
    }

    const [optionResult, voteResult] = await Promise.all([
      window.fwDb.client
        .from('poll_options')
        .select('id,poll_id,user_id,label,source,created_at')
        .in('poll_id', ids)
        .order('created_at', {ascending:true}),
      window.fwDb.client
        .from('poll_votes')
        .select('poll_id,option_id,user_id,created_at,updated_at')
        .in('poll_id', ids)
    ]);

    if(optionResult.error || voteResult.error){
      setStatus('投票统计读取失败，请确认数据库补丁已完整执行。');
      return;
    }

    const optionsByPoll = {};
    (optionResult.data || []).forEach(option => {
      (optionsByPoll[option.poll_id] = optionsByPoll[option.poll_id] || []).push(option);
    });

    const votesByPoll = {};
    (voteResult.data || []).forEach(vote => {
      (votesByPoll[vote.poll_id] = votesByPoll[vote.poll_id] || []).push(vote);
    });

    state.polls = polls.map(poll => ({
      ...poll,
      options:optionsByPoll[poll.id] || [],
      votes:votesByPoll[poll.id] || []
    }));

    renderPolls();
    setStatus('');
  }

  function validateCreateForm(form){
    const title = String(form.title?.value || '').trim();
    const options = $$('[data-option-input]').map(input => String(input.value || '').trim());

    if(!title) return {error:'请先填写课题标题。'};
    if(title.length > 120) return {error:'课题标题最多 120 个字。'};
    if(options.some(option => !option)) return {error:'创建投票必须填写 4 个初始选项。'};

    const normalized = options.map(option => option.toLowerCase());
    if(new Set(normalized).size !== INITIAL_OPTION_COUNT) return {error:'初始选项不能重复。'};
    if(options.some(option => option.length > 80)) return {error:'每个选项最多 80 个字。'};

    return {title, options};
  }

  async function handleCreate(event){
    event.preventDefault();
    const form = event.currentTarget;

    await refreshUser();
    if(!state.user){
      toast('登录后才能发起投票。');
      openLogin();
      return;
    }

    const data = validateCreateForm(form);
    if(data.error){
      toast(data.error);
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    const oldText = button.textContent;
    const isOfficial = !!state.user?.isAdmin && !!form.is_official?.checked;

    button.disabled = true;
    button.textContent = '提交中...';
    if(els.notice) els.notice.textContent = '';

    try{
      const result = await window.fwDb.client.rpc('fw_create_poll', {
        p_title:data.title,
        p_options:data.options,
        p_is_official:isOfficial
      });

      if(result.error) throw result.error;

      form.reset();
      toast(isOfficial ? '官方课题已置顶发布。' : '投票课题已发布。');
      await updateTodayCount();
      await loadPolls();
    }catch(error){
      const message = error.message || '发布失败，请稍后再试。';
      if(els.notice) els.notice.textContent = message;
      toast(message);
    }finally{
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  async function handleVote(button){
    await refreshUser();
    if(!state.user){
      toast('登录后才能投票。');
      openLogin();
      return;
    }

    button.disabled = true;
    try{
      const result = await window.fwDb.client.rpc('fw_vote_poll', {
        p_poll_id:Number(button.dataset.pollId),
        p_option_id:Number(button.dataset.optionId)
      });
      if(result.error) throw result.error;
      toast('投票已记录，截止前可以改票。');
      await loadPolls();
    }catch(error){
      toast(error.message || '投票失败，请稍后再试。');
    }finally{
      button.disabled = false;
    }
  }

  async function handleAddOption(form){
    await refreshUser();
    if(!state.user){
      toast('登录后才能新增选项。');
      openLogin();
      return;
    }

    const input = form.querySelector('input[name="option"]');
    const label = String(input?.value || '').trim();
    if(!label){
      toast('请先填写新增选项。');
      input?.focus();
      return;
    }
    if(label.length > 80){
      toast('新增选项最多 80 个字。');
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = '新增中...';

    try{
      const addResult = await window.fwDb.client.rpc('fw_add_poll_option', {
        p_poll_id:Number(form.dataset.pollId),
        p_label:label
      });
      if(addResult.error) throw addResult.error;

      const optionId = Number(addResult.data);
      if(optionId){
        const voteResult = await window.fwDb.client.rpc('fw_vote_poll', {
          p_poll_id:Number(form.dataset.pollId),
          p_option_id:optionId
        });
        if(voteResult.error) throw voteResult.error;
      }

      toast('新选项已加入研究样本。');
      await loadPolls();
    }catch(error){
      toast(error.message || '新增选项失败，请稍后再试。');
    }finally{
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function bindEvents(){
    if(els.form) els.form.addEventListener('submit', handleCreate);
    if(els.refresh) els.refresh.addEventListener('click', () => loadPolls());

    document.addEventListener('click', event => {
      const voteButton = event.target.closest('[data-vote-option]');
      if(voteButton){
        event.preventDefault();
        handleVote(voteButton);
      }
    });

    document.addEventListener('submit', event => {
      const form = event.target.closest('[data-add-option-form]');
      if(form){
        event.preventDefault();
        handleAddOption(form);
      }
    });
  }

  async function init(){
    bindEvents();
    setStatus('正在连接研究数据库...');

    const ready = await waitForFwDb();
    if(!ready){
      setStatus('Supabase 连接没有成功加载，投票区暂时无法使用。');
      return;
    }

    state.ready = true;
    await refreshUser();
    await loadPolls();

    window.fwDb.onAuthChange?.(async () => {
      await refreshUser();
      await loadPolls();
    });

    clearInterval(state.renderTimer);
    state.renderTimer = setInterval(renderPolls, 60000);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
})();