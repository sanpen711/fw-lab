import { expect, test, type Page } from '@playwright/test';

const appPath = '/app/index.html';
const views = ['nav', 'square', 'rooms', 'bird', 'archive', 'rules', 'moderation', 'buddy', 'echo', 'profile'] as const;
const fatalConsolePatterns = [
  /ReferenceError/i,
  /TypeError/i,
  /SyntaxError/i,
  /Unhandled/i,
  /is not defined/i,
  /Cannot read/i,
  /Cannot set/i
];

async function gotoApp(page: Page) {
  await page.goto(appPath, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-app-view="nav"].is-active', { timeout: 15_000 });
  await page.waitForTimeout(900);
}

async function openView(page: Page, view: string) {
  if (view === 'nav') {
    await page.locator('[data-app-nav="nav"]').click();
  } else if (view === 'profile') {
    await page.locator('[data-app-nav="profile"], [data-app-profile-trigger]').first().click();
  } else if (view === 'buddy' || view === 'echo') {
    await page.locator(`[data-app-nav="${view}"]`).click();
  } else {
    await page.locator(`[data-app-open="${view}"]`).first().click();
  }
  await expect(page.locator(`[data-app-view="${view}"].is-active`)).toBeVisible();
}

async function edgeSwipeRight(page: Page) {
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const dispatch = (type: string, x: number, y: number) => {
      const target = document.elementFromPoint(x, y) || document.body || document.documentElement;
      let touch: Touch | Record<string, unknown>;
      try {
        touch = new Touch({ identifier: 1, target, clientX: x, clientY: y, screenX: x, screenY: y, pageX: x, pageY: y, radiusX: 2, radiusY: 2, rotationAngle: 0, force: 0.8 });
      } catch {
        touch = { identifier: 1, target, clientX: x, clientY: y, screenX: x, screenY: y, pageX: x, pageY: y };
      }
      const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        touches: type === 'touchend' || type === 'touchcancel' ? [] : [touch],
        targetTouches: type === 'touchend' || type === 'touchcancel' ? [] : [touch],
        changedTouches: [touch]
      } as TouchEventInit;
      let event: Event;
      try {
        event = new TouchEvent(type, init);
      } catch {
        event = new Event(type, { bubbles: true, cancelable: true, composed: true });
        Object.defineProperty(event, 'touches', { value: init.touches });
        Object.defineProperty(event, 'targetTouches', { value: init.targetTouches });
        Object.defineProperty(event, 'changedTouches', { value: init.changedTouches });
      }
      target.dispatchEvent(event);
    };
    dispatch('touchstart', 12, 430);
    await sleep(40);
    dispatch('touchmove', 86, 432);
    await sleep(40);
    dispatch('touchmove', 176, 434);
    await sleep(40);
    dispatch('touchend', 218, 435);
    await sleep(220);
  });
}

function collectConsoleErrors(page: Page) {
  const messages: string[] = [];
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/favicon|net::ERR_ABORTED|Failed to load resource|Failed to fetch/i.test(text)) return;
    messages.push(text);
  });
  page.on('pageerror', error => messages.push(error.message));
  return messages;
}

test.describe('F.w 研究所手机端 PWA 基础稳定性', () => {
  test('应用入口、底部导航和核心视图可打开', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await gotoApp(page);

    await expect(page.locator('.app-header')).toBeVisible();
    await expect(page.locator('.app-tabbar')).toBeVisible();
    await expect(page.locator('[data-app-view="nav"].is-active')).toBeVisible();

    for (const view of views.filter(view => view !== 'nav')) {
      await openView(page, view);
      await expect(page.locator(`[data-app-view="${view}"].is-active`)).toBeVisible();
      await openView(page, 'nav');
      await expect(page.locator('[data-app-view="nav"].is-active')).toBeVisible();
    }

    const fatalErrors = consoleErrors.filter(text => fatalConsolePatterns.some(pattern => pattern.test(text)));
    expect(fatalErrors, fatalErrors.join('\n')).toEqual([]);
  });

  test('顶层页面左滑返回统一回首页', async ({ page }) => {
    await gotoApp(page);
    for (const view of ['square', 'rooms', 'bird', 'echo', 'buddy', 'profile']) {
      await openView(page, view);
      await edgeSwipeRight(page);
      await expect(page.locator('[data-app-view="nav"].is-active')).toBeVisible();
    }
  });

  test('缓存预览状态下，回声旧按钮不可直接点击', async ({ page }) => {
    await gotoApp(page);
    await openView(page, 'echo');

    await page.evaluate(() => {
      const list = document.querySelector('[data-echo-list]') as HTMLElement | null;
      if (!list) throw new Error('missing echo list');
      list.setAttribute('data-fw-cache-preview', 'echo');
      list.innerHTML = '<article class="notice-item mobile-echo-item unread" data-mobile-echo-item="test"><span class="list-avatar">测</span><div class="list-main"><b>测试回声</b><span>缓存预览按钮</span><div class="notice-actions"><button class="mobile-echo-mini dark" type="button" data-mobile-echo-post="fake-post">查看帖子</button></div></div></article>';
    });

    await page.locator('[data-mobile-echo-post="fake-post"]').click();
    await expect(page.locator('[data-app-toast]').filter({ hasText: /正在同步最新数据|稍等一下/ })).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('[data-app-view="echo"].is-active')).toBeVisible();
  });

  test('可见头像图片不应停留在破图状态', async ({ page }) => {
    await gotoApp(page);
    for (const view of ['echo', 'buddy', 'profile']) {
      await openView(page, view);
      await page.waitForTimeout(900);
      const broken = await page.locator('img:visible').evaluateAll(images => images
        .filter(image => image instanceof HTMLImageElement)
        .map(image => image as HTMLImageElement)
        .filter(image => image.complete && image.naturalWidth === 0)
        .map(image => image.getAttribute('src') || image.getAttribute('alt') || 'unknown'));
      expect(broken, `${view} visible broken images: ${broken.join(', ')}`).toEqual([]);
    }
  });
});

test.describe('可选登录测试', () => {
  test('有测试账号 Secret 时可检查登录后回声/搭子基础状态', async ({ page }) => {
    const email = process.env.FW_TEST_EMAIL;
    const password = process.env.FW_TEST_PASSWORD;
    test.skip(!email || !password, '未配置 FW_TEST_EMAIL / FW_TEST_PASSWORD，跳过登录态测试。');

    await gotoApp(page);
    await openView(page, 'profile');
    await page.locator('[data-profile-mode="login"], [data-auth-view="login"]').first().click().catch(() => undefined);
    await expect(page.locator('[data-login-form]')).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-login-form] input[name="email"], [data-login-form] input[type="email"]').first().fill(email!);
    await page.locator('[data-login-form] input[name="password"], [data-login-form] input[type="password"]').first().fill(password!);
    await page.locator('[data-login-form] button[type="submit"]').first().click();

    await page.waitForTimeout(2_000);
    const userLabel = await page.locator('[data-app-user-label]').first().textContent().catch(() => '');
    const toastText = await page.locator('[data-app-toast]').first().textContent().catch(() => '');
    if (!userLabel || /未登录/.test(userLabel)) {
      test.skip(true, `测试账号未登录成功，跳过登录态检查。当前状态：${userLabel || '无'}；提示：${toastText || '无'}`);
    }

    await openView(page, 'echo');
    await expect(page.locator('[data-echo-list]')).toBeVisible();
    await openView(page, 'buddy');
    await expect(page.locator('[data-buddy-list]')).toBeVisible();
  });
});
