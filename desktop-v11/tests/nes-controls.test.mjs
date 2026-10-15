import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {createNesDefaultControls,installNesKeyboardControls} from '../src/nes-controls.js';
import {NES_GAMES} from '../src/nes-games.js';

// Use the bundled emulator's real key lookup, rather than a duplicate key-code table.
const {EmulatorJS}=vm.runInNewContext(readFileSync(new URL('../public/emulatorjs/src/emulator.js',import.meta.url),'utf8')+';window;',{window:{}});
const game=NES_GAMES.contra;
function fixture({legacy=false,storage=new Map(),customKey}={}){
  const emulator=Object.create(EmulatorJS.prototype);
  emulator.initControlVars();
  emulator.controls=structuredClone(legacy?emulator.defaultControllers:createNesDefaultControls(game.keyboard));
  emulator.setupKeys();
  const calls=[];
  const parent=new EventTarget(),win=new EventTarget(),doc=new EventTarget();
  parent.contains=target=>target===parent;
  doc.hidden=false;
  Object.assign(emulator,{
    elements:{parent},started:true,settingsMenu:{style:{display:'none'}},
    isPopupOpen:()=>false,getSettingValue:()=> 'disabled',checkGamepadInputs:()=>{},
    gameManager:{simulateInput:(...args)=>calls.push(args)},
    saveSettings(){this.savedControls=structuredClone(this.controls);},
  });
  if(customKey)emulator.controls[0][0].value=Number(emulator.keyLookup(customKey));
  const cleanup=installNesKeyboardControls(emulator,game,{
    storage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},document:doc,window:win,
  });
  function key(type,code,keyCode=0,repeat=false){
    const event=new Event(type,{cancelable:true});
    Object.assign(event,{code,keyCode,repeat});
    parent.dispatchEvent(event);
    return event;
  }
  const press=(code,keyCode=0)=>{key('keydown',code,keyCode);key('keyup',code,keyCode);};
  return{emulator,calls,parent,win,doc,key,press,cleanup,storage};
}

test('魂斗罗默认键位对应 NES 的攻击 B 和跳跃 A，保留两人手柄操作',()=>{
  const controls=createNesDefaultControls(game.keyboard);
  assert.equal(controls[0][0].value,'j');assert.equal(controls[0][8].value,'k');
  assert.equal(controls[1][0].value,'numpad 1');assert.equal(controls[1][8].value,'numpad 2');
  for(const player of [0,1]){
    assert.equal(controls[player][0].value2,'BUTTON_2');
    assert.equal(controls[player][8].value2,'BUTTON_1');
  }
  assert.equal(controls[0][24].value,'f6');
  assert.match(game.controls,/攻击/);assert.match(game.controls,/跳跃/);
  assert.doesNotMatch(game.controls,/Z 键 B|X 键 A/);
});

test('两位玩家同时按方向和动作，输入分别发送到各自的控制器',()=>{
  const f=fixture();
  for(const code of ['KeyW','ArrowLeft','KeyJ','Numpad2'])f.key('keydown',code);
  assert.deepEqual(f.calls,[[0,4,1],[1,6,1],[0,0,1],[1,8,1]]);
  for(const code of ['KeyW','ArrowLeft','KeyJ','Numpad2'])f.key('keyup',code);
  assert.deepEqual(f.calls.slice(4),[[0,4,0],[1,6,0],[0,0,0],[1,8,0]]);
});

