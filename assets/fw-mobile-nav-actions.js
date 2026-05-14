// F.w 研究所：手机端快捷入口与回声/搭子入口
// 只在手机端显示，不改电脑端布局。
(function(){
  if(window.__FW_MOBILE_NAV_ACTIONS__) return;
  window.__FW_MOBILE_NAV_ACTIONS__ = true;

  var badgeTimer = 0;

  function $(s, root){ return (root || document).querySelector(s); }
  function $$(s, root){ return Array.from((root || document).querySelectorAll(s)); }

  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      var n = 0;
      var t = setInterval(function(){
        n += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(t); resolve(true); }
        if(n > 120){ clearInterval(t); resolve(false); }
      }, 100);
    });
  }

  async function getMe(){
    try{
      if(!(await waitDb())) return null;
      return await window.fwDb.getCurrentUser();
    }catch(e){
      return null;
    }
  }

  function injectStyle(){
    if($('#fw-mobile-nav-actions-style')) return;

    var style = document.createElement('style');
    style.id = 'fw-mobile-nav-actions-style';
    style.textContent = `
      .fw-mobile-header-actions,
      .fw-mobile-quick-entry{
        display:none;
      }

      @media (max-width: 760px){
        .header{
          gap:8px!important;
          justify-content:flex-start!important;
          align-items:center!important;
        }

        .header .logo{
          flex:0 0 auto!important;
          font-size:24px!important;
        }

        .header .menu-btn{
          flex:0 0 auto!important;
          margin-left:0!important;
          padding:0!important;
          line-height:1!important;
        }

        .fw-mobile-header-actions{
          display:flex!important;
          align-items:center!important;
          gap:6px!important;
          margin-left:auto!important;
          flex:0 0 auto!important;
          position:relative!important;
          z-index:30!important;
        }

        .fw-mobile-action-btn{
          position:relative!important;
          height:34px!important;
          min-width:48px!important;
          padding:0 10px!important;
          border-radius:999px!important;
          border:1px solid rgba(246,246,240,.55)!important;
          background:rgba(16,23,15,.48)!important;
          color:#fffdf7!important;
          font-size:12px!important;
          font-weight:950!important;
          line-height:1!important;
          backdrop-filter:blur(10px)!important;
          -webkit-backdrop-filter:blur(10px)!important;
        }

        .fw-mobile-action-badge{
          position:absolute!important;
          right:-6px!important;
          top:-7px!important;
          min-width:17px!important;
          height:17px!important;
          padding:0 4px!important;
          border-radius:999px!important;
          background:#df7676!important;
          color:#fff!important;
          border:2px solid #151711!important;
          display:none!important;
          place-items:center!important;
          font-size:9px!important;
          line-height:12px!important;
          font-weight:1000!important;
          z-index:2!important;
        }

        .fw-mobile-action-btn.show .fw-mobile-action-badge{
          display:grid!important;
        }

        .header .fw-userbar{
          flex:0 0 auto!important;
          margin-left:0!important;
        }

        .header .fw-userbar .fw-login-pill{
          min-width:42px!important;
          width:42px!important;
          height:42px!important;
          padding:0!important;
          justify-content:center!important;
          overflow:hidden!important;
        }

        .header .fw-userbar [data-fw-current]{
          display:none!important;
        }

        .header .fw-userbar .fw-avatar.mini,
        .header .fw-userbar .fw-avatar.mini img{
          width:30px!important;
          height:30px!important;
        }

        .home-hero-clean > div:first-child{
          width:100%!important;
        }

        .fw-mobile-quick-entry{
          display:grid!important;
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
          gap:12px!important;
          width:100%!important;
          margin-top:22px!important;
          padding:18px!important;
          border:1px solid rgba(217,121,121,.62)!important;
          background:rgba(16,23,15,.28)!important;
          backdrop-filter:blur(8px)!important;
          -webkit-backdrop-filter:blur(8px)!important;
        }

        .fw-mobile-quick-card{
          min-height:72px!important;
          padding:14px 13px!important;
          border:1px solid rgba(246,246,240,.22)!important;
          background:rgba(250,250,245,.055)!important;
          color:#fffdf7!important;
          display:flex!important;
          flex-direction:column!important;
          justify-content:center!important;
          gap:6px!important;
        }

        .fw-mobile-quick-card b{
          font-size:16px!important;
          line-height:1!important;
          font-weight:1000!important;
          letter-spacing:-.04em!important;
        }

        .fw-mobile-quick-card span{
          font-size:11px!important;
          line-height:1.35!important;
          color:rgba(246,246,240,.68)!important;
          font-weight:850!important;
        }

        .fw-mobile-quick-card:active,
        .fw-mobile-action-btn:active{
          transform:scale(.98)!important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureHeaderActions(){
    $$('.header').forEach(function(header){
      if(header.querySelector('.fw-mobile-header-actions')) return;

      var wrap = document.createElement('div');
      wrap.className = 'fw-mobile-header-actions';
      wrap.innerHTML = `
        <button type="button" class="fw-mobile-action-btn" data-fw-mobile-open="echo">回声<span class="fw-mobile-action-badge" data-fw-mobile-badge="echo"></span></button>
        <button type="button" class="fw-mobile-action-btn" data-fw-mobile-open="buddy">搭子<span class="fw-mobile-action-badge" data-fw-mobile-badge="buddy"></span></button>
      `;

      var userbar = header.querySelector('.fw-userbar');
      if(userbar){
        header.insertBefore(wrap, userbar);
        return;
      }

      header.appendChild(wrap);
    });
  }

  function ensureHomeQuickEntry(){
    var hero = $('.home-hero-clean > div:first-child');
    if(!hero || hero.querySelector('.fw-mobile-quick-entry')) return;

    var actions = hero.querySelector('.hero-actions');
    var box = document.createElement('div');
    box.className = 'fw-mobile-quick-entry';
    box.innerHTML = `
      <a class="fw-mobile-quick-card" href="rooms.html"><b>学术研讨</b><span>进房间实时发言</span></a>
      <a class="fw-mobile-quick-card" href="archive.html"><b>废话档案</b><span>看每周荣誉榜</span></a>
      <a class="fw-mobile-quick-card" href="rules.html"><b>入馆须知</b><span>先看边界和声明</span></a>
      <a class="fw-mobile-quick-card" href="admin.html"><b>公开处刑</b><span>查看处理公告</span></a>
    `;

    if(actions && actions.parentNode){
      actions.insertAdjacentElement('afterend', box);
    }else{
      hero.appendChild(box);
    }
  }

  function fireOriginal(kind){
    var selector = kind === 'buddy' ? '[data-fw-open-buddy]' : '[data-fw-open-echo]';
    var original = $$(selector).find(function(el){
      return !el.closest('.fw-mobile-header-actions');
    });

    if(original){
      original.click();
      return;
    }

    // 兜底：创建一个临时按钮，触发已有事件委托，不常驻页面，避免抢红点逻辑。
    var tmp = document.createElement('button');
    tmp.type = 'button';
    tmp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    tmp.setAttribute(kind === 'buddy' ? 'data-fw-open-buddy' : 'data-fw-open-echo', '1');
    document.body.appendChild(tmp);
    tmp.click();
    setTimeout(function(){ tmp.remove(); }, 50);
  }

  function setBadge(kind, count){
    var btn = $('[data-fw-mobile-open="' + kind + '"]');
    if(!btn) return;

    var badge = $('[data-fw-mobile-badge="' + kind + '"]', btn);
    var n = Number(count || 0);

    if(n > 0){
      badge.textContent = n > 99 ? '99+' : String(n);
      btn.classList.add('show');
    }else{
      badge.textContent = '';
      btn.classList.remove('show');
    }
  }

  function isEchoType(type){
    return !['private_message','friend_request','friend_accept'].includes(String(type || ''));
  }

  async function refreshMobileBadges(){
    if(window.innerWidth > 760) return;

    var me = await getMe();
    if(!me || !me.id){
      setBadge('echo', 0);
      setBadge('buddy', 0);
      return;
    }

    try{
      var notices = await window.fwDb.client
        .from('notifications')
        .select('id,type,is_read')
        .eq('user_id', me.id)
        .eq('is_read', false)
        .limit(300);

      if(notices.error) throw notices.error;

      var rows = notices.data || [];
      var echoCount = rows.filter(function(n){ return isEchoType(n.type); }).length;
      var privateCount = rows.filter(function(n){ return n.type === 'private_message'; }).length;
      var friendNoticeCount = rows.filter(function(n){ return n.type === 'friend_request' || n.type === 'friend_accept'; }).length;

      var pending = await window.fwDb.client
        .from('friendships')
        .select('id', {count:'exact', head:true})
        .eq('receiver_id', me.id)
        .eq('status', 'pending');

      var buddyCount = privateCount + Math.max(friendNoticeCount, pending.count || 0);

      setBadge('echo', echoCount);
      setBadge('buddy', buddyCount);
    }catch(e){
      console.warn('[FW mobile nav actions] badge refresh failed', e);
    }
  }

  function bind(){
    document.addEventListener('click', function(e){
      var btn = e.target.closest && e.target.closest('[data-fw-mobile-open]');
      if(!btn) return;

      e.preventDefault();
      e.stopPropagation();
      fireOriginal(btn.dataset.fwMobileOpen);

      setTimeout(refreshMobileBadges, 800);
    }, true);

    document.addEventListener('visibilitychange', function(){
      if(!document.hidden) refreshMobileBadges();
    });

    window.addEventListener('resize', function(){
      ensureHeaderActions();
      ensureHomeQuickEntry();
      refreshMobileBadges();
    });
  }

  function boot(){
    injectStyle();
    ensureHeaderActions();
    ensureHomeQuickEntry();
    bind();
    refreshMobileBadges();

    clearInterval(badgeTimer);
    badgeTimer = setInterval(refreshMobileBadges, 12000);

    var observer = new MutationObserver(function(){
      clearTimeout(window.__fwMobileNavActionsTimer);
      window.__fwMobileNavActionsTimer = setTimeout(function(){
        ensureHeaderActions();
        ensureHomeQuickEntry();
        refreshMobileBadges();
      }, 120);
    });

    observer.observe(document.body, {childList:true, subtree:true});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
