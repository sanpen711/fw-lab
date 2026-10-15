const gamepadButtons={0:'BUTTON_2',2:'SELECT',3:'START',4:'DPAD_UP',5:'DPAD_DOWN',6:'DPAD_LEFT',7:'DPAD_RIGHT',8:'BUTTON_1'};

export function createNesDefaultControls(profile){
  const controls={0:{},1:{},2:{},3:{}};
  for(const player of [0,1]){
    for(const [button,value2] of Object.entries(gamepadButtons))controls[player][button]={value:'',value2};
  }
  for(const {player,button,key} of profile.bindings){
    controls[player][button]??={};
    controls[player][button].value=key;
  }
  // Keep the number keys free for game actions.
  for(const [button,value] of [[24,'f6'],[25,'f7'],[26,'f8']])controls[0][button]={value};
  return controls;
}

export function installNesKeyboardControls(emulator,game,{storage,document:doc=globalThis.document,window:win=globalThis.window,clock=globalThis}={}){
  const profile=game.keyboard;
  const defaults=createNesDefaultControls(profile);
  const marker=`fw:nes:${game.storageId}:keyboard-revision`;
  // Migrate keyboard settings once without changing the game ID, saves, or gamepad bindings.
  let currentRevision;
  try{storage??=win.localStorage;currentRevision=storage?.getItem(marker);}catch{}
  if(currentRevision!==String(profile.revision)){
    for(let player=0;player<4;player++){
      emulator.controls[player]??={};
      for(let button=0;button<30;button++){
        const previous=emulator.controls[player][button],next=defaults[player][button];
        if(!previous&&!next)continue;
        emulator.controls[player][button]={...previous,...next,value:Number(emulator.keyLookup(next?.value||'')),value2:previous?.value2??next?.value2??''};
      }
    }
    emulator.checkGamepadInputs();
    try{emulator.saveSettings();storage?.setItem(marker,String(profile.revision));}catch{}
  }

  const bindings=new Map(profile.bindings.flatMap(binding=>binding.codes.map(code=>[code,binding])));
  const held=new Map();
  const rapidFire=new Map();
  const sameButton=(a,b)=>a.player===b.player&&a.button===b.button;
  const canPlay=()=>emulator.started&&!emulator.paused&&!doc.hidden&&emulator.settingsMenu.style.display==='none'&&!emulator.isPopupOpen()&&emulator.getSettingValue('keyboardInput')!=='enabled';
  const releaseButton=({player,button})=>{
    const id=`${player}:${button}`,rapid=rapidFire.get(id);
    if(rapid){clock.clearInterval(rapid.timer);rapidFire.delete(id);}
    emulator.gameManager.simulateInput(player,button,0);
  };
  const releaseAll=()=>{
    const buttons=new Map([...held.values()].map(binding=>[`${binding.player}:${binding.button}`,binding]));
    held.clear();
    for(const binding of buttons.values())releaseButton(binding);
  };
  const pressButton=binding=>{
    const {player,button,turboHz}=binding;
    emulator.gameManager.simulateInput(player,button,1);
    if(!turboHz)return;
    // NES Contra fires on a fresh button press: alternate press/release while held.
    const rapid={down:true,timer:0};
    rapid.timer=clock.setInterval(()=>{
      if(!canPlay()){releaseAll();return;}
      rapid.down=!rapid.down;
      emulator.gameManager.simulateInput(player,button,Number(rapid.down));
    },1000/(turboHz*2));
    rapidFire.set(`${player}:${button}`,rapid);
  };
  const keyChange=event=>{
    const binding=held.get(event.code)||bindings.get(event.code);
    if(!binding)return;
    const {player,button,key}=binding;
    if(event.type==='keyup'&&held.has(event.code)){
      held.delete(event.code);
      if(![...held.values()].some(other=>sameButton(other,binding)))releaseButton(binding);
    }else{
      if(!canPlay())return;
      // Respect later keyboard customization in the emulator's control menu.
      if(emulator.controls[player]?.[button]?.value!==Number(emulator.keyLookup(key)))return;
      if(event.type==='keydown'&&!event.repeat&&!held.has(event.code)){
        const alreadyDown=[...held.values()].some(other=>sameButton(other,binding));
        held.set(event.code,binding);
        if(!alreadyDown)pressButton(binding);
      }
    }
    // Physical codes distinguish main Enter from numpad Enter, even with Num Lock off.
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const visibilityChange=()=>{if(doc.hidden)releaseAll();};
  const parent=emulator.elements.parent;
  const focusOut=event=>{if(!parent.contains(event.relatedTarget))releaseAll();};
  const capture={capture:true};
  parent.addEventListener('keydown',keyChange,capture);
  parent.addEventListener('keyup',keyChange,capture);
  parent.addEventListener('focusout',focusOut);
  win.addEventListener('blur',releaseAll);
  doc.addEventListener('visibilitychange',visibilityChange);
  return()=>{
    releaseAll();
    parent.removeEventListener('keydown',keyChange,capture);
    parent.removeEventListener('keyup',keyChange,capture);
    parent.removeEventListener('focusout',focusOut);
    win.removeEventListener('blur',releaseAll);
    doc.removeEventListener('visibilitychange',visibilityChange);
  };
}
