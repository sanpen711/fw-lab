import './compose-ui-alignment.js';

document.addEventListener('click',event=>{
  const regular=event.target.closest?.('[data-nav]');
  if(!regular)return;
  document.querySelectorAll('[data-align-view].active').forEach(panel=>panel.classList.remove('active'));
  document.querySelectorAll('[data-align-nav].active').forEach(button=>button.classList.remove('active'));
},true);
