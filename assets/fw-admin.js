// F.w 研究所：公开处刑 + 管理员处理台
(function(){
  if(window.__FW_PUBLIC_TRIAL_ADMIN__) return;
  window.__FW_PUBLIC_TRIAL_ADMIN__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const state = { me:null, tab:'users', rows:{users:[],posts:[],comments:[],reports:[],chats:[],logs:[]} };

  const actionText = {
    ban:'封号', unban:'解封', mute:'禁言', unmute:'解除禁言',
    delete_post:'删帖', restore_post:'恢复帖子',
    delete_comment:'删评论', restore_comment:'恢复评论',
    delete_chat_message:'删除房间消息', restore_chat_message:'恢复房间消息',
    resolve_report:'处理举报', ignore_report:'忽略举报', system_note:'系统记录'
  };
  const targetText = { user:'账号', post:'帖子', comment:'评论', chat_message:'房间消息', report:'举报', system:'系统' };

  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function short(v,n=90){ const s=String(v||'').replace(/\s+/g,' ').trim(); return s.length>n?s.slice(0,n)+'...':s; }
  function fmt(t){ if(!t) return '刚刚'; try{return new Date(t).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}catch(e){return '刚刚';} }
  function toast(msg){ let t=$('.trial-toast'); if(!t){t=document.createElement('div');t.className='trial-toast';document.body.appendChild(t);} t.textContent=msg;t.classList.add('show');clearTimeout(window.__fwTrialToast);window.__fwTrialToast=setTimeout(()=>t.classList.remove('show'),2400); }

  function waitForDb(){
    return new Promise(resolve=>{
      if(window.fwDb?.enabled && window.fwDb?.client) return resolve(true);
      let n=0;
      const timer=setInterval(()=>{
        n++;
        if(window.fwDb?.enabled && window.fwDb?.client){clearInterval(timer);resolve(true);}
        if(n>80){clearInterval(timer);resolve(false);}
      },100);
    });
  }
  const db = () => window.fwDb.client;

  function ensureChatTab(){
    const tabs = $('.trial-tabs');
    if(!tabs || tabs.querySelector('[data-admin-tab="chats"]')) return;
    const btn = document.createElement('button');
    btn.className = 'trial-tab';
    btn.type = 'button';
    btn.dataset.adminTab = 'chats';
    btn.textContent = '房间消息';
    const logs = tabs.querySelector('[data-admin-tab="logs"]');
    tabs.insertBefore(btn, logs || null);
  }

  async function boot(){
    const ok = await waitForDb();
    ensureChatTab();
    if(!ok){ renderPublicError('数据库连接未就绪。请确认 app.js、supabase-config.js、supabase-db.js 正常加载。'); return; }
    await Promise.all([loadPublicLogs(), initAdmin()]);
    bind();
  }

  async function loadPublicLogs(){
    const box=$('[data-public-trial-list]');
    if(!box) return;
    try{
      const {data,error}=await db().from('moderation_logs')
        .select('id,target_type,target_display_name,action,reason,duration_text,created_at,expires_at')
        .eq('public_visible',true).eq('is_revoked',false)
        .order('created_at',{ascending:false}).limit(50);
      if(error) throw error;
      box.innerHTML = renderLogs(data||[], false);
    }catch(e){ renderPublicError('公开处刑记录表还没配置。请先在 Supabase 运行 supabase/patch-20260513-public-trial.sql。'); }
  }
  function renderPublicError(msg){ const box=$('[data-public-trial-list]'); if(box) box.innerHTML = `<div class="trial-empty">${esc(msg)}</div>`; }

  function renderLogs(rows){
    if(!rows.length) return '<div class="trial-empty">暂时没有处刑记录。说明大家今天还算体面。</div>';
    return rows.map(r=>{
      const action = actionText[r.action] || r.action || '处理';
      const isDanger = ['ban','mute','delete_post','delete_comment','delete_chat_message','resolve_report'].includes(r.action);
      const desc = [`对象：${targetText[r.target_type] || r.target_type || '对象'}`, r.duration_text ? `时长：${r.duration_text}` : '', r.reason ? `原因：${r.reason}` : ''].filter(Boolean).join(' · ');
      return `<article class="trial-log"><div class="trial-log-time">${esc(fmt(r.created_at))}</div><div class="trial-log-main"><b>${esc(r.target_display_name || '某位研究员')} 被执行：${esc(action)}</b><span>${esc(desc)}</span></div><div class="trial-log-action"><span class="trial-chip ${isDanger?'warn':'soft'}">${esc(action)}</span></div></article>`;
    }).join('');
  }

  async function initAdmin(){
    const panel=$('[data-admin-panel]');
    if(!panel) return;
    try{
      state.me = await window.fwDb.getCurrentUser();
      if(!state.me || !state.me.isAdmin) return;
      panel.classList.add('show');
      await loadTab('users');
    }catch(e){ $('[data-admin-body]').innerHTML = `<div class="trial-empty">管理员身份检查失败：${esc(e.message||e)}</div>`; }
  }

  async function loadTab(tab){
    state.tab = tab || state.tab;
    ensureChatTab();
    $$('.trial-tab').forEach(b=>b.classList.toggle('active', b.dataset.adminTab === state.tab));
    const body=$('[data-admin-body]');
    if(body) body.innerHTML='<div class="trial-empty">正在读取数据...</div>';
    try{
      if(state.tab==='users') await loadUsers();
      if(state.tab==='posts') await loadPosts();
      if(state.tab==='comments') await loadComments();
      if(state.tab==='reports') await loadReports();
      if(state.tab==='chats') await loadChats();
      if(state.tab==='logs') await loadAdminLogs();
      renderAdminBody();
    }catch(e){ if(body) body.innerHTML=`<div class="trial-empty">读取失败：${esc(e.message||e)}</div>`; }
  }

  async function loadUsers(){
    try{
      const {data,error}=await db().rpc('admin_list_profiles');
      if(error) throw error;
      state.rows.users=data||[];
    }catch(e){
      const {data,error}=await db().from('profiles').select('id,nickname,avatar_url,role,is_banned,lab_code,muted_until,created_at').order('created_at',{ascending:false}).limit(200);
      if(error) throw error;
      state.rows.users=data||[];
    }
  }
  async function loadPosts(){
    const {data,error}=await db().from('posts').select('id,user_id,content,status_tag,is_deleted,created_at,profiles(nickname,avatar_url)').order('created_at',{ascending:false}).limit(120);
    if(error) throw error; state.rows.posts=data||[];
  }
  async function loadComments(){
    const {data,error}=await db().from('comments').select('id,post_id,user_id,content,is_deleted,created_at,profiles!comments_user_id_fkey(nickname,avatar_url),posts(content)').order('created_at',{ascending:false}).limit(120);
    if(error) throw error; state.rows.comments=data||[];
  }
  async function loadReports(){
    try{
      const {data,error}=await db().rpc('admin_list_chat_reports');
      if(error) throw error;
      state.rows.reports=data||[];
    }catch(e){
      const {data,error}=await db().from('chat_message_reports').select('id,message_id,reporter_id,report_reason,status,created_at').order('created_at',{ascending:false}).limit(120);
      if(error) throw error;
      state.rows.reports=data||[];
    }
  }
  async function loadChats(){
    try{
      const {data,error}=await db().rpc('admin_list_chat_messages');
      if(error) throw error;
      state.rows.chats=data||[];
    }catch(e){
      const {data,error}=await db().from('chat_messages').select('id,room_key,user_id,content,is_deleted,created_at,profiles(nickname,avatar_url)').order('created_at',{ascending:false}).limit(160);
      if(error) throw error;
      state.rows.chats=(data||[]).map(x=>({id:x.id,room_key:x.room_key,user_id:x.user_id,nickname:(Array.isArray(x.profiles)?x.profiles[0]?.nickname:x.profiles?.nickname)||'匿名研究员',avatar_url:'',content:x.content,is_deleted:x.is_deleted,created_at:x.created_at}));
    }
  }
  async function loadAdminLogs(){
    const {data,error}=await db().from('moderation_logs').select('id,target_type,target_display_name,action,reason,duration_text,public_visible,is_revoked,created_at').order('created_at',{ascending:false}).limit(120);
    if(error) throw error; state.rows.logs=data||[];
  }

  function renderAdminBody(){
    const body=$('[data-admin-body]'); if(!body) return;
    if(state.tab==='users') body.innerHTML=renderUsers();
    if(state.tab==='posts') body.innerHTML=renderPosts();
    if(state.tab==='comments') body.innerHTML=renderComments();
    if(state.tab==='reports') body.innerHTML=renderReports();
    if(state.tab==='chats') body.innerHTML=renderChats();
    if(state.tab==='logs') body.innerHTML=`<div class="trial-list">${renderLogs(state.rows.logs)}</div>`;
  }
  function toolbar(label){ return `<div class="trial-toolbar"><b>${esc(label)}</b><input data-admin-search placeholder="搜索昵称、编号、房间或内容..." /></div>`; }
  function row(main, actions, searchText=''){ return `<article class="trial-row" data-search="${esc(searchText).toLowerCase()}"><div class="trial-row-main">${main}</div><div class="trial-actions">${actions}</div></article>`; }

  function renderUsers(){
    const rows=state.rows.users||[]; if(!rows.length) return toolbar('用户管理')+'<div class="trial-empty">暂无用户。</div>';
    return toolbar('用户管理') + `<div class="trial-table">${rows.map(u=>{
      const muted = u.muted_until && new Date(u.muted_until).getTime() > Date.now();
      const main=`<b>${esc(u.nickname||'研究员')} ${u.role==='admin'?'｜管理员':''}</b><p>编号：${esc(u.lab_code||'未设置')} · 状态：${u.is_banned?'已封号':muted?'禁言中':'正常'} · 注册：${esc(fmt(u.created_at))}</p>`;
      const actions = u.role==='admin' ? '<span class="trial-chip soft">管理员账号</span>' : `<button class="danger" data-user-act="ban" data-id="${esc(u.id)}">封号</button><button data-user-act="unban" data-id="${esc(u.id)}">解封</button><button class="dark" data-user-act="mute" data-min="60" data-id="${esc(u.id)}">禁言1h</button><button class="dark" data-user-act="mute" data-min="1440" data-id="${esc(u.id)}">禁言24h</button><button data-user-act="unmute" data-id="${esc(u.id)}">解禁言</button>`;
      return row(main, actions, `${u.nickname||''} ${u.lab_code||''}`);
    }).join('')}</div>`;
  }
  function renderPosts(){
    const rows=state.rows.posts||[]; if(!rows.length) return toolbar('帖子管理')+'<div class="trial-empty">暂无帖子。</div>';
    return toolbar('帖子管理') + `<div class="trial-table">${rows.map(p=>{ const prof = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles || {}; const main=`<b>${esc(prof.nickname||'匿名研究员')} · ${esc(p.status_tag||'无状态')} ${p.is_deleted?'｜已删除':''}</b><p>${esc(short(p.content,150))}<br>发布：${esc(fmt(p.created_at))}</p>`; const actions=`<button class="danger" data-post-act="delete" data-id="${p.id}">删除</button><button data-post-act="restore" data-id="${p.id}">恢复</button>`; return row(main, actions, `${prof.nickname||''} ${p.content||''}`); }).join('')}</div>`;
  }
  function renderComments(){
    const rows=state.rows.comments||[]; if(!rows.length) return toolbar('评论管理')+'<div class="trial-empty">暂无评论。</div>';
    return toolbar('评论管理') + `<div class="trial-table">${rows.map(c=>{ const prof = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles || {}; const main=`<b>${esc(prof.nickname||'匿名研究员')} ${c.is_deleted?'｜已删除':''}</b><p>评论：${esc(short(c.content,140))}<br>原帖：${esc(short(c.posts?.content||'',80))} · ${esc(fmt(c.created_at))}</p>`; const actions=`<button class="danger" data-comment-act="delete" data-id="${c.id}">删除</button><button data-comment-act="restore" data-id="${c.id}">恢复</button>`; return row(main, actions, `${prof.nickname||''} ${c.content||''}`); }).join('')}</div>`;
  }
  function renderReports(){
    const rows=state.rows.reports||[]; if(!rows.length) return toolbar('举报中心')+'<div class="trial-empty">暂无举报。</div>';
    return toolbar('举报中心') + `<div class="trial-table">${rows.map(r=>{ const main=`<b>举报 #${esc(r.id)} · ${esc(r.status||'pending')} · 被举报：${esc(r.target_name||'未知')}</b><p>房间：${esc(r.room_key||'未知')} · 消息：${esc(short(r.message_content||('消息ID：'+r.message_id),120))}<br>举报人：${esc(r.reporter_name||r.reporter_id||'未知')} · 原因：${esc(r.report_reason||'用户举报')} · ${esc(fmt(r.created_at))}</p>`; const actions=`<button class="dark" data-report-act="resolved" data-id="${r.id}">标记处理</button><button data-report-act="ignored" data-id="${r.id}">忽略</button>${r.message_id?`<button class="danger" data-chat-act="delete" data-id="${r.message_id}">删除消息</button>`:''}`; return row(main, actions, `${r.report_reason||''} ${r.status||''} ${r.target_name||''} ${r.message_content||''}`); }).join('')}</div>`;
  }
  function renderChats(){
    const rows=state.rows.chats||[]; if(!rows.length) return toolbar('房间消息管理')+'<div class="trial-empty">暂无房间消息。</div>';
    return toolbar('房间消息管理') + `<div class="trial-table">${rows.map(m=>{ const main=`<b>${esc(m.nickname||'匿名研究员')} · ${esc(m.room_key||'未知房间')} ${m.is_deleted?'｜已删除':''}</b><p>${esc(short(m.content,160))}<br>发送：${esc(fmt(m.created_at))}</p>`; const actions=`<button class="danger" data-chat-act="delete" data-id="${m.id}">删除</button><button data-chat-act="restore" data-id="${m.id}">恢复</button>`; return row(main, actions, `${m.nickname||''} ${m.room_key||''} ${m.content||''}`); }).join('')}</div>`;
  }

  function reason(defaultText){ const r = prompt('填写公开处刑原因：', defaultText || '违反研究所公约'); if(r === null) return null; return r.trim() || defaultText || '违反研究所公约'; }
  function visible(){ return confirm('是否公开到“公开处刑”公告栏？\n确定 = 公开；取消 = 仅管理员后台记录'); }
  async function rpc(name,args){ const {error}=await db().rpc(name,args); if(error) throw error; }

  async function handleClick(e){
    const tab=e.target.closest('[data-admin-tab]'); if(tab){ await loadTab(tab.dataset.adminTab); return; }
    if(e.target.closest('[data-admin-refresh]')){ await loadPublicLogs(); await loadTab(state.tab); toast('已刷新。'); return; }

    const user=e.target.closest('[data-user-act]');
    if(user){ const act=user.dataset.userAct; const r=reason(act==='ban'?'账号违规，已封号':act==='mute'?'扰乱交流秩序，已禁言':'状态调整'); if(r===null) return; await rpc('admin_moderate_user',{p_target_user_id:user.dataset.id,p_action:act,p_mute_minutes:Number(user.dataset.min||0)||null,p_reason:r,p_public_visible:visible()}); toast('用户处理完成。'); await loadPublicLogs(); await loadTab('users'); return; }

    const post=e.target.closest('[data-post-act]');
    if(post){ const del=post.dataset.postAct==='delete'; const r=reason(del?'内容不适合公开展示':'帖子恢复'); if(r===null) return; await rpc('admin_moderate_post',{p_post_id:Number(post.dataset.id),p_delete:del,p_reason:r,p_public_visible:visible()}); toast('帖子处理完成。'); await loadPublicLogs(); await loadTab('posts'); return; }

    const comment=e.target.closest('[data-comment-act]');
    if(comment){ const del=comment.dataset.commentAct==='delete'; const r=reason(del?'评论不适合公开展示':'评论恢复'); if(r===null) return; await rpc('admin_moderate_comment',{p_comment_id:Number(comment.dataset.id),p_delete:del,p_reason:r,p_public_visible:visible()}); toast('评论处理完成。'); await loadPublicLogs(); await loadTab('comments'); return; }

    const chat=e.target.closest('[data-chat-act]');
    if(chat){ const del=chat.dataset.chatAct==='delete'; const r=reason(del?'房间消息不适合公开展示':'房间消息恢复'); if(r===null) return; await rpc('admin_moderate_chat_message',{p_message_id:Number(chat.dataset.id),p_delete:del,p_reason:r,p_public_visible:visible()}); toast('房间消息处理完成。'); await loadPublicLogs(); await loadTab(state.tab); return; }

    const report=e.target.closest('[data-report-act]');
    if(report){ const status=report.dataset.reportAct; const r=reason(status==='resolved'?'举报已处理':'举报已忽略'); if(r===null) return; await rpc('admin_resolve_chat_report',{p_report_id:Number(report.dataset.id),p_status:status,p_reason:r,p_public_visible:visible()}); toast('举报状态已更新。'); await loadPublicLogs(); await loadTab('reports'); return; }
  }

  function bind(){
    document.addEventListener('click', e => { handleClick(e).catch(err=>toast(err.message||'操作失败')); });
    document.addEventListener('input', e=>{ const input=e.target.closest('[data-admin-search]'); if(!input) return; const q=input.value.trim().toLowerCase(); $$('.trial-row').forEach(row=>{ row.style.display = !q || (row.dataset.search||'').includes(q) ? '' : 'none'; }); });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
