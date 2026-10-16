import assert from 'node:assert/strict';
import test from 'node:test';
import {createUserActivityTracker} from '../assets/fw-user-activity.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function target(){
  const listeners=new Map();
  return {
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
    emit(type,isTrusted=true){for(const fn of listeners.get(type)||[])fn({isTrusted});},
    get listenerCount(){return [...listeners.values()].reduce((sum,set)=>sum+set.size,0);}
  };
}
function fixture(record){
  let time=0,focused=true;
  const doc=Object.assign(target(),{hidden:false,hasFocus:()=>focused}),win=target(),calls=[];
  const tracker=createUserActivityTracker({record:()=>{calls.push(time);return record?.();},document:doc,window:win,now:()=>time});
  return {doc,win,calls,tracker,advance:ms=>time+=ms,focus:value=>focused=value};
}

test('前台打开记录一次，闲置与同账号会话续期不刷新；真实交互每分钟最多一次',async()=>{
  const f=fixture();f.tracker.setUser('a');await flush();assert.deepEqual(f.calls,[0]);
  f.advance(60000);f.tracker.setUser('a');await flush();assert.equal(f.calls.length,1);
  f.advance(300000);await flush();assert.equal(f.calls.length,1);
  f.doc.emit('keydown',false);await flush();assert.equal(f.calls.length,1);
  f.doc.emit('keydown');await flush();assert.equal(f.calls.length,2);
  for(const type of ['wheel','pointerdown','touchstart'])f.doc.emit(type);
  await flush();assert.equal(f.calls.length,2);
  f.advance(60000);f.doc.emit('pointerdown');await flush();assert.equal(f.calls.length,3);
  f.tracker.stop();
});

test('隐藏、失焦与未登录时不记录；回到前台后记录，退出后移除监听',async()=>{
  const f=fixture();f.doc.hidden=true;f.tracker.setUser('a');await flush();assert.equal(f.calls.length,0);
  f.doc.emit('pointerdown');f.win.emit('focus');await flush();assert.equal(f.calls.length,0);
  f.doc.hidden=false;f.focus(false);f.doc.emit('visibilitychange');await flush();assert.equal(f.calls.length,0);
  f.focus(true);f.win.emit('focus');await flush();assert.equal(f.calls.length,1);
  f.tracker.stop();assert.equal(f.doc.listenerCount+f.win.listenerCount,0);
  f.advance(60000);f.doc.emit('pointerdown');f.win.emit('focus');await flush();assert.equal(f.calls.length,1);
});

test('上报失败不会抛给登录流程，短暂退避后下次真实操作可重试',async()=>{
  let fail=true;const f=fixture(()=>fail?Promise.reject(new Error('offline')):Promise.resolve({error:null}));
  f.tracker.setUser('a');await flush();assert.equal(f.calls.length,1);
  f.advance(10000);f.doc.emit('keydown');await flush();assert.equal(f.calls.length,1);
  fail=false;f.advance(5000);f.doc.emit('keydown');await flush();assert.equal(f.calls.length,2);
  f.advance(20000);f.doc.emit('keydown');await flush();assert.equal(f.calls.length,2);
  f.tracker.stop();
});

test('账号切换时旧请求的完成不会污染新账号的请求状态',async()=>{
  const resolvers=[];const f=fixture(()=>new Promise(resolve=>resolvers.push(resolve)));
  f.tracker.setUser('a');f.advance(1000);f.tracker.setUser('b');assert.equal(f.calls.length,2);
  resolvers[0]({error:null});await flush();
  f.advance(60000);f.doc.emit('pointerdown');await flush();assert.equal(f.calls.length,2);
  resolvers[1]({error:null});await flush();
  f.doc.emit('pointerdown');await flush();assert.equal(f.calls.length,3);
  resolvers[2]({error:null});await flush();f.tracker.stop();
});
