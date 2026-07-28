import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.FW_TEST_BASE_URL || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: {
    timeout: 8_000
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']]
    : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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
