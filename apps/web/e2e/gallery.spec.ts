import { expect, test } from '@playwright/test';

test('gallery shows the UI kit in light and dark, bn and en', async ({ page }) => {
  await page.goto('/dev/gallery');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('কম্পোনেন্ট গ্যালারি');

  const light = page.getByTestId('gallery-panel-light');
  const dark = page.getByTestId('gallery-panel-dark');
  await expect(light).toHaveCount(10);
  await expect(dark).toHaveCount(10);
  await expect(dark.first()).toHaveAttribute('data-theme', 'dark');

  // Panels really render different token values.
  const bg = (i: number) =>
    page
      .locator(`[data-testid="gallery-panel-${i ? 'dark' : 'light'}"]`)
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await bg(0)).not.toBe(await bg(1));

  // Option tiles behave as a radio group.
  const radios = page.getByRole('radiogroup').first().getByRole('radio');
  await radios.nth(2).click();
  await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'true');
  await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'false');

  // Bangla digits and option labels.
  await expect(page.getByRole('timer').last()).toHaveText('০০:৪৫');
  await expect(
    page.getByRole('button', { name: 'প্রশ্ন ৮, উত্তর, বর্তমান প্রশ্ন' }).first(),
  ).toBeVisible();

  await page.getByTestId('locale-switcher').click();
  await expect(page).toHaveURL(/\/en\/dev\/gallery$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Component gallery');
  await expect(page.getByRole('timer').last()).toHaveText('00:45');
});
