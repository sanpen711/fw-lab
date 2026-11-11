const KEY='fw:desktop:v11:behavior';
const defaults={closeToTray:false,shortcut:null,messagePreview:true,shortcutRegistered:false};

function normalize(value){
  const shortcut=value?.shortcutEnabled!==false&&typeof value?.shortcut==='string'&&value.shortcut.trim()
    ?value.shortcut:null;
  return {
    closeToTray:value?.closeToTray===true,
    shortcut,
    messagePreview:value?.messagePreview!==false,
    shortcutRegistered:Boolean(shortcut&&value?.shortcutRegistered)
  };
}

let current={...defaults};
try{current=normalize(JSON.parse(localStorage.getItem(KEY)||'null'));}catch{}
export const desktopPreferences={
  get value(){return current;},
  apply(value){
    current=normalize(value);
    try{localStorage.setItem(KEY,JSON.stringify(current));}catch{}
    window.dispatchEvent(new CustomEvent('fw:desktop-preferences',{detail:current}));
  }
};