test('全部方向、攻击和跳跃键发送正确动作，未使用的预留键不产生输入',()=>{
  const f=fixture();
  for(const [code,player,button] of [
    ['KeyW',0,4],['KeyS',0,5],['KeyA',0,6],['KeyD',0,7],['KeyJ',0,0],['Space',0,0],['KeyK',0,8],
    ['ArrowUp',1,4],['ArrowDown',1,5],['ArrowLeft',1,6],['ArrowRight',1,7],
    ['Numpad1',1,0],['Digit1',1,0],['NumpadEnter',1,0],['Numpad2',1,8],['Digit2',1,8],['Enter',0,3],['KeyV',0,2],
  ]){
    f.calls.length=0;f.press(code);
    assert.deepEqual(f.calls,[[player,button,1],[player,button,0]],code);
  }
  f.calls.length=0;
  for(const code of ['KeyL','KeyU','KeyI','KeyO','Numpad3','Numpad4','Numpad5','Numpad6'])f.press(code);
  assert.deepEqual(f.calls,[]);
});

test('区分两处回车，小键盘关闭 Num Lock 仍可攻击和跳跃',()=>{
  const f=fixture();
  f.press('Enter',13);f.press('NumpadEnter',13);
  f.press('Numpad1',35);f.press('Numpad2',40);
  assert.deepEqual(f.calls,[[0,3,1],[0,3,0],[1,0,1],[1,0,0],[1,0,1],[1,0,0],[1,8,1],[1,8,0]]);
});

test('攻击别名同时按住与自动重复不会重复触发或提前松开攻击',()=>{
  const f=fixture();
  f.key('keydown','KeyJ');f.key('keydown','KeyJ',74,true);f.key('keydown','Space');f.key('keyup','KeyJ');
  assert.deepEqual(f.calls,[[0,0,1]]);
  f.key('keyup','Space');assert.deepEqual(f.calls,[[0,0,1],[0,0,0]]);
});

test('离开游戏窗口、切换标签或焦点移出游戏时释放所有按键',()=>{
  for(const reason of ['blur','hidden','focusout']){
    const f=fixture();f.key('keydown','KeyD');f.key('keydown','Space');
    if(reason==='blur')f.win.dispatchEvent(new Event('blur'));
    if(reason==='hidden'){f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));}
    if(reason==='focusout')f.parent.dispatchEvent(new Event('focusout'));
    assert.deepEqual(f.calls,[[0,7,1],[0,0,1],[0,7,0],[0,0,0]],reason);
    f.key('keyup','KeyD');f.key('keyup','Space');assert.equal(f.calls.length,4);
  }
});

test('菜单内不抢按键，打开菜单前按住的键仍能释放',()=>{
  const f=fixture();f.key('keydown','KeyJ');f.emulator.settingsMenu.style.display='block';
  f.key('keyup','KeyJ');
  assert.equal(f.key('keydown','Space').defaultPrevented,false);
  assert.deepEqual(f.calls,[[0,0,1],[0,0,0]]);
  f.emulator.settingsMenu.style.display='none';f.emulator.isPopupOpen=()=>true;
  f.press('Enter');assert.equal(f.calls.length,2);
});

test('首次更新迁移旧缓存键位，保留手柄映射，之后保留用户重新设置的键位',()=>{
  const f=fixture({legacy:true});
  assert.equal(f.emulator.controls[0][0].value,74);assert.equal(f.emulator.controls[0][8].value,75);
  assert.equal(f.emulator.controls[0][4].value,87);assert.equal(f.emulator.controls[1][0].value,97);
  assert.equal(f.emulator.controls[0][0].value2,'BUTTON_2');
  assert.equal(f.emulator.savedControls[0][24].value,117);
  const next=fixture({storage:f.storage,customKey:'q'});
  assert.equal(next.emulator.controls[0][0].value,81);
  assert.equal(next.key('keydown','Space').defaultPrevented,false);
  assert.deepEqual(next.calls,[]);
  next.press('KeyK');assert.deepEqual(next.calls,[[0,8,1],[0,8,0]]);
});

test('清理监听器后不再接收输入，切换游戏时不保留按住状态',()=>{
  const f=fixture();f.key('keydown','ArrowRight');f.cleanup();
  assert.deepEqual(f.calls,[[1,7,1],[1,7,0]]);
  f.press('KeyJ');assert.equal(f.calls.length,2);
});
