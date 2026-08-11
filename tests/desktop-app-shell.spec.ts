import { expect, test } from '@playwright/test';

test.describe('Windows 客户端专用外壳', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('fw:desktop:home-enabled-20260811', '1'));
  });

  test('首页作为独立栏目显示预留内容', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(/fw-route-home/);
    await expect(page.locator('[data-fw-desktop-nav="home"]')).toHaveClass(/active/);
    await expect(page.locator('.fw-desktop-home')).toBeVisible();
    await expect(page.locator('.fw-desktop-home-card')).toHaveCount(3);
    await expect(page.locator('.home-hero')).toBeHidden();
    await expect(page.locator('#live')).toBeHidden();
  });

  test('精神广场保持紧凑且窄窗口可用', async ({ page }) => {
    await page.goto('/square.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(/fw-desktop-app/);
    await expect(page.locator('[data-fw-desktop-sidebar]')).toBeVisible();
    await expect(page.locator('[data-fw-desktop-account]')).toBeVisible();
    await expect(page.locator('.header')).toBeHidden();
    await expect(page.locator('.square-side')).toBeHidden();

    const closedComposer = page.locator('[data-post-form]');
    await expect(closedComposer).toHaveClass(/fw-desktop-compose-ready/);
    expect((await closedComposer.boundingBox())?.height || 999).toBeLessThan(90);

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
