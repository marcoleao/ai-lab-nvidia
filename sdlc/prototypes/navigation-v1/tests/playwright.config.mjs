import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'navigation.spec.mjs',
  workers: 1,
  timeout: 30000,
  reporter: 'list',
  outputDir: process.env.TEST_OUTPUT_DIR || '../.test-results',
  use: {
    baseURL: process.env.PROTOTYPE_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:3311',
    headless: true,
    viewport: {width: 1440, height: 1000},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
