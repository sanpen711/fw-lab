import assert from 'node:assert/strict';
import test from 'node:test';
import {createNesProgress,nesProgressKey} from '../src/nes-progress.js';

function fixture(){
  const values=new Map(),statuses=[],loads=[];
  let bytes=new Uint8Array([1,2,3,4]),time=100;
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const emulator={started:true,failedToStart:false,gameManager:{getState:()=>bytes,loadState:state=>loads.push([...state]),restart:()=>{bytes=new Uint8Array([9]);}}};
  const make=(gameId='contra')=>createNesProgress({gameId,storage,now:()=>++time,onStatus:value=>statuses.push(value)});
  return{values,statuses,loads,storage,emulator,make,setState:state=>{bytes=state;}};
}

test('a committed checkpoint resumes exact state after recreating the player',async()=>{
  const f=fixture(),progress=f.make();
  assert.equal(progress.prepare(),false);
  assert.equal(progress.save(),false);
  await progress.start(f.emulator);
  assert.equal(f.values.size,0);
  assert.equal(progress.save(),true);
  f.setState(new Uint8Array([7,8]));
  assert.equal(progress.info().savedAt,101);
  const reopened=f.make();
  assert.equal(reopened.prepare(),true);
  const restoring=reopened.start(f.emulator);
  assert.equal(reopened.save(),false);
  assert.equal(await restoring,true);
  assert.deepEqual(f.loads,[[1,2,3,4]]);
  assert.equal(reopened.info().restored,true);
  assert.equal(reopened.save(),true);
  const later=f.make();later.prepare();await later.start(f.emulator);
  assert.deepEqual(f.loads.at(-1),[7,8]);
});

test('corrupt checkpoints are retained and cannot be overwritten until explicit restart',async()=>{
  const f=fixture(),progress=f.make();progress.prepare();await progress.start(f.emulator);progress.save();
  const key=nesProgressKey('contra'),record=JSON.parse(f.values.get(key));
  record.state=btoa('different bytes');
  const damaged=JSON.stringify(record);f.values.set(key,damaged);
  const reopened=f.make();
  assert.equal(reopened.prepare(),false);assert.equal(reopened.info().blocked,true);
  await reopened.start(f.emulator);assert.equal(reopened.save(),false);
  assert.equal(f.values.get(key),damaged);
  reopened.restart();
  assert.equal(f.values.get(key),damaged);assert.equal(reopened.info().blocked,false);
  assert.equal(reopened.save(),true);
  assert.equal(f.statuses.some(value=>value.kind==='error'),true);
});

test('storage failures keep the last successful checkpoint and allow a later retry',async()=>{
  const f=fixture(),progress=f.make();progress.prepare();await progress.start(f.emulator);progress.save();
  const key=nesProgressKey('contra'),previous=f.values.get(key),write=f.storage.setItem;
  f.storage.setItem=()=>{throw new Error('Quota exceeded');};
  f.setState(new Uint8Array([8,9]));
  assert.throws(()=>progress.save(),/保存失败/);
  assert.equal(f.values.get(key),previous);assert.equal(progress.info().savedAt,101);
  assert.equal(f.statuses.at(-1).kind,'error');
  f.storage.setItem=write;assert.equal(progress.save(),true);
  const reopened=f.make();reopened.prepare();await reopened.start(f.emulator);
  assert.deepEqual(f.loads.at(-1),[8,9]);
});

test('starting over retains the manual checkpoint until the user saves again',async()=>{
  const f=fixture(),one=f.make('contra'),two=f.make('other');
  for(const progress of [one,two]){progress.prepare();await progress.start(f.emulator);progress.save();}
  f.values.set('bestScore','2048');f.values.set('ejs-settings','volume');
  const previous=f.values.get(nesProgressKey('contra'));
  one.restart();
  assert.equal(await one.start(f.emulator),false);
  assert.equal(f.values.get(nesProgressKey('contra')),previous);
  assert.equal(f.values.has(nesProgressKey('other')),true);
  assert.equal(f.values.get('bestScore'),'2048');assert.equal(f.values.get('ejs-settings'),'volume');
  assert.equal(one.save(),true);
  assert.notEqual(f.values.get(nesProgressKey('contra')),previous);
  const reopened=f.make('contra');reopened.prepare();await reopened.start(f.emulator);
  assert.deepEqual(f.loads.at(-1),[9]);
});

test('failed starts and oversized snapshots never replace a valid save',async()=>{
  const f=fixture(),progress=f.make();progress.prepare();await progress.start(f.emulator);progress.save();
  const key=nesProgressKey('contra'),previous=f.values.get(key);
  f.emulator.failedToStart=true;assert.equal(progress.save(),false);
  f.emulator.failedToStart=false;f.setState(new Uint8Array(1024*1024+1));
  assert.throws(()=>progress.save(),/保存失败/);assert.equal(f.values.get(key),previous);
});
