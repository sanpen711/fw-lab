(function(){
  'use strict';
  var toggle=document.querySelector('[data-web-square-echo-toggle]');
  var feedPanel=document.querySelector('[data-web-square-feed-panel]');
  var echoPanel=document.querySelector('[data-web-square-echo-panel]');
  var echoList=document.querySelector('[data-web-square-echo-list]');
  var markAll=document.querySelector('[data-web-square-echo-mark-all]');
  var refresh=document.querySelector('[data-web-square-echo-refresh]');
  if(!toggle||!feedPanel||!echoPanel||!echoList)return;
  if(/FWYanjiusuoDesktop\//i.test(navigator.userAgent||''))return;
  if(window.innerWidth<821||/Android|iPhone|iPod|Mobile|Windows Phone/i.test(navigator.userAgent||'')){
    toggle.addEventListener('click',function(){window.location.href='echo.html'});
    return;
  }

  var ECHO_TYPES=['like','same','tissue','comment','comment_reply','chat_agree','system'];
  var showingEcho=false;
  var loading=false;
  var rows=[];
  var profiles={};
  var me=null;

  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function initials(value){return String(value||'研').trim().slice(0,2)}
  function preview(value){return String(value||'对你的发言产生了回应。').replace(/\[\[FW_USER_STICKER:[A-Za-z0-9+/=]+\]\]/g,'动画表情').replace(/\[\[FW_MEDIA_IMAGE:[A-Za-z0-9+/=]+\]\]/g,'图片').replace(/\[\[FW_MEDIA_VIDEO:[A-Za-z0-9+/=]+\]\]/g,'视频').replace(/\s+/g,' ').trim()||'对你的发言产生了回应。'}
  function notice(type){return({like:'点赞了你的帖子',same:'对你说：俺也一样',tissue:'给你递了纸巾',comment:'评论了你的帖子',comment_reply:'回复了你的评论',chat_agree:'赞同了你的房间消息',system:'发送了一条系统通知'})[type]||'给你发来一条回声'}
  function time(value){
    var date=new Date(value||0);if(isNaN(date.getTime()))return'刚刚';
    var minutes=Math.floor(Math.max(0,Date.now()-date.getTime())/60000);if(minutes<1)return'刚刚';if(minutes<60)return minutes+'分钟前';
    var hours=Math.floor(minutes/60);if(hours<24)return hours+'小时前';var days=Math.floor(hours/24);return days<7?days+'天前':date.toLocaleDateString('zh-CN');
  }
  function avatar(profile,name){return profile.avatar_url?'<span class="web-square-echo-avatar" data-fw-profile-user="'+esc(profile.id||'')+'" data-user-id="'+esc(profile.id||'')+'"><img src="'+esc(profile.avatar_url)+'" alt="'+esc(name)+'"></span>':'<span class="web-square-echo-avatar" data-fw-profile-user="'+esc(profile.id||'')+'" data-user-id="'+esc(profile.id||'')+'">'+esc(initials(name))+'</span>'}
  function postId(row){if(row.__post_id)return String(row.__post_id);if(row.target_type==='post'&&row.target_id)return String(row.target_id);if(['like','same','tissue','comment'].includes(row.type)&&row.target_id)return String(row.target_id);return''}
  function toast(message){var node=document.querySelector('.fw-toast');if(!node){node=document.createElement('div');node.className='fw-toast';document.body.appendChild(node)}node.textContent=message;node.classList.add('show');clearTimeout(window.__fwWebEchoToast);window.__fwWebEchoToast=setTimeout(function(){node.classList.remove('show')},2400)}

  async function waitDb(){
    for(var i=0;i<50;i++){if(window.fwDb&&window.fwDb.enabled&&window.fwDb.client)return window.fwDb;await new Promise(function(resolve){setTimeout(resolve,100)})}
    return null;
  }
  async function resolveReplyPosts(list){
    var ids=Array.from(new Set(list.filter(function(row){return row.type==='comment_reply'&&!row.__post_id&&row.target_id}).map(function(row){return row.target_id})));
    if(!ids.length)return list;
    try{
      var result=await window.fwDb.client.from('comments').select('id,post_id').in('id',ids);
      if(result.error)throw result.error;
      var map={};(result.data||[]).forEach(function(row){map[String(row.id)]=row.post_id});
      list.forEach(function(row){if(row.type==='comment_reply'&&map[String(row.target_id)])row.__post_id=map[String(row.target_id)]});
    }catch(e){}
    return list;
  }
  async function fetchProfiles(ids){
    ids=Array.from(new Set(ids.filter(Boolean)));if(!ids.length)return{};
    var result=await window.fwDb.client.from('profiles').select('id,nickname,avatar_url').in('id',ids);
    if(result.error)return{};var map={};(result.data||[]).forEach(function(row){map[String(row.id)]=row});return map;
  }
  function render(){
    if(markAll)markAll.hidden=!rows.some(function(row){return !row.is_read});
    if(!me){echoList.innerHTML='<div class="web-square-echo-state"><b>登录后查看回声</b><span>登录后，评论、回复和点赞会显示在这里。</span><button type="button" data-fw-open>注册 / 登录</button></div>';return}
    if(!rows.length){echoList.innerHTML='<div class="web-square-echo-state"><b>暂时没有新的回声</b><span>安静也是一种运行状态。</span></div>';return}
    echoList.innerHTML=rows.map(function(row){
      var profile=profiles[String(row.actor_id)]||{};profile.id=row.actor_id||'';var name=profile.nickname||'某位研究员';var target=postId(row);
      return '<article class="web-square-echo-item '+(row.is_read?'':'unread')+'" data-web-square-echo-item="'+esc(row.id)+'"'+(target?' data-web-square-echo-post="'+esc(target)+'"':'')+'>'+avatar(profile,name)+'<div class="web-square-echo-main"><b><span data-user-id="'+esc(row.actor_id||'')+'">'+esc(name)+'</span> '+esc(notice(row.type))+'</b><span>'+esc(preview(row.content))+'</span><time>'+esc(time(row.created_at))+'</time></div><div class="web-square-echo-action">'+(target?'<button type="button" data-web-square-echo-open="'+esc(target)+'">查看帖子</button>':'<span>帖子已不可查看</span>')+'</div></article>';
    }).join('');
  }
  async function load(force){
    if(loading)return;loading=true;echoList.innerHTML='<div class="web-square-echo-state">正在读取回声...</div>';
    try{
      var db=await waitDb();if(!db)throw new Error('账号服务暂时没有准备好。');
      me=await db.getCurrentUser();if(!me){rows=[];profiles={};render();return}
      var result=await db.client.from('notifications').select('id,actor_id,type,target_type,target_id,content,is_read,created_at').eq('user_id',me.id).in('type',ECHO_TYPES).order('created_at',{ascending:false}).limit(100);
      if(result.error)throw result.error;
      rows=(result.data||[]).filter(function(row){return ECHO_TYPES.includes(String(row.type||''))});
      rows=await resolveReplyPosts(rows);
      if(window.FWCommentReplyEcho)rows=await window.FWCommentReplyEcho.merge(db.client,me.id,rows,{limit:100,force:!!force});
      profiles=await fetchProfiles(rows.map(function(row){return row.actor_id}));render();
    }catch(error){echoList.innerHTML='<div class="web-square-echo-state"><b>回声读取失败</b><span>请稍后刷新重试。</span></div>';toast(error.message||'回声读取失败。')}
    finally{loading=false}
  }
  async function markRead(ids){
    ids=Array.from(new Set(ids.map(String).filter(Boolean)));if(!ids.length||!me)return;
    if(window.FWCommentReplyEcho)window.FWCommentReplyEcho.markRead(me.id,ids);
    var databaseIds=window.FWCommentReplyEcho?window.FWCommentReplyEcho.databaseNoticeIds(ids):ids;
    rows=rows.map(function(row){return ids.includes(String(row.id))?Object.assign({},row,{is_read:true}):row});render();
    try{if(databaseIds.length)await window.fwDb.client.from('notifications').update({is_read:true}).in('id',databaseIds)}catch(e){}
    if(typeof window.fwRefreshWebSocialBadges==='function')window.fwRefreshWebSocialBadges();
  }
  async function showPost(target,noticeId){
    if(!target)return;
    if(noticeId)await markRead([noticeId]);
    var ready=typeof window.__FW_WEB_SQUARE_SELECT__==='function'&&window.__FW_WEB_SQUARE_SELECT__(target,{scroll:false,persist:true});
    if(!ready&&typeof window.__FW_SQUARE_OPEN_POST_BY_ID__==='function'){
      ready=await window.__FW_SQUARE_OPEN_POST_BY_ID__(target);
      if(ready&&typeof window.__FW_WEB_SQUARE_SELECT__==='function')ready=window.__FW_WEB_SQUARE_SELECT__(target,{scroll:false,persist:true});
    }
    if(!ready)toast('这条帖子已经删除或暂时无法查看。');
  }
  function setMode(next){
    showingEcho=!!next;feedPanel.hidden=showingEcho;echoPanel.hidden=!showingEcho;toggle.classList.toggle('active',showingEcho);toggle.setAttribute('aria-pressed',String(showingEcho));
    if(showingEcho)load(false);
  }

  toggle.addEventListener('click',function(){setMode(!showingEcho)});
  refresh&&refresh.addEventListener('click',function(){load(true)});
  markAll&&markAll.addEventListener('click',function(){markRead(rows.filter(function(row){return !row.is_read}).map(function(row){return row.id}))});
  echoList.addEventListener('click',function(event){
    if(event.target.closest('[data-fw-profile-user]')&&!event.target.closest('[data-web-square-echo-open]'))return;
    var item=event.target.closest('[data-web-square-echo-item]');if(!item)return;
    var target=(event.target.closest('[data-web-square-echo-open]')||{}).dataset?.webSquareEchoOpen||item.dataset.webSquareEchoPost;
    if(target)showPost(target,item.dataset.webSquareEchoItem);
    else if(item.classList.contains('unread'))markRead([item.dataset.webSquareEchoItem]);
  });
})();
