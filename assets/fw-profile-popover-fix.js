// F.w 研究所：右上角个人资料悬浮卡修复
// 问题：鼠标经过右上角头像时，资料卡会自动展开并覆盖页面按钮，导致精神状态筛选/发帖按钮点不动。
// 处理：禁用 hover 自动弹出资料卡；点击右上角账号仍然会打开资料编辑弹窗。
(function(){
  if(window.__FW_PROFILE_POPOVER_FIX__) return;
  window.__FW_PROFILE_POPOVER_FIX__ = true;

  function inject(){
    if(document.getElementById('fw-profile-popover-fix-style')) return;

    var style = document.createElement('style');
    style.id = 'fw-profile-popover-fix-style';
    style.textContent = `
      .fw-profile-popover,
      .fw-userbar:hover .fw-profile-popover,
      .fw-userbar:focus-within .fw-profile-popover{
        display:none!important;
        opacity:0!important;
        transform:translateY(8px)!important;
        pointer-events:none!important;
      }

      .fw-profile-popover *,
      .fw-profile-popover:before{
        pointer-events:none!important;
      }

      .fw-login-pill{
        position:relative;
        z-index:2;
      }
    `;

    document.head.appendChild(style);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', inject);
  }else{
    inject();
  }
})();
