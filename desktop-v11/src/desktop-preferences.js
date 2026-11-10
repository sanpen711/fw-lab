const KEY='fw:desktop:v11:behavior';
const defaults={closeToTray:false,shortcutEnabled:true,shortcut:'Ctrl+Alt+H',messagePreview:true};
let current={...defaults};
try{current={...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch{}
export const desktopPreferences={
  get value(){return current;},
  apply(value){current={...defaults,...value};try{localStorage.setItem(KEY,JSON.stringify(current));}catch{}window.dispatchEvent(new CustomEvent('fw:desktop-preferences',{detail:current}));}
};
