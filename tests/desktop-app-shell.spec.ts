import { expect, test } from '@playwright/test';

test.describe('Windows 客户端专用外壳', () => {
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
});
