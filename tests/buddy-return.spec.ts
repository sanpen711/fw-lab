import { expect, test, type Page } from '@playwright/test';

const appPath = '/app/index.html';

async function gotoApp(page: Page) {
  await page.goto(appPath, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-app-view="nav"].is-active', { timeout: 15_000 });
  await page.waitForTimeout(900);
}

async function openBuddy(page: Page) {
  await page.locator('[data-app-nav="buddy"]').click();
  await expect(page.locator('[data-app-view="buddy"].is-active')).toBeVisible();
  await page.waitForTimeout(400);
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
    await sleep(260);
  });
}

test.describe('搭子私聊返回专项测试', () => {
  test('搭子私聊返回应停留在搭子列表，不跳精神广场', async ({ page }) => {
    await gotoApp(page);
    await openBuddy(page);
    await page.waitForFunction(() => Boolean((window as any).FWAppBuddy && (window as any).__FW_BUDDY_RETURN_STABILITY__), null, { timeout: 12_000 });

    await page.evaluate(() => {
      const view = document.querySelector('[data-app-view="buddy"]');
      if (!view) throw new Error('missing buddy view');
      try { sessionStorage.setItem('fw_mobile_feed_detail_return_view', 'square'); } catch {}
      view.classList.add('is-chatting');
      document.body.classList.add('fw-buddy-chatting');
    });

    await edgeSwipeRight(page);
    await expect(page.locator('[data-app-view="buddy"].is-active')).toBeVisible();
    await expect(page.locator('[data-app-view="square"].is-active')).toHaveCount(0);
    await expect(page.locator('[data-app-view="buddy"].is-chatting')).toHaveCount(0);

    await edgeSwipeRight(page);
    await expect(page.locator('[data-app-view="nav"].is-active')).toBeVisible();
  });
});
