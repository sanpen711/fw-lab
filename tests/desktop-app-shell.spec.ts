import { expect, test } from '@playwright/test';

test.describe('Windows 客户端专用外壳', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('fw:desktop:home-enabled-20260811', '1'));
  });

  test('首页复用网页版主体并隐藏实时牢骚', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(/fw-route-home/);
    await expect(page.locator('[data-fw-desktop-nav="home"]')).toHaveClass(/active/);
    await expect(page.locator('.fw-desktop-home')).toHaveCount(0);
    await expect(page.locator('.home-hero')).toBeVisible();
    await expect(page.locator('.home-hero .hero-title')).toHaveText('F.w 研究所');
    await expect(page.locator('.home-hero .hero-actions')).toBeVisible();
    await expect(page.locator('#live')).toBeHidden();
    await expect(page.locator('.home-hero .hero-actions a[href="rooms.html"]')).toBeHidden();
    await expect(page.locator('.home-hero .hero-actions a[href="bird.html"]')).toBeHidden();
  });

  test('每次启动固定进入首页，不恢复上次退出页面', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('fw:desktop:last-route', 'buddy.html');
      sessionStorage.removeItem('fw:desktop:session-started');
    });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/\/index\.html$/);
    await expect(page.locator('html')).toHaveClass(/fw-route-home/);
  });

  test('首页停留后零未读不会弹出回声和搭子红点', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await expect(page.locator('[data-fw-desktop-badge="echo"]')).not.toHaveClass(/show/);
    await expect(page.locator('[data-fw-desktop-badge="buddy"]')).not.toHaveClass(/show/);
  });

  test('更多入口展开辅助页面，不再误导为入馆须知直达', async ({ page }) => {
    await page.goto('/square.html', { waitUntil: 'domcontentloaded' });
    const more = page.locator('[data-fw-desktop-more]');
    const menu = page.locator('[data-fw-desktop-more-menu]');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).toBeVisible();
    await expect(menu.locator('a[href="rules.html"]')).toContainText('入馆须知');
    await expect(menu.locator('a[href="admin.html"]')).toContainText('处理公告');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('发牢骚是独立页面，精神广场只保留内容流', async ({ page }) => {
    await page.goto('/compose.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(/fw-route-compose/);
    await expect(page.locator('[data-fw-desktop-compose]')).toHaveClass(/active/);
    await expect(page.locator('[data-fw-desktop-compose]')).toHaveAttribute('href', 'compose.html');
    await expect(page.locator('[data-post-form]')).toBeVisible();
    await expect(page.locator('[data-post-form]')).toHaveAttribute('data-post-redirect', 'square.html');

    await page.goto('/square.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(/fw-desktop-app/);
    await expect(page.locator('[data-fw-desktop-sidebar]')).toBeVisible();
    await expect(page.locator('[data-fw-desktop-account]')).toBeVisible();
    await expect(page.locator('.header')).toBeHidden();
    await expect(page.locator('.square-side')).toBeHidden();
    await expect(page.locator('[data-post-form]')).toHaveCount(0);
    await expect(page.locator('.square-main [data-feed]')).toBeVisible();

    await page.setViewportSize({ width: 760, height: 620 });
    await expect(page.locator('[data-fw-desktop-sidebar]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(760);
  });

  test('精神广场先读取 Windows 本地文件缓存', async ({ page }) => {
    await page.addInitScript(() => {
      const calls: string[] = [];
      (window as any).__FW_NATIVE_CACHE_CALLS__ = calls;
      (window as any).__TAURI__ = {
        core: {
          invoke: async (command: string) => {
            calls.push(command);
            if(command === 'desktop_cache_read'){
              return {
                version: 1,
                syncedAt: Date.now() - 1000,
                reactions: [],
                posts: [{
                  id: 998877,
                  userId: 'cached-user',
                  authorId: 'cached-user',
                  authorName: '本地研究员',
                  authorAvatar: '',
                  status: '今日无效',
                  content: '这是 Windows 本地缓存中的内容',
                  createdAt: new Date().toISOString(),
                  comments: [],
                  resonance: 0,
                  same: 0,
                  tissue: 0
                }]
              };
            }
            return {enabled: true, entries: 1, bytes: 512};
          }
        }
      };
    });

    await page.goto('/square.html', {waitUntil: 'domcontentloaded'});
    await expect(page.getByText('这是 Windows 本地缓存中的内容')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__FW_NATIVE_CACHE_CALLS__ || []))
      .toContain('desktop_cache_read');
  });

  test('学术研讨、观鸟台和废话档案先显示各自的本地缓存', async ({ page }) => {
    await page.addInitScript(() => {
      function archiveRange(){
        const start = (date: Date) => { const next = new Date(date); next.setHours(0, 0, 0, 0); return next; };
        const add = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };
        const today = start(new Date());
        const yesterday = add(today, -1);
        const thisMonday = add(today, -((today.getDay() + 6) % 7));
        const lastMonday = add(thisMonday, -7);
        return [yesterday, today, lastMonday, thisMonday].map(date => date.toISOString()).join('|');
      }
      (window as any).__TAURI__ = {
        core: {
          invoke: async (command: string, args: any) => {
            if(command !== 'desktop_cache_read') return {enabled:true, entries:3, bytes:2048};
            if(args?.key === 'rooms-polls-v1') return {
              version:1,
              polls:[{
                id:7001,
                user_id:'poll-user',
                title:'本地缓存课题',
                is_official:false,
                created_at:new Date().toISOString(),
                ends_at:new Date(Date.now() + 86400000).toISOString(),
                closed_at:null,
                conclusion:null,
                profiles:{nickname:'缓存研究员', avatar_url:''},
                options:[],
                stats:{},
                participantCount:0
              }]
            };
            if(args?.key === 'bird-feed-v1') return {
              version:1,
              posts:[{
                id:8001,
                userId:'bird-user',
                title:'本地缓存鸟类',
                content:'缓存观察记录',
                displayMode:'profile',
                images:[],
                createdAt:new Date().toISOString(),
                updatedAt:new Date().toISOString(),
                time:'刚刚',
                exactTime:'',
                authorName:'缓存观察员',
                authorAvatar:'',
                comments:[],
                validCount:0,
                seenCount:0,
                tissueCount:0
              }]
            };
            if(args?.key === 'archive-rankings-v1'){
              const winner = {nickname:'缓存榜首', avatar_url:'', score:9, topPost:{status_tag:'今日无效', content:'缓存代表废话'}};
              return {
                version:1,
                range:archiveRange(),
                weekly:{like:[winner], same:[], tissue:[]},
                daily:{like:[winner], same:[], tissue:[]}
              };
            }
            return null;
          }
        }
      };
    });

    await page.goto('/rooms.html', {waitUntil:'domcontentloaded'});
    await expect(page.getByText('本地缓存课题')).toBeVisible();
    await page.goto('/bird.html', {waitUntil:'domcontentloaded'});
    await expect(page.getByText('本地缓存鸟类')).toBeVisible();
    await page.goto('/archive.html', {waitUntil:'domcontentloaded'});
    await expect(page.getByText('缓存榜首').first()).toBeVisible();
  });

  test('栏目页压缩首屏并减少无关模块', async ({ page }) => {
    await page.goto('/rooms.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.polls-hero')).toBeVisible();
    expect((await page.locator('.polls-hero').boundingBox())?.height || 999).toBeLessThan(260);

    const roomScripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src') || ''));
    expect(roomScripts.some(src => src.includes('fw-buddy-wechat.js'))).toBe(false);
    expect(roomScripts.some(src => src.includes('fw-floating-panels.js'))).toBe(false);

    await page.goto('/bird.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bird-hero')).toBeVisible();
    expect((await page.locator('.bird-hero').boundingBox())?.height || 999).toBeLessThan(280);

    await page.goto('/archive.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(/fw-route-archive/);
    await expect(page.locator('.archive-hero h1')).toHaveCSS('font-size', '48px');
    await page.setViewportSize({ width: 760, height: 620 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(760);
  });

  test('专用回声页按 Esc 不会被关成空白', async ({ page }) => {
    await page.goto('/echo.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean((window as any).__FW_STABLE_CORE__));
    await page.evaluate(() => {
      const modal = document.createElement('div');
      modal.className = 'fw-stable-echo-modal show';
      modal.dataset.fwStableEchoModal = '1';
      modal.innerHTML = '<section class="fw-stable-echo-panel"><div data-fw-stable-echo-body></div></section>';
      document.body.appendChild(modal);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await expect(page.locator('[data-fw-stable-echo-modal]')).toHaveClass(/show/);
  });

  test('1.0.2 过渡升级通过系统 Edge 打开安装包', async ({ page }) => {
    await page.goto('/square.html', { waitUntil: 'domcontentloaded' });
    const updater = page.locator('[data-fw-legacy-updater]');
    await expect(updater).toBeVisible();

    const download = updater.locator('[data-fw-legacy-download]');
    await expect(download).toHaveAttribute(
      'href',
      'microsoft-edge:https://fwyanjiusuo.com/download/fw-lab-windows-latest.exe'
    );
    await expect(download).not.toHaveAttribute('download', /.*/);
    await expect(updater.locator('[data-fw-legacy-update-status]')).toContainText('Microsoft Edge');
  });
});
