import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/fw-comment-reply-echo.js', import.meta.url), 'utf8');
const memory = new Map();
const localStorage = {
  getItem(key){ return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value){ memory.set(key, String(value)); }
};
const context = {window:{localStorage}, localStorage, console, Set, Date, JSON};
vm.createContext(context);
vm.runInContext(source, context, {filename:'fw-comment-reply-echo.js'});

const uid = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
const third = '33333333-3333-3333-3333-333333333333';
const recent = new Date(Date.now() - 60_000).toISOString();
const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
const ownComments = [{id:1}, {id:2}];
const replyComments = [
  {id:10,post_id:100,user_id:other,parent_comment_id:9,reply_to_user_id:uid,content:'直接回复',is_deleted:false,created_at:recent},
  {id:11,post_id:101,user_id:other,parent_comment_id:1,reply_to_user_id:null,content:'旧电脑端回复',is_deleted:false,created_at:recent},
  {id:12,post_id:102,user_id:other,parent_comment_id:1,reply_to_user_id:third,content:'回复了楼中其他人',is_deleted:false,created_at:recent},
  {id:13,post_id:103,user_id:other,parent_comment_id:2,reply_to_user_id:uid,content:'已有正式通知',is_deleted:false,created_at:recent},
  {id:14,post_id:104,user_id:uid,parent_comment_id:1,reply_to_user_id:uid,content:'自己回复自己',is_deleted:false,created_at:recent},
  {id:15,post_id:105,user_id:other,parent_comment_id:2,reply_to_user_id:uid,content:'较早回复',is_deleted:false,created_at:old}
];

function query(rows){
  return {
    select(){ return this; }, eq(){ return this; }, neq(){ return this; }, or(){ return this; },
    order(){ return this; }, limit(){ return Promise.resolve({data:rows, error:null}); }
  };
}
let commentQueryCount = 0;
const client = {
  from(table){
    assert.equal(table, 'comments');
    commentQueryCount += 1;
    return query(commentQueryCount % 2 === 1 ? ownComments : replyComments);
  }
};

const formal = [{id:900,actor_id:other,type:'comment_reply',target_type:'comment',target_id:13,content:'正式通知',is_read:false,created_at:recent}];
const api = context.window.FWCommentReplyEcho;
const merged = await api.merge(client, uid, formal, {limit:100, force:true});

assert.equal(merged.filter(row => row.__reply_fallback).length, 3, '应补出直接回复、旧电脑端回复和较早回复');
assert.equal(merged.filter(row => String(row.target_id) === '13').length, 1, '已有正式通知的回复必须去重');
assert.equal(merged.some(row => String(row.target_id) === '12'), false, '不能把楼中回复其他人的内容提醒给楼主');
assert.equal(merged.some(row => String(row.target_id) === '14'), false, '自己回复自己不提醒');
assert.equal(merged.find(row => String(row.target_id) === '15').is_read, true, '三天前的历史回复只展示，不补未读红点');
assert.equal(merged.find(row => String(row.target_id) === '10').is_read, false, '近期漏通知回复应显示未读');

api.markRead(uid, ['reply-comment:10', '900']);
assert.deepEqual(Array.from(api.databaseNoticeIds(['reply-comment:10', '900'])), ['900'], '虚拟回复 ID 不能写入 notifications bigint 主键');
const afterRead = await api.merge(client, uid, formal, {limit:100});
assert.equal(afterRead.find(row => String(row.target_id) === '10').is_read, true, '查看后的兜底回复必须保持已读');

console.log('comment reply echo fallback checks passed');
