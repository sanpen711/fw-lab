// F.w 研究所：精神广场图文显示稳定补丁
// 现在只负责媒体样式和旧 DOM 兜底；如果评论回复系统已启用，不再抢 renderPost。
(function(){
  if(window.__FW_POST_RENDER_STABILIZE__) return;
  window.__FW_POST_RENDER_STABILIZE__ = true;

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function ini(v){ return String(v || 'FW').trim().slice(0,2).toUpperCase(); }

  function avatar(name, url, cls){
    cls = cls || '';
    if(url) return '<span class="fw-avatar '+ esc(cls) +'"><img src="'+ esc(url) +'" alt="'+ esc(name || '研究员') +'"></span>';
    return '<span class="fw-avatar '+ esc(cls) +'">'+ esc(ini(name)) +'</span>';
  }

  function decodeText(s){
    try{ return atob(String(s || '')); }catch(e){ return ''; }
  }

  function markerAt(text, index){
    var list = [
      ['[[FW_USER_STICKER:', 'sticker'],
      ['[[FW_MEDIA_IMAGE:', 'image'],
      ['[[FW_MEDIA_VIDEO:', 'video']]
    ];
    for(var i=0;i<list.length;i++){
      var prefix = list[i][0];
      if(text.indexOf(prefix, index) !== index) continue;
      var start = index + prefix.length;
      var end = text.indexOf(']]', start);
      if(end < 0) return null;
      var url = decodeText(text.slice(start, end));
      if(!/^https?:\/\//i.test(url)) return null;
      return {kind:list[i][1], url:url, end:end + 2};
    }
    return null;
  }

  function splitContent(text){
    text = String(text || '');
    var html = '';
    var media = [];
    var i = 0;
    while(i < text.length){
      var next = text.indexOf('[[FW_', i);
      if(next < 0){ html += esc(text.slice(i)); break; }
      html += esc(text.slice(i, next));
      var m = markerAt(text, next);
      if(!m){ html += esc(text.slice(next, next + 5)); i = next + 5; continue; }
      if(m.kind === 'sticker'){
        media.push('<span class="fw-post-stable-sticker"><img src="'+ esc(m.url) +'" alt="表情"></span>');
      }else if(m.kind === 'video'){
        media.push('<span class="fw-post-stable-media"><video src="'+ esc(m.url) +'" controls playsinline preload="metadata"></video></span>');
      }else{
        media.push('<a class="fw-post-stable-media" href="'+ esc(m.url) +'" target="_blank" rel="noopener"><img src="'+ esc(m.url) +'" alt="图片"></a>');
      }
      i = m.end;
    }
    html = html.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return {textHtml:html, mediaHtml:media.join('')};
  }

  function commentHtml(c){
    var o = (c && typeof c === 'object') ? c : {content:c};
    var name = o.authorName || '匿名回声';
    var p = splitContent(o.content || '');
    return '<li data-comment-id="'+ esc(o.id || '') +'">'
      + avatar(name, o.authorAvatar || '', 'mini')
      + '<strong>'+ esc(name) +'</strong>'
      + '<span class="fw-comment-text">'+ (p.textHtml || ' ') +'</span>'
      + (p.mediaHtml ? '<div class="fw-comment-media-list">'+ p.mediaHtml +'</div>' : '')
      + '</li>';
  }

  function stableRenderPost(p){
    p = p || {};
    var parsed = splitContent(p.content || '');
    var comments = (p.comments || []).map(commentHtml).join('');
    return '<article class="post-card" data-id="'+ esc(p.id) +'" data-status="'+ esc(p.status || '') +'">'
      + '<div class="post-top"><span class="status">'+ esc(p.status || '今日无效') +'</span><span class="time">'+ esc(p.time || '刚刚') +'</span></div>'
      + '<p class="fw-author">'+ avatar(p.authorName || '匿名研究员', p.authorAvatar || '', 'mini') +'<span>'+ esc(p.authorName || '匿名研究员') +'</span></p>'
      + '<p class="post-content fw-post-content-stable">'+ (parsed.textHtml || '&nbsp;') +'</p>'
      + (parsed.mediaHtml ? '<div class="fw-post-media-list">'+ parsed.mediaHtml +'</div>' : '')
      + '<div class="interactions"><button data-sb-action="resonance">点赞 '+ esc(p.resonance || 0) +'</button><button data-sb-action="comment-toggle">评论 '+ esc((p.comments || []).length) +'</button><button data-sb-action="same">俺也一样 '+ esc(p.same || 0) +'</button><button data-sb-action="tissue">递纸巾 '+ esc(p.tissue || 0) +'</button></div>'
      + '<div class="comment-box"><ul class="comment-list">'+ (comments || '<li><span>还没有回声，可以先留一句。</span></li>') +'</ul><input placeholder="留一句回声，评论不限量" /><button class="btn dark full" data-sb-action="comment-submit" style="margin-top:10px">发送回声</button></div>'
      + '</article>';
  }

  function injectStyle(){
    if(document.getElementById('fw-post-render-stabilize-style')) return;
    var s = document.createElement('style');
    s.id = 'fw-post-render-stabilize-style';
    s.textContent = '.fw-post-content-stable{white-space:pre-wrap}.fw-post-media-list{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;margin:14px 0 0}.fw-post-stable-media{display:inline-block;max-width:300px;line-height:0}.fw-post-stable-media img{display:block;max-width:280px;max-height:340px;object-fit:contain;border-radius:12px;border:1px solid rgba(0,0,0,.08);background:#fffdf7}.fw-post-stable-media video{display:block;max-width:300px;max-height:360px;border-radius:12px;background:#111}.fw-post-stable-sticker{display:inline-grid;place-items:center;max-width:150px;max-height:150px}.fw-post-stable-sticker img{display:block;max-width:144px;max-height:144px;object-fit:contain;border-radius:10px;background:transparent}.comment-list li{list-style:none;margin:8px 0 10px}.fw-comment-text{white-space:pre-wrap}.fw-comment-media-list{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 0 32px}.fw-comment-media-list .fw-post-stable-media img{max-width:180px;max-height:220px}.fw-comment-media-list .fw-post-stable-media video{max-width:190px;max-height:230px}.fw-comment-media-list .fw-post-stable-sticker img{max-width:100px;max-height:100px}.post-card>.fw-inline-media,.feed-list>.fw-inline-media,.square-main>.fw-inline-media{display:none!important}@media(max-width:760px){.fw-post-stable-media img{max-width:220px;max-height:280px}.fw-post-stable-media video{max-width:230px;max-height:300px}.fw-post-media-list{margin-top:10px}}';
    document.head.appendChild(s);
  }

  function install(){
    if(window.__FW_COMMENT_REPLY_SYSTEM__) return;
    if(typeof window.renderPost === 'function' && window.renderPost !== stableRenderPost){
      window.renderPost = stableRenderPost;
      if(typeof window.renderFeeds === 'function') setTimeout(function(){ try{ window.renderFeeds(); }catch(e){} }, 40);
    }
  }

  function normalizeOldDom(){
    document.querySelectorAll('.post-content').forEach(function(p){
      var card = p.closest('.post-card');
      if(!card) return;
      var nodes = Array.from(p.querySelectorAll('.fw-inline-media,.fw-inline-sticker'));
      if(!nodes.length) return;
      var list = card.querySelector('.fw-post-media-list');
      if(!list){
        list = document.createElement('div');
        list.className = 'fw-post-media-list';
        p.insertAdjacentElement('afterend', list);
      }
      nodes.forEach(function(n){
        n.classList.add(n.classList.contains('fw-inline-sticker') ? 'fw-post-stable-sticker' : 'fw-post-stable-media');
        list.appendChild(n);
      });
    });
  }

  function tick(){ injectStyle(); install(); normalizeOldDom(); }

  function boot(){
    tick();
    setTimeout(tick, 250);
    setTimeout(tick, 900);
    setInterval(tick, 1500);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
