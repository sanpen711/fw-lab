import {LEVEL_REWARDS,MEMBER_FRAMES,MEMBER_LAYOUTS} from '../../desktop-v11/src/membership-levels.js';
import './membership-appearance.css';

const badges=import.meta.glob('../../desktop-v11/public/membership-badges/v*.png',{
  eager:true,query:'?url',import:'default'
});
const themes=[['rose_gold','玫瑰金'],['black_gold','黑金'],['pink_starlight','粉色']];
const levels=LEVEL_REWARDS.map((reward,index)=>[index+1,`V${index+1}`,reward]);
const defaults={enabled:true,level:1,theme:'rose_gold',frame:'double',nickname_color:'default',
  card_layout:'classic',title:'',intro:'',featured_post_id:''};
const plain=value=>String(value||'').replace(/\[\[FW_[^\]]+\]\]/g,'[媒体]').replace(/\s+/g,' ').trim();

function badge(level){
  const src=badges[`../../desktop-v11/public/membership-badges/v${level}.png`];
  return src?`<img class="appearance-badge" src="${src}" alt="" width="160" height="128">`:'';
}

function choices(name,label,options,selected,sample){
  return `<fieldset class="appearance-options appearance-options-${name}"><legend>${label}</legend>
    <div>${options.map(([key,caption,detail])=>`<label class="appearance-option">
      <input type="radio" name="${name}" value="${key}" ${String(selected)===String(key)?'checked':''}>
      <span class="appearance-tile" title="${typeof detail==='string'?detail:caption}">${sample(key)}<span>${caption}</span>
        ${typeof detail==='number'&&detail>1?`<small>V${detail}</small>`:''}</span>
    </label>`).join('')}</div></fieldset>`;
}

function profilePreview(draft,admin,posts,escape){
  const name=admin.nickname||'管理员';
  const post=posts.find(row=>String(row.id)===draft.featured_post_id);
  const avatar=admin.avatarUrl?`<img src="${escape(admin.avatarUrl)}" alt="">`:escape(name.slice(0,2));
  return `<article class="appearance-card appearance-theme-${draft.theme} appearance-layout-${draft.card_layout}">
    <div class="appearance-card-head">
      <span class="appearance-avatar appearance-frame-${draft.frame}">${avatar}</span>
      <div><h4 class="appearance-name appearance-color-${draft.nickname_color}">${escape(name)} ${badge(draft.level)}</h4>
        <p>实验品编号：${escape(admin.labCode||'未设置')}</p>
        ${draft.title.trim()?`<span class="appearance-title">${escape(draft.title.trim())}</span>`:''}
      </div>
    </div>
    ${draft.intro.trim()?`<p class="appearance-intro">${escape(draft.intro.trim())}</p>`:''}
    ${post?`<div class="appearance-featured"><small>我的代表作</small><p>${escape(plain(post.content).slice(0,100)||'媒体帖子')}</p></div>`:''}
  </article>`;
}

