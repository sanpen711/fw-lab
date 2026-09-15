(function(){
  if(window.__FW_MOBILE_DESKTOP_SYNC__) return;
  window.__FW_MOBILE_DESKTOP_SYNC__ = true;

  var $ = function(selector, root){ return (root || document).querySelector(selector); };
  var $$ = function(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  var esc = function(value){ return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var client = function(){ return window.fwDb && window.fwDb.client; };
  var me = function(){ return window.FWApp && window.FWApp.state && window.FWApp.state.user; };
  var toast = function(message){ if(window.FWApp && window.FWApp.toast) window.FWApp.toast(message); };
  var fail = function(result, label){ if(result && result.error) throw new Error(label + '：' + result.error.message); return result ? result.data : null; };
  var dateText = function(value){ var date = new Date(value); return isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}); };
  var read = function(key){ try{return JSON.parse(localStorage.getItem(key) || 'null');}catch(e){return null;} };
  var write = function(key,value){ try{localStorage.setItem(key,JSON.stringify(value));}catch(e){} };

  /* 首页工具 */
  var WEATHER_LOCATION_KEY = 'fw:mobile:weather-location';
  var WEATHER_CACHE_KEY = 'fw:mobile:weather-cache';
  var OFFWORK_TIME_KEY = 'fw:mobile:offwork-time';
  var weatherResults = [];
  var weatherBusy = false;
  var countdownTimer = 0;
  var weatherEndpoint = ((window.FW_SUPABASE && window.FW_SUPABASE.url) || '') + '/functions/v1/fw-weather';

  function setHomeStatus(message){ var node=$('[data-mobile-home-status]'); if(node) node.textContent=message || ''; }
  function openHomeTool(name){
    var modal=$('[data-mobile-home-modal]'); if(!modal) return;
    $$('[data-mobile-home-view]',modal).forEach(function(view){ view.hidden=view.dataset.mobileHomeView!==name; });
    modal.hidden=false; setHomeStatus('');
    if(name==='weather'){ var city=$('[data-mobile-weather-form] input[name="city"]'); if(city) city.value=(read(WEATHER_LOCATION_KEY)||{}).query||''; renderWeatherResults([]); }
    if(name==='offwork'){ var time=$('[data-mobile-offwork-form] input[name="time"]'); if(time) time.value=read(OFFWORK_TIME_KEY)||'18:00'; }
  }
  function closeHomeTool(){ var modal=$('[data-mobile-home-modal]'); if(modal) modal.hidden=true; setHomeStatus(''); }
  function renderWeather(extra){
    var main=$('[data-mobile-weather-main]'), detail=$('[data-mobile-weather-detail]'), meta=$('[data-mobile-weather-meta]'), credit=$('[data-mobile-weather-credit]');
    if(!main||!detail||!meta) return;
    var location=read(WEATHER_LOCATION_KEY), cached=read(WEATHER_CACHE_KEY), valid=cached&&cached.provider==='qweather'&&cached.current;
    if(credit) credit.hidden=!valid;
    if(!location){ main.textContent='设置天气';detail.textContent='点击选择你所在的县区';meta.textContent='无需定位权限';return; }
    if(!valid){ main.textContent='正在读取天气';detail.textContent=location.label;meta.textContent=extra||'请稍候…';return; }
    var current=cached.current, humidity=Number(current.humidity);
    main.textContent=Math.round(Number(current.temperature)||0)+'°';
    detail.textContent=location.label+' · '+(current.conditionText||'天气变化中');
    meta.textContent=extra||('体感 '+Math.round(Number(current.apparentTemperature)||0)+'°'+(isFinite(humidity)?' · 湿度 '+Math.round(humidity*100)+'%':''));
  }
  async function fetchJson(url){
    var controller=new AbortController(), timer=setTimeout(function(){controller.abort();},9000);
    try{ var response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}}); var data=await response.json().catch(function(){return null;}); if(!response.ok) throw new Error(data&&data.error||'服务连接失败'); return data; }
    finally{clearTimeout(timer);}
  }
  async function fetchWeather(location){
    var params=new URLSearchParams({action:'current',lat:String(location.latitude),lon:String(location.longitude)});
    var data=await fetchJson(weatherEndpoint+'?'+params); if(!data||!data.current) throw new Error('暂时没有取到这个地区的天气。');
    write(WEATHER_CACHE_KEY,{provider:'qweather',savedAt:Date.now(),location:location,current:data.current,attribution:data.attribution||''});renderWeather();
  }
  async function loadWeather(force){
    var location=read(WEATHER_LOCATION_KEY); if(!location||weatherBusy) return;
    var cached=read(WEATHER_CACHE_KEY);renderWeather();if(!force&&cached&&cached.savedAt&&Date.now()-Number(cached.savedAt)<3600000)return;
    weatherBusy=true;renderWeather('正在更新…');try{await fetchWeather(location);}catch(e){renderWeather(cached&&cached.current?'更新失败，点击可重试':'天气暂时取不到');}finally{weatherBusy=false;}
  }
  function renderWeatherResults(rows){
    var host=$('[data-mobile-weather-results]');if(!host)return;weatherResults=rows||[];host.hidden=!weatherResults.length;
    host.innerHTML=weatherResults.map(function(row,index){return '<button type="button" data-mobile-weather-choice="'+index+'"><strong>'+esc(row.name)+'</strong><span>'+esc([row.adm2,row.adm1].filter(Boolean).join(' · '))+'</span></button>';}).join('');
  }
  function renderCountdown(){
    var value=$('[data-mobile-offwork-value]'),detail=$('[data-mobile-offwork-detail]'),meta=$('[data-mobile-offwork-meta]');if(!value||!detail||!meta)return;
    var time=read(OFFWORK_TIME_KEY);if(typeof time!=='string'||!/^\d{2}:\d{2}$/.test(time)){value.textContent='设置时间';detail.textContent='今天几点下班？';meta.textContent='点击设置下班时间';return;}
    var bits=time.split(':').map(Number),now=new Date(),target=new Date(now);target.setHours(bits[0],bits[1],0,0);var remaining=target-now;
    if(remaining<=0){value.textContent='已经下班';detail.textContent='今天辛苦了';meta.textContent='下班时间 '+time+' · 点击修改';return;}
    var seconds=Math.floor(remaining/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;
    value.textContent=[hours,minutes,rest].map(function(n){return String(n).padStart(2,'0');}).join(':');detail.textContent='距离 '+time+' 下班';meta.textContent=hours<1?'最后一小时，稳住':'点击修改下班时间';
  }
  function stopCountdown(){clearTimeout(countdownTimer);countdownTimer=0;}
  function scheduleCountdown(){
    stopCountdown();renderCountdown();
    var view=window.FWApp&&window.FWApp.state&&window.FWApp.state.view;
    if(!document.hidden&&view==='nav'&&typeof read(OFFWORK_TIME_KEY)==='string')countdownTimer=setTimeout(scheduleCountdown,1000);
  }
  async function submitFeedback(form){
    var user=me();if(!user){toast('请先登录后再提交反馈。');window.FWApp.setView('profile');closeHomeTool();return;}
    var data=new FormData(form), content=String(data.get('content')||'').trim();if(content.length<4)throw new Error('请至少写 4 个字。');
    var auth=await client().auth.getUser(), metadata=auth.data&&auth.data.user&&auth.data.user.user_metadata||{}, previous=Array.isArray(metadata.fw_feedback_history)?metadata.fw_feedback_history:[];
    var entry={category:String(data.get('category')||'其他'),content:content.slice(0,500),version:'1.2.21',platform:'mobile',createdAt:new Date().toISOString()};
    fail(await client().auth.updateUser({data:{fw_feedback:entry,fw_feedback_history:[entry].concat(previous).slice(0,5)}}),'反馈提交失败');form.reset();closeHomeTool();toast('反馈已收到，谢谢你。');
  }

  /* 会员中心 */
  var membership={loaded:false,loading:false,userId:'',plans:[],active:null,orders:[],theme:'rose_gold',styles:{},tab:'benefits',selected:'',payment:'wechat'};
  var defaultPlans=[
    {id:'monthly',name:'月度会员',duration_months:1,price_cents:200,compare_at_price_cents:990,sort_order:1},
    {id:'quarterly',name:'季度会员',duration_months:3,price_cents:2500,compare_at_price_cents:2970,sort_order:2},
    {id:'yearly',name:'年度会员',duration_months:12,price_cents:8800,compare_at_price_cents:11880,is_recommended:true,sort_order:3}
  ];
  function money(cents){var number=Number(cents||0)/100;return '¥'+number.toFixed(Number(cents||0)%100?1:0);}
  function activeMembership(){var row=membership.active;if(!row||row.status!=='active'||!row.expires_at)return null;return new Date(row.expires_at).getTime()>Date.now()?row:null;}
  function partyLimit(){return activeMembership()?15:5;}
  async function loadMembership(force){
    var user=me();if(!user){membership={loaded:true,loading:false,userId:'',plans:defaultPlans.slice(),active:null,orders:[],theme:'rose_gold',styles:{},tab:membership.tab||'benefits',selected:'',payment:'wechat'};renderMembership();return;}
    if(membership.loading||(!force&&membership.loaded&&membership.userId===String(user.id)))return;
    membership.loading=true;membership.userId=String(user.id);renderMembership();
    try{
      var results=await Promise.all([
        client().from('membership_plans').select('id,name,duration_months,price_cents,compare_at_price_cents,is_recommended,sort_order').eq('is_active',true).order('sort_order',{ascending:true}),
        client().from('memberships').select('user_id,plan_id,status,starts_at,expires_at,source,updated_at').eq('user_id',user.id).maybeSingle(),
        client().from('membership_orders').select('id,order_no,plan_id,amount_cents,payment_method,status,created_at,paid_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20),
        client().rpc('fw_get_active_membership_styles',{p_user_ids:[user.id]})
      ]);
      membership.plans=fail(results[0],'读取会员套餐失败')||[];if(!membership.plans.length)membership.plans=defaultPlans.slice();membership.active=fail(results[1],'读取会员状态失败')||null;membership.orders=fail(results[2],'读取订单失败')||[];
      var styleRows=fail(results[3],'读取会员装扮失败')||[];membership.theme=styleRows[0]&&styleRows[0].theme||'rose_gold';membership.styles[String(user.id)]=activeMembership()?membership.theme:'';
    }catch(e){membership.plans=membership.plans.length?membership.plans:defaultPlans.slice();toast(e.message||'会员信息读取失败。');}
    membership.loaded=true;membership.loading=false;renderMembership();enhanceProfiles();
  }
  async function ensureMemberStyles(ids){
    var user=me();if(!user)return;ids=Array.from(new Set((ids||[]).filter(Boolean).map(String))).filter(function(id){return membership.styles[id]===undefined;});if(!ids.length)return;
    try{var rows=fail(await client().rpc('fw_get_active_membership_styles',{p_user_ids:ids}),'读取会员身份失败')||[], found={};rows.forEach(function(row){found[String(row.user_id)]=row.theme||'rose_gold';});ids.forEach(function(id){membership.styles[id]=found[id]||'';});enhanceProfiles();}catch(e){}
  }
  function benefitsHtml(){var rows=[['会员标识','昵称与资料展示会员身份'],['专属资料卡','使用更醒目的会员资料样式'],['表情扩容','我的表情上限由 80 个提升至 160 个'],['组队扩容','同时创建的组队由 5 个提升至 15 个'],['优先体验','新的小功能与小游戏优先开放']];return '<section class="mobile-membership-section"><header><h3>会员权益</h3><p>基础功能不会因未开通会员而受限</p></header><div class="mobile-membership-benefits">'+rows.map(function(row,index){return '<article><i>'+String(index+1).padStart(2,'0')+'</i><div><b>'+row[0]+'</b><span>'+row[1]+'</span></div></article>';}).join('')+'</div></section>';}
  function renderMembership(){
    var host=$('[data-mobile-membership-content]');if(!host)return;$$('[data-mobile-membership-tab]').forEach(function(button){button.classList.toggle('active',button.dataset.mobileMembershipTab===membership.tab);});
    if(membership.loading&&!membership.loaded){host.innerHTML='<div class="mobile-sync-empty">正在读取会员信息…</div>';return;}
    if(membership.tab==='orders'){
      var orders=membership.orders.length?membership.orders.map(function(order){var plan=membership.plans.find(function(row){return String(row.id)===String(order.plan_id);})||{};return '<article class="mobile-membership-order"><div><b>'+esc(plan.name||'研究所会员')+'</b><span>'+esc(order.order_no||'订单号生成中')+'</span></div><div><b>'+money(order.amount_cents)+'</b><span>'+esc(({pending:'待支付',paid:'已支付',closed:'已关闭',refunded:'已退款',failed:'支付失败'})[order.status]||'处理中')+' · '+dateText(order.created_at)+'</span></div></article>';}).join(''):'<div class="mobile-sync-empty">'+(me()?'暂无会员订单':'登录后查看订单')+'</div>';
      host.innerHTML='<section class="mobile-membership-section"><h3>订单记录</h3>'+orders+'</section>';return;
    }
    var active=activeMembership(), plan=membership.plans.find(function(row){return String(row.id)===String(active&&active.plan_id);})||{}, selected=membership.plans.find(function(row){return String(row.id)===String(membership.selected);});
    var status='<section class="mobile-membership-card"><div class="mobile-membership-status"><div><small>当前状态</small><h2>'+(active?'会员身份已点亮':me()?'普通研究员':'尚未登录')+'</h2></div>'+(active?'<span>VIP</span>':'')+'</div><p>'+(active?esc(plan.name||'会员')+' · '+new Date(active.expires_at).toLocaleDateString('zh-CN')+' 到期':me()?'当前可以正常使用全部基础功能。':'登录后查看会员状态和订单记录。')+'</p></section>';
    var themes=active?'<section class="mobile-membership-section"><h3>会员装扮</h3><div class="mobile-membership-themes">'+[['rose_gold','玫瑰金'],['black_gold','黑金色'],['pink_starlight','粉色星光']].map(function(row){return '<button class="mobile-theme-choice '+(membership.theme===row[0]?'selected':'')+'" data-mobile-theme="'+row[0]+'" data-theme="'+row[0]+'"><i></i>'+row[1]+'</button>';}).join('')+'</div></section>':'';
    var plans='<section class="mobile-membership-section"><header><h3>'+(active?'续费会员':'选择会员时长')+'</h3><p>一次购买固定时长，不会自动扣费</p></header><div class="mobile-membership-plans">'+membership.plans.map(function(row){var chosen=String(row.id)===String(membership.selected);return '<article class="mobile-membership-plan '+(chosen?'selected':'')+'"><div class="mobile-membership-plan-head"><strong>'+esc(row.name)+'</strong><span>'+money(row.price_cents)+'</span></div><p>'+Number(row.duration_months)+' 个月'+(row.is_recommended?' · 推荐':'')+(String(row.id)==='monthly'?' · 限时':'')+'</p><button type="button" data-mobile-plan="'+esc(row.id)+'">'+(chosen?'已选择':'选择套餐')+'</button></article>';}).join('')+'</div></section>';
    var checkout=selected?'<section class="mobile-membership-checkout"><h3>'+esc(selected.name)+' · '+money(selected.price_cents)+'</h3><div class="mobile-payment-row"><button class="'+(membership.payment==='wechat'?'active':'')+'" data-mobile-payment="wechat">微信支付</button><button class="'+(membership.payment==='alipay'?'active':'')+'" data-mobile-payment="alipay">支付宝</button></div><p>支付接口待接入，当前页面不会创建订单，也不会产生扣款。</p></section>':'';
    host.innerHTML=status+themes+plans+checkout+benefitsHtml();
  }
  async function setMembershipTheme(theme){var result=await client().rpc('fw_set_membership_theme',{p_theme:theme});fail(result,'保存会员装扮失败');membership.theme=theme;membership.styles[String(me().id)]=theme;renderMembership();enhanceProfiles();toast('会员装扮已切换。');}

  /* 小游戏 */
  var games={
    '2048':{title:'2048',tip:'滑动合并数字',path:'2048'},minesweeper:{title:'扫雷',tip:'点按翻开，长按插旗',path:'minesweeper'},snake:{title:'贪吃蛇',tip:'使用下方方向按钮',path:'snake',controls:true},sudoku:{title:'数独',tip:'选择格子后填写数字',path:'sudoku'},reaction:{title:'反应测试',tip:'画面变绿后尽快点击',path:'reaction'},catch:{title:'接住掉落物',tip:'拖动手指控制托盘',path:'catch'}
  }, currentGame='';
  function openGame(id){var game=games[id];if(!game)return;currentGame=id;$('[data-mobile-game-title]').textContent=game.title;$('[data-mobile-game-tip]').textContent=game.tip;$('[data-mobile-game-controls]').hidden=!game.controls;$('[data-mobile-game-frame]').src='./games/'+game.path+'/index.html?v=1.2.21';window.FWApp.setView('game-stage');write('fw:mobile:last-game',id);}
  function closeGame(){currentGame='';var frame=$('[data-mobile-game-frame]');if(frame)frame.src='about:blank';window.FWApp.setView('games');}
  function reloadGame(){if(!currentGame)return;var frame=$('[data-mobile-game-frame]'),url=frame.src;frame.src='about:blank';setTimeout(function(){frame.src=url;},20);}
  function gameKey(key){var frame=$('[data-mobile-game-frame]');if(!frame||!frame.contentWindow)return;frame.contentWindow.dispatchEvent(new KeyboardEvent('keydown',{key:key,code:key,bubbles:true}));}

  /* 下班开黑 */
  var party={loaded:false,loading:false,busy:false,error:'',rows:[],members:[],contacts:[],messages:[],profiles:{},alerts:[],openId:'',filter:'open',createOpen:false,channel:null};
  var partyAlertTypes=['game_party_apply','game_party_joined','game_party_accepted','game_party_rejected'];
  function myPartyMember(row){var user=me();return party.members.find(function(item){return String(item.party_id)===String(row.id)&&String(item.user_id)===String(user&&user.id);});}
  function partyProfile(id){return party.profiles[String(id)]||{};}
  function partyContact(partyId,userId){return party.contacts.find(function(row){return String(row.party_id)===String(partyId)&&String(row.user_id)===String(userId);});}
  function isCaptain(row){return String(row.captain_id)===String(me()&&me().id||'');}
  function partyStart(row){var manual=String(row.starts_at_text||'').trim();if(manual)return manual;if(!row.starts_at)return'时间待定';return dateText(row.starts_at);}
  function partyHasAlert(id){return party.alerts.some(function(row){return String(row.target_id)===String(id);});}
  function partyStateLabel(value){return({pending:'等待确认',accepted:'已加入',rejected:'未通过',left:'已退出'})[value]||value||'查看详情';}
  function partyStatus(row){return row.status==='full'||Number(row.member_count)>=Number(row.capacity)?['已满员','full']:['可加入',''];}

  async function loadParties(force){
    if(party.loading||(!force&&party.loaded))return;party.loading=true;renderPartyList();
    try{
      var rows=fail(await client().from('game_parties').select('id,captain_id,game_name,platform,server_name,mode,starts_at,starts_at_text,capacity,member_count,note,requires_approval,status,created_at,updated_at').in('status',['open','full']).order('created_at',{ascending:false}).limit(100),'读取组队房间失败')||[];
      var ids=rows.map(function(row){return row.id;}),members=[],contacts=[],messages=[],alerts=[];
      if(me()&&ids.length){
        members=fail(await client().from('game_party_members').select('party_id,user_id,role,state,request_message,created_at,updated_at').in('party_id',ids),'读取组队状态失败')||[];
        contacts=fail(await client().from('game_party_contacts').select('party_id,user_id,game_id,updated_at').in('party_id',ids),'读取游戏 ID 失败')||[];
        var notices=fail(await client().from('notifications').select('id,actor_id,type,target_id,created_at').eq('user_id',me().id).in('type',partyAlertTypes).eq('is_read',false).in('target_id',ids.map(String)),'读取组队提醒失败')||[];
        var pending={};members.filter(function(row){return row.state==='pending';}).forEach(function(row){pending[String(row.party_id)+':'+String(row.user_id)]=true;});alerts=notices.filter(function(row){return row.type!=='game_party_apply'||pending[String(row.target_id)+':'+String(row.actor_id)];});
        if(party.openId)messages=fail(await client().from('game_party_messages').select('id,party_id,user_id,content,created_at').eq('party_id',party.openId).order('created_at',{ascending:true}).limit(200),'读取队伍聊天失败')||[];
      }
      var profileIds=Array.from(new Set(rows.map(function(row){return row.captain_id;}).concat(members.map(function(row){return row.user_id;}),messages.map(function(row){return row.user_id;})).filter(Boolean)));
      if(profileIds.length){var profiles=fail(await client().from('profiles').select('id,nickname,avatar_url,lab_code').in('id',profileIds),'读取队友资料失败')||[];profiles.forEach(function(row){party.profiles[String(row.id)]=row;});await ensureMemberStyles(profileIds);}
      party.rows=rows;party.members=members;party.contacts=contacts;party.messages=messages;party.alerts=alerts;party.loaded=true;party.error='';if(party.openId&&!rows.some(function(row){return String(row.id)===String(party.openId);}))party.openId='';
    }catch(e){party.error=e.message||'组队房间读取失败。';party.loaded=true;}
    party.loading=false;renderPartyList();renderPartyDetail();syncPartyDots();
  }
  function filteredParties(){return party.rows.filter(function(row){var member=myPartyMember(row);if(party.filter==='mine')return isCaptain(row)||(member&&['pending','accepted'].includes(member.state))||partyHasAlert(row.id);if(party.filter==='open')return row.status==='open'&&Number(row.member_count)<Number(row.capacity);return true;});}
  function partyCard(row){var captain=partyProfile(row.captain_id),status=partyStatus(row),tags=[row.server_name,row.mode,row.requires_approval===false?'直接加入':'需要申请'].filter(Boolean);return '<button class="mobile-party-card" type="button" data-mobile-party-open="'+esc(row.id)+'"><span class="mobile-party-card-head"><span><h2>'+esc(row.game_name)+(partyHasAlert(row.id)?' <i class="mobile-nav-dot" style="position:static;display:inline-block"></i>':'')+'</h2><p>'+esc(captain.nickname||'研究员')+' 发起 · '+esc(partyStart(row))+'</p></span><i class="mobile-party-status '+status[1]+'">'+status[0]+'</i></span><span class="mobile-party-tags">'+tags.map(function(tag){return'<span>'+esc(tag)+'</span>';}).join('')+'</span><footer><span><b>'+Number(row.member_count||0)+'/'+Number(row.capacity||5)+'</b> 人</span><span>'+partyStateLabel(myPartyMember(row)&&myPartyMember(row).state)+'</span></footer></button>';}
  function renderPartyList(){
    var host=$('[data-mobile-party-list]');if(!host)return;$$('[data-mobile-party-filter]').forEach(function(button){button.classList.toggle('active',button.dataset.mobilePartyFilter===party.filter);});
    if(party.loading&&!party.loaded){host.innerHTML='<div class="mobile-sync-empty">正在看看谁还缺队友…</div>';return;}if(party.error&&!party.rows.length){host.innerHTML='<div class="mobile-sync-empty">'+esc(party.error)+'</div>';return;}
    var rows=filteredParties();host.innerHTML=rows.length?rows.map(partyCard).join(''):'<div class="mobile-sync-empty">'+(party.filter==='mine'?'还没有你的组队。':'还没有可加入的房间，可以创建一个。')+'</div>';
  }
  function renderPartyCreate(){
    var host=$('[data-mobile-party-create-host]');if(!host)return;host.hidden=!party.createOpen;if(!party.createOpen)return;
    if(!me()){host.innerHTML='<div class="mobile-sync-empty">登录后才能创建组队。</div>';return;}
    host.innerHTML='<form class="mobile-party-create-card mobile-party-form" data-mobile-party-create-form><h2>创建组队</h2><p>只有游戏名称必须填写；当前最多可以同时创建 '+partyLimit()+' 个组队。</p><label>游戏名称<input name="gameName" maxlength="30" required></label><label>游戏模式<input name="mode" maxlength="30"></label><label>大区 / 服务器<input name="serverName" maxlength="30"></label><label>开玩时间<input name="startsAt" maxlength="40"></label><label>总人数<input name="capacity" type="number" min="2" max="10"></label><label>你的游戏 ID<input name="gameId" maxlength="60"></label><label class="mobile-party-approval"><input name="requiresApproval" type="checkbox" checked><span><b>进队需要申请</b><small>取消后，其他人提交加入信息即可直接进队。</small></span></label><label>补充说明<textarea name="note" maxlength="200"></textarea></label><button class="app-btn dark" type="submit">创建组队</button></form>';
  }
  function memberBadge(id){return membership.styles[String(id)]?'<span class="vip-mobile-badge">VIP</span>':'';}
  function memberRow(row,pending){var user=partyProfile(row.user_id),gameId=partyContact(row.party_id,row.user_id);return '<div class="mobile-party-member"><div><b>'+esc(user.nickname||'研究员')+memberBadge(row.user_id)+'</b><span>'+esc(pending?(row.request_message||'想加入这个组队'):'游戏 ID：'+(gameId&&gameId.game_id||'未填写'))+'</span></div>'+(pending?'<span class="mobile-party-member-actions"><button data-mobile-party-decide="reject" data-party="'+esc(row.party_id)+'" data-user="'+esc(row.user_id)+'">拒绝</button><button data-mobile-party-decide="accept" data-party="'+esc(row.party_id)+'" data-user="'+esc(row.user_id)+'">同意</button></span>':'')+'</div>';}
  function partyChat(row){return '<section class="mobile-party-section"><h3>队伍聊天</h3><div class="mobile-party-chat">'+(party.messages.length?party.messages.map(function(item){var user=partyProfile(item.user_id);return '<article class="mobile-party-message"><header><b>'+esc(user.nickname||'研究员')+memberBadge(item.user_id)+'</b><time>'+dateText(item.created_at)+'</time></header><p>'+esc(item.content)+'</p></article>';}).join(''):'<div class="mobile-sync-empty">队伍里还没人说话。</div>')+'</div></section><form class="mobile-party-chat-compose" data-mobile-party-chat-form="'+esc(row.id)+'"><input name="content" maxlength="300" placeholder="只对已确认队友可见" required><button type="submit">发送</button></form>';}
  function renderPartyDetail(){
    var host=$('[data-mobile-party-detail]');if(!host)return;var row=party.rows.find(function(item){return String(item.id)===String(party.openId);});if(!row){host.innerHTML='';return;}
    var captain=partyProfile(row.captain_id),mine=myPartyMember(row),captainMode=isCaptain(row),accepted=captainMode||(mine&&mine.state==='accepted'),needsApproval=row.requires_approval!==false,status=partyStatus(row),action='';
    if(!me()) action='<section class="mobile-party-section"><div class="mobile-sync-empty">登录后'+(needsApproval?'申请加入':'加入队伍')+'。</div></section>';
    else if(captainMode){var pending=party.members.filter(function(item){return String(item.party_id)===String(row.id)&&item.state==='pending';}),joined=party.members.filter(function(item){return String(item.party_id)===String(row.id)&&item.state==='accepted'&&item.role!=='captain';});action=(needsApproval?'<section class="mobile-party-section"><h3>待确认申请 · '+pending.length+'</h3>'+pending.map(function(item){return memberRow(item,true);}).join('')+'</section>':'')+'<section class="mobile-party-section"><h3>已加入队友 · '+joined.length+'</h3>'+joined.map(function(item){return memberRow(item,false);}).join('')+'<button class="app-btn" data-mobile-party-close="'+esc(row.id)+'">结束并删除房间</button></section>'+partyChat(row);}
    else if(mine&&mine.state==='pending')action='<section class="mobile-party-section"><div class="mobile-sync-empty">已提交申请，等待队长确认。</div><button class="app-btn" data-mobile-party-leave="'+esc(row.id)+'">撤回申请</button></section>';
    else if(mine&&mine.state==='accepted'){var captainId=partyContact(row.id,row.captain_id),ownId=partyContact(row.id,me().id);action='<section class="mobile-party-section"><h3>游戏 ID</h3><p>队长：'+esc(captainId&&captainId.game_id||'未填写')+'</p><p>我的：'+esc(ownId&&ownId.game_id||'未填写')+'</p><button class="app-btn" data-mobile-party-leave="'+esc(row.id)+'">退出组队</button></section>'+partyChat(row);}
    else if(row.status==='open'&&Number(row.member_count)<Number(row.capacity))action='<section class="mobile-party-section"><form class="mobile-party-form" data-mobile-party-join-form="'+esc(row.id)+'"><h3>'+(needsApproval?'申请加入':'加入队伍')+'</h3><label>你的游戏 ID<input name="gameId" maxlength="60"></label><label>想对队长说<textarea name="message" maxlength="100"></textarea></label><button class="app-btn dark" type="submit">'+(needsApproval?'提交申请':'直接加入')+'</button></form></section>';
    else action='<section class="mobile-party-section"><div class="mobile-sync-empty">这个房间暂时不能加入。</div></section>';
    host.innerHTML='<div class="mobile-party-detail-head"><button class="app-btn back-btn" data-mobile-party-detail-back>‹ 房间列表</button><b>组队详情</b><i class="mobile-party-status '+status[1]+'">'+status[0]+'</i></div><article class="mobile-party-summary"><h2>'+esc(row.game_name)+'</h2><p>'+esc(captain.nickname||'研究员')+memberBadge(row.captain_id)+' 发起</p><div class="mobile-party-meta"><div><small>开玩时间</small><b>'+esc(partyStart(row))+'</b></div><div><small>进队方式</small><b>'+(needsApproval?'需要申请':'直接加入')+'</b></div></div>'+(row.note?'<p>'+esc(row.note)+'</p>':'')+'</article>'+action;
    requestAnimationFrame(function(){var box=$('.mobile-party-chat',host);if(box)box.scrollTop=box.scrollHeight;});
  }
  function syncPartyDots(){var visible=party.alerts.length>0;var a=$('[data-mobile-party-dot]'),b=$('[data-mobile-party-tab-dot]');if(a)a.hidden=!visible;if(b)b.hidden=!visible;}
  function unsubscribeParty(){if(!party.channel||!client())return;client().removeChannel(party.channel);party.channel=null;}
  function subscribeParty(){if(party.channel||!client()||document.hidden)return;party.channel=client().channel('mobile-game-parties-'+(me()&&me().id||'public')).on('postgres_changes',{event:'*',schema:'public',table:'game_parties'},function(){loadParties(true);}).on('postgres_changes',{event:'*',schema:'public',table:'game_party_members'},function(){loadParties(true);}).on('postgres_changes',{event:'*',schema:'public',table:'game_party_messages'},function(){if(party.openId)loadParties(true);}).subscribe();}
  async function partyMutation(fn){if(party.busy)throw new Error('正在处理，请稍候。');party.busy=true;try{var result=await fn();await loadParties(true);return result;}finally{party.busy=false;}}
  async function openParty(id){party.openId=String(id);party.messages=[];await loadParties(true);if(me()){var ids=party.alerts.filter(function(row){return String(row.target_id)===String(id);}).map(function(row){return row.id;});if(ids.length){await client().from('notifications').update({is_read:true}).eq('user_id',me().id).in('id',ids);party.alerts=party.alerts.filter(function(row){return !ids.includes(row.id);});syncPartyDots();}}renderPartyDetail();window.FWApp.setView('play-detail');}

  /* 用户资料卡与会员标识 */
  var profileCard={userId:'',profile:null,relation:null,reportOpen:false,busy:false};
  function relationStatus(relation,target){var user=me();if(!user)return'登录后可以添加搭子。';if(String(user.id)===String(target))return'这是你自己的资料。';if(!relation||relation.status==='rejected')return'你们还不是搭子。';if(relation.status==='accepted')return'';if(relation.status==='pending')return String(relation.requester_id)===String(user.id)?'搭子申请已发出，等待对方处理。':'对方想加你为搭子。';if(relation.status==='blocked')return'当前无法与该研究员互动。';return'';}
  function profileActions(){var user=me(),relation=profileCard.relation;if(!user)return'<button class="primary" data-mobile-profile-login>登录账号</button>';if(String(user.id)===String(profileCard.userId))return'<button class="primary" data-mobile-profile-edit>编辑我的资料</button>';if(!relation||relation.status==='rejected')return'<button class="primary" data-mobile-profile-add>加为搭子</button>';if(relation.status==='accepted')return'<button class="primary" data-mobile-profile-chat>去私聊</button>';if(relation.status==='pending'&&String(relation.receiver_id)===String(user.id))return'<button data-mobile-profile-respond="reject">拒绝</button><button class="primary" data-mobile-profile-respond="accept">同意</button>';return'<button disabled>等待对方处理</button>';}
  function renderProfileCard(){var body=$('[data-mobile-profile-body]'),p=profileCard.profile;if(!body||!p)return;var theme=membership.styles[String(profileCard.userId)]||'',avatar=p.avatar_url?'<button class="mobile-profile-avatar" data-mobile-avatar-full="'+esc(p.avatar_url)+'"><img src="'+esc(p.avatar_url)+'" alt="'+esc(p.nickname||'研究员')+'"></button>':'<span class="mobile-profile-avatar">'+esc(String(p.nickname||'FW').slice(0,2))+'</span>';body.innerHTML='<div class="mobile-profile-head">'+avatar+'<div><h2>'+esc(p.nickname||'低功耗研究员')+(theme?'<span class="vip-mobile-badge">VIP</span>':'')+'</h2><p>实验品编号：'+esc(p.lab_code||'未设置')+'</p></div></div><p>'+esc(relationStatus(profileCard.relation,profileCard.userId))+'</p><div class="mobile-profile-actions">'+profileActions()+'</div>'+(me()&&String(me().id)!==String(profileCard.userId)?'<div class="mobile-profile-tools"><button data-mobile-profile-report-toggle>举报</button></div>':'')+(profileCard.reportOpen?'<form class="mobile-profile-report" data-mobile-profile-report-form><select name="reason"><option>骚扰或辱骂</option><option>广告或引流</option><option>诈骗或违法</option><option>昵称或头像不当</option><option>其他</option></select><textarea name="detail" maxlength="120" placeholder="可补充具体情况"></textarea><button type="submit">提交举报</button></form>':'');}
  async function queryRelation(target){if(!me()||String(me().id)===String(target))return null;var result=await client().from('friendships').select('id,requester_id,receiver_id,status,created_at,updated_at').or('requester_id.eq.'+target+',receiver_id.eq.'+target).limit(1).maybeSingle();if(result.error)throw result.error;return result.data||null;}
  async function openProfile(target){var sheet=$('[data-mobile-profile-sheet]');if(!sheet||!target)return;sheet.hidden=false;$('[data-mobile-profile-body]').innerHTML='<div class="mobile-sync-empty">正在读取资料…</div>';try{var results=await Promise.all([client().from('profiles').select('id,nickname,avatar_url,lab_code').eq('id',target).maybeSingle(),queryRelation(target),ensureMemberStyles([target])]);if(results[0].error)throw results[0].error;if(!results[0].data)throw new Error('profile not found');profileCard={userId:String(target),profile:results[0].data,relation:results[1],reportOpen:false,busy:false};renderProfileCard();}catch(e){$('[data-mobile-profile-body]').innerHTML='<div class="mobile-sync-empty">这份资料暂时无法查看。</div>';}}
  function closeProfile(){var sheet=$('[data-mobile-profile-sheet]');if(sheet)sheet.hidden=true;profileCard={userId:'',profile:null,relation:null,reportOpen:false,busy:false};}
  async function refreshProfileRelation(message){profileCard.relation=await queryRelation(profileCard.userId);renderProfileCard();if(message)toast(message);}
  function enhanceProfiles(){
    var ids=[];$$('[data-profile-user]').forEach(function(node){var id=node.dataset.profileUser;if(id)ids.push(id);var container=node.closest('.post-author,.comment-info-line,.list-main,.mobile-party-member')||node.parentElement;if(container&&membership.styles[String(id)]&&!$('.vip-mobile-badge',container)){var badge=document.createElement('span');badge.className='vip-mobile-badge';badge.textContent='VIP';container.appendChild(badge);}});ensureMemberStyles(ids);
  }

  function bind(){
    document.addEventListener('fw:app-viewchange',function(event){var view=event.detail&&event.detail.view;if(view==='nav'){renderWeather();loadWeather(false);scheduleCountdown();}else stopCountdown();if(view==='play'||view==='play-detail'){loadParties(false);subscribeParty();}else unsubscribeParty();if(view==='membership')loadMembership(false);if(view==='square'||view==='square-detail'||view==='buddy'||view==='echo'||view==='bird')setTimeout(enhanceProfiles,80);});
    document.addEventListener('fw:app-visibility',function(event){var visible=!!(event&&event.detail&&event.detail.visible),view=window.FWApp&&window.FWApp.state&&window.FWApp.state.view;if(!visible){stopCountdown();unsubscribeParty();return;}if(view==='nav')scheduleCountdown();if(view==='play'||view==='play-detail')subscribeParty();});
    document.addEventListener('fw:app-userchange',function(){membership.loaded=false;party.loaded=false;party.rows=[];party.members=[];party.alerts=[];unsubscribeParty();loadMembership(true);if(window.FWApp&&['play','play-detail'].includes(window.FWApp.state.view)){loadParties(true);subscribeParty();}});
    document.addEventListener('click',async function(event){
      var target=event.target;
      if(target.closest('[data-mobile-weather-open]')){openHomeTool('weather');return;}if(target.closest('[data-mobile-offwork-open]')){openHomeTool('offwork');return;}if(target.closest('[data-mobile-feedback-open]')){openHomeTool('feedback');return;}if(target.closest('[data-mobile-home-close]')||target.matches('[data-mobile-home-modal]')){closeHomeTool();return;}
      var choice=target.closest('[data-mobile-weather-choice]');if(choice){var location=weatherResults[Number(choice.dataset.mobileWeatherChoice)];if(!location)return;var selected={provider:'qweather',query:location.name,label:location.label||location.name,locationId:location.id,latitude:location.latitude,longitude:location.longitude,timezone:location.timezone||'Asia/Shanghai'};write(WEATHER_LOCATION_KEY,selected);write(WEATHER_CACHE_KEY,null);setHomeStatus('正在读取 '+selected.label+' 的天气…');try{await fetchWeather(selected);closeHomeTool();toast('天气地区已设置。');}catch(e){setHomeStatus(e.message||'天气读取失败。');}return;}
      var game=target.closest('[data-mobile-game-open]');if(game){openGame(game.dataset.mobileGameOpen);return;}if(target.closest('[data-mobile-game-back]')){closeGame();return;}if(target.closest('[data-mobile-game-reload]')){reloadGame();return;}var key=target.closest('[data-mobile-game-key]');if(key){gameKey(key.dataset.mobileGameKey);return;}
      var memberTab=target.closest('[data-mobile-membership-tab]');if(memberTab){membership.tab=memberTab.dataset.mobileMembershipTab;renderMembership();return;}var plan=target.closest('[data-mobile-plan]');if(plan){membership.selected=plan.dataset.mobilePlan;renderMembership();return;}var payment=target.closest('[data-mobile-payment]');if(payment){membership.payment=payment.dataset.mobilePayment;renderMembership();return;}var theme=target.closest('[data-mobile-theme]');if(theme){try{await setMembershipTheme(theme.dataset.mobileTheme);}catch(e){toast(e.message||'装扮切换失败。');}return;}
      var filter=target.closest('[data-mobile-party-filter]');if(filter){party.filter=filter.dataset.mobilePartyFilter;renderPartyList();return;}if(target.closest('[data-mobile-party-refresh]')){loadParties(true);return;}if(target.closest('[data-mobile-party-create-toggle]')){if(!me()){toast('请先登录。');window.FWApp.setView('profile');return;}party.createOpen=!party.createOpen;renderPartyCreate();return;}var partyOpen=target.closest('[data-mobile-party-open]');if(partyOpen){openParty(partyOpen.dataset.mobilePartyOpen).catch(function(e){toast(e.message||'房间读取失败。');});return;}if(target.closest('[data-mobile-party-detail-back]')){party.openId='';party.messages=[];window.FWApp.setView('play');return;}
      var decide=target.closest('[data-mobile-party-decide]');if(decide){try{await partyMutation(function(){return client().rpc('fw_decide_game_party',{p_party_id:Number(decide.dataset.party),p_user_id:decide.dataset.user,p_accept:decide.dataset.mobilePartyDecide==='accept'}).then(function(r){return fail(r,'处理申请失败');});});toast(decide.dataset.mobilePartyDecide==='accept'?'已同意加入。':'已拒绝申请。');}catch(e){toast(e.message||'处理失败。');}return;}
      var leave=target.closest('[data-mobile-party-leave]');if(leave){if(!confirm('确定要退出或撤回申请吗？'))return;try{await partyMutation(function(){return client().rpc('fw_leave_game_party',{p_party_id:Number(leave.dataset.mobilePartyLeave)}).then(function(r){return fail(r,'退出失败');});});party.openId='';window.FWApp.setView('play');toast('已退出这个组队。');}catch(e){toast(e.message||'退出失败。');}return;}
      var close=target.closest('[data-mobile-party-close]');if(close){if(!confirm('结束后房间会直接删除，确定结束吗？'))return;try{await partyMutation(function(){return client().rpc('fw_close_game_party',{p_party_id:Number(close.dataset.mobilePartyClose)}).then(function(r){return fail(r,'删除房间失败');});});party.openId='';window.FWApp.setView('play');toast('房间已结束并删除。');}catch(e){toast(e.message||'删除失败。');}return;}
      var profileTrigger=target.closest('[data-profile-user]');if(profileTrigger){event.preventDefault();event.stopPropagation();openProfile(profileTrigger.dataset.profileUser);return;}if(target.closest('[data-mobile-profile-close]')||target.matches('[data-mobile-profile-sheet]')){closeProfile();return;}var fullAvatar=target.closest('[data-mobile-avatar-full]');if(fullAvatar){var lightbox=$('[data-mobile-avatar-lightbox]');$('[data-mobile-avatar-image]').src=fullAvatar.dataset.mobileAvatarFull;lightbox.hidden=false;return;}if(target.closest('[data-mobile-avatar-close]')||target.matches('[data-mobile-avatar-lightbox]')){$('[data-mobile-avatar-lightbox]').hidden=true;return;}
      if(target.closest('[data-mobile-profile-login],[data-mobile-profile-edit]')){closeProfile();window.FWApp.setView('profile');return;}if(target.closest('[data-mobile-profile-report-toggle]')){profileCard.reportOpen=!profileCard.reportOpen;renderProfileCard();return;}
      if(target.closest('[data-mobile-profile-add]')){try{fail(await client().rpc('fw_send_friend_request',{target_user_id:profileCard.userId}),'发送申请失败');await refreshProfileRelation('搭子申请已发出。');}catch(e){toast(e.message||'发送申请失败。');}return;}
      var respond=target.closest('[data-mobile-profile-respond]');if(respond){try{fail(await client().rpc('fw_respond_friendship',{target_friendship_id:Number(profileCard.relation&&profileCard.relation.id),accept_request:respond.dataset.mobileProfileRespond==='accept'}),'处理申请失败');await refreshProfileRelation(respond.dataset.mobileProfileRespond==='accept'?'已同意搭子申请。':'已拒绝搭子申请。');}catch(e){toast(e.message||'处理失败。');}return;}
      if(target.closest('[data-mobile-profile-chat]')){var chatTarget=profileCard.userId;closeProfile();window.FWApp.setView('buddy');if(window.FWAppBuddy&&window.FWAppBuddy.openChat){Promise.resolve(window.FWAppBuddy.load(true)).then(function(){window.FWAppBuddy.openChat(chatTarget);});}return;}
    },true);
    document.addEventListener('keydown',function(event){var target=event.target&&event.target.closest&&event.target.closest('[data-profile-user]');if(!target||(event.key!=='Enter'&&event.key!==' '))return;event.preventDefault();event.stopPropagation();openProfile(target.dataset.profileUser);},true);
    document.addEventListener('submit',async function(event){
      var form=event.target;
      if(form.matches('[data-mobile-weather-form]')){event.preventDefault();setHomeStatus('正在查找地区…');try{var q=String(new FormData(form).get('city')||'').trim();if(q.length<2)throw new Error('请至少输入 2 个字。');var data=await fetchJson(weatherEndpoint+'?'+new URLSearchParams({action:'search',q:q}));var rows=Array.isArray(data.locations)?data.locations:[];if(!rows.length)throw new Error('没有找到这个地区。');renderWeatherResults(rows);setHomeStatus('找到 '+rows.length+' 个结果，请选择正确地区。');}catch(e){setHomeStatus(e.name==='AbortError'?'天气服务连接超时。':e.message||'地区查找失败。');}return;}
      if(form.matches('[data-mobile-offwork-form]')){event.preventDefault();var time=String(new FormData(form).get('time')||'');write(OFFWORK_TIME_KEY,time);scheduleCountdown();closeHomeTool();toast('下班时间已设为 '+time+'。');return;}
      if(form.matches('[data-mobile-feedback-form]')){event.preventDefault();try{await submitFeedback(form);}catch(e){setHomeStatus(e.message||'反馈提交失败。');}return;}
      if(form.matches('[data-mobile-party-create-form]')){event.preventDefault();var d=new FormData(form);try{await partyMutation(function(){return client().rpc('fw_create_game_party',{p_game_name:String(d.get('gameName')||'').trim(),p_platform:'',p_server_name:String(d.get('serverName')||'').trim(),p_mode:String(d.get('mode')||'').trim(),p_starts_at:null,p_capacity:String(d.get('capacity')||'').trim()?Number(d.get('capacity')):null,p_note:String(d.get('note')||'').trim(),p_game_id:String(d.get('gameId')||'').trim(),p_requires_approval:d.get('requiresApproval')==='on',p_starts_at_text:String(d.get('startsAt')||'').trim()}).then(function(r){return fail(r,'创建组队失败');});});party.createOpen=false;party.filter='mine';renderPartyCreate();renderPartyList();toast('组队房间已创建。');}catch(e){toast(e.message||'创建失败。');}return;}
      if(form.matches('[data-mobile-party-join-form]')){event.preventDefault();var join=new FormData(form);try{var result=await partyMutation(function(){return client().rpc('fw_apply_game_party',{p_party_id:Number(form.dataset.mobilePartyJoinForm),p_game_id:String(join.get('gameId')||'').trim(),p_message:String(join.get('message')||'').trim()}).then(function(r){return fail(r,'申请加入失败');});});toast(result==='joined'?'已加入队伍。':'申请已发给队长。');renderPartyDetail();}catch(e){toast(e.message||'加入失败。');}return;}
      if(form.matches('[data-mobile-party-chat-form]')){event.preventDefault();var content=String(new FormData(form).get('content')||'').trim();try{await partyMutation(function(){return client().rpc('fw_send_game_party_message',{p_party_id:Number(form.dataset.mobilePartyChatForm),p_content:content}).then(function(r){return fail(r,'发送消息失败');});});form.reset();renderPartyDetail();}catch(e){toast(e.message||'发送失败。');}return;}
      if(form.matches('[data-mobile-profile-report-form]')){event.preventDefault();var report=new FormData(form),reason=String(report.get('reason')||''),detail=String(report.get('detail')||'').trim();try{fail(await client().rpc('fw_submit_report',{p_target_type:'user',p_target_id:profileCard.userId,p_reason:detail?reason+'：'+detail:reason}),'提交举报失败');profileCard.reportOpen=false;renderProfileCard();toast('举报已提交，管理员会处理。');}catch(e){toast(e.message||'举报失败。');}}
    },true);
    var observer=new MutationObserver(function(){clearTimeout(observer.timer);observer.timer=setTimeout(enhanceProfiles,120);});observer.observe($('#appMain')||document.body,{childList:true,subtree:true});
  }
  function start(){bind();renderWeather();scheduleCountdown();setTimeout(function(){loadWeather(false);loadMembership(false);enhanceProfiles();},100);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
