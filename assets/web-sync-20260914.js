(function(){
  'use strict';
  window.__FW_PC_WEB_SYNC__=true;
  const PC_BREAKPOINT=821;
  const WEATHER_ENDPOINT='https://ekbovsmxbiplhyrzxoyw.supabase.co/functions/v1/fw-weather';
  const WEATHER_LOCATION_KEY='fw:web:weather-location';
  const WEATHER_CACHE_KEY='fw:web:weather-cache';
  const OFFWORK_TIME_KEY='fw:web:offwork-time';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}};
  const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
  const file=()=>((location.pathname.split('/').pop()||'index.html').toLowerCase());

  function isPc(){return window.innerWidth>=PC_BREAKPOINT && !/Android|iPhone|iPod|Mobile|Windows Phone/i.test(navigator.userAgent||'')}
  function active(target){return file()===target?'active':''}
  function removeLegacyHeaderSocial(){
    if(!isPc())return;
    $$('.header .fw-social-actions').forEach(node=>node.remove());
  }
  function installNav(){
    if(!isPc())return;
    const nav=$('.header .nav');
    if(!nav||nav.dataset.webSync==='1')return;
    nav.dataset.webSync='1';
    const current=file();
    const moreActive=['archive.html','rules.html','admin.html'].includes(current)?'active':'';
    nav.innerHTML=`
      <a class="${active('index.html')}" href="index.html">首页</a>
      <a class="${active('square.html')}" href="square.html">精神广场</a>
      <a class="${active('rooms.html')}" href="rooms.html">学术研讨</a>
      <a class="${active('bird.html')}" href="bird.html">新闻专区</a>
      <a class="${active('play.html')}" href="play.html">下班开黑</a>
      <a class="${active('games.html')}" href="games.html">小游戏</a>
      <a class="${active('buddy.html')}" href="buddy.html">搭子</a>
      <a class="${active('membership.html')}" href="membership.html">会员中心</a>
      <span class="web-more">
        <button class="web-more-toggle ${moreActive}" type="button" aria-expanded="false">更多</button>
        <span class="web-more-menu" hidden>
          <a class="${active('archive.html')}" href="archive.html">档案</a>
          <a class="${active('rules.html')}" href="rules.html">入馆须知</a>
          <a class="${active('admin.html')}" href="admin.html">处理公告</a>
        </span>
      </span>`;
    const button=$('.web-more-toggle',nav),menu=$('.web-more-menu',nav);
    button?.addEventListener('click',e=>{e.stopPropagation();const next=menu.hidden;menu.hidden=!next;button.setAttribute('aria-expanded',String(next));});
    document.addEventListener('click',e=>{if(!e.target.closest('.web-more')){if(menu)menu.hidden=true;if(button)button.setAttribute('aria-expanded','false')}});
  }

  function ensureModal(){
    let modal=$('[data-web-tool-modal]');
    if(modal)return modal;
    modal=document.createElement('div');modal.className='web-modal';modal.hidden=true;modal.dataset.webToolModal='';
    modal.innerHTML=`<div class="web-modal-card"><button class="web-modal-close" type="button" data-web-close>×</button><div data-web-modal-content></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('[data-web-close]'))closeModal()});
    window.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
    return modal;
  }
  function openModal(html){const modal=ensureModal();$('[data-web-modal-content]',modal).innerHTML=html;modal.hidden=false;document.body.style.overflow='hidden';return modal}
  function closeModal(){const modal=$('[data-web-tool-modal]');if(modal)modal.hidden=true;document.body.style.overflow=''}
  function status(message,error){const node=$('[data-web-status]');if(node){node.textContent=message||'';node.classList.toggle('error',!!error)}}
  function toast(message){let node=$('.fw-toast');if(!node){node=document.createElement('div');node.className='fw-toast';document.body.appendChild(node)}node.textContent=message;node.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>node.classList.remove('show'),2600)}

  function renderWeather(extra){
    const main=$('[data-weather-main]'),detail=$('[data-weather-detail]'),meta=$('[data-weather-meta]');if(!main||!detail||!meta)return;
    const loc=read(WEATHER_LOCATION_KEY),cache=read(WEATHER_CACHE_KEY);
    if(!loc){main.textContent='设置天气';detail.textContent='点击选择你所在的县区';meta.textContent='无需定位权限';return}
    if(!cache?.current){main.textContent='正在读取天气';detail.textContent=loc.label;meta.textContent=extra||'点击可重新设置';return}
    const c=cache.current;main.textContent=`${Math.round(Number(c.temperature)||0)}°`;detail.textContent=`${loc.label} · ${c.conditionText||'天气变化中'}`;meta.textContent=extra||`体感 ${Math.round(Number(c.apparentTemperature)||0)}°${Number.isFinite(Number(c.humidity))?` · 湿度 ${Math.round(Number(c.humidity)*100)}%`:''}`;
  }
  async function fetchJson(url){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);try{const res=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});const data=await res.json().catch(()=>null);if(!res.ok)throw new Error(data?.error||`服务返回 ${res.status}`);return data}finally{clearTimeout(timer)}}
  async function loadWeather(force){const loc=read(WEATHER_LOCATION_KEY);if(!loc)return;const cache=read(WEATHER_CACHE_KEY);renderWeather();if(!force&&cache?.savedAt&&Date.now()-cache.savedAt<3600000)return;try{renderWeather('正在更新…');const q=new URLSearchParams({action:'current',lat:String(loc.latitude),lon:String(loc.longitude)});const data=await fetchJson(`${WEATHER_ENDPOINT}?${q}`);write(WEATHER_CACHE_KEY,{savedAt:Date.now(),current:data.current,location:loc});renderWeather()}catch(e){renderWeather(cache?.current?'更新失败，点击重试':'天气暂时取不到，点击重试')}}
  function weatherDialog(){
    const modal=openModal(`<h2>设置天气</h2><p>输入县、区或城市名称，天气仍由和风天气服务提供。</p><form data-web-weather-form><label>地区</label><input name="city" placeholder="例如：宝安区、昆山市" autocomplete="off"><div class="web-result-list" data-web-weather-results></div><div class="web-status" data-web-status></div><div class="web-modal-actions"><button class="web-secondary" type="button" data-web-close>取消</button><button class="web-primary" style="margin:0;min-height:42px" type="submit">查找地区</button></div></form>`);
    const form=$('[data-web-weather-form]',modal),results=$('[data-web-weather-results]',modal);form.addEventListener('submit',async e=>{e.preventDefault();const q=String(new FormData(form).get('city')||'').trim();if(q.length<2){status('请至少输入 2 个字。',true);return}status('正在查找…');results.innerHTML='';try{const data=await fetchJson(`${WEATHER_ENDPOINT}?${new URLSearchParams({action:'search',q})}`);const list=Array.isArray(data?.locations)?data.locations:[];if(!list.length)throw new Error('没有找到这个地区。');status(`找到 ${list.length} 个结果，请选择。`);list.forEach(loc=>{const b=document.createElement('button');b.type='button';b.innerHTML=`<strong>${loc.name||''}</strong><br><small>${[loc.adm2,loc.adm1].filter(Boolean).join(' · ')}</small>`;b.addEventListener('click',async()=>{const selected={query:q,label:loc.label||loc.name,latitude:loc.latitude,longitude:loc.longitude,id:loc.id};write(WEATHER_LOCATION_KEY,selected);write(WEATHER_CACHE_KEY,null);status(`正在读取 ${selected.label}…`);try{await loadWeather(true);closeModal();toast(`已切换到 ${selected.label}`)}catch(err){status(err.message||'天气读取失败。',true)}});results.appendChild(b)})}catch(err){status(err.name==='AbortError'?'连接超时，请稍后再试。':err.message||'地区查找失败。',true)}});
  }

  function renderCountdown(){const value=$('[data-offwork-value]'),detail=$('[data-offwork-detail]'),meta=$('[data-offwork-meta]');if(!value||!detail||!meta)return;const saved=read(OFFWORK_TIME_KEY);const time=typeof saved==='string'&&/^\d{2}:\d{2}$/.test(saved)?saved:'';if(!time){value.textContent='设置时间';detail.textContent='今天几点下班？';meta.textContent='点击设置下班时间';return}const [h,m]=time.split(':').map(Number),now=new Date(),target=new Date(now);target.setHours(h,m,0,0);const diff=target-now;if(diff<=0){value.textContent='已经下班';detail.textContent='今天辛苦了，剩下的明天再说';meta.textContent=`下班时间 ${time} · 点击修改`;return}const sec=Math.floor(diff/1000),hh=Math.floor(sec/3600),mm=Math.floor(sec%3600/60),ss=sec%60;value.textContent=[hh,mm,ss].map(v=>String(v).padStart(2,'0')).join(':');detail.textContent=`距离 ${time} 下班`;meta.textContent=hh<1?'最后一小时，稳住':'点击修改下班时间'}
  function offworkDialog(){const saved=read(OFFWORK_TIME_KEY)||'18:00';const modal=openModal(`<h2>下班倒计时</h2><p>时间只保存在当前浏览器。</p><form data-web-offwork-form><label>下班时间</label><input type="time" name="time" value="${saved}"><div class="web-modal-actions"><button class="web-secondary" type="button" data-web-close>取消</button><button class="web-primary" style="margin:0;min-height:42px" type="submit">保存</button></div></form>`);$('[data-web-offwork-form]',modal).addEventListener('submit',e=>{e.preventDefault();const time=String(new FormData(e.currentTarget).get('time')||'');if(!/^\d{2}:\d{2}$/.test(time))return;write(OFFWORK_TIME_KEY,time);renderCountdown();closeModal();toast(`下班时间已设为 ${time}`)})}

  async function waitDb(){for(let i=0;i<50;i++){if(window.fwDb?.enabled&&window.fwDb?.client)return window.fwDb;await new Promise(r=>setTimeout(r,100))}return null}
  function feedbackDialog(){const modal=openModal(`<h2>反馈意见</h2><p>遇到问题，或者有个小建议，都可以直接提交。</p><form data-web-feedback-form><label>类型</label><select name="category"><option value="suggestion">功能建议</option><option value="bug">问题反馈</option><option value="other">其他</option></select><label>内容</label><textarea name="content" required maxlength="1000" placeholder="写下你希望我们知道的内容"></textarea><div class="web-status" data-web-status></div><div class="web-modal-actions"><button class="web-secondary" type="button" data-web-close>取消</button><button class="web-primary" style="margin:0;min-height:42px" type="submit">提交反馈</button></div></form>`);$('[data-web-feedback-form]',modal).addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,data=new FormData(form),content=String(data.get('content')||'').trim();if(!content){status('请先写下反馈内容。',true);return}status('正在提交…');try{const fw=await waitDb();const auth=fw?.client?.auth;if(!auth)throw new Error('账号服务暂时没有准备好。');const session=(await auth.getSession()).data?.session;if(!session?.user){closeModal();window.__FW_OPEN_AUTH__?.();throw new Error('请先登录后提交反馈。')}const metadata=session.user.user_metadata||{},entry={category:String(data.get('category')||'suggestion'),content,createdAt:new Date().toISOString()},previous=Array.isArray(metadata.fw_feedback_history)?metadata.fw_feedback_history:[];const result=await auth.updateUser({data:{fw_feedback:entry,fw_feedback_history:[entry,...previous].slice(0,5)}});if(result.error)throw result.error;closeModal();toast('反馈已收到，谢谢你。')}catch(err){if(!$('[data-web-tool-modal]')?.hidden)status(err.message||'反馈提交失败，请稍后再试。',true);else toast(err.message||'请先登录。')}})}

  function initHome(){
    if(!$('[data-web-home]'))return;
    renderWeather();loadWeather(false);renderCountdown();setInterval(renderCountdown,1000);setInterval(()=>loadWeather(true),3600000);
    $('[data-weather-open]')?.addEventListener('click',weatherDialog);$('[data-offwork-open]')?.addEventListener('click',offworkDialog);$('[data-feedback-open]')?.addEventListener('click',feedbackDialog);
  }

  function hideLegacySquareActions(){if(file()!=='square.html')return;const style=document.createElement('style');style.textContent='[data-action="same"],[data-action="tissue"]{display:none!important}';document.head.appendChild(style)}
  function watchLegacyHeaderSocial(){
    if(!isPc())return;
    removeLegacyHeaderSocial();
    const header=$('.header');if(!header)return;
    const observer=new MutationObserver(()=>removeLegacyHeaderSocial());
    observer.observe(header,{childList:true,subtree:true});
  }
  function boot(){installNav();removeLegacyHeaderSocial();watchLegacyHeaderSocial();initHome();hideLegacySquareActions()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('resize',()=>{if(isPc()){installNav();removeLegacyHeaderSocial()}});
})();