export function openMembershipAppearance(dialog,{admin,saved,previous,posts,escape,save,onSaved}){
  const settings={...defaults,...(saved||previous)};
  const featuredAvailable=posts.some(post=>String(post.id)===String(settings.featured_post_id));
  dialog.setAttribute('aria-labelledby','appearance-heading');
  dialog.innerHTML=`<form method="dialog" class="appearance-form">
    <header class="dialog-head"><div><h2 id="appearance-heading">装扮测试</h2><p>当前管理员 · ${escape(admin.nickname)}</p></div>
      <button class="icon-button" type="button" data-appearance-close aria-label="关闭">×</button>
    </header>
    <div class="dialog-body appearance-editor">
      <fieldset class="appearance-controls" aria-label="装扮选项">
        <label class="checkbox-field"><input type="checkbox" name="enabled" ${settings.enabled?'checked':''}>在客户端显示测试装扮</label>
        ${choices('level','徽章等级',levels,settings.level,badge)}
        ${choices('theme','配色',themes,settings.theme,key=>`<i class="appearance-swatch appearance-theme-${key}" aria-hidden="true"></i>`)}
        ${choices('frame','头像框',MEMBER_FRAMES,settings.frame,key=>`<i class="appearance-frame-sample appearance-avatar appearance-frame-${key}" aria-hidden="true">${escape((admin.nickname||'FW').slice(0,2))}</i>`)}
        ${choices('nickname_color','昵称颜色',[['default','原色'],...themes],settings.nickname_color,key=>`<i class="appearance-ink appearance-color-${key}" aria-hidden="true">Aa</i>`)}
        ${choices('card_layout','资料卡',MEMBER_LAYOUTS,settings.card_layout,key=>`<i class="appearance-layout-sample appearance-layout-${key}" aria-hidden="true"><b></b><b></b></i>`)}
        <label class="field">我的称号<input name="title" maxlength="8" placeholder="最多 8 个字" value="${escape(settings.title)}"></label>
        <label class="field">一句话介绍<textarea name="intro" maxlength="60" rows="2" placeholder="最多 60 个字">${escape(settings.intro)}</textarea></label>
        <label class="field">代表作<select name="featured_post_id">
          <option value="">暂不展示</option>
          ${posts.map(post=>`<option value="${escape(post.id)}" ${String(post.id)===String(settings.featured_post_id)?'selected':''}>${escape(plain(post.content).slice(0,50)||'媒体帖子')}</option>`).join('')}
        </select>${settings.featured_post_id&&!featuredAvailable?'<small>原代表作已无法展示，可以重新选择。</small>':''}</label>
      </fieldset>
      <aside class="appearance-preview" aria-label="资料卡预览">
        <h3>资料卡预览</h3><div data-appearance-preview></div>
        <p data-appearance-visibility></p>
        ${saved&&previous?'<button type="button" class="button compact" data-appearance-history>载入迁移前的装扮</button>':''}
      </aside>
    </div>
    <footer class="dialog-actions appearance-actions">
      <p data-appearance-status role="status"></p>
      <button class="button" type="button" data-appearance-reset>恢复已保存</button>
      <button class="button primary" type="submit">保存装扮</button>
    </footer>
  </form>`;

  const form=dialog.querySelector('form');
  const preview=form.querySelector('[data-appearance-preview]');
  const visibility=form.querySelector('[data-appearance-visibility]');
  const status=form.querySelector('[data-appearance-status]');
  const history=form.querySelector('[data-appearance-history]');
  const close=form.querySelector('[data-appearance-close]');
  const controls=form.querySelector('.appearance-controls');
  const submit=form.querySelector('[type="submit"]');
  const reset=form.querySelector('[data-appearance-reset]');
  const read=()=>Object.fromEntries(new FormData(form));
  const baseline=JSON.stringify(read());
  let saving=false;

  function render(){
    const draft=read();
    const changed=JSON.stringify(draft)!==baseline;
    controls.className=`appearance-controls appearance-theme-${draft.theme}`;
    preview.innerHTML=profilePreview(draft,admin,posts,escape);
    visibility.textContent=draft.enabled?'保存后在客户端显示这套装扮。':'关闭展示后，客户端会显示普通样式。';
    status.textContent=changed?'有未保存的修改':saved?'当前设置已保存':previous?'已载入迁移前的装扮':'尚未保存装扮';
    status.classList.remove('is-error');
    reset.disabled=!changed;
  }

  form.addEventListener('input',render);
  reset.addEventListener('click',()=>{
    form.reset();
    render();
  });
  history?.addEventListener('click',()=>{
    for(const name of Object.keys(defaults)){
      if(name==='enabled')continue;
      const value=String(previous[name]??defaults[name]);
      const field=form.elements.namedItem(name);
      field.value=name==='featured_post_id'&&!posts.some(post=>String(post.id)===value)?'':value;
    }
    render();
  });
  close.addEventListener('click',()=>dialog.close());
  const preventCancel=event=>{if(saving)event.preventDefault();};
  dialog.addEventListener('cancel',preventCancel);
  dialog.addEventListener('close',()=>{
    dialog.removeEventListener('cancel',preventCancel);
    if(!dialog.open)dialog.removeAttribute('aria-labelledby');
  },{once:true});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(saving)return;
    const draft=read();
    saving=true;
    controls.disabled=close.disabled=submit.disabled=reset.disabled=true;
    if(history)history.disabled=true;
    status.classList.remove('is-error');
    status.textContent='正在保存装扮…';
    try{
      await save({p_enabled:Boolean(draft.enabled),p_level:Number(draft.level),p_theme:draft.theme,
        p_frame:draft.frame,p_nickname_color:draft.nickname_color,p_title:draft.title,
        p_card_layout:draft.card_layout,p_intro:draft.intro,p_featured_post_id:draft.featured_post_id||null});
      if(form.isConnected&&dialog.open){dialog.close();onSaved();}
    }catch(error){
      status.textContent=error.message||'保存装扮失败。';
      status.classList.add('is-error');
    }finally{
      saving=false;
      controls.disabled=close.disabled=submit.disabled=false;
      reset.disabled=JSON.stringify(read())===baseline;
      if(history)history.disabled=false;
    }
  });
  render();
  dialog.showModal();
}
