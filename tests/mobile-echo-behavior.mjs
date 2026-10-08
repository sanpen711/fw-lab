import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app/echo.js', import.meta.url), 'utf8');
function harness(rows){
  const listeners = new Map(), notices = [], nodes = new Map();
  const state = {user:{id:'me'}, view:'square'};
  let failUpdate = false, emptyUpdate = false, delayRead = null;
  const classes = () => ({add(){}, remove(){}, toggle(){}});
  const button = {classList:classes(), badge:{classList:classes(), setAttribute(){}}, querySelector(){return this.badge;}};
  const markAll = {hidden:true, disabled:false};
  const dot = {hidden:true};
  const list = {
    html:'', get innerHTML(){return this.html;}, set innerHTML(value){this.html=value; nodes.clear(); this.index(value);},
    index(value){ for(const match of value.matchAll(/class="notice-item mobile-echo-item (unread)?" data-mobile-echo-item="(\d+)"/g)){
      const node={unread:!!match[1]}; node.classList={remove(){node.unread=false;}}; nodes.set(match[2],node);
    } },
    insertAdjacentHTML(_,value){this.html+=value;this.index(value);},
    querySelector(selector){return selector.includes('more') && this.html.includes('data-mobile-echo-more') ? {remove(){},disabled:false}:null;}
  };
  const document = {
    hidden:false,
    addEventListener(name,fn){listeners.set(name,fn);},
    querySelector(selector){
      if(selector==='[data-echo-list]')return list;
      if(selector==='[data-mobile-square-dot]')return dot;
      if(selector==='[data-mobile-square-mode="echo"]')return button;
      if(selector==='[data-mobile-echo-mark-all]')return markAll;
      const match=/data-mobile-echo-item="(\d+)"/.exec(selector);return match?nodes.get(match[1]):null;
    },
    getElementById(){return {};}
  };
  const db = {from(table){
    const filters=[], orders=[]; let update=null, limit=Infinity, cursor=null;
    const q={
      select(){return q;}, update(value){update=value;return q;},
      eq(key,value){filters.push(row=>row[key]===value);return q;},
      in(key,values){filters.push(row=>values.map(String).includes(String(row[key])));return q;},
      lte(key,value){filters.push(row=>row[key]<=value);return q;},
      order(key){orders.push(key);return q;}, limit(value){limit=value;return q;},
      or(value){const match=/created_at\.lt\.(.*),and\(created_at\.eq\..*,id\.lt\.(\d+)\)/.exec(value);assert.ok(match);cursor={time:match[1],id:Number(match[2])};return q;},
      async then(resolve,reject){try{
        if(table!=='notifications'){resolve({data:[],error:null});return;}
        if(!update&&orders.length&&delayRead){const pause=delayRead;delayRead=null;await pause;}
        let data=rows.filter(row=>filters.every(f=>f(row))&&(!cursor||row.created_at<cursor.time||(row.created_at===cursor.time&&Number(row.id)<cursor.id)));
        if(update){
          if(failUpdate){resolve({data:null,error:{message:'offline'}});return;}
          if(emptyUpdate)data=[];
          data.forEach(row=>Object.assign(row,update));
        }else data.sort((a,b)=>{for(const key of orders){const cmp=key==='id'?Number(b.id)-Number(a.id):String(b[key]).localeCompare(String(a[key]));if(cmp)return cmp;}return 0;});
        resolve({data:data.slice(0,limit).map(row=>({...row})),error:null});
      }catch(error){reject(error);}}
    };return q;
  }};
  const fw = {state,db:()=>({client:db}),waitForDb:async()=>true,refreshUser:async()=>state.user,
    $:selector=>document.querySelector(selector),$$:()=>[],esc:String,initials:()=> '研',toast:message=>notices.push(message)};
  const context={document,window:{FWApp:fw,addEventListener(){}},console:{warn(){}},localStorage:{getItem(){return null;}},setTimeout(){},clearTimeout(){},Set,Date,JSON};
  vm.createContext(context);vm.runInContext(source,context);
  const api=context.window.FWAppEcho;
  api.init();api.setSquareMode('echo');
  const click=async(attribute)=>{listeners.get('click')({target:{closest:selector=>selector===`[${attribute}]`?(attribute==='data-mobile-echo-mark-all'?markAll:{}):null},preventDefault(){}});await settle();};
  return {api,rows,list,dot,nodes,notices,state,document,click,fail(value){failUpdate=value;},empty(value){emptyUpdate=value;},delay(promise){delayRead=promise;}};
}
async function settle(){for(let i=0;i<15;i++)await new Promise(resolve=>setImmediate(resolve));}
const time=new Date(Date.now()-10*86400000).toISOString();
const notice=(id,extra={})=>({id:String(id),user_id:'me',actor_id:'other',type:'like',target_type:'post',target_id:'8',content:'test',created_at:time,is_read:false,...extra});

// >300 notifications, equal timestamps, unread isolation and arrivals between pages.
const h=harness(Array.from({length:305},(_,i)=>notice(i+1)).concat(notice(999,{user_id:'someone-else'}),notice(998,{type:'private_message'})));
await settle();
assert.equal(h.nodes.size,100);assert.equal(h.rows.filter(row=>row.user_id==='me'&&row.type==='like'&&row.is_read).length,100);
assert.equal(h.dot.hidden,false,'older unread notices must retain the global dot');
h.rows.push(notice(1000,{created_at:new Date().toISOString()}));
for(let i=0;i<3;i++)await h.click('data-mobile-echo-more');
assert.equal(h.nodes.size,305,'cursor pagination must neither skip nor repeat older notices');
assert.equal(h.rows.find(row=>row.id==='1000').is_read,false,'new arrival outside the displayed snapshot stays unread');
assert.equal(h.rows.find(row=>row.id==='998').is_read,false,'private messages never belong to echo');
await h.click('data-mobile-echo-mark-all');
assert.equal(h.rows.find(row=>row.id==='1000').is_read,true);
assert.equal(h.rows.find(row=>row.id==='999').is_read,false,'another account must remain untouched');
assert.equal(h.dot.hidden,true);

// Network failures and silent RLS zero-row writes must preserve unread UI.
for(const mode of ['fail','empty']){
  const h=harness([notice(1)]);h[mode](true);await settle();
  assert.equal(h.nodes.get('1').unread,true);assert.equal(h.dot.hidden,false);assert.ok(h.notices.length);
  h[mode](false);assert.equal(await h.api.markRead(['1']),true);assert.equal(h.dot.hidden,true);
}

// Cross-device read state is authoritative, even on a fresh browser with no local storage.
const read=harness([notice(1,{is_read:true})]);await settle();assert.equal(read.dot.hidden,true);assert.equal(read.nodes.get('1').unread,false);

// Leaving the panel before a response arrives must never consume it.
const hidden=harness([notice(1)]);hidden.document.hidden=true;await settle();assert.equal(hidden.rows[0].is_read,false);

// A response started by one account must not render or mark notices for another.
const switched=harness([notice(1)]);let release;switched.delay(new Promise(resolve=>{release=resolve;}));
await settle();switched.state.user={id:'other-account'};release();await settle();
assert.equal(switched.rows[0].is_read,false);assert.equal(switched.nodes.size,0);
console.log('mobile echo behavior checks passed (pagination, write failures, isolation, cross-device reads, hidden panel)');
