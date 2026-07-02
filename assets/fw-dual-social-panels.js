// F.w 研究所：旧版电脑端回声 / 搭子双浮窗已停用。
// 原文件会优先接管顶部“回声”按钮，并渲染旧版右侧小窗。
// 现在电脑端回声统一交给 assets/fw-social.js 里的原生回声弹窗逻辑处理。
(function(){
  window.__FW_DUAL_SOCIAL_PANELS__ = true;
})();
