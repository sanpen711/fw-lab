// F.w 研究所：首页介绍弹窗 + 退出后默认回首页
(function(){
  if(window.__FW_HOME_INTRO__) return;
  window.__FW_HOME_INTRO__ = true;

  var SEEN_KEY = 'fw_home_intro_seen_v1';
  var FORCE_KEY = 'fw_force_home_intro_v1';

  function isHome(){
    var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    return page === '' || page === 'index.html';
  }

  function homeUrl(){
    return location.origin + location.pathname.replace(/[^/]*$/, 'index.html');
  }

  function waitDb(){
    return new Promise(function(resolve){
      if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ resolve(true); return; }
      var n = 0;
      var timer = setInterval(function(){
        n += 1;
        if(window.fwDb && window.fwDb.enabled && window.fwDb.client){ clearInterval(timer); resolve(true); }
        if(n > 50){ clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  async function logoutToHome(btn){
    if(btn){ btn.disabled = true; btn.textContent = '正在退出...'; }
    try{
      await waitDb();
      if(window.fwDb && window.fwDb.client && window.fwDb.client.auth){
        await window.fwDb.client.auth.signOut({scope:'local'}).catch(function(){});
        await window.fwDb.client.auth.signOut().catch(function(){});
      }
    }catch(e){}

    try{
      Object.keys(localStorage).forEach(function(k){
        if(/^sb-|supabase|fw_register_state/i.test(k)) localStorage.removeItem(k);
      });
      Object.keys(sessionStorage).forEach(function(k){
        if(/^sb-|supabase|fw_register_state/i.test(k)) sessionStorage.removeItem(k);
      });
      sessionStorage.setItem(FORCE_KEY, '1');
    }catch(e){}

    location.href = homeUrl() + '?logout=' + Date.now();
  }

  function bindLogout(){
    window.addEventListener('click', function(e){
      var btn = e.target.closest && e.target.closest('[data-sb-logout]');
      if(!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      logoutToHome(btn);
    }, true);
  }

  function injectStyle(){
    if(document.getElementById('fw-home-intro-style')) return;
    var style = document.createElement('style');
    style.id = 'fw-home-intro-style';
    style.textContent = '.fw-home-intro-modal{position:fixed;inset:0;z-index:10450;display:none;align-items:center;justify-content:center;padding:22px;background:rgba(5,8,6,.72);backdrop-filter:blur(8px)}.fw-home-intro-modal.show{display:flex}.fw-home-intro-card{width:min(720px,100%);max-height:min(86vh,720px);overflow:auto;background:#fffdf7;color:#171715;border:1px solid rgba(217,121,121,.45);box-shadow:0 32px 110px rgba(0,0,0,.34)}.fw-home-intro-head{padding:28px 30px 18px;border-bottom:1px solid rgba(23,23,21,.12);background:linear-gradient(135deg,#171715,#263426);color:#fffdf7}.fw-home-intro-kicker{display:block;margin-bottom:10px;color:#d97979;font-size:12px;font-weight:1000;letter-spacing:.16em}.fw-home-intro-head h2{margin:0;font-size:42px;line-height:.98;letter-spacing:-.07em}.fw-home-intro-body{padding:24px 30px 28px;display:grid;gap:18px}.fw-home-intro-body p{margin:0;color:#4f4a42;font-size:15px;line-height:1.85;font-weight:760}.fw-home-intro-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.fw-home-intro-grid article{border:1px solid rgba(23,23,21,.12);background:rgba(245,241,232,.72);padding:14px}.fw-home-intro-grid b{display:block;margin-bottom:7px;font-size:15px;color:#171715}.fw-home-intro-grid span{display:block;color:#746b5d;font-size:13px;line-height:1.55;font-weight:780}.fw-home-intro-statement{border:1px solid rgba(217,121,121,.48);background:rgba(217,121,121,.08);padding:16px 18px}.fw-home-intro-statement h3{margin:0 0 8px;font-size:20px;letter-spacing:-.035em;color:#8f3636}.fw-home-intro-statement p{color:#503d38;font-weight:850}.fw-home-intro-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;padding-top:4px}.fw-home-intro-actions button,.fw-home-intro-actions a{min-height:42px;border-radius:999px;border:1px solid rgba(23,23,21,.18);padding:0 18px;font-weight:1000;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.fw-home-intro-primary{background:#171715;color:#fffdf7;border-color:#171715!important}.fw-home-intro-secondary{background:#fffdf7;color:#171715}@media(max-width:720px){.fw-home-intro-head h2{font-size:34px}.fw-home-intro-grid{grid-template-columns:1fr}.fw-home-intro-card{max-height:88vh}.fw-home-intro-head,.fw-home-intro-body{padding-left:20px;padding-right:20px}.fw-home-intro-actions{justify-content:stretch}.fw-home-intro-actions button,.fw-home-intro-actions a{width:100%}}';
    document.head.appendChild(style);
  }

  function shouldShow(){
    if(!isHome()) return false;
    try{
      if(sessionStorage.getItem(FORCE_KEY) === '1') return true;
      return sessionStorage.getItem(SEEN_KEY) !== '1';
    }catch(e){ return true; }
  }

  function closeIntro(modal){
    modal.classList.remove('show');
    try{
      sessionStorage.setItem(SEEN_KEY, '1');
      sessionStorage.removeItem(FORCE_KEY);
    }catch(e){}
  }

  function showIntro(){
    if(!shouldShow()) return;
    injectStyle();
    var modal = document.createElement('div');
    modal.className = 'fw-home-intro-modal';
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.innerHTML = '<section class="fw-home-intro-card"><header class="fw-home-intro-head"><span class="fw-home-intro-kicker">FW LAB / BEFORE ENTERING</span><h2>欢迎来到 F.w 研究所</h2></header><div class="fw-home-intro-body"><p>这里是一个给上班族、学生党和低功耗人类临时喘口气的休闲交流区。你可以发牢骚、讲废话、找搭子、围观别人的精神状态，也可以只是把今天不想处理的情绪先放在这里。</p><div class="fw-home-intro-grid"><article><b>可以放松</b><span>不要求积极向上，也不要求句句有用。这里允许你短暂低功耗运行。</span></article><article><b>可以交流</b><span>帖子、评论、回声和搭子功能，都是为了让大家轻松互动。</span></article><article><b>但要有边界</b><span>匿名不是免责任，情绪可以表达，攻击、骚扰和违法内容不可以。</span></article></div><div class="fw-home-intro-statement"><h3>使用声明</h3><p>本网站是休闲娱乐与日常交流平台。未采用实名展示，是为了降低表达压力，让大家可以更自然地发言和评论；但这里是交流区、评论区，不是无人区。请对自己的言论负责。对于被多次举报、恶意攻击、骚扰他人或破坏交流秩序的内容与账号，平台将视情况进行删帖、禁言或封号处理；如出现过激言论，或涉及色情、赌博、毒品、暴力、诈骗等违法违规内容，平台将保留证据，并依法提交相关部门处理。</p></div><div class="fw-home-intro-actions"><a class="fw-home-intro-secondary" href="rules.html">查看入馆须知</a><button class="fw-home-intro-primary" type="button" data-fw-home-intro-ok>我知道了，进入研究所</button></div></div></section>';
    document.body.appendChild(modal);
    requestAnimationFrame(function(){ modal.classList.add('show'); });
    modal.addEventListener('click', function(e){
      if(e.target === modal || e.target.closest('[data-fw-home-intro-ok]')) closeIntro(modal);
    });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && modal.classList.contains('show')) closeIntro(modal);
    });
  }

  function boot(){
    bindLogout();
    setTimeout(showIntro, 320);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
