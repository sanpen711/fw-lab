import { expect, test, type Page } from '@playwright/test';

async function waitForDbReady(page: Page) {
  await page.waitForFunction(() => Boolean((window as any).fwDb && (window as any).fwDb.enabled), null, { timeout: 15_000 });
}

async function waitForLoggedInUser(page: Page) {
  await page.waitForFunction(async () => {
    const db = (window as any).fwDb;
    if (!db || typeof db.getCurrentUser !== 'function') return false;
    try {
      const user = await db.getCurrentUser();
      return Boolean(user && user.id);
    } catch {
      return false;
    }
  }, null, { timeout: 22_000 });
}

test.describe('电脑端账号流程', () => {
  test.beforeEach(async ({ page }) => {
    // 首页首次访问说明会覆盖页面；账号专项测试预先标记已读，避免正常引导遮挡账号入口。
    await page.addInitScript(() => {
      window.sessionStorage.setItem('fw_home_intro_seen_v1', '1');
    });
  });

  test('登录、注册和找回密码入口可稳定切换', async ({ page }) => {
    await page.goto('/index.html?desktop=1', { waitUntil: 'domcontentloaded' });

    // 静态入口可以在账号控制器仍加载时被点击，完成加载后必须自动打开。
    await page.locator('[data-login-cta]').click();
    const dialog = page.locator('[data-sb-auth]');
    await expect(dialog).toHaveClass(/\bshow\b/);
    await expect(dialog.locator('[data-view="login"]')).toBeVisible();

    await dialog.locator('[data-view="login"] [data-go="register1"]').click();
    await expect(dialog.locator('[data-view="register1"]')).toBeVisible();
    await expect(dialog.locator('[data-reg1]')).toBeVisible();

    await dialog.locator('[data-view="register1"] [data-go="login"]').click();
    await expect(dialog.locator('[data-view="login"]')).toBeVisible();

    await dialog.locator('[data-view="login"] [data-go="reset"]').click();
    await expect(dialog.locator('[data-view="reset"]')).toBeVisible();
    await dialog.locator('[data-view="reset"] [data-go="login"]').click();
    await expect(dialog.locator('[data-view="login"]')).toBeVisible();

    await dialog.locator('[data-sb-close]').click();
    await expect(dialog).not.toHaveClass(/\bshow\b/);

    const headerLogin = page.locator('.header .fw-login-pill[data-fw-open]');
    await expect(headerLogin).toHaveCount(1);
    await expect(headerLogin).toBeVisible();
    await headerLogin.click();
    await expect(dialog).toHaveClass(/\bshow\b/);
  });

  test('测试账号可在电脑端登录', async ({ page }) => {
    const email = process.env.FW_TEST_EMAIL;
    const password = process.env.FW_TEST_PASSWORD;
    test.skip(!email || !password, '未配置测试登录 Secret，跳过电脑端登录态测试。');

    await page.goto('/index.html?desktop=1', { waitUntil: 'domcontentloaded' });
    await waitForDbReady(page);
    await page.locator('[data-login-cta]').click();
    await expect(page.locator('[data-sb-auth] [data-view="login"]')).toBeVisible();

    await page.locator('[data-login] input[name="email"]').fill(email!);
    await page.locator('[data-login] input[name="password"]').fill(password!);
    await page.locator('[data-login] button[type="submit"]').click();

    await waitForLoggedInUser(page);
  });
});
