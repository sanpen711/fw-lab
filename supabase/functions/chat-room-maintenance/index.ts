import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.55.0';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply(405,{error:'仅支持 POST。'});
 try{
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if(!url||!key)return reply(500,{error:'服务配置不完整。'});
  const service=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const body=await req.json().catch(()=>({}));let authorized=false;
  if(typeof body.token==='string'&&/^[0-9a-f-]{36}$/.test(body.token)){
   const {data,error}=await service.rpc('fw_chat_gc_claim',{p_token:body.token});authorized=!error&&data===true;
  }else{
   const auth=req.headers.get('Authorization')||'';
   if(auth.startsWith('Bearer ')){
    const {data,error}=await service.auth.getUser(auth.slice(7));
    if(!error&&data.user){const {data:profile}=await service.from('profiles').select('is_banned').eq('id',data.user.id).maybeSingle();authorized=!!profile&&!profile.is_banned;}
   }
  }
  if(!authorized)return reply(401,{error:'维护请求未授权。'});
  const {data:bucket}=await service.storage.getBucket('room-media');
  if(!bucket){const {error:bucketError}=await service.storage.createBucket('room-media',{public:false,fileSizeLimit:3*1024*1024,allowedMimeTypes:['image/jpeg','image/png','image/webp','image/gif']});if(bucketError&&!/exist/i.test(bucketError.message))throw bucketError;}
  const {data:jobs,error}=await service.rpc('fw_chat_gc_jobs');if(error)throw error;
  let removed=0;const failures:string[]=[];
  for(const bucket of [...new Set((jobs||[]).map((row:any)=>row.bucket))] as string[]){
   if(!['room-media','chat-media'].includes(bucket))continue;
   const paths=(jobs||[]).filter((row:any)=>row.bucket===bucket).map((row:any)=>String(row.path));
   for(let i=0;i<paths.length;i+=100){const batch=paths.slice(i,i+100);const {error:removeError}=await service.storage.from(bucket).remove(batch);if(removeError){failures.push(bucket);continue;}const {error:ackError}=await service.rpc('fw_chat_gc_ack',{p_bucket:bucket,p_paths:batch});if(ackError)throw ackError;removed+=batch.length;}
  }
  return reply(failures.length?503:200,{ok:failures.length===0,removed,failed_buckets:failures});
 }catch(error){console.error('chat-room-maintenance',error);return reply(500,{error:'房间附件清理暂未完成，将自动重试。'});}
});
