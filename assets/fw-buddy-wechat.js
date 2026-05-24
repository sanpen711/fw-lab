// F.w 研究所：微信式搭子中心
// 目标：把“搭子列表”和“私聊”合并到一个左右分栏面板里。
(function(){
  if(window.__FW_BUDDY_WECHAT_CENTER__) return;
  window.__FW_BUDDY_WECHAT_CENTER__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  let me = null;
  let activeTab = 'friends';
  let activeTargetId = '';
  let activeConversationId = null;
  let chatTimer = null;
  let drag = null;

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[c]));
  }

  function ini(v){
    return String(v || 'FW').trim().slice(0, 2).toUpperCase();
  }

  function avatar(name, url, cls){
    const c = cls || 'fw-social-avatar';
    if(url){
      return `<span class="${c}"><img src="${esc(url)}" alt="${esc(name || '')}"></span>`;
    }
    return `<span class="${c}">${esc(ini(name))}</span>`;
  }

  function toast(msg){
    let t = $('.fw-toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'fw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__fwWechatBuddyToast);
    window.__fwWechatBuddyToast = setTimeout(() => t.classList.remove('show'), 3000);
  }

  function hasLink(txt){
    return /(https?:\/\/|www\.|[a-z0-9][a-z0-9-]*\.(com|net|org|xyz|top|cn|cc|io|me|vip|club|site|info|online|shop|live|app)(\/|$|\s))/i.test(txt || '');
  }

  function isMobile(){
    try{ return window.matchMedia && window.matchMedia('(max-width:760px)').matches; }
    catch(e){ return window.innerWidth <= 760; }
  }

  function isStickerPayload(text){
    return /^\[\[FW_USER_STICKER:[A-Za-z0-9+/=]+\]\]$/.test(String(text || '').trim());
  }

  function waitForDb(){
    return new Promise(resolve => {
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      let count = 0;
      const timer = setInterval(() => {
        count += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(timer); resolve(true); }
        if(count > 120){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  async function refreshMe(){
    try{
      if(!window.fwDb || !window.fwDb.enabled) return null;
      me = await window.fwDb.getCurrentUser();
      return me;
    }catch(e){
      me = null;
      return null;
    }
  }

  async function needLogin(){
    await refreshMe();
    if(me && !me.disabled) return true;
    const btn = $('[data-fw-open], [data-login-cta], [data-sb-open]');
    if(btn) btn.click(); else toast('请先注册 / 登录。');
    return false;
  }

  async function fetchProfiles(ids){
    const unique = Array.from(new Set((ids || []).filter(Boolean)));
    if(!unique.length) return {};
    const {data, error} = await window.fwDb.client
      .from('profiles')
      .select('id,nickname,avatar_url,lab_code')
      .in('id', unique);
    if(error) return {};
    const map = {};
    (data || []).forEach(p => map[p.id] = p);
    return map;
  }

  async function getFriendships(){
    const {data, error} = await window.fwDb.client
      .from('friendships')
      .select('id,requester_id,receiver_id,status,created_at,updated_at')
      .or(`requester_id.eq.${me.id},receiver_id.eq.${me.id}`)
      .order('updated_at', {ascending:false});
    if(error) throw error;
    const ids = [];
    (data || []).forEach(f => ids.push(f.requester_id, f.receiver_id));
    return {rows:data || [], profiles:await fetchProfiles(ids)};
  }

  function otherId(f){
    return f.requester_id === me.id ? f.receiver_id : f.requester_id;
  }

  function injectStyle(){
    if($('#fw-buddy-wechat-style')) return;
    const style = document.createElement('style');
    style.id = 'fw-buddy-wechat-style';
    style.textContent = `
      .fw-wx-back-list{display:none;}
      @media (min-width:761px){
        .fw-wx-modal{position:fixed;inset:0;z-index:10060;display:none;pointer-events:none;background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}
        .fw-wx-modal.show{display:block;}
        .fw-wx-panel{position:fixed;right:28px;top:88px;width:min(1060px,calc(100vw - 56px));height:min(720px,calc(100vh - 112px));min-width:760px;min-height:520px;background:#fffdf7;border:1px solid rgba(217,121,121,.42);box-shadow:0 24px 90px rgba(0,0,0,.3);display:grid;grid-template-rows:auto 1fr;pointer-events:auto;resize:both;overflow:hidden;}
        .fw-wx-head{height:88px;padding:22px 28px;border-bottom:1px solid rgba(28,28,24,.12);display:flex;align-items:center;justify-content:space-between;cursor:move;user-select:none;background:#fffdf7;}
        .fw-wx-title small{display:block;color:#d97979;font-size:13px;font-weight:1000;letter-spacing:.18em;margin-bottom:6px;}
        .fw-wx-title h2{margin:0;font-size:34px;line-height:1;color:#1d1d1a;font-weight:1000;}
        .fw-wx-tools{display:flex;align-items:center;gap:10px;}
        .fw-wx-tool,.fw-wx-close{border:1px solid rgba(28,28,24,.15);background:#fffdf7;border-radius:999px;min-width:34px;height:34px;padding:0 12px;font-size:13px;font-weight:1000;cursor:pointer;}
        .fw-wx-close{font-size:24px;border:none;background:transparent;padding:0 2px;}
        .fw-wx-shell{min-height:0;display:grid;grid-template-columns:320px 1fr;background:#f7f2e8;}
        .fw-wx-left{min-width:0;border-right:1px solid rgba(28,28,24,.12);background:#f3efe6;display:grid;grid-template-rows:auto auto 1fr;}
        .fw-wx-search{padding:16px;border-bottom:1px solid rgba(28,28,24,.08);}
        .fw-wx-search form{display:grid;grid-template-columns:1fr auto;gap:8px;}
        .fw-wx-search input{height:42px;border:1px solid rgba(28,28,24,.18);background:#fffdf7;padding:0 12px;font-weight:800;outline:none;}
        .fw-wx-search button{border:none;background:#1b1b18;color:#fff;border-radius:999px;padding:0 14px;font-weight:1000;cursor:pointer;}
        .fw-wx-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:14px 16px;border-bottom:1px solid rgba(28,28,24,.08);}
        .fw-wx-tab{height:36px;border:1px solid rgba(28,28,24,.14);background:#fffdf7;border-radius:999px;font-weight:1000;cursor:pointer;}
        .fw-wx-tab.active{background:#1b1b18;color:#fff;border-color:#1b1b18;}
        .fw-wx-list{min-height:0;overflow:auto;padding:10px 10px 18px;}
        .fw-wx-item{display:grid;grid-template-columns:44px 1fr;gap:10px;align-items:center;padding:12px;border-radius:14px;cursor:pointer;border:1px solid transparent;}
        .fw-wx-item:hover{background:#fffdf7;border-color:rgba(217,121,121,.28);}
        .fw-wx-item.active{background:#fffdf7;border-color:rgba(217,121,121,.65);box-shadow:0 8px 20px rgba(0,0,0,.05);}
        .fw-wx-avatar{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:#1b1b18;color:#fff;font-weight:1000;font-size:12px;}
        .fw-wx-avatar img{width:100%;height:100%;object-fit:cover;}
        .fw-wx-name{font-weight:1000;color:#1d1d1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .fw-wx-sub{font-size:12px;color:#77736b;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:800;}
        .fw-wx-right{min-width:0;display:grid;grid-template-rows:auto 1fr auto;background:#fffaf1;}
        .fw-wx-chat-head{height:70px;padding:0 22px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(28,28,24,.1);background:#fffdf7;}
        .fw-wx-chat-head h3{margin:0;font-size:24px;color:#1d1d1a;font-weight:1000;}
        .fw-wx-chat-head span{font-size:12px;color:#9d4a4a;font-weight:900;}
        .fw-wx-messages{min-height:0;overflow:auto;padding:22px;background-image:linear-gradient(rgba(42,42,35,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(42,42,35,.045) 1px,transparent 1px);background-size:28px 28px;}
        .fw-wx-empty{border:1px dashed rgba(28,28,24,.2);background:rgba(255,253,247,.72);padding:18px;color:#77736b;font-weight:900;}
        .fw-wx-pm{margin:0 0 18px;max-width:72%;}
        .fw-wx-pm.me{margin-left:auto;text-align:right;}
        .fw-wx-pm-name{font-size:12px;color:#9d4a4a;font-weight:1000;margin-bottom:6px;}
        .fw-wx-pm-bubble{display:inline-block;text-align:left;background:#fffdf7;border-radius:14px;padding:13px 16px;box-shadow:0 1px 0 rgba(28,28,24,.08);font-weight:900;color:#1d1d1a;word-break:break-word;}
        .fw-wx-pm.me .fw-wx-pm-bubble{background:#df7676;color:#fff;}
        .fw-wx-compose{display:grid;grid-template-columns:1fr auto;gap:12px;padding:16px;border-top:1px solid rgba(28,28,24,.1);background:#fffdf7;}
        .fw-wx-compose input{height:48px;border:1px solid rgba(28,28,24,.18);background:#fffdf7;padding:0 14px;font-weight:900;outline:none;}
        .fw-wx-compose button{height:52px;min-width:82px;border:none;border-radius:999px;background:#1b1b18;color:#fff;font-weight:1000;cursor:pointer;}
        .fw-wx-search-result{padding:10px;}
        .fw-wx-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}
        .fw-wx-mini{border:1px solid rgba(28,28,24,.14);background:#fffdf7;border-radius:999px;padding:7px 12px;font-size:12px;font-weight:1000;cursor:pointer;}
        .fw-wx-mini.dark{background:#1b1b18;color:#fff;border-color:#1b1b18;}
        .fw-wx-mini.danger{color:#b35353;border-color:rgba(179,83,83,.35);}
      }
      @media (max-width:760px){.fw-wx-modal{display:none!important;}}
    `;
    document.head.appendChild(style);
  }

  function ensureHub(){
    let modal = $('[data-fw-wx-buddy-modal]');
    if(modal) return modal;
    modal = document.createElement('div');
    modal.className = 'fw-wx-modal';
    modal.dataset.fwWxBuddyModal = '1';
    modal.innerHTML = `
      <div class="fw-wx-panel" data-fw-wx-panel>
        <header class="fw-wx-head">
          <div class="fw-wx-title"><small>BUDDY CENTER</small><h2>搭子中心</h2></div>
          <div class="fw-wx-tools"><button class="fw-wx-tool" data-fw-wx-reset type="button">复位</button><button class="fw-wx-close" data-fw-wx-close type="button">×</button></div>
        </header>
        <div class="fw-wx-shell">
          <aside class="fw-wx-left">
            <div class="fw-wx-search"><form data-fw-wx-search><input name="q" placeholder="搜索实验品编号 / 昵称 / 完整邮箱"><button type="submit">搜索</button></form></div>
            <div class="fw-wx-tabs"><button class="fw-wx-tab active" data-fw-wx-tab="friends">我的搭子</button><button class="fw-wx-tab" data-fw-wx-tab="incoming">收到申请</button><button class="fw-wx-tab" data-fw-wx-tab="outgoing">发出申请</button></div>
            <div class="fw-wx-list" data-fw-wx-list></div>
          </aside>
          <section class="fw-wx-right">
            <div class="fw-wx-chat-head"><div><button class="fw-wx-back-list" data-fw-wx-back-list type="button">← 返回搭子列表</button><h3 data-fw-wx-chat-title>选择一个搭子</h3><span data-fw-wx-chat-sub>左侧点一个搭子，右侧开始低功耗私聊。</span></div></div>
            <div class="fw-wx-messages" data-fw-wx-messages><div class="fw-wx-empty">还没有选择聊天对象。</div></div>
            <form class="fw-wx-compose" data-fw-wx-compose><input name="message" maxlength="300" autocomplete="off" placeholder="说一句只给搭子看的话，最多 300 字..."><button type="submit">发送</button></form>
          </section>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function openHub(){
    const modal = ensureHub();
    const panel = $('[data-fw-wx-panel]');
    modal.classList.add('show');
    modal.classList.remove('fw-wx-mobile-chatting');
    document.body.classList.add('fw-wx-modal-open');
    if(panel){
      panel.style.right = '28px';
      panel.style.top = '88px';
      panel.style.left = 'auto';
      panel.style.bottom = 'auto';
      panel.style.width = 'min(1060px, calc(100vw - 56px))';
      panel.style.height = 'min(720px, calc(100vh - 112px))';
    }
    return modal;
  }

  function setTabs(){
    $$('[data-fw-wx-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.fwWxTab === activeTab));
  }

  function renderRows(rows, profiles){
    const list = $('[data-fw-wx-list]');
    if(!list) return;
    if(!rows.length){
      list.innerHTML = `<div class="fw-wx-empty">${activeTab === 'friends' ? '暂时还没有搭子。可以先搜索实验品。' : activeTab === 'incoming' ? '暂无收到的搭子申请。' : '暂无发出的搭子申请。'}</div>`;
      return;
    }
    list.innerHTML = rows.map(f => {
      const oid = otherId(f);
      const p = profiles[oid] || {};
      const name = p.nickname || '低功耗研究员';
      const incoming = f.receiver_id === me.id && f.status === 'pending';
      const outgoing = f.requester_id === me.id && f.status === 'pending';
      const accepted = f.status === 'accepted';
      let sub = accepted ? '点击进入私聊' : incoming ? '对方想加你为搭子' : outgoing ? '等待对方低功耗处理' : '关系已失效';
      let actions = '';
      if(incoming){
        actions = `<div class="fw-wx-actions"><button class="fw-wx-mini dark" data-fw-wx-accept="${f.id}">同意</button><button class="fw-wx-mini danger" data-fw-wx-reject="${f.id}">拒绝</button></div>`;
      }else if(outgoing){
        actions = `<div class="fw-wx-actions"><button class="fw-wx-mini danger" data-fw-wx-remove="${f.id}">撤回</button></div>`;
      }else if(accepted){
        actions = `<div class="fw-wx-actions"><button class="fw-wx-mini danger" data-fw-wx-remove="${f.id}">解除</button></div>`;
      }
      return `<div class="fw-wx-item ${activeTargetId === oid ? 'active' : ''}" data-fw-wx-chat-user="${esc(oid)}">
        ${avatar(name, p.avatar_url, 'fw-wx-avatar')}
        <div><div class="fw-wx-name">${esc(name)}</div><div class="fw-wx-sub">实验品编号：${esc(p.lab_code || '未设置')} · ${esc(sub)}</div>${actions}</div>
      </div>`;
    }).join('');
  }

  async function loadBuddyList(selectId){
    if(!(await waitForDb()) || !(await needLogin())) return;
    openHub();
    setTabs();
    const list = $('[data-fw-wx-list]');
    if(list) list.innerHTML = '<div class="fw-wx-empty">正在读取搭子列表...</div>';
    try{
      const {rows, profiles} = await getFriendships();
      const accepted = rows.filter(f => f.status === 'accepted');
      const incoming = rows.filter(f => f.status === 'pending' && f.receiver_id === me.id);
      const outgoing = rows.filter(f => f.status === 'pending' && f.requester_id === me.id);
      let show = accepted;
      if(activeTab === 'incoming') show = incoming;
      if(activeTab === 'outgoing') show = outgoing;
      renderRows(show, profiles);
      if(selectId){ await selectChat(selectId); }
    }catch(e){
      if(list) list.innerHTML = `<div class="fw-wx-empty">搭子读取失败：${esc(e.message || '请稍后重试。')}</div>`;
    }
  }

  async function selectChat(targetId){
    if(!targetId) return;
    activeTargetId = targetId;
    activeTab = 'friends';
    setTabs();
    $$('.fw-wx-item').forEach(x => x.classList.toggle('active', x.dataset.fwWxChatUser === targetId));
    const title = $('[data-fw-wx-chat-title]');
    const sub = $('[data-fw-wx-chat-sub]');
    const box = $('[data-fw-wx-messages]');
    if(box) box.innerHTML = '<div class="fw-wx-empty">正在打开私聊...</div>';
    try{
      const profiles = await fetchProfiles([targetId]);
      const p = profiles[targetId] || {};
      if(title) title.textContent = '和 ' + (p.nickname || '摸鱼搭子') + ' 私聊';
      if(sub) sub.textContent = p.lab_code ? '实验品编号：' + p.lab_code : '实验品编号：未设置';
      const {data, error} = await window.fwDb.client.rpc('fw_get_or_create_conversation', {target_user_id:targetId});
      if(error) throw error;
      const convId = Number(data);
      if(!Number.isFinite(convId) || convId <= 0) throw new Error('私聊会话创建失败。');
      activeConversationId = convId;
      if(isMobile()){
        $('.fw-wx-modal')?.classList.add('fw-wx-mobile-chatting');
      }
      await loadMessages();
      clearInterval(chatTimer);
      chatTimer = setInterval(() => {
        if($('.fw-wx-modal.show')) loadMessages();
      }, 4500);
      if(!isMobile()){
        $('[data-fw-wx-compose] input')?.focus();
      }
    }catch(e){
      if(box) box.innerHTML = `<div class="fw-wx-empty">私聊打开失败：${esc(e.message || '请稍后重试。')}</div>`;
    }
  }

  async function loadMessages(){
    const box = $('[data-fw-wx-messages]');
    if(!box || !activeConversationId) return;
    try{
      const {data, error} = await window.fwDb.client
        .from('private_messages')
        .select('id,conversation_id,sender_id,content,is_deleted,created_at')
        .eq('conversation_id', activeConversationId)
        .eq('is_deleted', false)
        .order('created_at', {ascending:true})
        .limit(200);
      if(error) throw error;
      const profiles = await fetchProfiles((data || []).map(m => m.sender_id));
      if(!data || !data.length){
        box.innerHTML = '<div class="fw-wx-empty">还没有私聊消息。可以先低功耗地打个招呼。</div>';
        return;
      }
      box.innerHTML = data.map(m => {
        const mine = me && m.sender_id === me.id;
        const p = profiles[m.sender_id] || {};
        return `<div class="fw-wx-pm ${mine ? 'me' : ''}"><div class="fw-wx-pm-name">${mine ? '你' : esc(p.nickname || '搭子')}</div><div class="fw-wx-pm-bubble">${esc(m.content)}</div></div>`;
      }).join('');
      if(typeof window.fwRenderStickerMessages === 'function') window.fwRenderStickerMessages();
      box.scrollTop = box.scrollHeight;
    }catch(e){
      box.innerHTML = '<div class="fw-wx-empty">私聊读取失败。</div>';
    }
  }

  async function sendMessage(form){
    if(!activeTargetId){ toast('先在左侧选择一个搭子。'); return; }
    const input = form.querySelector('input[name="message"]');
    const text = (input.value || '').trim();
    if(!text){ input.focus(); return; }
    const stickerPayload = isStickerPayload(text);
    if(!stickerPayload && text.length > 300){ toast('私聊最多 300 字。'); return; }
    if(!stickerPayload && hasLink(text)){ toast('私聊第一版暂不支持链接。'); return; }
    const btn = form.querySelector('button');
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '发送中...';
    try{
      const {data, error} = await window.fwDb.client.rpc('fw_send_private_message_to_user', {target_user_id:activeTargetId, message_text:text});
      if(error) throw error;
      const convId = Number(data);
      if(Number.isFinite(convId) && convId > 0) activeConversationId = convId;
      input.value = '';
      await loadMessages();
    }catch(e){
      toast(e.message || '发送失败。');
    }finally{
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  async function renderSearch(q){
    const list = $('[data-fw-wx-list]');
    if(!list) return;
    const keyword = String(q || '').trim();
    if(keyword.length < 2){ toast('至少输入 2 个字符；邮箱需要输入完整邮箱。'); return; }
    list.innerHTML = '<div class="fw-wx-empty">正在搜索实验品...</div>';
    try{
      const {data, error} = await window.fwDb.client.rpc('fw_search_profiles', {search_text:keyword});
      if(error) throw error;
      const rows = data || [];
      if(!rows.length){ list.innerHTML = '<div class="fw-wx-empty">没有找到对应实验品。</div>'; return; }
      const html = [];
      for(const p of rows){
        const {data:frows} = await window.fwDb.client
          .from('friendships')
          .select('id,requester_id,receiver_id,status')
          .or(`and(requester_id.eq.${me.id},receiver_id.eq.${p.id}),and(requester_id.eq.${p.id},receiver_id.eq.${me.id})`)
          .limit(1);
        const f = (frows || [])[0];
        let actions = `<button class="fw-wx-mini dark" data-fw-wx-add="${esc(p.id)}">加为搭子</button>`;
        let sub = '可以发送搭子申请';
        if(f && f.status === 'accepted'){
          actions = `<button class="fw-wx-mini dark" data-fw-wx-chat-direct="${esc(p.id)}">打开私聊</button>`;
          sub = '已是搭子';
        }else if(f && f.status === 'pending' && f.requester_id === me.id){
          actions = '<button class="fw-wx-mini" disabled>等待处理</button>';
          sub = '申请已发出';
        }else if(f && f.status === 'pending' && f.receiver_id === me.id){
          actions = `<button class="fw-wx-mini dark" data-fw-wx-accept="${f.id}">同意</button><button class="fw-wx-mini danger" data-fw-wx-reject="${f.id}">拒绝</button>`;
          sub = '对方想加你为搭子';
        }
        html.push(`<div class="fw-wx-item"><span>${avatar(p.nickname, p.avatar_url, 'fw-wx-avatar')}</span><div><div class="fw-wx-name">${esc(p.nickname || '低功耗研究员')}</div><div class="fw-wx-sub">实验品编号：${esc(p.lab_code || '未设置')} · ${esc(sub)}</div><div class="fw-wx-actions">${actions}</div></div></div>`);
      }
      list.innerHTML = html.join('');
    }catch(e){
      list.innerHTML = '<div class="fw-wx-empty">搜索失败。</div>';
    }
  }

  async function rpc(name, args){
    const {error} = await window.fwDb.client.rpc(name, args);
    if(error) throw error;
  }

  function startDrag(e){
    if(isMobile()) return;
    const head = e.target.closest('.fw-wx-head');
    if(!head) return;
    if(e.target.closest('button,input,textarea,a,select')) return;
    const panel = $('[data-fw-wx-panel]');
    if(!panel) return;
    const rect = panel.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    drag = {panel,startX:p.clientX,startY:p.clientY,left:rect.left,top:rect.top,width:rect.width,height:rect.height};
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  function moveDrag(e){
    if(isMobile()) return;
    if(!drag) return;
    const p = e.touches ? e.touches[0] : e;
    const dx = p.clientX - drag.startX;
    const dy = p.clientY - drag.startY;
    drag.panel.style.left = drag.left + dx + 'px';
    drag.panel.style.top = drag.top + dy + 'px';
    drag.panel.style.right = 'auto';
    drag.panel.style.bottom = 'auto';
  }

  function endDrag(){
    drag = null;
    document.body.style.userSelect = '';
  }

  async function openBuddyCenter(selectId){
    if(!(await waitForDb()) || !(await needLogin())) return;
    openHub();
    await loadBuddyList(selectId || '');
  }

  window.FWMobileActions = window.FWMobileActions || {};
  window.FWMobileActions.openBuddy = function(){
    openBuddyCenter('');
    return true;
  };

  function intercept(e){
    const buddyBtn = e.target.closest('[data-fw-open-buddy]');
    const startChat = e.target.closest('[data-fw-start-chat], [data-fw-dual-chat]');
    if(!buddyBtn && !startChat) return;
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    const id = startChat ? (startChat.dataset.fwStartChat || startChat.dataset.fwDualChat || '') : '';
    openBuddyCenter(id);
  }

  function bind(){
    window.addEventListener('click', intercept, true);

    window.addEventListener('click', async e => {
      const close = e.target.closest('[data-fw-wx-close]');
      if(close){
        $('.fw-wx-modal')?.classList.remove('show');
        $('.fw-wx-modal')?.classList.remove('fw-wx-mobile-chatting');
        document.body.classList.remove('fw-wx-modal-open');
        clearInterval(chatTimer);
        chatTimer = null;
        return;
      }
      const backList = e.target.closest('[data-fw-wx-back-list]');
      if(backList){
        const modal = $('.fw-wx-modal');
        if(modal) modal.classList.remove('fw-wx-mobile-chatting');
        activeTargetId = '';
        activeConversationId = null;
        clearInterval(chatTimer);
        chatTimer = null;
        $$('.fw-wx-item').forEach(x => x.classList.remove('active'));
        const title = $('[data-fw-wx-chat-title]');
        const sub = $('[data-fw-wx-chat-sub]');
        const box = $('[data-fw-wx-messages]');
        if(title) title.textContent = '选择一个搭子';
        if(sub) sub.textContent = '左侧点一个搭子，右侧开始低功耗私聊。';
        if(box) box.innerHTML = '<div class="fw-wx-empty">还没有选择聊天对象。</div>';
        return;
      }
      const reset = e.target.closest('[data-fw-wx-reset]');
      if(reset){ openHub(); return; }
      const tab = e.target.closest('[data-fw-wx-tab]');
      if(tab){ activeTab = tab.dataset.fwWxTab || 'friends'; activeTargetId = ''; activeConversationId = null; loadBuddyList(); return; }
      const item = e.target.closest('[data-fw-wx-chat-user]');
      if(item && !e.target.closest('button')){ selectChat(item.dataset.fwWxChatUser); return; }
      const direct = e.target.closest('[data-fw-wx-chat-direct]');
      if(direct){ selectChat(direct.dataset.fwWxChatDirect); return; }
      const add = e.target.closest('[data-fw-wx-add]');
      if(add){ try{ await rpc('fw_send_friend_request', {target_user_id:add.dataset.fwWxAdd}); toast('搭子申请已发出。'); loadBuddyList(); }catch(err){ toast(err.message || '发送申请失败。'); } return; }
      const accept = e.target.closest('[data-fw-wx-accept]');
      if(accept){ try{ await rpc('fw_respond_friendship', {target_friendship_id:Number(accept.dataset.fwWxAccept), accept_request:true}); toast('已同意搭子申请。'); activeTab='friends'; loadBuddyList(); }catch(err){ toast(err.message || '处理失败。'); } return; }
      const reject = e.target.closest('[data-fw-wx-reject]');
      if(reject){ try{ await rpc('fw_respond_friendship', {target_friendship_id:Number(reject.dataset.fwWxReject), accept_request:false}); toast('已拒绝搭子申请。'); activeTab='incoming'; loadBuddyList(); }catch(err){ toast(err.message || '处理失败。'); } return; }
      const remove = e.target.closest('[data-fw-wx-remove]');
      if(remove){ try{ await rpc('fw_remove_friendship', {target_friendship_id:Number(remove.dataset.fwWxRemove)}); toast('已处理搭子关系。'); loadBuddyList(); }catch(err){ toast(err.message || '操作失败。'); } return; }
    }, true);

    window.addEventListener('submit', e => {
      const search = e.target.closest('[data-fw-wx-search]');
      if(search){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        renderSearch(search.querySelector('input[name="q"]')?.value || '');
        return;
      }
      const compose = e.target.closest('[data-fw-wx-compose]');
      if(compose){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        sendMessage(compose);
      }
    }, true);

    document.addEventListener('mousedown', startDrag, true);
    document.addEventListener('touchstart', startDrag, {capture:true, passive:false});
    document.addEventListener('mousemove', moveDrag, true);
    document.addEventListener('touchmove', moveDrag, {capture:true, passive:false});
    document.addEventListener('mouseup', endDrag, true);
    document.addEventListener('touchend', endDrag, true);
  }

  function boot(){
    injectStyle();
    bind();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
