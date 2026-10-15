export const DEFAULT_NES_GAME_ID='contra';

// Each game owns its action buttons and physical keys. Unused action keys stay unbound.
const contraKeyboard=Object.freeze({
  revision:1,
  help:[
    '玩家1：WASD 方向 · J / 空格 攻击 · K 跳跃',
    '玩家2：↑↓←→ 方向 · 数字 1 / 小键盘回车 攻击 · 数字 2 跳跃（数字区均可）',
    '主回车 Enter 开始 / 暂停 · V 选择单人 / 双人（标题画面）',
  ].join('\n'),
  bindings:[
    {player:0,button:4,key:'w',codes:['KeyW']},
    {player:0,button:5,key:'s',codes:['KeyS']},
    {player:0,button:6,key:'a',codes:['KeyA']},
    {player:0,button:7,key:'d',codes:['KeyD']},
    {player:0,button:0,key:'j',codes:['KeyJ','Space']},
    {player:0,button:8,key:'k',codes:['KeyK']},
    {player:0,button:3,key:'enter',codes:['Enter']},
    {player:0,button:2,key:'v',codes:['KeyV']},
    {player:1,button:4,key:'up arrow',codes:['ArrowUp']},
    {player:1,button:5,key:'down arrow',codes:['ArrowDown']},
    {player:1,button:6,key:'left arrow',codes:['ArrowLeft']},
    {player:1,button:7,key:'right arrow',codes:['ArrowRight']},
    {player:1,button:0,key:'numpad 1',codes:['Numpad1','Digit1','NumpadEnter']},
    {player:1,button:8,key:'numpad 2',codes:['Numpad2','Digit2']},
  ],
});

export const NES_GAMES=Object.freeze({
  contra:Object.freeze({
    title:'魂斗罗 1代',
    emulatorName:'魂斗罗 1代 无限人＋散弹枪',
    storageId:'fw-contra-1-infinite-spread',
    rom:'games/nes/roms/contra-infinite-spread.nes',
    keyboard:contraKeyboard,
    controls:contraKeyboard.help,
  }),
});
