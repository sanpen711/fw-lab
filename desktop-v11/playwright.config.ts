import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests',
  testMatch:/.*shell\.spec\.ts/,
  timeout:30000,
  workers:1,
  reporter:[['list']],
  use:{...devices['Desktop Chrome'],baseURL:'http://127.0.0.1:1421',viewport:{width:1280,height:820},locale:'zh-CN'},
  webServer:{command:'npm run dev',url:'http://127.0.0.1:1421',reuseExistingServer:false,timeout:20000}
});
