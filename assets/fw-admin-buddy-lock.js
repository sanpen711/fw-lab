// F.w 研究所：站长固定搭子前端保护
// 作用：站长自动在搭子列表中展示；前端隐藏站长的解除、拉黑等危险操作。
(function(){
  if(window.__FW_ADMIN_BUDDY_LOCK__) return;
  window.__FW_ADMIN_BUDDY_LOCK__ = true;

  var adminProfile = null;

  function $(s){
    return document.querySelector(s);
  }

  function $$(s){
    return Array.from(document.querySelectorAll(s));
  }

  function toast(msg){
    var t = $('.fw-toast');

    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }

    t.textContent = msg;
    t.classList.add('show');

    clearTimeout(window.__fwAdminBuddyLockToast);
    window.__fwAdminBuddyLockToast = setTimeout(function(){
      t.classList.remove('show');
    }, 2600);
  }

  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
        resolve(true);
        return;
      }

      var n = 0;
      var timer = setInterval(function(){
        n += 1;

        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
          clearInterval(timer);
          resolve(true);
        }

        if(n > 80){
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  async function loadAdmin(){
    try{
      var ok = await waitDb();
      if(!ok) return null;

      var res = await window.fwDb.client.rpc('fw_get_admin_public_profile');

      if(res.error) throw res.error;

      var row = Array.isArray(res.data) ? res.data[0] : res.data;

      if(row && row.id){
        adminProfile = row;
        return row;
      }
    }catch(e){
      console.warn('[FW admin buddy lock] load admin failed', e);
    }

    return null;
  }

  function hideDangerButtons(item){
    if(!item) return;

    item.classList.add('fw-wx-admin-fixed-item');

    item.querySelectorAll(
      '[data-fw-wx-remove], [data-fw-menu-remove], [data-fw-menu-block], [data-fw-menu-report], [data-fw-menu-mute]'
    ).forEach(function(btn){
      btn.style.display = 'none';
      btn.setAttribute('aria-hidden', 'true');
      btn.disabled = true;
    });

    var menu = item.querySelector('.fw-wx-more-menu');

    if(menu && !menu.querySelector('[data-fw-admin-fixed-tip]')){
      var tip = document.createElement('div');
      tip.dataset.fwAdminFixedTip = '1';
      tip.textContent = '站长为系统固定搭子';
      tip.style.cssText = 'padding:8px 10px;color:#9d4a4a;font-size:12px;font-weight:950;white-space:nowrap;';
      menu.appendChild(tip);
    }

    var name = item.querySelector('.fw-wx-name');

    if(name && !name.querySelector('[data-fw-admin-badge]')){
      var badge = document.createElement('span');
      badge.dataset.fwAdminBadge = '1';
      badge.textContent = '站长';
      badge.style.cssText = 'margin-left:6px;display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;background:#1b1b18;color:#fffdf7;font-size:11px;font-weight:1000;vertical-align:middle;';
      name.appendChild(badge);
    }

    var sub = item.querySelector('.fw-wx-sub');

    if(sub && !sub.dataset.fwAdminLockedSub){
      sub.dataset.fwAdminLockedSub = '1';
      if(!sub.textContent.includes('系统固定搭子')){
        sub.textContent = sub.textContent + ' · 系统固定搭子';
      }
    }
  }

  function enhance(){
    if(!adminProfile || !adminProfile.id) return;

    $$('[data-fw-wx-chat-user="' + adminProfile.id + '"]').forEach(hideDangerButtons);

    $$('[data-fw-wx-chat-direct="' + adminProfile.id + '"]').forEach(function(btn){
      var item = btn.closest('.fw-wx-item');
      if(item) hideDangerButtons(item);
    });

    $$('[data-fw-wx-add="' + adminProfile.id + '"]').forEach(function(btn){
      btn.textContent = '打开私聊';
      btn.removeAttribute('data-fw-wx-add');
      btn.setAttribute('data-fw-wx-chat-direct', adminProfile.id);
      btn.classList.add('dark');

      var item = btn.closest('.fw-wx-item');
      if(item) hideDangerButtons(item);
    });
  }

  function interceptDanger(e){
    if(!adminProfile || !adminProfile.id) return;

    var item = e.target.closest && e.target.closest('[data-fw-wx-chat-user="' + adminProfile.id + '"]');

    if(!item) return;

    if(
      e.target.closest('[data-fw-wx-remove]') ||
      e.target.closest('[data-fw-menu-remove]') ||
      e.target.closest('[data-fw-menu-block]') ||
      e.target.closest('[data-fw-menu-report]') ||
      e.target.closest('[data-fw-menu-mute]')
    ){
      e.preventDefault();
      e.stopPropagation();

      if(e.stopImmediatePropagation){
        e.stopImmediatePropagation();
      }

      toast('站长是系统固定搭子，不能解除、拉黑或屏蔽。');
    }
  }

  function injectStyle(){
    if($('#fw-admin-buddy-lock-style')) return;

    var style = document.createElement('style');
    style.id = 'fw-admin-buddy-lock-style';
    style.textContent = `
      .fw-wx-admin-fixed-item{
        border-color:rgba(217,121,121,.55)!important;
        background:linear-gradient(135deg,#fffdf7,#fff3ef)!important;
      }
      .fw-wx-admin-fixed-item .fw-wx-avatar{
        box-shadow:0 0 0 3px rgba(217,121,121,.18);
      }
      .fw-wx-admin-fixed-item [data-fw-wx-remove],
      .fw-wx-admin-fixed-item [data-fw-menu-remove],
      .fw-wx-admin-fixed-item [data-fw-menu-block],
      .fw-wx-admin-fixed-item [data-fw-menu-report],
      .fw-wx-admin-fixed-item [data-fw-menu-mute]{
        display:none!important;
      }
    `;
    document.head.appendChild(style);
  }

  async function boot(){
    injectStyle();
    await loadAdmin();
    enhance();

    var observer = new MutationObserver(function(){
      clearTimeout(window.__fwAdminBuddyEnhanceTimer);
      window.__fwAdminBuddyEnhanceTimer = setTimeout(enhance, 60);
    });

    observer.observe(document.body, {
      childList:true,
      subtree:true
    });

    window.addEventListener('click', interceptDanger, true);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }else{
    boot();
  }
})();
