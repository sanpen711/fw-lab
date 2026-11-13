import {MEMBER_FRAMES,MEMBER_LAYOUTS} from '../../desktop-v11/src/membership-levels.js';

const themes=[['rose_gold','玫瑰金'],['black_gold','黑金'],['pink_starlight','粉色星光']];

export function membershipAppearanceForm(saved,posts,escape){
  const value=saved||{};
  const select=(name,label,options,initial)=>`<label class="field">${label}<select name="${name}">
    ${options.map(([key,copy])=>`<option value="${escape(key)}" ${String(value[name]??initial)===String(key)?'selected':''}>${escape(copy)}</option>`).join('')}
  </select></label>`;
  return `
    <label class="checkbox-field"><input type="checkbox" name="enabled" ${value.enabled!==false?'checked':''}>在客户端显示测试装扮</label>
    ${select('level','徽章等级',Array.from({length:9},(_,i)=>[i+1,`V${i+1}`]),1)}
    ${select('theme','配色',themes,'rose_gold')}
    ${select('frame','头像框',MEMBER_FRAMES,'double')}
    ${select('nickname_color','昵称颜色',[['default','原色'],...themes],'default')}
    ${select('card_layout','资料卡',MEMBER_LAYOUTS,'classic')}
    <label class="field">称号<input name="title" maxlength="8" value="${escape(value.title)}"></label>
    <label class="field">一句话介绍<textarea name="intro" maxlength="60" rows="2">${escape(value.intro)}</textarea></label>
    ${select('featured_post_id','代表作',[
      ['', '暂不展示'],
      ...posts.map(post=>[post.id,String(post.content||'').replace(/\[\[FW_[^\]]+\]\]/g,'[媒体]').trim().slice(0,50)||'媒体帖子'])
    ],'')}`;
}

export function membershipAppearanceInput(data){
  return {
    p_enabled:data.has('enabled'),
    p_level:Number(data.get('level')),
    p_theme:data.get('theme'),
    p_frame:data.get('frame'),
    p_nickname_color:data.get('nickname_color'),
    p_title:data.get('title'),
    p_card_layout:data.get('card_layout'),
    p_intro:data.get('intro'),
    p_featured_post_id:data.get('featured_post_id')||null
  };
}
