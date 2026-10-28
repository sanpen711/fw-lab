// Keep provider diagnostics out of user-facing account messages.
export function authErrorMessage(error,fallback='操作失败，请稍后重试。'){
  const text=String(error?.message||error||'').trim();
  const code=String(error?.code||'');
  if(code==='same_password'||/new password (?:should|must) be different|same_password|password.*same as (?:the )?(?:old|previous)/i.test(text))return '新密码不能与原密码相同，请换一个新密码。';
  if(code==='weak_password'||/weak.password|password.*(?:at least|too short|strength)|password.*(?:pwned|leaked|compromised)/i.test(text)){
    if(error?.reasons?.includes('pwned')||/pwned|leaked|compromised/i.test(text))return '这个密码容易被猜到或已泄露，请换一个更安全的密码。';
    const minimum=text.match(/at least\s+(\d+)\s+characters/i);
    return minimum?`密码至少需要 ${minimum[1]} 位，请重新设置。`:'密码强度不足，请使用更长且不易猜测的密码。';
  }
  if(code==='otp_expired'||/token.*(?:invalid|expired)|otp.*(?:invalid|expired)/i.test(text))return '验证码不正确或已过期，请检查或重新发送。';
  if(code==='reauthentication_needed'||code==='reauthentication_not_valid'||/reauthentication/i.test(text))return '邮箱验证状态已失效，请重新获取验证码并验证。';
  if(/^(?:over_email_send_rate_limit|over_request_rate_limit|over_sms_send_rate_limit)$/.test(code)||/rate.limit|too many|security purposes.*seconds/i.test(text))return '操作太频繁，请稍后重试。';
  if(code==='invalid_credentials'||/invalid login credentials/i.test(text))return '邮箱或密码不正确，请检查后重试。';
  if(code==='email_not_confirmed'||/email not confirmed/i.test(text))return '邮箱还没有验证，请先完成邮箱验证。';
  if(code==='email_exists'||code==='user_already_exists'||/user already registered|email.*already.*registered/i.test(text))return '这个邮箱已注册，请直接登录或找回密码。';
  if(code==='email_address_invalid'||/invalid.*email|email.*invalid/i.test(text))return '邮箱格式不正确，请检查后重试。';
  if(/^(?:session_not_found|session_expired|refresh_token_not_found|refresh_token_already_used|bad_jwt)$/.test(code)||/auth session missing|invalid.*(?:session|refresh token)|(?:session|refresh token).*expired|jwt.*expired/i.test(text))return '登录或验证状态已失效，请重新登录或重新获取验证码。';
  if(code==='request_timeout'||/failed to fetch|fetch failed|network.*(?:error|failed)|load failed|timed?\s*out|timeout/i.test(text))return '网络连接异常，请检查网络后重试。';
  if(/error sending.*email|email.*(?:delivery|sending).*failed/i.test(text))return '邮件发送失败，请稍后重试。';
  if(/row.level security|permission denied|violates.*policy/i.test(text))return '当前账号没有操作权限，请重新登录后重试。';
  if(/duplicate key|unique constraint/i.test(text))return '这项信息已被使用，请修改后重试。';
  // Preserve helpful local Chinese validation, including familiar file formats.
  const untranslated=text.replace(/\b(?:JPG|JPEG|PNG|GIF|WebP|HEIC|MB|KB|ID)\b/gi,'');
  if(/[\u3400-\u9fff]/.test(text)&&!/[A-Za-z]/.test(untranslated))return text;
  return fallback;
}
