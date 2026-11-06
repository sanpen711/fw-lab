import {test,expect} from '@playwright/test';

const user={id:'00000000-0000-4000-8000-000000000024',aud:'authenticated',role:'authenticated',email:'desktop-test@example.com',email_confirmed_at:'2026-09-18T00:00:00.000Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{nickname:'测试研究员',lab_code:'FWTEST1'},created_at:'2026-09-18T00:00:00.000Z'};
test.beforeEach(async({page})=>{
  await page.addInitScript(user=>{
    localStorage.setItem('fw-lab-auth-token',JSON.stringify({access_token:'desktop-test-access-token',refresh_token:'desktop-test-refresh-token',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user}));
    localStorage.setItem('fw:desktop:v11:last-game','contra');
  },user);
  await page.route('https://**.supabase.co/**',async route=>{
    const url=route.request().url();
    if(url.includes('/auth/v1/user'))return route.fulfill({contentType:'application/json',body:JSON.stringify(user)});
    if(url.includes('/auth/v1/token'))return route.fulfill({contentType:'application/json',body:JSON.stringify({access_token:'desktop-test-access-token',refresh_token:'desktop-test-refresh-token',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user})});
    if(url.includes('/rest/v1/rpc/fw_get_current_profile'))return route.fulfill({contentType:'application/json',body:JSON.stringify([{id:user.id,nickname:'测试研究员',role:'user',lab_code:'FWTEST1',is_banned:false}])});
    return route.fulfill({contentType:'application/json',body:'[]'});
  });
});

test('生产包只提供四款启用游戏，旧记录或内部调用不能打开魂斗罗',async({page})=>{
  await page.goto('/');
  await expect(page.locator('.hero-card')).toBeVisible();
  await expect(page.locator('.hero-visual')).toHaveCount(0);
  await page.locator('.nav-item[data-nav="games"]').click();
  await expect(page.locator('[data-game-open]')).toHaveCount(4);
  await expect(page.locator('[data-game-open="contra"]')).toHaveCount(0);
  await page.evaluate(()=>(window as any).__FW_GAMES__.open('contra'));
  await expect(page.locator('[data-game-stage]')).toBeHidden();
  await expect(page.locator('[data-game-frame]')).toHaveAttribute('src','about:blank');
});

test('生产包的启用游戏均能加载，脚本、字体和数独工作线程没有资源缺失',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.url().startsWith('http://127.0.0.1:1422/')&&response.status()>=400)errors.push(response.status()+' '+response.url());});
  await page.goto('/');await page.locator('.nav-item[data-nav="games"]').click();
  for(const game of ['2048','minesweeper','sudoku','reaction']){
    await page.locator('[data-game-open="'+game+'"]').click();
    const frame=page.frames().find(frame=>frame.url().includes('/games/'+game+'/index.html'))||await page.waitForEvent('framenavigated',frame=>frame.url().includes('/games/'+game+'/index.html'));
    await frame.waitForLoadState('networkidle');
    await expect(page.frameLocator('[data-game-frame]').locator('body')).toBeVisible();
    await page.locator('[data-game-back]').click();
    await expect(page.locator('[data-game-hall]')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('生产包无法访问 ROM、模拟器、停用游戏或旧版网页',async({request})=>{
  for(const path of ['/nes-player.html','/games/nes/roms/contra-infinite-spread.nes','/emulatorjs/loader.js','/games/snake/index.html','/games/catch/index.html','/news.html','/games.html','/app/index.html','/hero-office.webp','/mascot-fufu-seated.webp']){
    const response=await request.get(path);expect(response.status(),path).toBe(404);
  }
});
