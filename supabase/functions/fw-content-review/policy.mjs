export const REVIEW_POLICY={
 version:'2026-10-21',
 allow:['日常吐槽、负面情绪、合理批评','本人自愿公开的联系方式'],
 reject:['明确淫秽色情','赌博推广、诈骗、违法交易'],
 review:['疑似辱骂围攻、威胁、他人隐私泄露','指控事实不清、上下文不足','广告引流、重复刷屏','媒体未完整检测、检测失败或超时'],
 instructions:'结合上下文判断，不能仅因负面情绪、公司名或单个关键词拒绝；机器只决定内容，不处罚账号。图片含文字须OCR，GIF须覆盖动画内容，视频未完整审核进入人工队列。'
};
export function normalizeDecision(result,{hasMedia=false}={}){
 if(!result||!['allow','review','reject'].includes(result.decision))return {decision:'review',reason:'审核结果无效，等待人工复核'};
 if(result.complete!==true||(hasMedia&&result.media_complete!==true))return {decision:'review',reason:'内容或媒体未完整审核，等待人工复核'};
 if(typeof result.reason!=='string'||result.reason.trim().length<2)return {decision:'review',reason:'审核依据不足，等待人工复核'};
 return {decision:result.decision,reason:result.reason.trim().slice(0,500)};
}
export async function inspectContent(job,{endpoint,key,fetcher=fetch,timeout=12000}={}){
 if(!endpoint||!key)return {decision:'review',reason:'自动审核服务未配置，等待人工复核'};
 const url=new URL(endpoint);if(url.protocol!=='https:')return {decision:'review',reason:'审核服务地址配置无效'};
 const source=JSON.stringify(job.snapshot);
 const hasMedia=/FW_MEDIA_|FW_USER_STICKER|media_path|sticker_url|image_url|"images"/.test(source);
 // Complete media data must be handled by the provider adapter, never infer safety from text alone.
 try{
  const response=await fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({id:job.id,revision:job.revision,kind:job.kind,snapshot:job.snapshot,policy:REVIEW_POLICY}),signal:AbortSignal.timeout(timeout)});
  if(!response.ok)throw new Error('provider error');
  return normalizeDecision(await response.json(),{hasMedia});
 }catch{return {decision:'review',reason:'自动审核失败或超时，等待人工复核'};}
}
