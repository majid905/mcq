import { expect, test } from '@playwright/test';

test('admin home renders in Bangla, reaches the mock API, switches theme and language', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('অ্যাডমিন প্যানেল');
  await expect(page.getByTestId('api-status')).toHaveAttribute('data-status', 'ok');

  const toggle = page.getByTestId('theme-toggle');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Admin keeps the locale in a cookie, so the URL does not change.
  await page.getByTestId('locale-switcher').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Admin panel');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
