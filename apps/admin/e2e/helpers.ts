import { type Page, expect } from '@playwright/test';

export const MOCK_API = !process.env.E2E_API_BASE;

/** Seeded super admin (database/seed, dev only). The mock accepts any credentials. */
export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'change-me-admin',
};

export async function adminLogin(page: Page, next = '/dashboard') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('ইমেইল').fill(ADMIN.email);
  await page.getByLabel('পাসওয়ার্ড').fill(ADMIN.password);
  await page.getByRole('button', { name: 'লগইন', exact: true }).click();
  await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === next);
}
