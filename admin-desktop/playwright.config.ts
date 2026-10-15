import {defineConfig,devices} from '@playwright/test';
import {fileURLToPath} from 'node:url';
export default defineConfig({testDir:'./tests',testMatch:/.*shell\.spec\.ts/,timeout:30000,workers:1,reporter:[['list']],use:{...devices['Desktop Chrome'],baseURL:'http://127.0.0.1:1422',viewport:{width:1440,height:900},locale:'zh-CN'},webServer:{command:'npm run dev',cwd:fileURLToPath(new URL('.',import.meta.url)),url:'http://127.0.0.1:1422',reuseExistingServer:false,timeout:20000}});
