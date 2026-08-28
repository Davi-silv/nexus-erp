import { defineConfig, devices } from '@playwright/test';

const chromePath = process.env.PLAYWRIGHT_CHROME_PATH
  || (process.env.CI ? null : '/usr/bin/google-chrome-stable');

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:8081',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...(chromePath ? {
      launchOptions: {
        executablePath: chromePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    } : {})
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 8081 --strictPort',
    url: 'http://127.0.0.1:8081',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
