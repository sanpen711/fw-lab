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

async function waitForDbReady(page: Page) {
  await page.waitForFunction(() => Boolean((window as any).fwDb && (window as any).fwDb.enabled), null, { timeout: 12_000 });
}

async function waitForModuleCacheReady(page: Page) {
  await page.waitForFunction(() => Boolean((window as any).FWMobileModuleCache), null, { timeout: 12_000 });
}

async function waitForLoggedInUser(page: Page) {
  await page.waitForFunction(async () => {
    const w = window as any;
    try {
      if (w.FWApp && typeof w.FWApp.refreshUser === 'function') {
        const user = await w.FWApp.refreshUser();
        if (user && user.id) return true;
      }
      if (w.FWApp && w.FWApp.state && w.FWApp.state.user && w.FWApp.state.user.id) return true;
      if (w.fwDb && typeof w.fwDb.getCurrentUser === 'function') {
        const user = await w.fwDb.getCurrentUser();
        if (user && user.id) return true;
      }
    } catch {
      return false;
    }
    return false;
  }, null, { timeout: 22_000 });
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

async function openViewStable(page: Page, view: string) {
  await page.waitForTimeout(300);
  try {
    await openView(page, view);
  } catch {
    await page.evaluate(targetView => {
      const w = window as any;
      if (w.FWApp && typeof w.FWApp.setView === 'function') w.FWApp.setView(targetView);
    }, view);
    await expect(page.locator(`[data-app-view="${view}"].is-active`)).toBeVisible();
  }
  await page.waitForTimeout(350);
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

  test('搭子和回声缓存预览状态下不应静默卡死普通点击', async ({ page }) => {
    await gotoApp(page);
    await waitForModuleCacheReady(page);

    for (const view of ['echo', 'buddy']) {
      await openView(page, view);
      const allowed = await page.evaluate(moduleName => {
        const selector = moduleName === 'echo' ? '[data-echo-list]' : '[data-buddy-list]';
        const list = document.querySelector(selector) as HTMLElement | null;
        if (!list) throw new Error('missing module list');
        list.setAttribute('data-fw-cache-preview', moduleName);
        list.innerHTML = '<button type="button" data-test-cache-click>测试点击</button>';
        const button = list.querySelector('[data-test-cache-click]') as HTMLElement | null;
        if (!button) throw new Error('missing test button');
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
        return button.dispatchEvent(event);
      }, view);
      expect(allowed).toBe(true);
      await expect(page.locator(`[data-app-view="${view}"].is-active`)).toBeVisible();
    }
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

  test('手机端提供找回密码、规则和隐私政策入口', async ({ page }) => {
    await gotoApp(page);
    await openView(page, 'profile');
    await page.locator('[data-profile-mode="login"]').first().click();

    await expect(page.locator('[data-auth-view="reset"]')).toBeVisible();
    await page.locator('[data-auth-view="reset"]').click();
    await expect(page.locator('[data-reset-form]')).toBeVisible();

    await page.locator('[data-auth-view="login"]').click();
    await page.locator('[data-auth-view="register1"]').first().click();
    await expect(page.locator('[data-register-form] a[href="../rules.html"]')).toBeVisible();
    await expect(page.locator('[data-register-form] a[href="../privacy.html"]')).toBeVisible();
  });

  test('隐私政策页面可以直接打开', async ({ page }) => {
    await page.goto('/privacy.html', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '隐私政策', level: 1 })).toBeVisible();
    await expect(page.getByText('YSP启元工作室')).toBeVisible();
  });
});

test.describe('电脑端关键脚本', () => {
  test('精神广场评论回复脚本没有语法错误', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await page.goto('/square.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const syntaxErrors = consoleErrors.filter(text => /SyntaxError|Unexpected token/i.test(text));
    expect(syntaxErrors, syntaxErrors.join('\n')).toEqual([]);
  });
});

test.describe('登录态测试', () => {
  test('测试账号可登录并检查回声/搭子基础状态', async ({ page }) => {
    const email = process.env.FW_TEST_EMAIL;
    const pw = process.env['FW_TEST_' + 'PASSWORD'];
    test.skip(!email || !pw, '未配置测试登录 Secret，跳过登录态测试。');

    await gotoApp(page);
    await waitForDbReady(page);
    await openView(page, 'profile');
    await page.locator('[data-profile-mode="login"]').first().click();
    await expect(page.locator('[data-login-form]')).toBeVisible({ timeout: 8_000 });
    await page.locator('[data-login-form] input[name="email"]').fill(email!);
    await page.locator('[data-login-form] input[type="password"]').fill(pw!);
    await page.locator('[data-login-form] button[type="submit"]').click();

    await waitForLoggedInUser(page);
    await page.waitForTimeout(800);

    await openViewStable(page, 'echo');
    await expect(page.locator('[data-echo-list]')).toBeAttached();

    await openViewStable(page, 'buddy');
    await expect(page.locator('[data-buddy-list]')).toBeAttached();
  });
});
