import { defineConfig, devices } from '@playwright/test';

// Web owns :3001 (docs/10-HANDOFF-A-TO-B.md). E2E_PORT overrides it when 3001 is busy locally.
const port = Number(process.env.E2E_PORT ?? 3001);
const baseURL = `http://localhost:${port}`;
// Default: Prism mock. E2E_API_BASE=http://localhost:3000/v1 runs the suite against the real API
// (specs that need real data, like the exam flow, only run then).
const MOCK = 'http://localhost:4010/v1';
const apiBase = process.env.E2E_API_BASE ?? MOCK;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // next dev on Windows can corrupt its cache when many pages compile at once.
  workers: process.env.CI ? undefined : 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // next dev compiles each route on first visit; give cold pages time.
  expect: { timeout: 15_000 },
  use: { baseURL, trace: 'on-first-retry', navigationTimeout: 30_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    ...(apiBase === MOCK
      ? [
          {
            command: 'pnpm --dir ../.. mock',
            url: `${MOCK}/settings/public`,
            reuseExistingServer: true,
            timeout: 120_000,
          },
        ]
      : []),
    {
      command: `pnpm exec next dev --port ${port}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { NEXT_PUBLIC_API_BASE: apiBase, API_BASE_URL: apiBase },
    },
  ],
});
