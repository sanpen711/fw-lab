import {test,expect} from '@playwright/test';

test('管理员能保存自己的测试装扮和关闭展示',async({page})=>{
  const user={id:'00000000-0000-4000-8000-000000000053',email:'admin@example.invalid',
    aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{nickname:'管理员'}};
  const saves:Record<string,unknown>[]=[];
  let saved:Record<string,unknown>|null=null;
  await page.addInitScript(account=>localStorage.setItem('fw-admin-desktop-auth',JSON.stringify({
    user:account,access_token:'test',refresh_token:'test',expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer'
  })),user);
  await page.route('https://**.supabase.co/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data:unknown=[];
    if(path.endsWith('/auth/v1/user'))data=user;
    if(path.endsWith('/fw_get_current_profile'))data=[{id:user.id,nickname:'管理员',role:'admin',is_banned:false}];
    if(path.endsWith('/admin_get_appearance_test'))data=saved;
    if(path.endsWith('/admin_save_appearance_test')){
      const fields=route.request().postDataJSON();saves.push(fields);
      saved=Object.fromEntries(Object.entries(fields).map(([key,value])=>[key.slice(2),value]));
      data=null;
    }
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/');
  await page.locator('[data-nav="memberships"]').click();
  const open=page.getByRole('button',{name:'装扮测试'});
  const dialog=page.getByRole('dialog');
  await open.click();
  await dialog.getByRole('checkbox').check();
  await dialog.getByLabel('徽章等级').selectOption('9');
  await dialog.getByLabel('头像框').selectOption('crown');
  await dialog.getByLabel('昵称颜色').selectOption('pink_starlight');
  await dialog.getByRole('button',{name:'保存装扮'}).click();
  await expect(dialog).toBeHidden();
  expect(saves[0]).toMatchObject({p_enabled:true,p_level:9,p_frame:'crown',p_nickname_color:'pink_starlight'});
  expect(saves[0]).not.toHaveProperty('p_user_id');
  await open.click();
  await expect(dialog.getByLabel('昵称颜色')).toHaveValue('pink_starlight');
  await dialog.getByRole('checkbox').uncheck();
  await dialog.getByRole('button',{name:'保存装扮'}).click();
  await expect(dialog).toBeHidden();
  expect(saves[1].p_enabled).toBe(false);
});
