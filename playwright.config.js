import { defineConfig, devices } from '@playwright/test';

const SYSTEM_CHROME = process.env.PLAYWRIGHT_CHROME_PATH || '/usr/bin/google-chrome-stable';

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
    launchOptions: {
      executablePath: SYSTEM_CHROME,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 8081 --strictPort',
    url: 'http://127.0.0.1:8081',
    reuseExistingServer: false,
    timeout: 120_000
  }
});
