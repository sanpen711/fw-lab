import {authStore} from './auth-store.js';
import {openDialog,closeDialog} from './dialog-focus.js';

const OFFWORK_TIME_KEY='fw:desktop:v11:offwork-time';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
let notify=()=>{},started=false,owner='',generation=0;
function readLocal(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function writeLocal(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
function renderCountdown(){
  const value=$('[data-offwork-value]'),detail=$('[data-offwork-detail]'),meta=$('[data-offwork-meta]');if(!value||!detail||!meta)return;
  const saved=readLocal(OFFWORK_TIME_KEY),time=typeof saved==='string'&&/^\d{2}:\d{2}$/.test(saved)?saved:'';
  if(!time){value.textContent='设置时间';detail.textContent='今天几点下班？';meta.textContent='点击设置下班时间';return;}
  const [hour,minute]=time.split(':').map(Number),now=new Date(),target=new Date(now);target.setHours(hour,minute,0,0);const remaining=target.getTime()-now.getTime();
  if(remaining<=0){value.textContent='已经下班';detail.textContent='今天辛苦了，剩下的明天再说';meta.textContent=`下班时间 ${time} · 点击修改`;return;}
  const seconds=Math.floor(remaining/1000),hours=Math.floor(seconds/3600),minutes=Math.floor((seconds%3600)/60),rest=seconds%60;
  value.textContent=[hours,minutes,rest].map(number=>String(number).padStart(2,'0')).join(':');detail.textContent=`距离 ${time} 下班`;meta.textContent=hours<1?'最后一小时，稳住':'点击修改下班时间';
}
function setStatus(message='',error=false){const node=$('[data-home-tool-status]');if(node){node.textContent=message;node.classList.toggle('error',error);}}
function openTool(view){
  const modal=$('[data-home-tool-modal]');if(!modal||!owner)return;
  $$('[data-home-tool-view]',modal).forEach(panel=>{panel.hidden=panel.dataset.homeToolView!==view;panel.inert=panel.hidden;});
  setStatus('');modal.hidden=false;document.body.classList.add('modal-open');
  if(view==='offwork')$('[data-offwork-form] input[name="time"]',modal).value=readLocal(OFFWORK_TIME_KEY)||'18:00';
  openDialog(modal,{close:closeTool,initialFocus:()=>$('[data-home-tool-view]:not([hidden]) input, [data-home-tool-view]:not([hidden]) textarea',modal)});
}
function closeTool(){const modal=$('[data-home-tool-modal]');if(!modal)return;modal.hidden=true;if($('[data-account-modal]')?.hidden)document.body.classList.remove('modal-open');setStatus('');closeDialog(modal);}
function setBusy(form,busy){Array.from(form.elements).forEach(node=>{node.disabled=busy;});}
function initHomeWidgets(options={}){
  if(started)return;started=true;notify=options.toast||notify;
  authStore.subscribe(auth=>{
    if(!auth.ready)return;const id=auth.user&&!auth.user.cached&&!auth.user.disabled?String(auth.user.id):'';if(id===owner)return;
    owner=id;generation++;closeTool();const form=$('[data-feedback-form]');form?.reset();if(form)setBusy(form,false);
  });
  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-offwork-open]')){openTool('offwork');return;}
    if(event.target.closest?.('[data-feedback-open]')){openTool('feedback');return;}
    if(event.target.closest?.('[data-close-home-tool]')||event.target.matches?.('[data-home-tool-modal]'))closeTool();
  });
  $('[data-offwork-form]')?.addEventListener('submit',event=>{
    event.preventDefault();const time=String(new FormData(event.currentTarget).get('time')||'');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){setStatus('请选择正确的下班时间。',true);return;}
    writeLocal(OFFWORK_TIME_KEY,time);renderCountdown();closeTool();notify(`下班时间已设为 ${time}。`);
  });
  $('[data-feedback-form]')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;if(form.querySelector('[type="submit"]').disabled)return;
    const token=generation,data=new FormData(form);setBusy(form,true);setStatus('正在提交反馈…');
    try{await authStore.submitFeedback({category:data.get('category'),content:data.get('content')});if(token!==generation)return;form.reset();closeTool();notify('反馈已收到，谢谢你。');}
    catch(error){if(token===generation)setStatus(error.message||'反馈提交失败，请稍后再试。',true);}
    finally{if(token===generation)setBusy(form,false);}
  });
  renderCountdown();setInterval(renderCountdown,1000);
}
export const homeWidgets={init:initHomeWidgets,renderCountdown};
