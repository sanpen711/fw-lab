import {authStore} from './auth-store.js';

const WEATHER_LOCATION_KEY='fw:desktop:v11:weather-location';
const WEATHER_CACHE_KEY='fw:desktop:v11:weather-cache';
const OFFWORK_TIME_KEY='fw:desktop:v11:offwork-time';
const WEATHER_FRESH_MS=30*60*1000;
const WEATHER_REFRESH_MS=30*60*1000;

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
let notify=()=>{};
let openAccount=()=>{};
let weatherBusy=false;
let started=false;

function readLocal(key){
  try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}
}

function writeLocal(key,value){
  try{localStorage.setItem(key,JSON.stringify(value));}catch{}
}

function weatherText(code){
  const value=Number(code);
  if(value===0)return['晴','☀'];
  if([1,2].includes(value))return['多云','⛅'];
  if(value===3)return['阴','☁'];
  if([45,48].includes(value))return['有雾','🌫'];
  if(value>=51&&value<=57)return['毛毛雨','🌦'];
  if((value>=61&&value<=67)||(value>=80&&value<=82))return['有雨','🌧'];
  if((value>=71&&value<=77)||(value>=85&&value<=86))return['有雪','🌨'];
  if(value>=95)return['雷雨','⛈'];
  return['天气变化中','☁'];
}

function round(value){const number=Number(value);return Number.isFinite(number)?Math.round(number):'--';}

function renderWeather(extraMeta=''){
  const main=$('[data-weather-main]');const detail=$('[data-weather-detail]');const meta=$('[data-weather-meta]');
  if(!main||!detail||!meta)return;
  const location=readLocal(WEATHER_LOCATION_KEY);const cached=readLocal(WEATHER_CACHE_KEY);
  if(!location){main.textContent='设置天气';detail.textContent='点击选择你所在的城市';meta.textContent='无需定位权限';return;}
  if(!cached?.current){main.textContent='正在读取天气';detail.textContent=location.label;meta.textContent=extraMeta||'请稍候…';return;}
  const [label,icon]=weatherText(cached.current.weather_code);
  main.textContent=`${icon} ${round(cached.current.temperature_2m)}°`;
  detail.textContent=`${location.label} · ${label}`;
  const low=round(cached.daily?.temperature_2m_min?.[0]);const high=round(cached.daily?.temperature_2m_max?.[0]);
  meta.textContent=extraMeta||`${low}° / ${high}° · 体感 ${round(cached.current.apparent_temperature)}°`;
}

async function fetchJson(url){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);
  try{
    const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`天气服务返回 ${response.status}`);
    return await response.json();
  }finally{clearTimeout(timer);}
}

async function fetchWeather(location){
  const query=new URLSearchParams({
    latitude:String(location.latitude),longitude:String(location.longitude),
    current:'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
    daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone:'auto',forecast_days:'1'
  });
  const data=await fetchJson(`https://api.open-meteo.com/v1/forecast?${query}`);
  if(!data?.current)throw new Error('暂时没有取到这个城市的天气。');
  const cached={savedAt:Date.now(),location,current:data.current,daily:data.daily||{}};
  writeLocal(WEATHER_CACHE_KEY,cached);renderWeather();return cached;
}

async function loadWeather(force=false){
  const location=readLocal(WEATHER_LOCATION_KEY);if(!location)return;
  const cached=readLocal(WEATHER_CACHE_KEY);renderWeather();
  if(!force&&cached?.savedAt&&Date.now()-Number(cached.savedAt)<WEATHER_FRESH_MS)return;
  if(weatherBusy)return;weatherBusy=true;renderWeather('正在更新…');
  try{await fetchWeather(location);}catch(error){renderWeather(cached?.current?'更新失败，点击可重试':'天气暂时取不到，点击重试');if(!cached?.current)throw error;}finally{weatherBusy=false;}
}

function renderCountdown(){
  const value=$('[data-offwork-value]');const detail=$('[data-offwork-detail]');const meta=$('[data-offwork-meta]');if(!value||!detail||!meta)return;
  const saved=readLocal(OFFWORK_TIME_KEY);const time=typeof saved==='string'&&/^\d{2}:\d{2}$/.test(saved)?saved:'';
  if(!time){value.textContent='设置时间';detail.textContent='今天几点下班？';meta.textContent='点击设置下班时间';return;}
  const [hour,minute]=time.split(':').map(Number);const now=new Date();const target=new Date(now);target.setHours(hour,minute,0,0);const remaining=target.getTime()-now.getTime();
  if(remaining<=0){value.textContent='已经下班';detail.textContent='今天辛苦了，剩下的明天再说';meta.textContent=`下班时间 ${time} · 点击修改`;return;}
  const seconds=Math.floor(remaining/1000);const hours=Math.floor(seconds/3600);const minutes=Math.floor((seconds%3600)/60);const rest=seconds%60;
  value.textContent=[hours,minutes,rest].map(number=>String(number).padStart(2,'0')).join(':');
  detail.textContent=`距离 ${time} 下班`;
  meta.textContent=hours<1?'最后一小时，稳住':'点击修改下班时间';
}

