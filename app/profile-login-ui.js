// 旧手机端登录 UI 补丁已停用。
// 当前手机端登录/注册流程统一由 app/profile.js 负责。
(function(){
  if(window.__FW_MOBILE_PROFILE_LOGIN_UI__) return;
  window.__FW_MOBILE_PROFILE_LOGIN_UI__ = true;
})();
