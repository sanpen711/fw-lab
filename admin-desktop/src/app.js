import {adminApi} from './admin-api.js';
import {APP_VERSION} from './config.js';

const app=document.querySelector('#app');
const toastHost=document.querySelector('#toast');
const dialog=document.querySelector('#action-dialog');

const emptyRows=()=>({users:[],reports:[],feedback:[],posts:[],comments:[],chats:[],parties:[],birdPosts:[],birdComments:[],polls:[],partyMessages:[],logs:[]});
const state={admin:null,ready:false,busy:false,error:'',view:'dashboard',query:'',filter:'pending',contentType:'posts',showTestData:false,selection:null,rows:emptyRows()};
let dialogSubmit=null;

const viewMeta={
  dashboard:['工作台','优先处理举报和用户反馈'],
  reports:['举报中心','统一处理用户、帖子、评论和房间消息举报'],
  feedback:['问题反馈','查看问题、建议并向用户回复'],
  users:['用户管理','搜索账号并处理禁言和封禁'],
  content:['内容管理','统一管理广场、树洞、投票、房间和组队内容'],
  logs:['处理记录','查看所有管理操作和公开状态']
};

const actionText={
  ban:'封禁账号',unban:'解除封禁',mute:'禁言',unmute:'解除禁言',
  delete_post:'删除帖子',restore_post:'恢复帖子',delete_comment:'删除评论',restore_comment:'恢复评论',
  delete_chat_message:'删除房间消息',restore_chat_message:'恢复房间消息',resolve_report:'处理举报',
  delete_bird_post:'删除树洞帖子',restore_bird_post:'恢复树洞帖子',
  delete_bird_comment:'删除树洞评论',restore_bird_comment:'恢复树洞评论',
  delete_poll:'删除投票',restore_poll:'恢复投票',delete_game_party_message:'删除组队留言',
  delete_account:'永久删除账号',ignore_report:'忽略举报',delete_game_party:'删除组队房间',feedback_update:'更新反馈',system_note:'系统记录'
};
const reportTypeText={post:'精神广场帖子',comment:'精神广场评论',user:'用户 / 搭子',chat_message:'房间消息'};
const feedbackStatusText={new:'未处理',in_progress:'处理中',waiting_user:'等待用户',resolved:'已解决',closed:'已关闭'};
const priorityText={low:'低',normal:'普通',medium:'中',high:'高'};

function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function short(value,max=90){const text=String(value||'').replace(/\s+/g,' ').trim();return text.length>max?`${text.slice(0,max)}…`:text;}
function fmt(value){if(!value)return '—';try{return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));}catch{return '—';}}
function ago(value){if(!value)return '—';const diff=Date.now()-new Date(value).getTime();if(diff<60000)return '刚刚';if(diff<3600000)return `${Math.floor(diff/60000)}分钟前`;if(diff<86400000)return `${Math.floor(diff/3600000)}小时前`;return `${Math.floor(diff/86400000)}天前`;}
function profileOf(row){const value=row?.profiles;return Array.isArray(value)?(value[0]||{}):(value||{});}
function reportType(row){return row?.room_key||((Number(row?.id)>0&&row?.message_id)?'chat_message':'unknown');}
function statusBadge(status,label){return `<span class="badge ${esc(status||'')}">${esc(label||status||'未知')}</span>`;}
function includesQuery(...values){const query=state.query.trim().toLowerCase();return !query||values.some(value=>String(value||'').toLowerCase().includes(query));}
function userById(id){return id?state.rows.users.find(row=>String(row.id)===String(id)):null;}
function isTestRow(row){
  const ids=[row?.user_id,row?.target_user_id,row?.reporter_id,row?.captain_id];
  return ids.some(id=>userById(id)?.is_test_account)||String(row?.content||row?.message_content||'').startsWith('[FW-AUTO-TEST]');
}
function withoutTestRows(rows){return state.showTestData?rows:rows.filter(row=>!isTestRow(row));}

function toast(message,error=false){
  toastHost.textContent=message;
  toastHost.className=`toast show${error?' error':''}`;
  clearTimeout(toastHost.__timer);
  toastHost.__timer=setTimeout(()=>{toastHost.className='toast';},3200);
}

function setBusy(value,label='正在处理…'){
  state.busy=value;
  document.querySelector('[data-loading-cover]')?.remove();
  if(value){
    const cover=document.createElement('div');
    cover.className='loading-cover';cover.dataset.loadingCover='1';cover.innerHTML=`<div class="loading-card">${esc(label)}</div>`;
    document.body.appendChild(cover);
  }
}

function loginView(message=''){
  app.innerHTML=`
    <section class="login-screen">
      <div class="login-card">
        <div class="login-brand"><div class="brand-mark">FW</div><div><h1>FW管理台</h1><p>仅限管理员账号登录</p></div></div>
        <form class="form-stack" data-login-form>
          <label class="field">管理员邮箱<input name="email" type="email" autocomplete="username" required></label>
          <label class="field">密码<input name="password" type="password" autocomplete="current-password" minlength="6" required></label>
          <p class="login-status" data-login-status>${esc(message)}</p>
          <button class="button primary" type="submit">登录管理台</button>
        </form>
      </div>
    </section>`;
}

