(function(){
  if(window.FWAppBuddy) return;

  var bound = false;
  var loaded = false;
  var activeTab = 'friends';
  var friendshipRows = [];
  var profileMap = {};

  function app(){ return window.FWApp; }
  function $(selector, root){ return app().$(selector, root); }
  function $$(selector, root){ return app().$$(selector, root); }
  function esc(value){ return app().esc(value); }

  function fail(result, message){
    if(result && result.error) throw new Error(message || '读取失败');
    return result ? result.data : null;
  }

  function avatar(profile){
    var name = profile && profile.nickname || '研究员';
    if(profile && profile.avatar_url){
      return '<span class="list-avatar"><img src="' + esc(profile.avatar_url) + '" alt="' + esc(name) + '"></span>';
    }
    return '<span class="list-avatar">' + esc(app().initials(name)) + '</span>';
  }

  async function fetchProfiles(ids){
    var db = app().db();
    var client = db && db.client;
    var unique = Array.from(new Set((ids || []).filter(Boolean)));
    if(!client || !unique.length) return {};
    var rows = fail(await client.from('profiles').select('id,nickname,avatar_url,lab_code').in('id', unique), '资料读取失败') || [];
    var map = {};
    rows.forEach(function(row){ map[row.id] = row; });
    return map;
  }

  function otherId(row, meId){
    return row.requester_id === meId ? row.receiver_id : row.requester_id;
  }

  function currentRows(){
    var me = app().state.user;
    if(!me) return [];
    if(activeTab === 'incoming') return friendshipRows.filter(function(row){ return row.status === 'pending' && row.receiver_id === me.id; });
    if(activeTab === 'outgoing') return friendshipRows.filter(function(row){ return row.status === 'pending' && row.requester_id === me.id; });
    return friendshipRows.filter(function(row){ return row.status === 'accepted'; });
  }

  function rowHtml(row){
    var me = app().state.user;
    var id = otherId(row, me.id);
    var profile = profileMap[id] || {};
    var name = profile.nickname || '低功耗研究员';
    var sub = profile.lab_code ? '实验品编号：' + profile.lab_code : '实验品编号：未设置';
    if(row.status === 'pending' && row.receiver_id === me.id) sub += ' · 收到搭子申请';
    if(row.status === 'pending' && row.requester_id === me.id) sub += ' · 等待对方处理';
    if(row.status === 'accepted') sub += ' · 可进入私聊';

    return '<article class="list-item" data-buddy-user="' + esc(id) + '">' +
      avatar(profile) +
      '<div class="list-main"><b>' + esc(name) + '</b><span>' + esc(sub) + '</span></div>' +
      '<button class="more-btn" type="button" data-buddy-more>更多</button>' +
    '</article>';
  }

  function render(){
    var list = $('[data-buddy-list]');
    if(!list) return;

    $$('[data-buddy-tab]').forEach(function(tab){
      tab.classList.toggle('active', tab.dataset.buddyTab === activeTab);
    });

    if(!app().state.user){
      list.innerHTML = '<div class="empty">请先登录后查看搭子中心。</div>';
      return;
    }

    var rows = currentRows();
    if(!rows.length){
      var text = activeTab === 'friends' ? '暂时还没有搭子，可以先搜索实验品。' : activeTab === 'incoming' ? '暂时没有收到新的搭子申请。' : '暂时没有发出的搭子申请。';
      list.innerHTML = '<div class="empty">' + text + '</div>';
      return;
    }
    list.innerHTML = rows.map(rowHtml).join('');
  }

  async function load(force){
    if(loaded && !force){ render(); return; }
    var list = $('[data-buddy-list]');
    if(list) list.innerHTML = '<div class="loading">正在读取搭子列表...</div>';

    try{
      await app().refreshUser();
      var me = app().state.user;
      if(!me){ loaded = true; render(); return; }
      if(!(await app().waitForDb())) throw new Error('暂时无法连接数据服务。');
      var client = app().db().client;
      friendshipRows = fail(
        await client
          .from('friendships')
          .select('id,requester_id,receiver_id,status,created_at,updated_at')
          .or('requester_id.eq.' + me.id + ',receiver_id.eq.' + me.id)
          .order('updated_at', {ascending:false}),
        '搭子列表读取失败'
      ) || [];
      var ids = [];
      friendshipRows.forEach(function(row){ ids.push(row.requester_id, row.receiver_id); });
      profileMap = await fetchProfiles(ids);
      loaded = true;
      render();
    }catch(e){
      console.warn('[FW mobile app] buddy load failed', e);
      if(list) list.innerHTML = '<div class="error">搭子列表暂时读取失败，请稍后再试。</div>';
    }
  }

  async function search(keyword){
    var result = $('[data-buddy-search-result]');
    if(!result) return;
    var q = String(keyword || '').trim();
    if(q.length < 2){
      app().toast('至少输入 2 个字符；邮箱需要完整输入。');
      return;
    }
    result.innerHTML = '<div class="loading">正在搜索实验品...</div>';

    try{
      if(!(await app().waitForDb())) throw new Error('暂时无法连接数据服务。');
      var rows = fail(await app().db().client.rpc('fw_search_profiles', {search_text:q}), '搜索失败') || [];
      if(!rows.length){ result.innerHTML = '<div class="empty">没有找到对应实验品。</div>'; return; }
      result.innerHTML = rows.map(function(profile){
        return '<article class="list-item">' + avatar(profile) + '<div class="list-main"><b>' + esc(profile.nickname || '低功耗研究员') + '</b><span>实验品编号：' + esc(profile.lab_code || '未设置') + '</span></div><button class="more-btn" type="button" data-buddy-more>更多</button></article>';
      }).join('');
    }catch(e){
      console.warn('[FW mobile app] buddy search failed', e);
      result.innerHTML = '<div class="error">搜索暂时失败，请稍后再试。</div>';
    }
  }

  function bind(){
    if(bound) return;
    bound = true;

    document.addEventListener('click', function(e){
      var tab = e.target.closest && e.target.closest('[data-buddy-tab]');
      if(tab){
        activeTab = tab.dataset.buddyTab || 'friends';
        render();
        return;
      }

      var more = e.target.closest && e.target.closest('[data-buddy-more]');
      if(more){
        app().toast('资料、申请处理和私聊会继续迁移到这里。');
      }
    });

    document.addEventListener('submit', function(e){
      var form = e.target.closest && e.target.closest('[data-buddy-search]');
      if(!form) return;
      e.preventDefault();
      search(form.q.value);
    });
  }

  function init(){ bind(); }
  function ensureLoaded(){ load(false); }

  window.FWAppBuddy = {init:init, load:load, ensureLoaded:ensureLoaded};
})();
