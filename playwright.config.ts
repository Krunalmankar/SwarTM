import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests of the built site (dist/) on emulated phones, tablets,
 * laptops and desktops. Uses the locally installed Google Chrome (no browser
 * download). Run `npm run build` first, then `npm run test:e2e`.
 */
const chrome = { browserName: 'chromium' as const, channel: 'chrome' };
const PORT = 4300;

export default defineConfig({
  testDir: 'tests',
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/report' }]],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: `http://localhost:${PORT}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'phone-320-iPhoneSE', use: { ...devices['iPhone SE'], ...chrome } },
    { name: 'phone-360-GalaxyS8', use: { ...devices['Galaxy S8'], ...chrome } },
    { name: 'phone-393-iPhone15', use: { ...devices['iPhone 15'], ...chrome } },
    { name: 'phone-412-Pixel7', use: { ...devices['Pixel 7'], ...chrome } },
    { name: 'phone-landscape-734-iPhone15', use: { ...devices['iPhone 15 landscape'], ...chrome } },
    { name: 'tablet-712-GalaxyTabS4', use: { ...devices['Galaxy Tab S4'], ...chrome } },
    { name: 'tablet-810-iPad', use: { ...devices['iPad (gen 7)'], ...chrome } },
    { name: 'tablet-1194-iPadPro-landscape', use: { ...devices['iPad Pro 11 landscape'], ...chrome } },
    {
      name: 'laptop-1366',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 }, ...chrome },
    },
    {
      name: 'desktop-1920',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 }, ...chrome },
    },
    {
      name: 'desktop-2560',
      use: { ...devices['Desktop Chrome'], viewport: { width: 2560, height: 1440 }, ...chrome },
    },
  ],
});
