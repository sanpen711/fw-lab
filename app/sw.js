const CACHE_NAME = 'fw-mobile-app-square-comment-reply-1';
const APP_SHELL = [
  '/app/install.html',
  '/app/index.html',
  '/app/app.css',
  '/app/app.js',
  '/app/nav.js',
  '/app/feed.js',
  '/app/publish.js',
  '/app/buddy.js',
  '/app/echo.js',
  '/app/profile.js',
  '/app/manifest.webmanifest'
];

const FEED_COMMENT_PATCH = String.raw`
;(function(){
if(window.__FW_APP_COMMENT_REPLY_PATCH__)return;window.__FW_APP_COMMENT_REPLY_PATCH__=true;
var replies={},adding=false,obs=false,patched=false,timer=0;
function app(){return window.FWApp}function $(s,r){return(r||document).querySelector(s)}function $$(s,r){return Array.from((r||document).querySelectorAll(s))}function esc(v){return app()&&app().esc?app().esc(v):String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}function toast(m){if(app()&&app().toast)app().toast(m)}
function style(){if($('#fwAppCommentReplyPatchStyle'))return;var st=document.createElement('style');st.id='fwAppCommentReplyPatchStyle';st.textContent=['.comment-tool{background:#fffdf7!important;color:var(--text)!important;border-color:rgba(30,30,28,.14)!important;box-shadow:none!important}', '.comment-tool svg{width:23px;height:23px;display:block}', '.comment-reply-state{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 2px;padding:7px 9px;border:1px solid rgba(30,30,28,.1);border-radius:12px;background:#fffdf7;color:var(--muted);font-size:12px;font-weight:900}', '.comment-reply-state[hidden]{display:none!important}', '.comment-reply-state b{color:var(--text);font-weight:1000}', '.comment-reply-cancel{width:26px;height:26px;border:0;border-radius:999px;background:rgba(30,30,28,.08);color:var(--text);font-size:16px;font-weight:1000;line-height:1}', '.comment .post-name span{display:flex;align-items:center;gap:7px;flex-wrap:wrap}', '.comment-reply{border:0;background:transparent;color:var(--accent-dark);font-size:12px;font-weight:1000;padding:0;min-height:24px}', '.comment-sticker-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}', '.comment-sticker-head span{color:var(--muted);font-size:12px;font-weight:1000}', '.comment-sticker-add{min-height:30px;border:1px solid rgba(30,30,28,.12);border-radius:999px;background:#fffdf7;color:var(--text);padding:0 10px;font-size:12px;font-weight:1000}', '.comment-sticker-add:disabled{opacity:.55}'].join('\n');document.head.appendChild(st)}
function smile(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="7.4"></circle><path d="M9.2 10.4h.01"></path><path d="M14.8 10.4h.01"></path><path d="M8.8 14.4c1.5 1.4 4.9 1.4 6.4 0"></path></svg>'}function imgIcon(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="5" width="16" height="14" rx="2.6"></rect><path d="M7.2 15.5l3.3-3.3 2.4 2.4 1.6-1.8 3.2 3.7"></path><path d="M8.7 8.8h.01"></path></svg>'}
function pid(n){var f=n&&n.closest&&n.closest('[data-comment-form]');if(f&&f.dataset.postId)return String(f.dataset.postId);var c=n&&n.closest&&n.closest('[data-post-id]');return c&&c.dataset.postId?String(c.dataset.postId):''}function clearOthers(id){Object.keys(replies).forEach(function(k){if(String(k)!==String(id))delete replies[k]})}
function addFileInput(f){if(!f||f.querySelector('[data-app-comment-sticker-file]'))return;var i=document.createElement('input');i.type='file';i.accept='image/jpeg,image/png,image/webp,image/gif';i.hidden=true;i.dataset.appCommentStickerFile='true';f.appendChild(i)}
function replyUi(f){if(!f)return;var id=String(f.dataset.postId||pid(f)),r=replies[id],box=f.querySelector('[data-app-comment-reply-state]');if(!box){box=document.createElement('div');box.className='comment-reply-state';box.dataset.appCommentReplyState='true';box.hidden=true;f.insertBefore(box,f.firstChild)}var input=f.querySelector('input[name="content"]');if(r&&r.name){box.hidden=false;box.innerHTML='<span>正在回复：<b>'+esc(r.name)+'</b></span><button class="comment-reply-cancel" type="button" aria-label="取消回复" data-app-comment-reply-cancel>×</button>';if(input)input.placeholder='回复 '+r.name}else{box.hidden=true;box.innerHTML='';if(input)input.placeholder='留一句回声'}}
function panel(f){var p=f&&f.querySelector('[data-comment-sticker-panel]');if(!p||p.hidden||p.querySelector('[data-app-comment-sticker-head]'))return;var h=document.createElement('div');h.className='comment-sticker-head';h.dataset.appCommentStickerHead='true';h.innerHTML='<span>我的表情</span><button class="comment-sticker-add" type="button" data-app-comment-sticker-add>添加表情</button>';p.insertBefore(h,p.firstChild)}
function form(f){if(!f)return;addFileInput(f);replyUi(f);var s=f.querySelector('[data-comment-sticker-toggle]');if(s&&s.dataset.appIconPatched!=='1'){s.innerHTML=smile();s.dataset.appIconPatched='1'}var im=f.querySelector('[data-comment-image-pick]');if(im&&im.dataset.appIconPatched!=='1'){im.innerHTML=imgIcon();im.dataset.appIconPatched='1'}panel(f)}
function comment(c){if(!c||c.dataset.appReplyReady==='1')return;var m=c.querySelector('.post-name span');if(!m||m.querySelector('[data-app-comment-reply]'))return;var b=c.querySelector('.post-name b'),name=b?b.textContent.trim():'匿名回声',btn=document.createElement('button');btn.className='comment-reply';btn.type='button';btn.dataset.appCommentReply='true';btn.dataset.commentId=c.dataset.commentId||'';btn.dataset.commentAuthor=name;btn.textContent='回复';m.appendChild(btn);c.dataset.appReplyReady='1'}
function enhance(){style();$$('[data-comment-form]').forEach(form);$$('.comment[data-comment-id]').forEach(comment)}function schedule(){clearTimeout(timer);timer=setTimeout(enhance,40)}
async function user(msg){if(app()&&app().state&&app().state.user)return app().state.user;if(app()&&app().refreshUser){var u=await app().refreshUser();if(u)return u}toast(msg||'登录后才能继续。');return null}
function timeout(p,ms,msg){return new Promise(function(res,rej){var t=setTimeout(function(){rej(new Error(msg||'timeout'))},ms);p.then(function(v){clearTimeout(t);res(v)}).catch(function(e){clearTimeout(t);rej(e)})})}function loadImage(file){return new Promise(function(res,rej){var u=URL.createObjectURL(file),i=new Image;i.onload=function(){try{URL.revokeObjectURL(u)}catch(e){}res(i)};i.onerror=function(){try{URL.revokeObjectURL(u)}catch(e){}rej(new Error('image-load'))};i.src=u})}function blob(canvas,type,q){return new Promise(function(res){canvas.toBlob(function(b){res(b)},type,q)})}function makeFile(b,n,t){try{return new File([b],n,{type:t||b.type||'image/webp'})}catch(e){b.name=n;return b}}function gif(f){return /gif/i.test(f&&f.type||'')||/\.gif$/i.test(f&&f.name||'')}
async function prepSticker(file){if(!file||!/^image\//i.test(file.type||''))throw new Error('请选择图片文件。');if(gif(file)){if(file.size>1024*1024)throw new Error('GIF 不能超过 1MB。');return{file:file,mime:file.type||'image/gif',ext:'gif'}}var im=await loadImage(file),w=im.naturalWidth||im.width,h=im.naturalHeight||im.height,side=Math.min(w,h),c=document.createElement('canvas');c.width=300;c.height=300;var ctx=c.getContext('2d',{alpha:true}),sx=Math.max(0,Math.floor((w-side)/2)),sy=Math.max(0,Math.floor((h-side)/2));ctx.drawImage(im,sx,sy,side,side,0,0,300,300);var q=.82,b=await blob(c,'image/webp',q);while(b&&b.size>200*1024&&q>.42){q-=.08;b=await blob(c,'image/webp',q)}if(!b)throw new Error('表情处理失败，请换一张。');if(b.size>200*1024)throw new Error('表情压缩后仍超过 200KB，请换一张。');return{file:makeFile(b,'fw_sticker_'+Date.now().toString(36)+'.webp','image/webp'),mime:'image/webp',ext:'webp'}}
async function uploadSticker(file,u){var db=app()&&app().db&&app().db(),client=db&&db.client;if(!client||!client.storage)throw new Error('storage-missing');var p=await prepSticker(file),path=String(u.id)+'/'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)+'.'+p.ext,up=await timeout(client.storage.from('stickers').upload(path,p.file,{upsert:false,cacheControl:'3600',contentType:p.mime}),22000,'表情上传超时，请稍后重试。');if(up.error)throw up.error;var pub=client.storage.from('stickers').getPublicUrl(path),url=pub&&pub.data&&pub.data.publicUrl;if(!url)throw new Error('public-url-missing');var saved=await timeout(client.from('user_stickers').insert({user_id:u.id,image_url:url,storage_path:path,file_name:file.name||'sticker',file_size:p.file.size||file.size||0,mime_type:p.mime}).select('id,image_url,file_name,file_size,mime_type,storage_path,created_at').single(),12000,'表情保存超时，请稍后重试。');if(saved.error)throw saved.error;return saved.data}
function addStickerButton(f,row){if(!f||!row)return;var p=f.querySelector('[data-comment-sticker-panel]');if(!p)return;p.hidden=false;panel(f);p.querySelectorAll('.comment-panel-note').forEach(function(n){n.remove()});var g=p.querySelector('.comment-sticker-grid');if(!g){g=document.createElement('div');g.className='comment-sticker-grid';p.appendChild(g)}var url=row.image_url||row.url||'';if(!url)return;var b=document.createElement('button');b.type='button';b.dataset.commentStickerUrl=url;b.setAttribute('aria-label','选择表情');b.innerHTML='<img src="'+esc(url)+'" alt="表情">';g.insertBefore(b,g.firstChild)}
function patchCreate(){if(patched||!window.fwDb||!window.fwDb.createComment)return false;var old=window.fwDb.createComment.bind(window.fwDb);window.fwDb.createComment=function(payload){payload=payload||{};var id=String(payload.postId||''),r=replies[id];if(r&&r.name){var pre='回复 '+r.name+'：',content=String(payload.content||'').trim();if(content.indexOf(pre)!==0)payload=Object.assign({},payload,{content:pre+content})}return Promise.resolve(old(payload)).then(function(v){if(replies[id])delete replies[id];setTimeout(enhance,0);return v})};window.fwDb.__fwAppCommentReplyPatched=true;patched=true;return true}
function bind(){document.addEventListener('click',async function(e){var r=e.target.closest&&e.target.closest('[data-app-comment-reply]');if(r){e.preventDefault();e.stopPropagation();var u=await user('登录后才能回复。');if(!u)return;var card=r.closest('[data-post-id]'),f=card&&card.querySelector('[data-comment-form]');if(!card||!f)return;var id=String(card.dataset.postId||'');clearOthers(id);replies[id]={id:r.dataset.commentId||'',name:r.dataset.commentAuthor||'匿名回声'};var cs=card.querySelector('.comments');if(cs)cs.classList.add('show');form(f);var input=f.querySelector('input[name="content"]');if(input)input.focus();return}var cancel=e.target.closest&&e.target.closest('[data-app-comment-reply-cancel]');if(cancel){e.preventDefault();e.stopPropagation();var cid=pid(cancel);if(cid)delete replies[cid];form(cancel.closest('[data-comment-form]'));return}var add=e.target.closest&&e.target.closest('[data-app-comment-sticker-add]');if(add){e.preventDefault();e.stopPropagation();var au=await user('登录后才能添加表情。');if(!au)return;var af=add.closest('[data-comment-form]');addFileInput(af);var fi=af&&af.querySelector('[data-app-comment-sticker-file]');if(fi)fi.click();return}var t=e.target.closest&&e.target.closest('[data-app-comments]');if(t)setTimeout(function(){var card=t.closest('[data-post-id]'),id=card&&card.dataset.postId,cs=card&&card.querySelector('.comments');if(id&&cs&&!cs.classList.contains('show'))delete replies[String(id)];enhance()},0)},true);
document.addEventListener('change',async function(e){var input=e.target.closest&&e.target.closest('[data-app-comment-sticker-file]');if(!input)return;var f=input.closest('[data-comment-form]'),file=input.files&&input.files[0];input.value='';if(!file)return;if(adding){toast('正在添加表情，请稍后。');return}var u=await user('登录后才能添加表情。');if(!u)return;try{adding=true;var p=f&&f.querySelector('[data-comment-sticker-panel]');if(p){p.hidden=false;panel(f)}toast('正在添加表情...');var row=await uploadSticker(file,u);addStickerButton(f,row);toast('已添加')}catch(err){console.warn('[FW mobile app] add comment sticker failed',err);toast('添加失败，请稍后再试。')}finally{adding=false;enhance()}},true)}
function observe(){if(obs)return;obs=true;var root=$('#appMain')||document.body;if(root&&window.MutationObserver)new MutationObserver(schedule).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});document.addEventListener('visibilitychange',function(){if(!document.hidden)schedule()},{passive:true});window.addEventListener('pageshow',schedule,{passive:true});window.addEventListener('focus',schedule,{passive:true})}
function init(){style();bind();observe();enhance();var n=0,iv=setInterval(function(){n++;if(patchCreate()||n>80)clearInterval(iv)},125)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
`;

function patchFeedScript(text){
  if(typeof text !== 'string') return text;
  if(text.indexOf('__FW_APP_COMMENT_REPLY_PATCH__') >= 0) return text;
  return text + '\n' + FEED_COMMENT_PATCH;
}

async function patchAppResponse(request, response){
  if(!response) return response;
  const url = new URL(request.url);
  if(url.pathname !== '/app/feed.js') return response;
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/javascript; charset=utf-8');
  headers.delete('Content-Length');
  headers.delete('content-length');
  const text = await response.text();
  return new Response(patchFeedScript(text), {status: response.status, statusText: response.statusText, headers});
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME && key.indexOf('fw-mobile-app-') === 0).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if(request.method !== 'GET') return;

  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return;
  if(!url.pathname.startsWith('/app/')) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if(cached) return patchAppResponse(request, cached);

    try{
      const response = await fetch(request);
      const patched = await patchAppResponse(request, response);
      if(patched && patched.ok){
        caches.open(CACHE_NAME).then(cache => cache.put(request, patched.clone()));
      }
      return patched;
    }catch(err){
      return caches.match('/app/index.html');
    }
  })());
});
