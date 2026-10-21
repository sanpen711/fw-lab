import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectContent,normalizeDecision,REVIEW_POLICY} from '../supabase/functions/fw-content-review/policy.mjs';
test('missing service, HTTP failure and timeout never approve content',async()=>{
 const job={id:1,revision:'x',snapshot:{content:'正常吐槽'}};
 assert.equal((await inspectContent(job)).decision,'review');
 for(const fetcher of [async()=>({ok:false}),async()=>{throw new Error('timeout');}]){
  assert.equal((await inspectContent(job,{endpoint:'https://review.example.invalid',key:'test',fetcher})).decision,'review');
 }
});
test('requires explicit complete context and complete media review',()=>{
 assert.equal(normalizeDecision({decision:'allow',reason:'正常内容'}).decision,'review');
 assert.equal(normalizeDecision({decision:'allow',reason:'正常内容',complete:true},{hasMedia:true}).decision,'review');
 assert.equal(normalizeDecision({decision:'allow',reason:'正常内容',complete:true,media_complete:true},{hasMedia:true}).decision,'allow');
 assert.equal(normalizeDecision({decision:'reject',reason:'确认诈骗',complete:true}).decision,'reject');
 assert.equal(normalizeDecision({decision:'ban',reason:'恶意用户',complete:true}).decision,'review');
});
test('provider receives original content and contextual rules; keyword match is not a verdict',async()=>{
 let payload;const job={id:1,revision:'x',snapshot:{content:'今天加班真烦'}};
 const result=await inspectContent(job,{endpoint:'https://review.example.invalid',key:'test',fetcher:async(url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({decision:'allow',reason:'正常日常吐槽',complete:true})};}});
 assert.equal(result.decision,'allow');assert.deepEqual(payload.snapshot,job.snapshot);assert.deepEqual(payload.policy,REVIEW_POLICY);
});
