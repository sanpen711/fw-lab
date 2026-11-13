import {test,expect} from '@playwright/test';

test('管理员能预览、恢复和保存自己完整的测试装扮',async({page})=>{
  const user={id:'00000000-0000-4000-8000-000000000053',email:'admin@example.invalid',
    aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{nickname:'管理员'}};
  const saves:Record<string,unknown>[]=[];
  const previous={theme:'black_gold',frame:'fufu',nickname_color:'rose_gold',card_layout:'folio',
    title:'准点下班',intro:'研究如何准点下班',featured_post_id:45};
  let saved:Record<string,unknown>|null=null;
  let rejectSave=true;
  await page.addInitScript(account=>localStorage.setItem('fw-admin-desktop-auth',JSON.stringify({
    user:account,access_token:'test',refresh_token:'test',expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer'
  })),user);
  await page.route('https://**.supabase.co/**',async route=>{
    const url=new URL(route.request().url());
    const path=url.pathname;
    let data:unknown=[];
    if(path.endsWith('/auth/v1/user'))data=user;
    if(path.endsWith('/fw_get_current_profile'))data=[{id:user.id,nickname:'F.w研究所-所长',lab_code:'FW-0001',role:'admin',is_banned:false}];
    if(path.endsWith('/admin_get_appearance_test'))data=saved;
    if(path.endsWith('/fw_get_own_membership_appearance'))data=[previous];
    if(path.endsWith('/fw_get_own_membership_growth'))data={level:5};
    if(path.endsWith('/posts')&&url.searchParams.has('user_id')){
      data=url.searchParams.has('id')?[{id:45,content:'以前选中的代表作'}]:[{id:46,content:'审核中的帖子'},{id:47,content:'新代表作'}];
    }
    if(path.endsWith('/fw_content_review_visibility')){
      data=route.request().postDataJSON().p_refs.map(({id})=>({target_id:id,visible:id!=='46'}));
    }
    if(path.endsWith('/admin_save_appearance_test')){
      if(rejectSave){
        rejectSave=false;
        return route.fulfill({status:400,json:{message:'请稍后重试'}});
      }
      const fields=route.request().postDataJSON();saves.push(fields);
      saved=Object.fromEntries(Object.entries(fields).map(([key,value])=>[key.slice(2),value]));
      data=null;
    }
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.setViewportSize({width:1190,height:729});
  await page.goto('/');
  await page.locator('[data-nav="memberships"]').click();
  const open=page.getByRole('button',{name:'装扮测试'});
  const dialog=page.getByRole('dialog',{name:'装扮测试'});
  const group=(name:string)=>dialog.getByRole('group',{name,exact:true});
  const preview=dialog.getByRole('complementary',{name:'资料卡预览'});
  const restore=dialog.getByRole('button',{name:'恢复已保存'});
  const save=dialog.getByRole('button',{name:'保存装扮'});
  await open.click();
  for(const [name,count] of [['徽章等级',9],['配色',3],['头像框',8],['昵称颜色',4],['资料卡',4]] as const){
    await expect(group(name).getByRole('radio')).toHaveCount(count);
  }
  await expect(group('徽章等级').getByRole('radio',{name:'V5',exact:true})).toBeChecked();
  await expect(preview.getByText('FW-0001',{exact:false})).toBeVisible();
  await expect(preview.getByText('以前选中的代表作')).toBeVisible();
  await expect(dialog.getByRole('option',{name:'审核中的帖子'})).toHaveCount(0);
  const badge=preview.locator('.appearance-badge');
  await expect.poll(()=>badge.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth)).toBe(160);
  if(process.env.FW_APPEARANCE_SCREENSHOT)await page.screenshot({path:process.env.FW_APPEARANCE_SCREENSHOT});
  await group('头像框').getByRole('radio',{name:/冠冕/}).check();
  await expect(preview.locator('.appearance-frame-crown')).toBeVisible();
  await restore.click();
  await expect(preview.locator('.appearance-frame-fufu')).toBeVisible();
  await expect(restore).toBeDisabled();
  await group('徽章等级').getByRole('radio',{name:'V9',exact:true}).check();
  await group('配色').getByRole('radio',{name:'粉色',exact:true}).check();
  await group('头像框').getByRole('radio',{name:/冠冕/}).check();
  await group('昵称颜色').getByRole('radio',{name:'粉色',exact:true}).check();
  await group('资料卡').getByRole('radio',{name:/荣誉/}).check();
  await dialog.getByLabel('我的称号').fill('今天摸鱼');
  await dialog.getByLabel('一句话介绍').fill('先去喝杯茶');
  await dialog.getByLabel('代表作').selectOption('47');
  await expect(preview.locator('.appearance-layout-honor')).toBeVisible();
  await expect(preview.locator('.appearance-name')).toHaveCSS('color','rgb(177, 62, 117)');
  await expect(preview.getByText('今天摸鱼')).toBeVisible();
  await expect(preview.getByText('先去喝杯茶')).toBeVisible();
  await expect(preview.getByText('新代表作')).toBeVisible();
  await save.click();
  await expect(dialog.getByRole('status')).toHaveText('保存装扮测试失败：请稍后重试');
  await expect(preview.getByText('新代表作')).toBeVisible();
  await save.click();
  await expect(dialog).toBeHidden();
  expect(saves[0]).toEqual({p_enabled:true,p_level:9,p_theme:'pink_starlight',p_frame:'crown',
    p_nickname_color:'pink_starlight',p_title:'今天摸鱼',p_intro:'先去喝杯茶',p_card_layout:'honor',p_featured_post_id:'47'});
  await open.click();
  await expect(dialog.getByLabel('我的称号')).toHaveValue('今天摸鱼');
  await dialog.getByRole('button',{name:'载入迁移前的装扮'}).click();
  await expect(preview.locator('.appearance-frame-fufu')).toBeVisible();
  await expect(preview.getByText('以前选中的代表作')).toBeVisible();
  await restore.click();
  await expect(preview.locator('.appearance-frame-crown')).toBeVisible();
  await dialog.getByRole('checkbox').uncheck();
  await expect(preview.getByText('关闭展示后，客户端会显示普通样式。')).toBeVisible();
  await save.click();
  await expect(dialog).toBeHidden();
  expect(saves[1]).toEqual({...saves[0],p_enabled:false});
});
