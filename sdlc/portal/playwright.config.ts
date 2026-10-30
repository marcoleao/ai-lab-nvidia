import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',outputDir:'test-results/browser-direct',workers:1,timeout:30000,use:{baseURL:process.env.PORTAL_TEST_BASE_URL || 'http://127.0.0.1:3000',headless:true,viewport:{width:1440,height:1000},trace:'retain-on-failure'},reporter:'list'});
