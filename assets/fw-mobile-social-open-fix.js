// F.w 研究所：微信内置浏览器手机端回声 / 搭子修复 v3
// 只接管手机压缩栏按钮 [data-fw-mobile-open]，不碰电脑端按钮。
// 重点：微信 WebView 下移动端没有吃到桌面样式，所以这里补齐完整手机样式；回声增加独立兜底面板。
(function(){
  if(window.__FW_MOBILE_SOCIAL_OPEN_FIX_V3__) return;
  window.__FW_MOBILE_SOCIAL_OPEN_FIX_V3__ = true;

  function $(s, root){ return (root || document).querySelector(s); }
  function $$(s, root){ return Array.from((root || document).querySelectorAll(s)); }

  function isMobile(){
    try{ return window.matchMedia && window.matchMedia('(max-width:760px)').matches; }
    catch(e){ return window.innerWidth <= 760; }
  }

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function ini(v){ return String(v || 'FW').trim().slice(0,2).toUpperCase(); }

  function toast(msg){
    var t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwMobileSocialToast);
    window.__fwMobileSocialToast = setTimeout(function(){ t.classList.remove('show'); }, 2400);
  }

  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      var n = 0;
      var timer = setInterval(function(){
        n += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(timer); resolve(true); }
        if(n > 100){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  async function getMe(){
    try{
      if(!(await waitDb())) return null;
      return await window.fwDb.getCurrentUser();
    }catch(e){ return null; }
  }

  function injectStyle(){
    if($('#fw-mobile-social-open-fix-style')) return;
    var style = document.createElement('style');
    style.id = 'fw-mobile-social-open-fix-style';
    style.textContent = `
      @media(max-width:760px){
        body.fw-wx-modal-open{
          overflow:hidden!important;
        }
        .fw-mobile-echo-modal.show,
        .fw-stable-echo-modal.show,
        [data-fw-stable-echo-modal].show{
          display:flex!important;
          position:fixed!important;
          inset:0!important;
          z-index:10220!important;
          align-items:center!important;
          justify-content:center!important;
          padding:12px!important;
          background:rgba(6,8,6,.76)!important;
          pointer-events:auto!important;
          box-sizing:border-box!important;
        }
        .fw-mobile-echo-panel,
        .fw-stable-echo-modal.show .fw-stable-echo-panel,
        [data-fw-stable-echo-modal].show .fw-stable-echo-panel{
          position:relative!important;
          width:100%!important;
          height:86dvh!important;
          max-height:86dvh!important;
          min-height:0!important;
          right:auto!important;
          left:auto!important;
          top:auto!important;
          bottom:auto!important;
          background:#fffdf7!important;
          color:#1d1d1a!important;
          border:1px solid rgba(217,121,121,.45)!important;
          display:grid!important;
          grid-template-rows:auto minmax(0,1fr)!important;
          overflow:hidden!important;
          box-sizing:border-box!important;
        }
        .fw-mobile-echo-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;padding:18px!important;border-bottom:1px solid rgba(28,28,24,.12)!important;background:#fffdf7!important;}
        .fw-mobile-echo-head small{display:block!important;color:#d97979!important;font-size:11px!important;font-weight:1000!important;letter-spacing:.14em!important;margin-bottom:7px!important;}
        .fw-mobile-echo-head h2{margin:0!important;font-size:30px!important;line-height:1!important;font-weight:1000!important;letter-spacing:-.06em!important;}
        .fw-mobile-echo-close{width:38px!important;height:38px!important;border:0!important;background:transparent!important;color:#1b1b18!important;font-size:30px!important;line-height:1!important;font-weight:1000!important;}
        .fw-mobile-echo-body{min-height:0!important;overflow:auto!important;padding:12px!important;display:grid!important;align-content:start!important;gap:10px!important;background:#f7f2e8!important;}
        .fw-mobile-echo-empty{padding:16px!important;border:1px dashed rgba(28,28,24,.2)!important;background:#fffdf7!important;color:#6f6a5f!important;font-weight:900!important;line-height:1.55!important;}
        .fw-mobile-echo-item{display:grid!important;grid-template-columns:38px 1fr!important;gap:10px!important;align-items:start!important;padding:12px!important;border:1px solid rgba(28,28,24,.12)!important;background:#fffdf7!important;border-radius:12px!important;}
        .fw-mobile-echo-item.unread{border-color:rgba(217,121,121,.58)!important;}
        .fw-mobile-echo-avatar{width:38px!important;height:38px!important;border-radius:999px!important;display:grid!important;place-items:center!important;overflow:hidden!important;background:#1b1b18!important;color:#fff!important;font-size:12px!important;font-weight:1000!important;}
        .fw-mobile-echo-avatar img{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important;}
        .fw-mobile-echo-main b{display:block!important;font-size:14px!important;font-weight:1000!important;line-height:1.25!important;}
        .fw-mobile-echo-main span{display:block!important;margin-top:5px!important;color:#6f6a5f!important;font-size:12px!important;font-weight:850!important;line-height:1.45!important;}

        .fw-wx-modal.show,
        [data-fw-wx-buddy-modal].show{
          display:flex!important;
          position:fixed!important;
          inset:0!important;
          z-index:10180!important;
          align-items:center!important;
          justify-content:center!important;
          padding:12px!important;
          background:rgba(6,8,6,.76)!important;
          pointer-events:auto!important;
          backdrop-filter:blur(8px)!important;
          -webkit-backdrop-filter:blur(8px)!important;
          box-sizing:border-box!important;
        }
        .fw-wx-modal.show .fw-wx-panel,
        [data-fw-wx-buddy-modal].show [data-fw-wx-panel]{
          position:relative!important;
          left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;
          width:100%!important;min-width:0!important;max-width:100%!important;
          height:86dvh!important;min-height:0!important;max-height:86dvh!important;
          resize:none!important;display:grid!important;grid-template-rows:auto minmax(0,1fr)!important;overflow:hidden!important;
          background:#fffdf7!important;color:#1d1d1a!important;border:1px solid rgba(217,121,121,.42)!important;box-shadow:none!important;box-sizing:border-box!important;
        }
        .fw-wx-modal.show .fw-wx-head{height:70px!important;padding:14px 16px!important;cursor:default!important;display:flex!important;align-items:center!important;justify-content:space-between!important;border-bottom:1px solid rgba(28,28,24,.12)!important;background:#fffdf7!important;box-sizing:border-box!important;}
        .fw-wx-modal.show .fw-wx-title small{display:block!important;color:#d97979!important;font-size:10px!important;font-weight:1000!important;letter-spacing:.14em!important;margin:0 0 5px!important;}
        .fw-wx-modal.show .fw-wx-title h2{margin:0!important;font-size:28px!important;line-height:1!important;font-weight:1000!important;color:#1d1d1a!important;}
        .fw-wx-modal.show .fw-wx-tools{display:flex!important;align-items:center!important;gap:8px!important;}
        .fw-wx-modal.show .fw-wx-tool{height:32px!important;min-width:42px!important;border:1px solid rgba(28,28,24,.16)!important;border-radius:999px!important;background:#fffdf7!important;color:#1d1d1a!important;font-size:12px!important;font-weight:1000!important;padding:0 10px!important;}
        .fw-wx-modal.show .fw-wx-close{width:34px!important;height:34px!important;border:0!important;background:transparent!important;color:#1d1d1a!important;font-size:26px!important;font-weight:1000!important;line-height:1!important;}
        .fw-wx-modal.show .fw-wx-shell{min-height:0!important;height:100%!important;display:block!important;overflow:hidden!important;background:#f7f2e8!important;}
        .fw-wx-modal.show .fw-wx-left{height:100%!important;min-height:0!important;display:grid!important;grid-template-rows:auto auto minmax(0,1fr)!important;overflow:hidden!important;border-right:0!important;border-bottom:0!important;background:#f3efe6!important;}
        .fw-wx-modal.show .fw-wx-search{padding:10px!important;border-bottom:1px solid rgba(28,28,24,.08)!important;box-sizing:border-box!important;}
        .fw-wx-modal.show .fw-wx-search form{display:grid!important;grid-template-columns:1fr 58px!important;gap:8px!important;align-items:center!important;}
        .fw-wx-modal.show .fw-wx-search input{width:100%!important;min-width:0!important;height:38px!important;border:1px solid rgba(28,28,24,.18)!important;border-radius:10px!important;background:#fffdf7!important;color:#1d1d1a!important;padding:0 10px!important;font-size:13px!important;font-weight:800!important;outline:none!important;box-sizing:border-box!important;}
        .fw-wx-modal.show .fw-wx-search button{height:38px!important;border:0!important;border-radius:999px!important;background:#1b1b18!important;color:#fff!important;font-size:13px!important;font-weight:1000!important;padding:0!important;appearance:none!important;-webkit-appearance:none!important;}
        .fw-wx-modal.show .fw-wx-tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important;padding:8px 10px!important;border-bottom:1px solid rgba(28,28,24,.08)!important;box-sizing:border-box!important;}
        .fw-wx-modal.show .fw-wx-tab{height:32px!important;border:1px solid rgba(28,28,24,.14)!important;border-radius:999px!important;background:#fffdf7!important;color:#1d1d1a!important;font-size:12px!important;font-weight:1000!important;padding:0!important;appearance:none!important;-webkit-appearance:none!important;}
        .fw-wx-modal.show .fw-wx-tab.active{background:#1b1b18!important;color:#fff!important;border-color:#1b1b18!important;}
        .fw-wx-modal.show .fw-wx-list{min-height:0!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;padding:8px!important;box-sizing:border-box!important;}
        .fw-wx-modal.show .fw-wx-empty{padding:14px!important;border:1px dashed rgba(28,28,24,.2)!important;background:#fffdf7!important;color:#77736b!important;font-size:13px!important;font-weight:900!important;line-height:1.5!important;}
        .fw-wx-modal.show .fw-wx-item{display:grid!important;grid-template-columns:40px minmax(0,1fr)!important;align-items:center!important;gap:9px!important;padding:8px!important;border-radius:12px!important;border:1px solid transparent!important;background:transparent!important;box-sizing:border-box!important;overflow:hidden!important;}
        .fw-wx-modal.show .fw-wx-item.active{background:#fffdf7!important;border-color:rgba(217,121,121,.55)!important;}
        .fw-wx-modal.show .fw-wx-avatar{width:40px!important;height:40px!important;min-width:40px!important;max-width:40px!important;min-height:40px!important;max-height:40px!important;border-radius:999px!important;display:grid!important;place-items:center!important;overflow:hidden!important;background:#1b1b18!important;color:#fff!important;font-size:11px!important;font-weight:1000!important;line-height:1!important;}
        .fw-wx-modal.show .fw-wx-avatar img{width:100%!important;height:100%!important;display:block!important;object-fit:cover!important;}
        .fw-wx-modal.show .fw-wx-name{min-width:0!important;font-size:13px!important;font-weight:1000!important;color:#1d1d1a!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}
        .fw-wx-modal.show .fw-wx-sub{min-width:0!important;margin-top:3px!important;font-size:11px!important;color:#77736b!important;font-weight:800!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}
        .fw-wx-modal.show .fw-wx-actions{display:flex!important;gap:6px!important;flex-wrap:wrap!important;margin-top:6px!important;}
        .fw-wx-modal.show .fw-wx-mini{height:28px!important;border:1px solid rgba(28,28,24,.14)!important;border-radius:999px!important;background:#fffdf7!important;color:#1d1d1a!important;font-size:11px!important;font-weight:1000!important;padding:0 10px!important;appearance:none!important;-webkit-appearance:none!important;}
        .fw-wx-modal.show .fw-wx-mini.dark{background:#1b1b18!important;color:#fff!important;border-color:#1b1b18!important;}
        .fw-wx-modal.show .fw-wx-mini.danger{color:#b35353!important;border-color:rgba(179,83,83,.35)!important;}
        .fw-wx-modal.show .fw-wx-right{height:100%!important;min-height:0!important;display:none!important;grid-template-rows:auto minmax(0,1fr) auto!important;overflow:hidden!important;background:#fffaf1!important;}
        .fw-wx-modal.show.fw-wx-mobile-chatting .fw-wx-left{display:none!important;}
        .fw-wx-modal.show.fw-wx-mobile-chatting .fw-wx-right{display:grid!important;}
        .fw-wx-modal.show .fw-wx-chat-head{min-height:68px!important;padding:10px 12px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;border-bottom:1px solid rgba(28,28,24,.1)!important;background:#fffdf7!important;box-sizing:border-box!important;}
        .fw-wx-modal.show .fw-wx-back-list{display:inline-flex!important;align-items:center!important;justify-content:center!important;margin:0 0 7px!important;min-height:28px!important;border:1px solid rgba(28,28,24,.15)!important;border-radius:999px!important;background:#fffaf1!important;color:#1d1d1a!important;font-size:12px!important;font-weight:1000!important;padding:0 11px!important;}
        .fw-wx-modal.show .fw-wx-chat-head h3{margin:0!important;font-size:18px!important;color:#1d1d1a!important;font-weight:1000!important;line-height:1.15!important;}
        .fw-wx-modal.show .fw-wx-chat-head span{font-size:10px!important;color:#9d4a4a!important;font-weight:900!important;}
        .fw-wx-modal.show .fw-wx-messages{min-height:0!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;padding:12px!important;background-image:linear-gradient(rgba(42,42,35,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(42,42,35,.045) 1px,transparent 1px)!important;background-size:26px 26px!important;box-sizing:border-box!important;}
        .fw-wx-modal.show .fw-wx-pm{max-width:86%!important;margin:0 0 12px!important;}
        .fw-wx-modal.show .fw-wx-pm.me{margin-left:auto!important;text-align:right!important;}
        .fw-wx-modal.show .fw-wx-pm-name{font-size:11px!important;color:#9d4a4a!important;font-weight:1000!important;margin-bottom:5px!important;}
        .fw-wx-modal.show .fw-wx-pm-bubble{display:inline-block!important;text-align:left!important;background:#fffdf7!important;color:#1d1d1a!important;border-radius:13px!important;padding:9px 11px!important;font-size:13px!important;font-weight:900!important;line-height:1.42!important;word-break:break-word!important;}
        .fw-wx-modal.show .fw-wx-pm.me .fw-wx-pm-bubble{background:#df7676!important;color:#fff!important;}
        .fw-wx-modal.show .fw-wx-compose{display:grid!important;grid-template-columns:44px 44px minmax(0,1fr) 58px!important;gap:6px!important;padding:10px!important;border-top:1px solid rgba(28,28,24,.1)!important;background:#fffdf7!important;box-sizing:border-box!important;}
        .fw-wx-modal.show .fw-wx-compose input{width:100%!important;min-width:0!important;height:42px!important;border:1px solid rgba(28,28,24,.18)!important;border-radius:10px!important;background:#fffdf7!important;color:#1d1d1a!important;padding:0 10px!important;font-size:13px!important;font-weight:900!important;outline:none!important;box-sizing:border-box!important;}
        .fw-wx-modal.show .fw-wx-compose button{height:42px!important;width:100%!important;min-width:0!important;border:0!important;border-radius:999px!important;background:#1b1b18!important;color:#fff!important;font-size:13px!important;font-weight:1000!important;padding:0!important;appearance:none!important;-webkit-appearance:none!important;}
        .fw-wx-modal.show .fw-wx-compose .fw-emoji-trigger{width:44px!important;min-width:44px!important;height:42px!important;padding:0!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureMobileEcho(){
    var modal = $('[data-fw-mobile-echo-modal]');
    if(modal) return modal;
    modal = document.createElement('div');
    modal.className = 'fw-mobile-echo-modal';
    modal.dataset.fwMobileEchoModal = '1';
    modal.innerHTML = '<section class="fw-mobile-echo-panel"><header class="fw-mobile-echo-head"><div><small>ECHO CENTER</small><h2>回声</h2></div><button type="button" class="fw-mobile-echo-close" data-fw-mobile-echo-close>×</button></header><div class="fw-mobile-echo-body" data-fw-mobile-echo-body><div class="fw-mobile-echo-empty">正在读取回声...</div></div></section>';
    document.body.appendChild(modal);
    return modal;
  }

  function avatarHtml(p){
    var name = p && p.nickname || '研究员';
    var url = p && p.avatar_url || '';
    if(url) return '<span class="fw-mobile-echo-avatar"><img src="' + esc(url) + '" alt="' + esc(name) + '"></span>';
    return '<span class="fw-mobile-echo-avatar">' + esc(ini(name)) + '</span>';
  }

  async function fetchProfiles(ids){
    var unique = Array.from(new Set((ids || []).filter(Boolean)));
    if(!unique.length) return {};
    try{
      var r = await window.fwDb.client.from('profiles').select('id,nickname,avatar_url,lab_code').in('id', unique);
      if(r.error) return {};
      var map = {};
      (r.data || []).forEach(function(p){ map[p.id] = p; });
      return map;
    }catch(e){ return {}; }
  }

  function typeText(type){
    return ({like:'点赞了你的帖子',same:'对你说：俺也一样',tissue:'给你递了纸巾',comment:'评论了你的帖子',friend_request:'想加你为搭子',friend_accept:'通过了你的搭子申请',chat_agree:'赞同了你的房间消息',system:'系统通知'})[type] || '给你发来一条回声';
  }

  async function openMobileEchoFallback(){
    var modal = ensureMobileEcho();
    var body = $('[data-fw-mobile-echo-body]', modal);
    modal.classList.add('show');
    body.innerHTML = '<div class="fw-mobile-echo-empty">正在读取回声...</div>';
    var me = await getMe();
    if(!me || !me.id){ body.innerHTML = '<div class="fw-mobile-echo-empty">请先登录后查看回声。</div>'; return; }
    try{
      var r = await window.fwDb.client.from('notifications').select('id,actor_id,type,target_type,target_id,content,is_read,created_at').eq('user_id', me.id).neq('type', 'private_message').order('created_at', {ascending:false}).limit(80);
      if(r.error) throw r.error;
      var rows = r.data || [];
      var profiles = await fetchProfiles(rows.map(function(x){ return x.actor_id; }));
      if(!rows.length){ body.innerHTML = '<div class="fw-mobile-echo-empty">暂时没有新的回声。私聊消息在“搭子”里查看。</div>'; return; }
      body.innerHTML = rows.map(function(n){
        var p = profiles[n.actor_id] || {};
        var name = p.nickname || '某位研究员';
        return '<article class="fw-mobile-echo-item ' + (n.is_read ? '' : 'unread') + '">' + avatarHtml(p) + '<div class="fw-mobile-echo-main"><b>' + esc(name + ' ' + typeText(n.type)) + '</b><span>' + esc(n.content || '对你的低功耗发言产生了回应。') + '</span></div></article>';
      }).join('');
      await window.fwDb.client.from('notifications').update({is_read:true}).eq('user_id', me.id).eq('is_read', false).neq('type', 'private_message');
    }catch(e){
      body.innerHTML = '<div class="fw-mobile-echo-empty">回声读取失败，请稍后重试。</div>';
    }
  }

  function visibleEcho(){
    var modal = $('[data-fw-mobile-echo-modal], [data-fw-stable-echo-modal], .fw-stable-echo-modal.show');
    return !!(modal && modal.classList.contains('show'));
  }

  function visibleBuddy(){
    var modal = $('[data-fw-wx-buddy-modal], .fw-wx-modal.show');
    return !!(modal && modal.classList.contains('show'));
  }

  function findOriginal(kind){
    var selector = kind === 'buddy' ? '[data-fw-open-buddy]' : '[data-fw-open-echo]';
    return $$(selector).find(function(el){ return !el.closest('#fw-mobile-compact-strip'); });
  }

  function triggerOriginal(kind){
    var original = findOriginal(kind);
    if(original){
      original.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
      return true;
    }
    var tmp = document.createElement('button');
    tmp.type = 'button';
    tmp.setAttribute(kind === 'buddy' ? 'data-fw-open-buddy' : 'data-fw-open-echo', '1');
    tmp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;';
    document.body.appendChild(tmp);
    tmp.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
    setTimeout(function(){ tmp.remove(); }, 180);
    return true;
  }

  function forceShowBuddy(){
    var modal = $('[data-fw-wx-buddy-modal], .fw-wx-modal');
    if(modal) modal.classList.add('show');
  }

  function openEcho(){
    openMobileEchoFallback();
  }

  function openBuddy(){
    triggerOriginal('buddy');
    var tries = 0;
    var timer = setInterval(function(){
      tries += 1;
      if(visibleBuddy()){
        clearInterval(timer);
        forceShowBuddy();
        return;
      }
      triggerOriginal('buddy');
      forceShowBuddy();
      if(tries >= 12){
        clearInterval(timer);
        if(!visibleBuddy()) toast('搭子功能还没加载完成，请稍后再点。');
      }
    }, 220);
  }

  function bind(){
    window.addEventListener('click', function(e){
      var closeEcho = e.target.closest && e.target.closest('[data-fw-mobile-echo-close]');
      if(closeEcho){ e.preventDefault(); $('[data-fw-mobile-echo-modal]')?.classList.remove('show'); return; }
      if(e.target && e.target.matches && e.target.matches('[data-fw-mobile-echo-modal]')){ e.target.classList.remove('show'); return; }

      var btn = e.target.closest && e.target.closest('[data-fw-mobile-open]');
      if(!btn) return;
      var kind = btn.dataset.fwMobileOpen || '';
      if(kind !== 'echo' && kind !== 'buddy') return;

      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();

      if(!isMobile()){
        triggerOriginal(kind);
        return;
      }
      if(kind === 'echo') openEcho();
      else openBuddy();
    }, true);
  }

  function boot(){
    injectStyle();
    bind();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