function setStatus(message='',error=false){const node=$('[data-home-tool-status]');if(!node)return;node.textContent=message;node.classList.toggle('error',error);}

function openTool(view){
  const modal=$('[data-home-tool-modal]');if(!modal)return;
  $$('[data-home-tool-view]',modal).forEach(panel=>{panel.hidden=panel.dataset.homeToolView!==view;});
  setStatus('');modal.hidden=false;document.body.classList.add('modal-open');
  if(view==='weather')$('[data-weather-form] input[name="city"]',modal).value=readLocal(WEATHER_LOCATION_KEY)?.query||'';
  if(view==='offwork')$('[data-offwork-form] input[name="time"]',modal).value=readLocal(OFFWORK_TIME_KEY)||'18:00';
  requestAnimationFrame(()=>$('[data-home-tool-view]:not([hidden]) input, [data-home-tool-view]:not([hidden]) textarea',modal)?.focus());
}

function closeTool(){const modal=$('[data-home-tool-modal]');if(!modal)return;modal.hidden=true;document.body.classList.remove('modal-open');setStatus('');}

async function saveCity(form){
  const input=form.elements.city;const city=String(input.value||'').trim();if(city.length<2)throw new Error('请至少输入 2 个字的城市名称。');
  const query=new URLSearchParams({name:city,count:'1',language:'zh',format:'json'});
  const data=await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${query}`);const result=data?.results?.[0];
  if(!result)throw new Error('没有找到这个城市，请换个名称试试。');
  const area=[result.name,result.admin1].filter((item,index,list)=>item&&list.indexOf(item)===index).join(' · ');
  const location={query:city,label:area||city,latitude:result.latitude,longitude:result.longitude,timezone:result.timezone||'auto'};
  writeLocal(WEATHER_LOCATION_KEY,location);writeLocal(WEATHER_CACHE_KEY,null);renderWeather();await fetchWeather(location);return location;
}

function setBusy(form,busy){Array.from(form.elements).forEach(node=>{node.disabled=busy;});}

function bindForms(){
  $('[data-weather-form]')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;setBusy(form,true);setStatus('正在查找城市和天气…');
    try{const location=await saveCity(form);closeTool();notify(`已切换到 ${location.label}。`);}catch(error){setStatus(error.name==='AbortError'?'天气服务连接超时，请稍后再试。':error.message||'天气读取失败。',true);}finally{setBusy(form,false);}
  });
  $('[data-offwork-form]')?.addEventListener('submit',event=>{
    event.preventDefault();const time=String(new FormData(event.currentTarget).get('time')||'');if(!/^\d{2}:\d{2}$/.test(time)){setStatus('请选择正确的下班时间。',true);return;}
    writeLocal(OFFWORK_TIME_KEY,time);renderCountdown();closeTool();notify(`下班时间已设为 ${time}。`);
  });
  $('[data-feedback-form]')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;const data=new FormData(form);setBusy(form,true);setStatus('正在提交反馈…');
    try{await authStore.submitFeedback({category:data.get('category'),content:data.get('content')});form.reset();closeTool();notify('反馈已收到，谢谢你。');}
    catch(error){setStatus(error.message||'反馈提交失败，请稍后再试。',true);if(!authStore.state.session?.user){closeTool();openAccount();notify('请先登录，刚才填写的内容会保留。');}}
    finally{setBusy(form,false);}
  });
}

function initHomeWidgets(options={}){
  if(started)return;started=true;notify=options.toast||notify;openAccount=options.openAccount||openAccount;
  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-weather-open]')){openTool('weather');return;}
    if(event.target.closest?.('[data-offwork-open]')){openTool('offwork');return;}
    if(event.target.closest?.('[data-feedback-open]')){openTool('feedback');return;}
    if(event.target.closest?.('[data-close-home-tool]')||event.target.matches?.('[data-home-tool-modal]'))closeTool();
  });
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('[data-home-tool-modal]')?.hidden)closeTool();});
  bindForms();renderCountdown();renderWeather();loadWeather().catch(()=>{});
  setInterval(renderCountdown,1000);
  setInterval(()=>loadWeather(true).catch(()=>{}),WEATHER_REFRESH_MS);
}

export const homeWidgets={init:initHomeWidgets,renderCountdown,loadWeather};
