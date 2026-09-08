import {authStore} from './auth-store.js';
import {SUPABASE_URL} from './config.js';

const WEATHER_LOCATION_KEY='fw:desktop:v11:weather-location';
const WEATHER_CACHE_KEY='fw:desktop:v11:weather-cache';
const OFFWORK_TIME_KEY='fw:desktop:v11:offwork-time';
const WEATHER_FRESH_MS=60*60*1000;
const WEATHER_REFRESH_MS=60*60*1000;
const WEATHER_ENDPOINT=`${SUPABASE_URL}/functions/v1/fw-weather`;

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
let notify=()=>{};
let openAccount=()=>{};
let weatherBusy=false;
let weatherSearchResults=[];
let started=false;

function readLocal(key){
  try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}
}

function writeLocal(key,value){
  try{localStorage.setItem(key,JSON.stringify(value));}catch{}
}

function weatherIcon(code){
  const value=Number(code);
  if([100,150].includes(value))return'sun';
  if([101,102,103,151,152,153].includes(value))return'partly-cloudy';
  if([104,154].includes(value))return'cloud';
  if(value>=300&&value<400)return value>=302&&value<=304?'storm':'rain';
  if(value>=400&&value<500)return'snow';
  if(value>=500&&value<600)return'fog';
  if(value===900)return'temperature';
  if(value===901)return'snow';
  return'cloud';
}

function round(value){const number=Number(value);return Number.isFinite(number)?Math.round(number):'--';}

function renderWeather(extraMeta=''){
  const main=$('[data-weather-main]');const detail=$('[data-weather-detail]');const meta=$('[data-weather-meta]');const credit=$('[data-weather-credit]');
  if(!main||!detail||!meta)return;
  const location=readLocal(WEATHER_LOCATION_KEY);const cached=readLocal(WEATHER_CACHE_KEY);
  const validCache=cached?.provider==='qweather'&&cached?.current;
  if(credit)credit.hidden=!validCache;
  if(!location){main.textContent='设置天气';detail.textContent='点击选择你所在的县区';meta.textContent='无需定位权限';return;}
  if(!validCache){main.textContent='正在读取天气';detail.textContent=location.label;meta.textContent=extraMeta||'请稍候…';return;}
  const current=cached.current;const humidity=Number(current.humidity);
  main.innerHTML=`<svg class="ui-symbol weather-symbol" aria-hidden="true"><use href="/ui-icons.svg#${weatherIcon(current.conditionCode)}"></use></svg>${round(current.temperature)}°`;
  detail.textContent=`${location.label} · ${current.conditionText||'天气变化中'}`;
  const humidityText=Number.isFinite(humidity)?` · 湿度 ${Math.round(humidity*100)}%`:'';
  meta.textContent=extraMeta||`体感 ${round(current.apparentTemperature)}°${humidityText}`;
}

async function fetchJson(url){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);
  try{
    const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.error||`天气服务返回 ${response.status}`);
    return data;
  }finally{clearTimeout(timer);}
}

async function fetchWeather(location){
  const query=new URLSearchParams({action:'current',lat:String(location.latitude),lon:String(location.longitude)});
  const data=await fetchJson(`${WEATHER_ENDPOINT}?${query}`);
  if(!data?.current)throw new Error('暂时没有取到这个城市的天气。');
  const cached={provider:'qweather',savedAt:Date.now(),location,current:data.current,attribution:data.attribution||''};
  writeLocal(WEATHER_CACHE_KEY,cached);renderWeather();return cached;
}

async function loadWeather(force=false){
  const location=readLocal(WEATHER_LOCATION_KEY);if(!location)return;
  const cached=readLocal(WEATHER_CACHE_KEY);renderWeather();
  if(!force&&cached?.provider==='qweather'&&cached?.savedAt&&Date.now()-Number(cached.savedAt)<WEATHER_FRESH_MS)return;
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
  if(view==='weather'){
    $('[data-weather-form] input[name="city"]',modal).value=readLocal(WEATHER_LOCATION_KEY)?.query||'';
    renderWeatherResults([]);
  }
  if(view==='offwork')$('[data-offwork-form] input[name="time"]',modal).value=readLocal(OFFWORK_TIME_KEY)||'18:00';
  requestAnimationFrame(()=>$('[data-home-tool-view]:not([hidden]) input, [data-home-tool-view]:not([hidden]) textarea',modal)?.focus());
}

function closeTool(){const modal=$('[data-home-tool-modal]');if(!modal)return;modal.hidden=true;document.body.classList.remove('modal-open');setStatus('');}

function renderWeatherResults(locations){
  const host=$('[data-weather-results]');if(!host)return;host.replaceChildren();weatherSearchResults=locations;
  host.hidden=!locations.length;
  locations.forEach((location,index)=>{
    const button=document.createElement('button');button.type='button';button.className='weather-result';button.dataset.weatherLocation=String(index);
    const name=document.createElement('strong');name.textContent=location.name;
    const parent=document.createElement('span');parent.textContent=[location.adm2,location.adm1].filter((value,position,list)=>value&&list.indexOf(value)===position).join(' · ');
    button.append(name,parent);host.append(button);
  });
}

async function searchCities(form){
  const input=form.elements.city;const city=String(input.value||'').trim();if(city.length<2)throw new Error('请至少输入 2 个字的县区或城市名称。');
  const query=new URLSearchParams({action:'search',q:city});const data=await fetchJson(`${WEATHER_ENDPOINT}?${query}`);
  const locations=Array.isArray(data?.locations)?data.locations:[];if(!locations.length)throw new Error('没有找到这个地区，请加上省或市名称再试。');
  renderWeatherResults(locations);return locations;
}

async function selectWeatherLocation(location){
  const selected={provider:'qweather',query:location.name,label:location.label||location.name,locationId:location.id,latitude:location.latitude,longitude:location.longitude,timezone:location.timezone||'Asia/Shanghai'};
  writeLocal(WEATHER_LOCATION_KEY,selected);writeLocal(WEATHER_CACHE_KEY,null);renderWeather();await fetchWeather(selected);return selected;
}

function setBusy(form,busy){Array.from(form.elements).forEach(node=>{node.disabled=busy;});}

function bindForms(){
  $('[data-weather-form]')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;setBusy(form,true);renderWeatherResults([]);setStatus('正在查找县区…');
    try{const locations=await searchCities(form);setStatus(`找到 ${locations.length} 个结果，请选择正确的地区。`);}catch(error){setStatus(error.name==='AbortError'?'天气服务连接超时，请稍后再试。':error.message||'地区查找失败。',true);}finally{setBusy(form,false);}
  });
  $('[data-weather-results]')?.addEventListener('click',async event=>{
    const button=event.target.closest?.('[data-weather-location]');if(!button)return;const location=weatherSearchResults[Number(button.dataset.weatherLocation)];if(!location)return;
    const form=$('[data-weather-form]');setBusy(form,true);setStatus(`正在读取 ${location.label||location.name} 的天气…`);
    try{const selected=await selectWeatherLocation(location);closeTool();notify(`已切换到 ${selected.label}。`);}catch(error){setStatus(error.name==='AbortError'?'天气服务连接超时，请稍后再试。':error.message||'天气读取失败。',true);}finally{setBusy(form,false);}
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
