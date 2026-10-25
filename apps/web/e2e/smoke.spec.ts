import { expect, test } from '@playwright/test';

test('home renders in Bangla, reaches the mock API, switches theme and language', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('প্রস্তুতি শুরু হোক আজই');
  await expect(page.getByTestId('api-status')).toHaveAttribute('data-status', 'ok');

  const toggle = page.getByTestId('theme-toggle');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByTestId('locale-switcher').click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Start preparing today');
});