function navButton(id,index,label,count=0,attention=false){
  return `<button class="nav-button ${state.view===id?'active':''}" type="button" data-nav="${id}"><span class="nav-index">${index}</span><span>${label}</span>${count?`<span class="nav-count ${attention?'attention':''}">${count>99?'99+':count}</span>`:''}</button>`;
}

function pendingReportCount(){return withoutTestRows(state.rows.reports).filter(row=>(row.status||'pending')==='pending').length;}
function pendingFeedbackCount(){return withoutTestRows(state.rows.feedback).filter(row=>['new','in_progress','waiting_user'].includes(row.status||'new')).length;}
function mutedCount(){return state.rows.users.filter(row=>!row.is_test_account&&row.muted_until&&new Date(row.muted_until).getTime()>Date.now()).length;}

function shellView(){
  const [title,subtitle]=viewMeta[state.view];
  const reportCount=pendingReportCount();
  const feedbackCount=pendingFeedbackCount();
  app.innerHTML=`
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand"><div class="brand-mark">FW</div><div><strong>FW管理台</strong><span>管理员专用</span></div></div>
        <nav class="nav-list" aria-label="管理功能">
          ${navButton('dashboard','01','工作台',reportCount+feedbackCount,reportCount+feedbackCount>0)}
          ${navButton('reports','02','举报中心',reportCount,reportCount>0)}
          ${navButton('feedback','03','问题反馈',feedbackCount,feedbackCount>0)}
          ${navButton('users','04','用户管理')}
          ${navButton('content','05','内容管理')}
          ${navButton('logs','06','处理记录')}
        </nav>
        <div class="sidebar-user"><strong>${esc(state.admin.nickname)}</strong><span>${esc(state.admin.email)}</span><button type="button" data-logout>退出登录</button></div>
      </aside>
      <section class="main-area">
        <header class="topbar">
          <div class="topbar-title"><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>
          <div class="topbar-actions"><span class="connection-dot" aria-hidden="true"></span><span>数据库已连接</span><button class="button compact ${state.showTestData?'test-active':''}" type="button" data-toggle-tests>${state.showTestData?'隐藏测试数据':'显示测试数据'}</button><button class="button compact" type="button" data-refresh>刷新</button></div>
        </header>
        <div class="page">${renderPage()}</div>
      </section>
    </div>`;
}

function renderPage(){
  if(state.view==='dashboard')return renderDashboard();
  if(state.view==='reports')return renderReports();
  if(state.view==='feedback')return renderFeedback();
  if(state.view==='users')return renderUsers();
  if(state.view==='content')return renderContent();
  return renderLogs();
}

function renderDashboard(){
  const reports=pendingReportCount();
  const feedback=pendingFeedbackCount();
  const banned=state.rows.users.filter(row=>!row.is_test_account&&row.is_banned).length;
  const todo=[
    ...withoutTestRows(state.rows.reports).filter(row=>(row.status||'pending')==='pending').map(row=>({kind:'report',time:row.created_at,title:`${reportTypeText[reportType(row)]||'内容'}举报`,text:`${row.target_name||'未知用户'} · ${row.report_reason||'用户举报'}`,row})),
    ...withoutTestRows(state.rows.feedback).filter(row=>['new','in_progress','waiting_user'].includes(row.status||'new')).map(row=>({kind:'feedback',time:row.created_at,title:`${row.category||'问题'}反馈`,text:`${row.nickname||'用户'} · ${short(row.content,70)}`,row}))
  ].sort((a,b)=>new Date(b.time)-new Date(a.time)).slice(0,12);
  return `
    <section class="metric-grid">
      <article class="metric-card ${reports?'attention':''}"><span>待处理举报</span><strong>${reports}</strong><small>用户、帖子、评论和消息</small></article>
      <article class="metric-card ${feedback?'attention':''}"><span>待处理反馈</span><strong>${feedback}</strong><small>问题、建议和账号反馈</small></article>
      <article class="metric-card"><span>当前禁言</span><strong>${mutedCount()}</strong><small>到期后自动解除</small></article>
      <article class="metric-card"><span>封禁账号</span><strong>${banned}</strong><small>管理员账号不计入</small></article>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><h2>优先待办</h2><p>按照最新提交时间排列</p></div></div>
      ${todo.length?`<div class="todo-list">${todo.map(item=>`<article class="todo-row" data-open-kind="${item.kind}" data-open-id="${esc(item.row.id)}"><div>${statusBadge(item.kind==='report'?'pending':item.row.status||'new',item.kind==='report'?'举报':feedbackStatusText[item.row.status||'new'])}</div><div class="todo-main"><strong>${esc(item.title)}</strong><span>${esc(item.text)}</span></div><div class="todo-time">${esc(ago(item.time))}</div></article>`).join('')}</div>`:'<div class="empty-state">目前没有待处理事项。</div>'}
    </section>`;
}

function reportRows(){
  return withoutTestRows(state.rows.reports).filter(row=>{
    const status=row.status||'pending';
    const filterOk=state.filter==='all'||status===state.filter;
    return filterOk&&includesQuery(row.id,row.target_name,row.reporter_name,row.report_reason,row.message_content,reportTypeText[reportType(row)]);
  });
}

