import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone-portrait', use: { ...devices['iPhone 13'] } },
    { name: 'iphone-landscape', use: { ...devices['iPhone 13 landscape'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: [
    {
      command: 'npm run dev --workspace @monopoly/worker -- --port 8787',
      url: 'http://127.0.0.1:8787/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command: 'VITE_API_BASE=http://127.0.0.1:8787 npm run dev --workspace @monopoly/web -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
});
