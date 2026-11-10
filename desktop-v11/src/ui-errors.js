import {authErrorMessage} from '../../assets/fw-auth-errors.mjs';

export function uiErrorMessage(error,fallback='操作失败，请稍后重试。'){
  const text=String(error?.message||error||'').trim();
  if(!text)return fallback;
  if(/network|failed to fetch|fetch failed|load failed|timeout|timed out|网络|连接超时/i.test(text))return '网络连接异常，请检查网络后重试。';
  const translated=authErrorMessage(error,'');if(translated)return translated;
  // Preserve the local operation name, never provider SQL/HTTP diagnostics.
  const label=text.match(/^([\u3400-\u9fff\s、，]{2,28})[：:]/)?.[1];
  return label?label+'，请稍后重试。':fallback;
}
