import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../app/sw.js',import.meta.url),'utf8');
const version=/const CACHE_NAME = '([^']+)'/.exec(source)[1];
const names=new Set(['fw-mobile-home-overlay-20260929-1','fw-mobile-app-old',version,'unrelated-app']);
const handlers={};
const context={URL,console,Promise,fetch:async()=>{throw new Error('offline');},caches:{
  keys:async()=>[...names],delete:async key=>names.delete(key),
  open:async name=>({match:async request=>name===version&&request==='https://fwyanjiusuo.com/app/echo.js'?'new echo':undefined}),
  match:async()=> 'old echo'
},self:{location:{href:'https://fwyanjiusuo.com/app/sw.js',origin:'https://fwyanjiusuo.com'},clients:{claim:async()=>{}},addEventListener:(event,handler)=>{handlers[event]=handler;}}};
vm.createContext(context);vm.runInContext(source,context);
let response;
handlers.fetch({request:{method:'GET',url:'https://fwyanjiusuo.com/app/echo.js?v=new',mode:'cors',headers:{get:()=>''}},respondWith:value=>{response=value;}});
assert.equal(await response,'new echo','offline fallback must use the current cache rather than old caches');
let activation;
handlers.activate({waitUntil:promise=>{activation=promise;}});await activation;
assert.deepEqual([...names].sort(),[version,'unrelated-app'].sort(),'remove only older mobile caches');
console.log('mobile echo cache checks passed (offline fallback and old cache cleanup)');
