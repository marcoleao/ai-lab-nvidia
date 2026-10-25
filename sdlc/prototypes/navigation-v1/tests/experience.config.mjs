import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'.',testMatch:'experience*.spec.mjs',workers:1,timeout:30000,
  outputDir:process.env.TEST_OUTPUT_DIR||'/output/experience-report',
  reporter:'list',
  use:{baseURL:process.env.PROTOTYPE_BASE_URL||process.env.BASE_URL||'http://127.0.0.1:3311',headless:true,viewport:{width:1440,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure'},
});