function renderReports(){
  const rows=reportRows();
  return `<div class="workspace ${state.selection?.type==='report'?'with-detail':''}">
    <section class="panel">
      <div class="panel-heading"><div><h2>举报记录</h2><p>共 ${state.rows.reports.length} 条</p></div><div class="panel-tools"><input class="toolbar-search" data-search value="${esc(state.query)}" placeholder="搜索用户、原因或内容"></div></div>
      <div class="filter-row">${filterButton('pending','待处理')}${filterButton('resolved','已处理')}${filterButton('ignored','已忽略')}${filterButton('all','全部')}</div>
      ${rows.length?`<div class="table-wrap"><table class="data-table"><colgroup><col style="width:18%"><col style="width:18%"><col><col style="width:20%"></colgroup><thead><tr><th>状态 / 类型</th><th>被举报用户</th><th>举报内容</th><th>提交时间</th></tr></thead><tbody>${rows.map(row=>`<tr data-select-type="report" data-select-id="${esc(row.id)}" class="${isSelected('report',row.id)?'selected':''}"><td>${statusBadge(row.status||'pending',reportStatusLabel(row.status))}<small>${esc(reportTypeText[reportType(row)]||reportType(row))}</small></td><td><strong class="ellipsis">${esc(row.target_name||'未知用户')}</strong><small class="ellipsis">举报人：${esc(row.reporter_name||'未知')}</small></td><td><strong class="wrap-text">${esc(short(row.message_content||'没有内容预览',120))}</strong><small class="wrap-text">原因：${esc(row.report_reason||'用户举报')}</small></td><td>${esc(fmt(row.created_at))}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state">没有符合条件的举报。</div>'}
    </section>
    ${state.selection?.type==='report'?renderReportDetail(state.selection.row):''}
  </div>`;
}

function feedbackRows(){
  return withoutTestRows(state.rows.feedback).filter(row=>{
    const status=row.status||'new';
    const filterOk=state.filter==='all'||(state.filter==='pending'?['new','in_progress','waiting_user'].includes(status):status===state.filter);
    return filterOk&&includesQuery(row.id,row.nickname,row.email,row.category,row.content,row.platform,row.version);
  });
}

function renderFeedback(){
  const rows=feedbackRows();
  return `<div class="workspace ${state.selection?.type==='feedback'?'with-detail':''}">
    <section class="panel">
      <div class="panel-heading"><div><h2>反馈工单</h2><p>共 ${state.rows.feedback.length} 条</p></div><div class="panel-tools"><input class="toolbar-search" data-search value="${esc(state.query)}" placeholder="搜索用户、分类或内容"></div></div>
      <div class="filter-row">${filterButton('pending','待处理')}${filterButton('resolved','已解决')}${filterButton('closed','已关闭')}${filterButton('all','全部')}</div>
      ${rows.length?`<div class="table-wrap"><table class="data-table"><colgroup><col style="width:18%"><col style="width:20%"><col><col style="width:19%"></colgroup><thead><tr><th>状态</th><th>提交用户</th><th>反馈内容</th><th>提交时间</th></tr></thead><tbody>${rows.map(row=>`<tr data-select-type="feedback" data-select-id="${esc(row.id)}" class="${isSelected('feedback',row.id)?'selected':''}"><td>${statusBadge(row.status||'new',feedbackStatusText[row.status||'new'])}<small>优先级：${esc(priorityText[row.priority||'normal'])}</small></td><td><strong class="ellipsis">${esc(row.nickname||'未知用户')}</strong><small class="ellipsis">${esc(row.category||'其他')}</small></td><td><strong class="wrap-text">${esc(short(row.content,135))}</strong><small>${esc(row.platform||'未知来源')} · ${esc(row.version||'未知版本')}</small></td><td>${esc(fmt(row.created_at))}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state">没有符合条件的反馈。</div>'}
    </section>
    ${state.selection?.type==='feedback'?renderFeedbackDetail(state.selection.row):''}
  </div>`;
}

function userRows(){
  return state.rows.users.filter(row=>includesQuery(row.id,row.nickname,row.lab_code,row.email_search,row.role));
}

function renderUsers(){
  const rows=userRows();
  return `<div class="workspace ${state.selection?.type==='user'?'with-detail':''}">
    <section class="panel">
      <div class="panel-heading"><div><h2>用户列表</h2><p>共 ${state.rows.users.length} 个账号，测试账号会单独标记</p></div><div class="panel-tools"><input class="toolbar-search" data-search value="${esc(state.query)}" placeholder="搜索昵称、编号或账号"></div></div>
      ${rows.length?`<div class="table-wrap"><table class="data-table"><colgroup><col style="width:28%"><col style="width:24%"><col style="width:24%"><col></colgroup><thead><tr><th>用户</th><th>实验品编号</th><th>账号状态</th><th>最近登录</th></tr></thead><tbody>${rows.map(row=>`<tr data-select-type="user" data-select-id="${esc(row.id)}" class="${isSelected('user',row.id)?'selected':''}"><td><strong class="ellipsis">${esc(row.nickname||'研究员')} ${row.is_test_account?'<span class="inline-tag">测试</span>':''}</strong><small class="ellipsis">${esc(row.email_search||row.id)}</small></td><td>${esc(row.lab_code||'未设置')}</td><td>${userStatusBadge(row)}</td><td>${esc(fmt(row.last_sign_in_at))}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state">没有符合条件的用户。</div>'}
    </section>
    ${state.selection?.type==='user'?renderUserDetail(state.selection.row):''}
  </div>`;
}

function contentRows(){
  const rows=state.rows[state.contentType]||[];
  return withoutTestRows(rows).filter(row=>includesQuery(row.id,row.title,row.content,row.game_name,row.note,row.nickname,profileOf(row).nickname,row.room_key,row.status,row.post_title));
}

function renderContent(){
  const rows=contentRows();
  return `<div class="workspace ${state.selection?.type==='content'?'with-detail':''}">
    <section class="panel">
      <div class="panel-heading"><div><h2>内容列表</h2><p>管理公开内容和互动消息</p></div><div class="panel-tools"><input class="toolbar-search" data-search value="${esc(state.query)}" placeholder="搜索用户或内容"></div></div>
      <div class="filter-row">${contentButton('posts','广场帖子')}${contentButton('comments','广场评论')}${contentButton('birdPosts','树洞帖子')}${contentButton('birdComments','树洞评论')}${contentButton('polls','投票')}${contentButton('chats','房间消息')}${contentButton('parties','组队房间')}${contentButton('partyMessages','组队留言')}</div>
      ${rows.length?renderContentTable(rows):'<div class="empty-state">当前分类暂无内容。</div>'}
    </section>
    ${state.selection?.type==='content'?renderContentDetail(state.selection.row,state.selection.kind):''}
  </div>`;
}

function renderContentTable(rows){
  return `<div class="table-wrap"><table class="data-table"><colgroup><col style="width:22%"><col><col style="width:18%"><col style="width:19%"></colgroup><thead><tr><th>发布用户</th><th>内容</th><th>状态</th><th>时间</th></tr></thead><tbody>${rows.map(row=>{
    const kind=state.contentType;
    const profile=profileOf(row);
    const owner=row.nickname||row.captain_name||profile.nickname||'未知用户';
    const content=kind==='parties'?`${row.game_name||'未命名游戏'}${row.mode?` · ${row.mode}`:''}${row.note?` · ${row.note}`:''}`:kind==='polls'?row.title:kind==='birdPosts'?`${row.title||'无标题'} · ${row.content||''}`:(row.content||'');
    const deleted=Boolean(row.is_deleted);
    const label=kind==='parties'?(row.status||'open'):(deleted?'已删除':'正常');
    const badge=kind==='parties'?statusBadge(row.status||'open',partyStatus(row.status)):statusBadge(deleted?'deleted':'normal',label);
    const source=kind==='comments'?`原帖：${short(row.posts?.content||'',70)}`:kind==='birdComments'?`树洞：${short(row.post_title||'',70)}`:kind==='partyMessages'?`房间：${row.game_name||row.party_id}`:kind==='polls'?`${row.option_count||0} 个选项`:'';
    return `<tr data-select-type="content" data-select-kind="${kind}" data-select-id="${esc(row.id)}" class="${isSelected('content',row.id,kind)?'selected':''}"><td><strong class="ellipsis">${esc(owner)}</strong><small>${esc(kindLabel(kind))}</small></td><td><strong class="wrap-text">${esc(short(content,145))}</strong>${source?`<small class="wrap-text">${esc(source)}</small>`:''}</td><td>${badge}</td><td>${esc(fmt(row.created_at))}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function renderLogs(){
  const rows=state.rows.logs.filter(row=>includesQuery(row.target_display_name,row.action,row.reason,row.target_type));
  return `<section class="panel"><div class="panel-heading"><div><h2>操作记录</h2><p>所有处罚、恢复和举报处理均保留记录</p></div><div class="panel-tools"><input class="toolbar-search" data-search value="${esc(state.query)}" placeholder="搜索对象、动作或原因"></div></div>${rows.length?`<div class="table-wrap"><table class="data-table"><colgroup><col style="width:18%"><col style="width:22%"><col><col style="width:18%"></colgroup><thead><tr><th>操作</th><th>对象</th><th>原因</th><th>时间</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${statusBadge(logBadge(row.action),actionText[row.action]||row.action||'管理操作')}<small>${row.public_visible?'已公开':'仅后台'}</small></td><td><strong class="ellipsis">${esc(row.target_display_name||'未知对象')}</strong><small>${esc(row.target_type||'对象')}</small></td><td><strong class="wrap-text">${esc(row.reason||'未填写')}</strong><small>${esc(row.duration_text||'')}</small></td><td>${esc(fmt(row.created_at))}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state">暂无操作记录。</div>'}</section>`;
}

function filterButton(value,label){return `<button class="filter-button ${state.filter===value?'active':''}" type="button" data-filter="${value}">${label}</button>`;}
function contentButton(value,label){return `<button class="filter-button ${state.contentType===value?'active':''}" type="button" data-content-type="${value}">${label}</button>`;}
function isSelected(type,id,kind=''){return state.selection?.type===type&&String(state.selection?.row?.id)===String(id)&&(!kind||state.selection?.kind===kind);}
function reportStatusLabel(value){return value==='resolved'?'已处理':value==='ignored'?'已忽略':'待处理';}
function userStatusBadge(row){if(row.role==='admin')return statusBadge('in_progress','管理员');if(row.is_banned)return statusBadge('banned','已封禁');if(row.muted_until&&new Date(row.muted_until).getTime()>Date.now())return statusBadge('pending',`禁言至 ${fmt(row.muted_until)}`);return statusBadge('normal','正常');}
function partyStatus(value){return ({open:'可加入',full:'已满员',closed:'已结束',cancelled:'已取消'})[value]||value||'未知';}
function kindLabel(value){return ({posts:'广场帖子',comments:'广场评论',birdPosts:'树洞帖子',birdComments:'树洞评论',polls:'投票',chats:'房间消息',parties:'组队房间',partyMessages:'组队留言'})[value]||value;}
function logBadge(action){return ['ban','mute','delete_post','delete_comment','delete_chat_message','delete_bird_post','delete_bird_comment','delete_poll','delete_game_party_message','delete_game_party','delete_account'].includes(action)?'ignored':['unban','unmute','restore_post','restore_comment','restore_chat_message','restore_bird_post','restore_bird_comment','restore_poll'].includes(action)?'resolved':'in_progress';}

function detailShell(title,subtitle,body,actions=''){
  return `<aside class="panel detail-panel"><div class="detail-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="icon-button" type="button" data-close-detail aria-label="关闭详情">×</button></div><div class="detail-body">${body}</div>${actions?`<div class="detail-actions">${actions}</div>`:''}</aside>`;
}

function renderReportDetail(row){
  const type=reportType(row);
  const body=`
    <div class="detail-block"><h3>当前状态</h3><p>${statusBadge(row.status||'pending',reportStatusLabel(row.status))} ${statusBadge('in_progress',reportTypeText[type]||type)}</p></div>
    <div class="detail-block"><h3>被举报用户</h3><p>${esc(row.target_name||'未知用户')}<br><small>${esc(row.target_user_id||'')}</small></p></div>
    <div class="detail-block"><h3>举报原因</h3><div class="detail-content">${esc(row.report_reason||'用户举报')}</div></div>
    <div class="detail-block"><h3>被举报内容</h3><div class="detail-content">${esc(row.message_content||'没有内容预览')}</div></div>
    <div class="detail-block"><h3>举报人</h3><p>${esc(row.reporter_name||'未知')} · ${esc(fmt(row.created_at))}</p></div>`;
  const actions=(row.status||'pending')==='pending'?`<button class="button danger-solid" type="button" data-action="report" data-id="${esc(row.id)}">处理这条举报</button>`:'<button class="button" type="button" data-action="report" data-id="'+esc(row.id)+'">重新处理</button>';
  return detailShell(`举报 #${row.id}`,reportTypeText[type]||type,body,actions);
}

function renderFeedbackDetail(row){
  const body=`
    <div class="detail-block"><h3>状态</h3><p>${statusBadge(row.status||'new',feedbackStatusText[row.status||'new'])} ${statusBadge(row.priority||'normal',`优先级：${priorityText[row.priority||'normal']}`)}</p></div>
    <div class="detail-block"><h3>提交用户</h3><p>${esc(row.nickname||'未知用户')}<br><small>${esc(row.email||row.user_id||'')}</small></p></div>
    <div class="detail-block"><h3>反馈内容</h3><div class="detail-content">${esc(row.content||'')}</div></div>
    <div class="detail-block"><h3>来源</h3><p>${esc(row.platform||'未知')} · ${esc(row.version||'未知版本')}<br>${esc(fmt(row.created_at))}</p></div>
    ${row.admin_reply?`<div class="detail-block"><h3>最近回复</h3><div class="detail-content">${esc(row.admin_reply)}</div></div>`:''}
    ${row.internal_note?`<div class="detail-block"><h3>内部备注</h3><div class="detail-content">${esc(row.internal_note)}</div></div>`:''}`;
  return detailShell(`反馈 #${row.id}`,row.category||'其他反馈',body,`<button class="button primary" type="button" data-action="feedback" data-id="${esc(row.id)}">处理反馈</button>`);
}

function renderUserDetail(row){
  const body=`
    <div class="detail-block"><h3>账号状态</h3><p>${userStatusBadge(row)} ${row.is_test_account?statusBadge('test','测试账号'):''}</p></div>
    <div class="detail-block"><h3>用户资料</h3><p>${esc(row.nickname||'研究员')}<br>实验品编号：${esc(row.lab_code||'未设置')}<br>登录账号：${esc(row.email_search||'未记录')}<br><small>${esc(row.id)}</small></p></div>
    <div class="detail-block"><h3>账号时间</h3><p>注册：${esc(fmt(row.created_at))}<br>最近登录：${esc(fmt(row.last_sign_in_at))}</p></div>
    <div class="user-stat-grid"><div><strong>${Number(row.post_count||0)}</strong><span>公开发布</span></div><div><strong>${Number(row.comment_count||0)}</strong><span>互动内容</span></div><div><strong>${Number(row.report_count||0)}</strong><span>被举报</span></div><div><strong>${Number(row.moderation_count||0)}</strong><span>处理记录</span></div></div>
    ${row.role==='admin'?'':`<div class="danger-note"><strong>永久删除账号</strong><span>将删除登录账号及其关联内容、会话和文件，无法恢复。</span></div>`}`;
  const actions=row.role==='admin'?'<span class="badge in_progress">管理员账号不可处罚或删除</span>':`<button class="button danger-solid" type="button" data-action="user" data-id="${esc(row.id)}">调整账号状态</button><button class="button danger" type="button" data-action="user-delete" data-id="${esc(row.id)}">永久删除账号</button>`;
  return detailShell(row.nickname||'用户详情',row.lab_code||'未设置编号',body,actions);
}

function renderContentDetail(row,kind){
  const profile=profileOf(row);
  const owner=row.nickname||row.captain_name||profile.nickname||'未知用户';
  const content=kind==='parties'?`${row.game_name||'未命名游戏'}\n游戏模式：${row.mode||'未填写'}\n开黑时间：${row.starts_at_text||'未填写'}\n备注：${row.note||'无'}`:kind==='polls'?`${row.title||'无标题'}\n选项数：${row.option_count||0}\n截止时间：${fmt(row.ends_at)}\n结论：${row.conclusion||'暂无'}`:kind==='birdPosts'?`${row.title||'无标题'}\n${row.content||''}`:(row.content||'');
  const extra=kind==='birdComments'?`<div class="detail-block"><h3>所属树洞</h3><p>${esc(row.post_title||`#${row.post_id}`)}</p></div>`:kind==='partyMessages'?`<div class="detail-block"><h3>所属房间</h3><p>${esc(row.game_name||`#${row.party_id}`)}</p></div>`:'';
  const body=`<div class="detail-block"><h3>发布用户</h3><p>${esc(owner)}<br><small>${esc(row.user_id||row.captain_id||'')}</small></p></div><div class="detail-block"><h3>${esc(kindLabel(kind))}内容</h3><div class="detail-content">${esc(content)}</div></div>${extra}<div class="detail-block"><h3>发布时间</h3><p>${esc(fmt(row.created_at))}</p></div>`;
  const hardDelete=kind==='parties'||kind==='partyMessages';
  const actions=`<button class="button ${hardDelete||!row.is_deleted?'danger-solid':'primary'}" type="button" data-action="content" data-kind="${esc(kind)}" data-id="${esc(row.id)}">${hardDelete?(kind==='parties'?'删除组队房间':'删除组队留言'):row.is_deleted?'恢复内容':'删除内容'}</button>`;
  return detailShell(`${kindLabel(kind)} #${row.id}`,owner,body,actions);
}

function findRow(type,id,kind=''){
  const list=type==='report'?state.rows.reports:type==='feedback'?state.rows.feedback:type==='user'?state.rows.users:state.rows[kind]||[];
  return list.find(row=>String(row.id)===String(id))||null;
}

function selectRow(type,id,kind=''){
  const row=findRow(type,id,kind);if(!row)return;
  state.selection={type,row,kind};shellView();
}

function openDialog({title,description='',body,submitLabel='确认处理',danger=false,onSubmit}){
  dialogSubmit=onSubmit;
  dialog.innerHTML=`<form method="dialog" data-action-form><div class="dialog-head"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><button class="icon-button" type="button" data-dialog-close aria-label="关闭">×</button></div><div class="dialog-body">${body}</div><div class="dialog-actions"><button class="button" type="button" data-dialog-close>取消</button><button class="button ${danger?'danger-solid':'primary'}" type="submit">${esc(submitLabel)}</button></div></form>`;
  dialog.showModal();
}

function openReportAction(row){
  const type=reportType(row);
  const canDelete=['post','comment','chat_message'].includes(type);
  openDialog({title:`处理举报 #${row.id}`,description:`${reportTypeText[type]||type} · ${row.target_name||'未知用户'}`,danger:true,submitLabel:'确认并完成',body:`
    <label class="field">举报结果<select name="status"><option value="resolved">确认违规，标记已处理</option><option value="ignored">未发现违规，忽略举报</option></select></label>
    <label class="field">内容处理<select name="contentAction" ${canDelete?'':'disabled'}><option value="none">不处理内容</option>${canDelete?'<option value="delete">删除被举报内容</option>':''}</select></label>
    <label class="field">账号处理<select name="userAction"><option value="none">不处理账号</option><option value="mute:60">禁言 1 小时</option><option value="mute:1440">禁言 1 天</option><option value="mute:4320">禁言 3 天</option><option value="mute:10080">禁言 7 天</option><option value="mute:43200">禁言 30 天</option><option value="ban">封禁账号</option></select></label>
    <label class="field">处理原因<textarea name="reason" maxlength="240" required>举报已核实并完成处理</textarea></label>
    <label class="checkbox-field"><input name="publicVisible" type="checkbox">同步到公开处理公告</label>`,onSubmit:async data=>{
      const reason=String(data.get('reason')||'').trim();
      if(data.get('contentAction')==='delete')await moderateContent(type,row,true,reason,Boolean(data.get('publicVisible')));
      const action=String(data.get('userAction')||'none');
      if(action!=='none'&&row.target_user_id){
        const [name,minutes]=action.split(':');
        await adminApi.moderateUser({userId:row.target_user_id,action:name,muteMinutes:minutes?Number(minutes):null,reason,publicVisible:Boolean(data.get('publicVisible'))});
      }
      await adminApi.resolveReport({id:row.id,status:String(data.get('status')),reason,publicVisible:Boolean(data.get('publicVisible'))});
    }});
}

function openFeedbackAction(row){
  openDialog({title:`处理反馈 #${row.id}`,description:`${row.nickname||'用户'} · ${row.category||'其他'}`,submitLabel:'保存处理结果',body:`
    <label class="field">处理状态<select name="status">${feedbackOption('new','未处理',row.status)}${feedbackOption('in_progress','处理中',row.status)}${feedbackOption('waiting_user','等待用户回复',row.status)}${feedbackOption('resolved','已解决',row.status)}${feedbackOption('closed','已关闭',row.status)}</select></label>
    <label class="field">优先级<select name="priority">${priorityOption('low','低',row.priority)}${priorityOption('normal','普通',row.priority)}${priorityOption('medium','中',row.priority)}${priorityOption('high','高',row.priority)}</select></label>
    <label class="field">回复用户<small>填写后通过“回声”发送系统通知；不回复可留空。</small><textarea name="reply" maxlength="500">${esc(row.admin_reply||'')}</textarea></label>
    <label class="field">内部备注<small>仅管理员可见。</small><textarea name="note" maxlength="500">${esc(row.internal_note||'')}</textarea></label>`,onSubmit:data=>adminApi.updateFeedback({id:row.id,status:String(data.get('status')),priority:String(data.get('priority')),reply:String(data.get('reply')||'').trim(),note:String(data.get('note')||'').trim()})});
}

function feedbackOption(value,label,current){return `<option value="${value}" ${(current||'new')===value?'selected':''}>${label}</option>`;}
function priorityOption(value,label,current){return `<option value="${value}" ${(current||'normal')===value?'selected':''}>${label}</option>`;}

function openUserAction(row){
  openDialog({title:'调整账号状态',description:`${row.nickname||'用户'} · ${row.lab_code||'未设置编号'}`,danger:true,submitLabel:'确认处理',body:`
    <label class="field">处理动作<select name="action"><option value="mute:60">禁言 1 小时</option><option value="mute:1440">禁言 1 天</option><option value="mute:4320">禁言 3 天</option><option value="mute:10080">禁言 7 天</option><option value="mute:43200">禁言 30 天</option><option value="unmute">解除禁言</option><option value="ban">封禁账号</option><option value="unban">解除封禁</option></select></label>
    <label class="field">处理原因<textarea name="reason" maxlength="240" required>违反研究所公约</textarea></label>
    <label class="checkbox-field"><input name="publicVisible" type="checkbox">同步到公开处理公告</label>`,onSubmit:data=>{
      const [action,minutes]=String(data.get('action')).split(':');
      return adminApi.moderateUser({userId:row.id,action,muteMinutes:minutes?Number(minutes):null,reason:String(data.get('reason')||'').trim(),publicVisible:Boolean(data.get('publicVisible'))});
    }});
}

function openDeleteUserAction(row){
  const confirmation=row.lab_code||row.id;
  openDialog({title:'永久删除账号',description:`${row.nickname||'用户'} · 此操作无法恢复`,danger:true,submitLabel:'永久删除',body:`
    <div class="dialog-warning"><strong>将永久删除：</strong><span>登录账号、个人资料、帖子评论、聊天消息、组队数据以及存储文件。处理记录会保留。</span></div>
    <label class="field">删除原因<textarea name="reason" maxlength="240" required>用户申请注销账号</textarea></label>
    <label class="field">输入账号编号确认<small>请输入：${esc(confirmation)}</small><input name="confirmCode" autocomplete="off" required></label>
    <label class="field">最后确认<small>请输入：永久删除</small><input name="confirmText" autocomplete="off" required></label>`,onSubmit:data=>{
      const confirmCode=String(data.get('confirmCode')||'').trim();
      const confirmText=String(data.get('confirmText')||'').trim();
      if(confirmCode!==confirmation)throw new Error('账号编号不匹配，请重新确认。');
      if(confirmText!=='永久删除')throw new Error('请输入“永久删除”完成确认。');
      return adminApi.deleteUserAccount({targetUserId:row.id,confirmCode,confirmText,reason:String(data.get('reason')||'').trim()});
    }});
}

function openContentAction(row,kind){
  const hardDelete=kind==='parties'||kind==='partyMessages';
  const remove=hardDelete?true:!row.is_deleted;
  const title=kind==='parties'?'删除组队房间':kind==='partyMessages'?'删除组队留言':remove?'删除内容':'恢复内容';
  openDialog({title,description:`${kindLabel(kind)} #${row.id}`,danger:remove,submitLabel:hardDelete?'确认删除':remove?'确认删除':'确认恢复',body:`<label class="field">处理原因<textarea name="reason" maxlength="240" required>${hardDelete?'内容违规，管理员删除':remove?'内容不适合公开展示':'内容复核后恢复'}</textarea></label>${kind==='parties'?'':'<label class="checkbox-field"><input name="publicVisible" type="checkbox">同步到公开处理公告</label>'}`,onSubmit:data=>{
    const reason=String(data.get('reason')||'').trim();
    if(kind==='parties')return adminApi.moderateParty({id:row.id,reason});
    if(kind==='partyMessages')return adminApi.deletePartyMessage({id:row.id,reason,publicVisible:Boolean(data.get('publicVisible'))});
    return moderateContent(kind,row,remove,reason,Boolean(data.get('publicVisible')));
  }});
}

async function moderateContent(type,row,remove,reason,publicVisible){
  if(type==='post'||type==='posts')return adminApi.moderatePost({id:row.message_id||row.id,remove,reason,publicVisible});
  if(type==='comment'||type==='comments')return adminApi.moderateComment({id:row.message_id||row.id,remove,reason,publicVisible});
  if(type==='chat_message'||type==='chat'||type==='chats')return adminApi.moderateChat({id:row.message_id||row.id,remove,reason,publicVisible});
  if(type==='birdPosts')return adminApi.moderateBirdPost({id:row.id,remove,reason,publicVisible});
  if(type==='birdComments')return adminApi.moderateBirdComment({id:row.id,remove,reason,publicVisible});
  if(type==='polls')return adminApi.moderatePoll({id:row.id,remove,reason,publicVisible});
}

async function loadAll({quiet=false}={}){
  if(!quiet)setBusy(true,'正在同步管理数据…');
  try{
    const results=await Promise.allSettled([
      adminApi.listUsers(),adminApi.listReports(),adminApi.listFeedback(),adminApi.listPosts(),
      adminApi.listComments(),adminApi.listChats(),adminApi.listParties(),adminApi.listBirdPosts(),
      adminApi.listBirdComments(),adminApi.listPolls(),adminApi.listPartyMessages(),adminApi.listLogs()
    ]);
    const keys=['users','reports','feedback','posts','comments','chats','parties','birdPosts','birdComments','polls','partyMessages','logs'];
    const failures=[];
    results.forEach((result,index)=>{if(result.status==='fulfilled')state.rows[keys[index]]=result.value||[];else failures.push(result.reason?.message||`${keys[index]}读取失败`);});
    if(failures.length)toast(failures[0],true);
    if(state.selection){const updated=findRow(state.selection.type,state.selection.row.id,state.selection.kind);state.selection=updated?{...state.selection,row:updated}:null;}
    shellView();
  }finally{if(!quiet)setBusy(false);}
}

async function refresh(){await loadAll();toast('管理数据已刷新。');}

document.addEventListener('submit',async event=>{
  const login=event.target.closest('[data-login-form]');
  if(login){
    event.preventDefault();const data=new FormData(login);const status=login.querySelector('[data-login-status]');
    status.textContent='正在验证管理员权限…';
    try{state.admin=await adminApi.signIn(data.get('email'),data.get('password'));await loadAll();}
    catch(error){status.textContent=error.message||'登录失败。';}
    return;
  }
  const form=event.target.closest('[data-action-form]');
  if(form){
    event.preventDefault();if(!dialogSubmit)return;
    const submit=form.querySelector('[type="submit"]');submit.disabled=true;
    try{setBusy(true,'正在保存处理结果…');await dialogSubmit(new FormData(form));dialog.close();dialogSubmit=null;await loadAll({quiet:true});toast('处理结果已保存。');}
    catch(error){toast(error.message||'操作失败。',true);}
    finally{setBusy(false);submit.disabled=false;}
  }
});

document.addEventListener('click',async event=>{
  const nav=event.target.closest('[data-nav]');
  if(nav){state.view=nav.dataset.nav;state.query='';state.filter=state.view==='feedback'||state.view==='reports'?'pending':'all';state.selection=null;shellView();return;}
  if(event.target.closest('[data-refresh]')){refresh().catch(error=>toast(error.message||'刷新失败。',true));return;}
  if(event.target.closest('[data-toggle-tests]')){state.showTestData=!state.showTestData;state.selection=null;shellView();return;}
  if(event.target.closest('[data-logout]')){setBusy(true,'正在退出…');try{await adminApi.signOut();state.admin=null;state.rows=emptyRows();loginView();}catch(error){toast(error.message,true);}finally{setBusy(false);}return;}
  const filter=event.target.closest('[data-filter]');if(filter){state.filter=filter.dataset.filter;state.selection=null;shellView();return;}
  const content=event.target.closest('[data-content-type]');if(content){state.contentType=content.dataset.contentType;state.selection=null;shellView();return;}
  const selected=event.target.closest('[data-select-type]');if(selected){selectRow(selected.dataset.selectType,selected.dataset.selectId,selected.dataset.selectKind||'');return;}
  const open=event.target.closest('[data-open-kind]');if(open){state.view=open.dataset.openKind==='report'?'reports':'feedback';state.filter='all';selectRow(open.dataset.openKind,open.dataset.openId);return;}
  if(event.target.closest('[data-close-detail]')){state.selection=null;shellView();return;}
  if(event.target.closest('[data-dialog-close]')){dialog.close();dialogSubmit=null;return;}
  const action=event.target.closest('[data-action]');
  if(action){const kind=action.dataset.action;const lookup=kind==='content'?'content':kind==='user-delete'?'user':kind;const row=findRow(lookup,action.dataset.id,action.dataset.kind||'');if(!row)return;if(kind==='report')openReportAction(row);if(kind==='feedback')openFeedbackAction(row);if(kind==='user')openUserAction(row);if(kind==='user-delete')openDeleteUserAction(row);if(kind==='content')openContentAction(row,action.dataset.kind);}
});

document.addEventListener('input',event=>{
  const input=event.target.closest('[data-search]');if(!input)return;
  state.query=input.value;
  const position=input.selectionStart;
  shellView();
  const next=document.querySelector('[data-search]');if(next){next.focus();next.setSelectionRange(position,position);}
});

dialog.addEventListener('cancel',()=>{dialogSubmit=null;});

async function boot(){
  try{
    const admin=await adminApi.restoreAdmin();
    if(!admin){loginView();return;}
    state.admin=admin;await loadAll();
  }catch(error){loginView(error.message||'登录状态已失效，请重新登录。');}
}

adminApi.onAuthStateChange(event=>{
  if(event==='SIGNED_OUT'&&state.admin){state.admin=null;state.rows=emptyRows();loginView();}
});

boot();

window.__FW_ADMIN_APP__={version:APP_VERSION};
