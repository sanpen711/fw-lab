// F.w 研究所：注册声明点击查看补丁
// 只处理注册页里的《F.w研究所声明》，不改登录、不改验证码、不改资料保存。
(function(){
  if(window.__FW_REGISTER_DISCLAIMER_LINK__) return;
  window.__FW_REGISTER_DISCLAIMER_LINK__ = true;

  function $(s){
    return document.querySelector(s);
  }

  function injectStyle(){
    if($('#fw-register-disclaimer-link-style')) return;

    var style = document.createElement('style');
    style.id = 'fw-register-disclaimer-link-style';
    style.textContent = `
      .fw-disclaimer-text{
        cursor:pointer;
      }

      .fw-disclaimer-text .fw-disclaimer-open-text{
        color:#9d3d3d;
        text-decoration:underline;
        text-underline-offset:3px;
        font-weight:1000;
      }

      .fw-register-statement-modal{
        position:fixed;
        inset:0;
        z-index:10880;
        display:none;
        align-items:center;
        justify-content:center;
        padding:22px;
        background:rgba(5,8,6,.72);
        backdrop-filter:blur(8px);
      }

      .fw-register-statement-modal.show{
        display:flex;
      }

      .fw-register-statement-card{
        width:min(680px,100%);
        max-height:min(82vh,720px);
        overflow:auto;
        background:#fffdf7;
        color:#171715;
        border:1px solid rgba(217,121,121,.45);
        box-shadow:0 32px 110px rgba(0,0,0,.34);
      }

      .fw-register-statement-head{
        padding:24px 28px 16px;
        border-bottom:1px solid rgba(23,23,21,.12);
        background:linear-gradient(135deg,#171715,#263426);
        color:#fffdf7;
      }

      .fw-register-statement-kicker{
        display:block;
        margin-bottom:8px;
        color:#d97979;
        font-size:12px;
        font-weight:1000;
        letter-spacing:.16em;
      }

      .fw-register-statement-head h2{
        margin:0;
        font-size:36px;
        line-height:1;
        letter-spacing:-.06em;
      }

      .fw-register-statement-body{
        padding:22px 28px 26px;
      }

      .fw-register-statement-body p{
        margin:0 0 14px;
        color:#4f4a42;
        font-size:15px;
        line-height:1.85;
        font-weight:760;
      }

      .fw-register-statement-body h3{
        margin:18px 0 8px;
        color:#8f3636;
        font-size:20px;
        letter-spacing:-.035em;
      }

      .fw-register-statement-list{
        margin:0;
        padding-left:20px;
        color:#503d38;
        font-weight:820;
        line-height:1.8;
      }

      .fw-register-statement-actions{
        display:flex;
        justify-content:flex-end;
        gap:10px;
        margin-top:20px;
      }

      .fw-register-statement-actions button,
      .fw-register-statement-actions a{
        min-height:42px;
        border-radius:999px;
        border:1px solid rgba(23,23,21,.18);
        padding:0 20px;
        font-weight:1000;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        color:#171715;
        text-decoration:none;
      }

      .fw-register-statement-ok{
        background:#171715;
        color:#fffdf7;
        border-color:#171715!important;
      }

      @media(max-width:720px){
        .fw-register-statement-card{
          max-height:86vh;
        }

        .fw-register-statement-head,
        .fw-register-statement-body{
          padding-left:20px;
          padding-right:20px;
        }

        .fw-register-statement-head h2{
          font-size:30px;
        }

        .fw-register-statement-actions button{
          width:100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureModal(){
    var modal = $('#fw-register-statement-modal');

    if(modal) return modal;

    modal = document.createElement('div');
    modal.id = 'fw-register-statement-modal';
    modal.className = 'fw-register-statement-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <section class="fw-register-statement-card">
        <header class="fw-register-statement-head">
          <span class="fw-register-statement-kicker">FW LAB / STATEMENT</span>
          <h2>F.w研究所声明</h2>
        </header>

        <div class="fw-register-statement-body">
          <p>
            F.w研究所是一个休闲娱乐与日常交流平台。这里允许大家发牢骚、讲废话、找共鸣、找搭子，
            也允许你在低功耗状态下短暂放松。
          </p>

          <p>
            网站未采用实名展示，是为了降低表达压力，让大家可以更自然地发言和评论；
            但这里是交流区、评论区，不是无人区。匿名不代表可以不负责。
          </p>

          <h3>请注意以下边界</h3>
          <ul class="fw-register-statement-list">
            <li>可以表达情绪，但不要攻击、辱骂、骚扰他人。</li>
            <li>可以开玩笑，但不要发布恶意引战、刷屏或破坏交流秩序的内容。</li>
            <li>不得发布涉及色情、赌博、毒品、暴力、诈骗等违法违规内容。</li>
            <li>针对多次被举报或明显违规的内容，平台会进行删帖、禁言或封号处理。</li>
            <li>针对严重违法违规内容，平台将保留证据，并依法提交相关部门处理。</li>
          </ul>

          <p style="margin-top:16px">
            注册时会收集邮箱、实验品编号和账号资料，用于登录、找回密码与提供站内互动功能。
            具体处理方式、保存范围和账号删除说明请查看隐私政策。
          </p>

          <div class="fw-register-statement-actions">
            <a href="rules.html" target="_blank" rel="noopener">查看用户规则</a>
            <a href="privacy.html" target="_blank" rel="noopener">查看隐私政策</a>
            <button type="button" class="fw-register-statement-ok" data-fw-register-statement-close>
              我知道了
            </button>
          </div>
        </div>
      </section>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', function(e){
      if(e.target === modal || e.target.closest('[data-fw-register-statement-close]')){
        closeModal();
      }
    });

    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && modal.classList.contains('show')){
        closeModal();
      }
    });

    return modal;
  }

  function openModal(){
    injectStyle();
    ensureModal().classList.add('show');
  }

  function closeModal(){
    var modal = $('#fw-register-statement-modal');

    if(modal){
      modal.classList.remove('show');
    }
  }

  function enhanceText(){
    document.querySelectorAll('.fw-disclaimer-text').forEach(function(el){
      if(el.dataset.fwDisclaimerEnhanced === '1') return;

      el.dataset.fwDisclaimerEnhanced = '1';
      el.innerHTML = '我已阅读并同意 <span class="fw-disclaimer-open-text">《用户规则与隐私政策》</span>';
      el.setAttribute('title', '点击查看用户规则与隐私政策');
    });
  }

  function bind(){
    window.addEventListener('click', function(e){
      var text = e.target.closest && e.target.closest('.fw-disclaimer-text');

      if(!text) return;

      e.preventDefault();
      e.stopPropagation();

      if(e.stopImmediatePropagation){
        e.stopImmediatePropagation();
      }

      openModal();
    }, true);
  }

  function boot(){
    injectStyle();
    enhanceText();
    bind();

    var observer = new MutationObserver(function(){
      clearTimeout(window.__fwRegisterDisclaimerTimer);
      window.__fwRegisterDisclaimerTimer = setTimeout(enhanceText, 80);
    });

    observer.observe(document.body, {
      childList:true,
      subtree:true
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }else{
    boot();
  }
})();
