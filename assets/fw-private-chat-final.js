// F.w 研究所：私聊最终兜底修复
// 作用：拦截私聊发送，不再使用前端旧 conversation_id；改为传 target_user_id 给数据库，由数据库内部创建/读取真实会话。
(function(){
  if(window.__FW_PRIVATE_CHAT_FINAL__) return;
  window.__FW_PRIVATE_CHAT_FINAL__ = true;

  const $ = s => document.querySelector(s);

  let activeTargetId = '';
  let activeConversationId = null;
  let activeTimer = null;

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function hasLink(txt){
    return /(https?:\/\/|www\.|[a-z0-9][a-z0-9-]*\.(com|net|org|xyz|top|cn|cc|io|me|vip|club|site|info|online|shop|live|app)(\/|$|\s))/i.test(txt || '');
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

    clearTimeout(window.__fwPrivateFinalToast);
    window.__fwPrivateFinalToast = setTimeout(function(){
      t.classList.remove('show');
    }, 3000);
  }

  function waitForDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
        resolve(true);
        return;
      }

      let count = 0;

      const timer = setInterval(function(){
        count += 1;

        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){
          clearInterval(timer);
          resolve(true);
        }

        if(count > 120){
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  async function getMe(){
    if(!window.fwDb || !window.fwDb.enabled) return null;

    try{
      return await window.fwDb.getCurrentUser();
    }catch(e){
      return null;
    }
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

    (data || []).forEach(function(p){
      map[p.id] = p;
    });

    return map;
  }

  async function ensureConversation(){
    if(!activeTargetId) return null;

    const ok = await waitForDb();

    if(!ok){
      toast('数据库连接未就绪，请刷新页面后重试。');
      return null;
    }

    try{
      const {data, error} = await window.fwDb.client.rpc('fw_get_or_create_conversation', {
        target_user_id: activeTargetId
      });

      if(error) throw error;

      const convId = Number(data);

      if(!Number.isFinite(convId) || convId <= 0){
        throw new Error('私聊会话创建失败，请刷新后重试。');
      }

      activeConversationId = convId;
      return convId;

    }catch(err){
      toast(err.message || '私聊会话创建失败。');
      return null;
    }
  }

  async function loadMessages(){
    const box = $('[data-fw-private-messages]');

    if(!box) return;

    let convId = activeConversationId;

    if(!convId){
      convId = await ensureConversation();
    }

    if(!convId) return;

    try{
      const me = await getMe();

      const {data, error} = await window.fwDb.client
        .from('private_messages')
        .select('id,conversation_id,sender_id,content,is_deleted,created_at')
        .eq('conversation_id', convId)
        .eq('is_deleted', false)
        .order('created_at', {ascending: true})
        .limit(200);

      if(error) throw error;

      const profiles = await fetchProfiles((data || []).map(function(m){
        return m.sender_id;
      }));

      if(!data || !data.length){
        box.innerHTML = '<div class="fw-social-empty">还没有私聊消息。可以先低功耗地打个招呼。</div>';
        return;
      }

      box.innerHTML = data.map(function(m){
        const mine = me && m.sender_id === me.id;
        const p = profiles[m.sender_id] || {};

        return `
          <div class="fw-pm ${mine ? 'me' : ''}">
            <div class="fw-pm-name">${mine ? '你' : esc(p.nickname || '搭子')}</div>
            <div class="fw-pm-bubble">${esc(m.content)}</div>
          </div>
        `;
      }).join('');

      box.scrollTop = box.scrollHeight;

    }catch(err){
      box.innerHTML = '<div class="fw-social-empty">私聊读取失败。</div>';
    }
  }

  function rememberTargetFromClick(e){
    const start = e.target.closest('[data-fw-start-chat]');

    if(!start) return;

    const targetId = start.dataset.fwStartChat;

    if(!targetId) return;

    activeTargetId = targetId;
    activeConversationId = null;

    clearInterval(activeTimer);
    activeTimer = null;

    setTimeout(function(){
      ensureConversation().then(loadMessages);
    }, 600);

    setTimeout(function(){
      ensureConversation().then(loadMessages);
    }, 1400);

    activeTimer = setInterval(function(){
      if($('.fw-social-modal[data-fw-private-modal].show') || $('[data-fw-private-modal].show')){
        loadMessages();
      }
    }, 3500);
  }

  async function sendByTargetUser(form){
    if(!activeTargetId){
      toast('私聊对象丢失，请关闭窗口重新打开私聊。');
      return;
    }

    const ok = await waitForDb();

    if(!ok){
      toast('数据库连接未就绪，请刷新页面后重试。');
      return;
    }

    const input = form.querySelector('input[name="message"]');
    const text = (input && input.value ? input.value : '').trim();

    if(!text){
      if(input) input.focus();
      return;
    }

    if(text.length > 300){
      toast('私聊最多 300 字。');
      return;
    }

    if(hasLink(text)){
      toast('私聊第一版暂不支持链接。');
      return;
    }

    const btn = form.querySelector('button');
    const old = btn ? btn.textContent : '';

    if(btn){
      btn.disabled = true;
      btn.textContent = '发送中...';
    }

    try{
      const {data, error} = await window.fwDb.client.rpc('fw_send_private_message_to_user', {
        target_user_id: activeTargetId,
        message_text: text
      });

      if(error) throw error;

      const convId = Number(data);

      if(Number.isFinite(convId) && convId > 0){
        activeConversationId = convId;
      }

      if(input){
        input.value = '';
      }

      await loadMessages();

    }catch(err){
      toast(err.message || '发送失败。');
    }finally{
      if(btn){
        btn.disabled = false;
        btn.textContent = old || '发送';
      }
    }
  }

  document.addEventListener('click', function(e){
    rememberTargetFromClick(e);

    if(e.target.closest('[data-fw-chat-close]')){
      clearInterval(activeTimer);
      activeTimer = null;
      activeTargetId = '';
      activeConversationId = null;
    }
  }, true);

  document.addEventListener('submit', function(e){
    const form = e.target && e.target.closest && e.target.closest('[data-fw-private-form]');

    if(!form) return;

    e.preventDefault();
    e.stopPropagation();

    if(e.stopImmediatePropagation){
      e.stopImmediatePropagation();
    }

    sendByTargetUser(form);
  }, true);
})();
