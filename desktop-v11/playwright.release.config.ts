import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests',
  testMatch:'release-package.spec.ts',
  timeout:30000,
  workers:1,
  reporter:[['list']],
  use:{...devices['Desktop Chrome'],baseURL:'http://127.0.0.1:1422',viewport:{width:1280,height:820},locale:'zh-CN'},
  webServer:{command:'npm run preview',url:'http://127.0.0.1:1422',reuseExistingServer:false,timeout:20000}
});
