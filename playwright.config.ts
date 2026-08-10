import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.FW_TEST_BASE_URL || 'http://127.0.0.1:4173';
const hasTestCredentials = Boolean(process.env.FW_TEST_EMAIL && process.env.FW_TEST_PASSWORD);

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: {
    timeout: 8_000
  },
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? (hasTestCredentials
        ? [['list']]
        : [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']])
    : [['list']],
  use: {
    baseURL,
    // 登录测试使用仓库 Secret。包含测试凭据时不生成可回放附件，避免失败报告保留输入值。
    trace: hasTestCredentials ? 'off' : 'retain-on-failure',
    screenshot: hasTestCredentials ? 'off' : 'only-on-failure',
    video: hasTestCredentials ? 'off' : 'retain-on-failure',
    actionTimeout: 12_000,
    navigationTimeout: 20_000
  },
  projects: [
    {
      name: 'mobile-chromium-pwa',
      testMatch: /.*(?:mobile-pwa|buddy-return)\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 412, height: 915 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai'
      }
    },
    {
      name: 'desktop-chromium',
      testMatch: /.*desktop-(?:auth|account-security)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai'
      }
    },
    {
      name: 'windows-client-chromium',
      testMatch: /.*desktop-app-shell\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        userAgent: `${devices['Desktop Chrome'].userAgent} FWYanjiusuoDesktop/1.0.2`,
        viewport: { width: 1280, height: 820 },
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai'
      }
    }
  ],
  webServer: process.env.FW_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npx http-server . -p 4173 -c-1 --silent',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 20_000
      }
});
