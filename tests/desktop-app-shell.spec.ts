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
