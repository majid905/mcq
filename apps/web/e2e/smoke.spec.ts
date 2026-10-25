import { expect, test } from '@playwright/test';

test('landing renders in Bangla, switches theme and language', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'বিসিএস প্রস্তুতি, লাইভ পরীক্ষায়',
  );

  const toggle = page.getByTestId('theme-toggle').first();
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByTestId('locale-switcher').first().click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Prepare for BCS with live exams',
  );
});
