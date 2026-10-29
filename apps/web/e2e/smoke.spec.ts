import { expect, test } from '@playwright/test';
import { MOCK_API } from './helpers';

// Mock-only: fixed phone numbers and mock data.
test.skip(!MOCK_API, 'runs against the Prism mock');

test('landing renders in Bangla, switches theme and language', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'সবার সঙ্গে লাইভ পরীক্ষা, সঙ্গে সঙ্গে আসল র‍্যাংক',
  );

  // The landing header switch flips light ↔ dark from what is showing (light here).
  const toggle = page.getByTestId('theme-toggle').first();
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-label', 'লাইট মোডে যান'); // hydrated
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByTestId('locale-switcher').first().click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Sit live exams with everyone, and get your real rank instantly',
  );
});
