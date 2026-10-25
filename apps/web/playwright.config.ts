import { defineConfig, devices } from '@playwright/test';

// Web owns :3001 (docs/10-HANDOFF-A-TO-B.md). E2E_PORT overrides it when 3001 is busy locally.
const port = Number(process.env.E2E_PORT ?? 3001);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --dir ../.. mock',
      url: 'http://localhost:4010/v1/settings/public',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `pnpm exec next dev --port ${port}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { NEXT_PUBLIC_API_BASE: 'http://localhost:4010/v1' },
    },
  ],
});
