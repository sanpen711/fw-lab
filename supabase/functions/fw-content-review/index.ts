import {createClient} from 'npm:@supabase/supabase-js@2.55.0';
import {inspectContent} from './policy.mjs';
// Database webhook contains a private random revision, not user-supplied content.
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 try{
  const input=await req.json();
  if(!Number.isSafeInteger(input.id)||!/^[-0-9a-f]{36}$/i.test(input.revision||''))return new Response('Invalid job',{status:400});
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const job=await client.rpc('fw_machine_review_read',{p_id:input.id,p_revision:input.revision});
  if(job.error||!job.data)return new Response('Unavailable job',{status:404});
  const result=await inspectContent(job.data,{endpoint:Deno.env.get('CONTENT_REVIEW_ENDPOINT'),key:Deno.env.get('CONTENT_REVIEW_KEY')});
  const saved=await client.rpc('fw_machine_review_finish',{p_id:input.id,p_revision:input.revision,p_decision:result.decision,p_reason:result.reason});
  if(saved.error)return new Response('Review not saved',{status:409});
  return Response.json({processed:true});
 }catch{return new Response('Review unavailable; content remains pending',{status:503});}
});
