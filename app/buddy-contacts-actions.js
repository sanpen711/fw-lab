// F.w 研究所：手机端全部搭子联系人列表与操作菜单
(function(){
  if(window.__FW_MOBILE_BUDDY_CONTACT_ACTIONS__) return;
  window.__FW_MOBILE_BUDDY_CONTACT_ACTIONS__ = true;

  var menuTargetId = '';
  var menuTargetName = '';
  var transformPending = false;
  var pinyinCollator = null;
  var PINYIN_BOUNDARIES = [
    ['A','啊'], ['B','芭'], ['C','擦'], ['D','搭'], ['E','蛾'], ['F','发'], ['G','噶'], ['H','哈'],
    ['J','击'], ['K','喀'], ['L','垃'], ['M','妈'], ['N','拿'], ['O','哦'], ['P','啪'], ['Q','期'],
    ['R','然'], ['S','撒'], ['T','塌'], ['W','挖'], ['X','昔'], ['Y','压'], ['Z','匝']
  ];

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function app(){ return window.FWApp || null; }
  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function toast(message){
    var fw = app();
    if(fw && fw.toast) fw.toast(message);
    else alert(message);
  }
  async function getMe(){
    if(window.fwDb && window.fwDb.getCurrentUser) return await window.fwDb.getCurrentUser();
    var fw = app();
    return fw && fw.state && fw.state.user || null;
  }
  function client(){ return window.fwDb && window.fwDb.client; }

  function injectStyle(){
    if($('#fwMobileBuddyContactActionsStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileBuddyContactActionsStyle';
    style.textContent = [
      '[data-app-view="buddy"]:not(.is-chatting):not(.is-profile) [data-buddy-list]{margin-top:-8px!important}',
      '[data-app-view="buddy"] .buddy-letter{position:static!important;margin:16px 0 7px 4px!important;padding:0!important;background:transparent!important;color:rgba(16,23,15,.62)!important;font-size:13px!important;font-weight:1000!important;letter-spacing:.06em;width:auto!important}',
      '[data-app-view="buddy"] .buddy-contact-list{display:grid!important;gap:0!important;border-radius:18px!important;background:#fffdf7!important;border:1px solid rgba(16,23,15,.08)!important;overflow:hidden!important;box-shadow:0 8px 22px rgba(16,23,15,.04)!important}',
      '.buddy-contact-row,.buddy-contact-card{display:grid!important;grid-template-columns:48px minmax(0,1fr) 44px!important;align-items:center!important;gap:12px!important;min-height:66px!important;height:66px!important;padding:9px 8px 9px 12px!important;border:0!important;border-bottom:1px solid rgba(16,23,15,.08)!important;background:#fffdf7!important;text-align:left!important;color:#161713!important;width:100%!important;box-sizing:border-box!important}',
      '.buddy-contact-row:last-child,.buddy-contact-card:last-child{border-bottom:0!important}',
      '.buddy-contact-card:active{background:#f7f1e7!important}',
      '.buddy-contact-card .list-avatar,.buddy-contact-row .list-avatar{width:44px!important;height:44px!important;border-radius:12px!important;font-size:14px!important;flex:0 0 auto!important}',
      '.buddy-contact-name{display:block!important;font-size:18px!important;line-height:1.2!important;font-weight:1000!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}',
      '.buddy-contact-more{width:38px!important;height:38px!important;border:0!important;border-radius:999px!important;background:transparent!important;color:rgba(16,23,15,.62)!important;font-size:24px!important;line-height:1!important;font-weight:1000!important;display:grid!important;place-items:center!important;padding:0!important}',
      '.buddy-contact-more:active{background:rgba(16,23,15,.08)!important}',
      '.buddy-contact-menu-mask{position:fixed;inset:0;z-index:520;background:rgba(0,0,0,.18);display:none}',
      '.buddy-contact-menu-mask.show{display:block}',
      '.buddy-contact-menu{position:fixed;left:14px;right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);z-index:521;border-radius:20px;background:#fffdf7;box-shadow:0 18px 44px rgba(0,0,0,.18);overflow:hidden;display:none}',
      '.buddy-contact-menu.show{display:block}',
      '.buddy-contact-menu-title{padding:14px 18px 10px;color:rgba(16,23,15,.58);font-size:13px;font-weight:900;border-bottom:1px solid rgba(16,23,15,.08)}',
      '.buddy-contact-menu button{width:100%;height:54px;border:0;border-bottom:1px solid rgba(16,23,15,.08);background:#fffdf7;color:#151713;font-size:17px;font-weight:950;text-align:center}',
      '.buddy-contact-menu button:last-child{border-bottom:0}',
      '.buddy-contact-menu button.danger{color:#b45353}',
      '.buddy-contact-menu button.cancel{margin-top:8px;border-top:8px solid #eee8dc;color:rgba(16,23,15,.62)}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureMenu(){
    var mask = $('.buddy-contact-menu-mask');
    var menu = $('.buddy-contact-menu');
    if(mask && menu) return menu;
    mask = document.createElement('div');
    mask.className = 'buddy-contact-menu-mask';
    mask.dataset.buddyContactMenuClose = 'true';
    menu = document.createElement('div');
    menu.className = 'buddy-contact-menu';
    menu.innerHTML = [
      '<div class="buddy-contact-menu-title" data-buddy-contact-menu-title>搭子操作</div>',
      '<button type="button" data-buddy-contact-profile>个人资料</button>',
      '<button type="button" data-buddy-contact-report>举报</button>',
      '<button type="button" class="danger" data-buddy-contact-delete>删除搭子</button>',
      '<button type="button" class="cancel" data-buddy-contact-menu-close>取消</button>'
    ].join('');
    document.body.appendChild(mask);
    document.body.appendChild(menu);
    return menu;
  }

  function closeMenu(){
    var mask = $('.buddy-contact-menu-mask');
    var menu = $('.buddy-contact-menu');
    if(mask) mask.classList.remove('show');
    if(menu) menu.classList.remove('show');
    menuTargetId = '';
    menuTargetName = '';
  }

  function openMenu(targetId, name){
    menuTargetId = String(targetId || '');
    menuTargetName = String(name || '这个搭子');
    var menu = ensureMenu();
    var title = $('[data-buddy-contact-menu-title]', menu);
    if(title) title.textContent = menuTargetName;
    $('.buddy-contact-menu-mask').classList.add('show');
    menu.classList.add('show');
  }

  function isFriendsTabVisible(){
    var view = $('[data-app-view="buddy"]');
    if(!view || view.classList.contains('is-chatting') || view.classList.contains('is-profile')) return false;
    var active = $('[data-buddy-tab].active');
    return !!(active && active.dataset.buddyTab === 'friends');
  }

  function getPinyinCollator(){
    if(pinyinCollator) return pinyinCollator;
    try{
      pinyinCollator = new Intl.Collator('zh-Hans-u-co-pinyin', {sensitivity:'base'});
    }catch(e){
      pinyinCollator = null;
    }
    return pinyinCollator;
  }

  function firstMeaningfulChar(name){
    var chars = Array.from(String(name || '').trim());
    for(var i = 0; i < chars.length; i += 1){
      if(/[A-Za-z\u4e00-\u9fff]/.test(chars[i])) return chars[i];
    }
    return chars[0] || '';
  }

  function pinyinInitialForChinese(ch){
    var collator = getPinyinCollator();
    if(!collator) return '#';
    var initial = '#';
    for(var i = 0; i < PINYIN_BOUNDARIES.length; i += 1){
      if(collator.compare(ch, PINYIN_BOUNDARIES[i][1]) >= 0) initial = PINYIN_BOUNDARIES[i][0];
      else break;
    }
    return initial;
  }

  function letterForName(name){
    var first = firstMeaningfulChar(name);
    if(!first) return '#';
    var upper = first.toUpperCase();
    if(/^[A-Z]$/.test(upper)) return upper;
    if(/^[\u4e00-\u9fff]$/.test(first)) return pinyinInitialForChinese(first);
    return '#';
  }

  function sortCards(cards){
    return cards.sort(function(a, b){
      var an = (($('.buddy-contact-name', a) || {}).textContent || '').trim();
      var bn = (($('.buddy-contact-name', b) || {}).textContent || '').trim();
      var al = letterForName(an);
      var bl = letterForName(bn);
      if(al !== bl){
        if(al === '#') return 1;
        if(bl === '#') return -1;
        return al.localeCompare(bl, 'en');
      }
      return an.localeCompare(bn, 'zh-Hans-u-co-pinyin', {numeric:true});
    });
  }

  function groupContactCards(){
    if(!isFriendsTabVisible()) return;
    var list = $('[data-buddy-list]');
    if(!list) return;
    if(list.dataset.fwBuddyContactGrouped === '1' && list.querySelector('.buddy-letter')) return;
    var cards = $$('.buddy-contact-card[data-buddy-contact-card], .buddy-contact-row[data-buddy-profile]', list);
    if(!cards.length) return;
    cards = sortCards(cards.map(function(card){ return card.cloneNode(true); }));
    var html = [];
    var currentLetter = '';
    cards.forEach(function(card){
      var name = (($('.buddy-contact-name', card) || {}).textContent || '').trim();
      var letter = letterForName(name);
      if(letter !== currentLetter){
        if(currentLetter) html.push('</div>');
        currentLetter = letter;
        html.push('<div class="buddy-letter">' + esc(letter) + '</div><div class="buddy-contact-list">');
      }
      html.push(card.outerHTML);
    });
    if(currentLetter) html.push('</div>');
    list.innerHTML = html.join('');
    list.dataset.fwBuddyContactGrouped = '1';
  }

  function transformContacts(){
    if(!isFriendsTabVisible()) return;
    $$('.buddy-contact-row[data-buddy-profile]').forEach(function(row){
      if(row.dataset.fwContactActionEnhanced === '1') return;
      var targetId = row.dataset.buddyProfile || '';
      var avatar = $('.list-avatar', row);
      var name = $('.buddy-contact-name', row);
      var label = name ? name.textContent.trim() : '低功耗研究员';
      var card = document.createElement('div');
      card.className = 'buddy-contact-card';
      card.dataset.buddyOpenChat = targetId;
      card.dataset.buddyContactCard = targetId;
      card.dataset.fwContactActionEnhanced = '1';
      card.innerHTML = (avatar ? avatar.outerHTML : '<span class="list-avatar">研</span>') + '<span class="buddy-contact-name">' + esc(label) + '</span><button class="buddy-contact-more" type="button" data-buddy-contact-more="' + esc(targetId) + '" data-buddy-contact-name="' + esc(label) + '" aria-label="更多操作">⋯</button>';
      row.replaceWith(card);
    });
    groupContactCards();
  }

  function scheduleTransform(delay){
    if(transformPending) return;
    transformPending = true;
    setTimeout(function(){
      requestAnimationFrame(function(){
        transformPending = false;
        transformContacts();
      });
    }, delay == null ? 80 : delay);
  }

  async function findFriendshipId(targetId){
    var c = client();
    var me = await getMe();
    if(!c || !me || !me.id || !targetId) throw new Error('暂时无法读取搭子关系。');
    var r = await c
      .from('friendships')
      .select('id,requester_id,receiver_id,status')
      .or('requester_id.eq.' + me.id + ',receiver_id.eq.' + me.id)
      .eq('status', 'accepted');
    if(r.error) throw r.error;
    var row = (r.data || []).find(function(item){
      return (String(item.requester_id) === String(me.id) && String(item.receiver_id) === String(targetId)) ||
        (String(item.receiver_id) === String(me.id) && String(item.requester_id) === String(targetId));
    });
    if(!row) throw new Error('没有找到这个搭子关系。');
    return row.id;
  }

  async function deleteBuddy(targetId, name){
    if(!window.confirm('确定删除搭子「' + (name || '这个搭子') + '」吗？')) return;
    try{
      var c = client();
      if(!c) throw new Error('数据服务未连接。');
      var id = await findFriendshipId(targetId);
      var r = await c.rpc('fw_remove_friendship', {target_friendship_id:Number(id)});
      if(r.error) throw r.error;
      toast('已删除搭子。');
      closeMenu();
      if(window.FWAppBuddy && window.FWAppBuddy.load) window.FWAppBuddy.load(true);
    }catch(e){
      console.warn('[FW mobile app] delete buddy failed', e);
      toast(e.message || '删除失败，请稍后再试。');
    }
  }

  function reportBuddy(targetId, name){
    var reason = window.prompt('举报「' + (name || '这个搭子') + '」的原因：');
    if(reason === null) return;
    reason = String(reason || '').trim();
    if(!reason){ toast('举报原因不能为空。'); return; }
    console.info('[FW mobile app] buddy report submitted locally', {targetId:targetId, reason:reason});
    toast('举报已记录，后续会接入站长处理。');
    closeMenu();
  }

  function bind(){
    document.addEventListener('click', function(e){
      var more = e.target.closest && e.target.closest('[data-buddy-contact-more]');
      if(more){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        openMenu(more.dataset.buddyContactMore, more.dataset.buddyContactName || '这个搭子');
        return;
      }

      var card = e.target.closest && e.target.closest('[data-buddy-contact-card]');
      if(card){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        var targetId = card.dataset.buddyContactCard || card.dataset.buddyOpenChat;
        if(window.FWAppBuddy && window.FWAppBuddy.openChat) window.FWAppBuddy.openChat(targetId);
        return;
      }

      if(e.target.closest && e.target.closest('[data-buddy-contact-menu-close]')){
        e.preventDefault();
        closeMenu();
        return;
      }
      if(e.target.closest && e.target.closest('[data-buddy-contact-profile]')){
        e.preventDefault();
        var id = menuTargetId;
        closeMenu();
        if(window.FWAppBuddy && window.FWAppBuddy.openProfile) window.FWAppBuddy.openProfile(id);
        return;
      }
      if(e.target.closest && e.target.closest('[data-buddy-contact-report]')){
        e.preventDefault();
        reportBuddy(menuTargetId, menuTargetName);
        return;
      }
      if(e.target.closest && e.target.closest('[data-buddy-contact-delete]')){
        e.preventDefault();
        deleteBuddy(menuTargetId, menuTargetName);
      }
    }, true);
  }

  function boot(){
    injectStyle();
    ensureMenu();
    bind();
    var list = $('[data-buddy-list]') || document.body;
    var observer = new MutationObserver(function(){ scheduleTransform(80); });
    observer.observe(list, {childList:true, subtree:true});
    document.addEventListener('click', function(){ scheduleTransform(120); });
    setInterval(function(){ if(isFriendsTabVisible()) scheduleTransform(0); }, 3000);
    transformContacts();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();