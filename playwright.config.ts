import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PORTLESS_URL ?? 'http://127.0.0.1:3000',
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command:
      'PORTLESS_URL=http://127.0.0.1:3000 NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 pnpm --filter=@selfbox/web exec next dev --turbopack --hostname 127.0.0.1 --port 3000',
    url: process.env.PORTLESS_URL ?? 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
