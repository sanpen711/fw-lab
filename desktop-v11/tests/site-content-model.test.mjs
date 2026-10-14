import test from 'node:test';
import assert from 'node:assert/strict';
import {siteContentValues,activityStatus,activityTimeInput,activityImage} from '../src/site-content-model.js';
const draft={title:'活动',body:'说明',starts_at:'2026-10-14T16:30',ends_at:'2026-10-15T18:00',target:'external',participation_url:'https://example.com/join'};
test('活动时间按北京时间解析并拒绝无效日期与倒置时间',()=>{
 const values=siteContentValues('activities',draft);assert.equal(values.starts_at,'2026-10-14T08:30:00.000Z');assert.equal(activityTimeInput(values.starts_at),draft.starts_at);
 assert.throws(()=>siteContentValues('activities',{...draft,starts_at:'2026-02-30T10:00'}));assert.throws(()=>siteContentValues('activities',{...draft,ends_at:'2026-10-14T16:30'}));
 assert.equal(activityStatus(values,Date.parse(values.starts_at)-1),'未开始');assert.equal(activityStatus(values,Date.parse(values.starts_at)),'进行中');assert.equal(activityStatus(values,Date.parse(values.ends_at)),'已结束');
});
test('参与入口拒绝脚本与带凭证网址，内部入口不保存遗留外链',()=>{
 for(const participation_url of ['javascript:alert(1)','file:///etc/passwd','https://user:pass@example.com'])assert.throws(()=>siteContentValues('activities',{...draft,participation_url}));
 const v=siteContentValues('activities',{...draft,target:'shop'});assert.equal(v.target_view,'shop');assert.equal(v.participation_url,'');
});
test('标题按字符限制，活动封面只读取指定存储桶下的图片',()=>{
 assert.doesNotThrow(()=>siteContentValues('announcements',{title:'🙂'.repeat(80),body:'正文'}));assert.throws(()=>siteContentValues('announcements',{title:'🙂'.repeat(81),body:'正文'}));assert.equal(activityImage('https://example.com/tracker.png','https://example.supabase.co'),'');assert.equal(activityImage('activities/../../secret.svg','https://example.supabase.co'),'');
});
