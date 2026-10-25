import { expect, test } from '@playwright/test';
import { MOCK_API, registerAndOnboard } from './helpers';

// Needs real exams, papers and the scoring worker:
//   pnpm infra:up && pnpm db:reset && pnpm --filter @mcq/api dev & pnpm --filter @mcq/api dev:worker
//   E2E_API_BASE=http://localhost:3000/v1 pnpm --filter @mcq/web e2e
// The seed's running exam is open for 4 hours after `pnpm db:reset`.
test.skip(MOCK_API, 'exam flow runs against the real API (set E2E_API_BASE)');

test('start exam → answer → reload keeps answers → submit → result', async ({ page }) => {
  test.setTimeout(180_000);
  // Reloading the room triggers the beforeunload guard; accept it.
  page.on('dialog', (d) => void d.accept());

  await registerAndOnboard(page);

  await page.goto('/exams?tab=running');
  await page.getByTestId('exam-card').first().click();
  await expect(page).toHaveURL(/\/exams\/\d+$/);
  await page.getByRole('link', { name: 'পরীক্ষা শুরু করুন' }).click();
  await expect(page).toHaveURL(/\/instructions$/);
  await page.getByRole('button', { name: 'আমি প্রস্তুত' }).click();

  await expect(page).toHaveURL(/\/room\/\d+\?exam=\d+/);
  await expect(page.getByTestId('exam-room')).toBeVisible();
  const total = (await page.locator('article[id^="q-"]').count()).toString();
  expect(Number(total)).toBeGreaterThan(3);

  // Desktop defaults to "all at once"; answer the first three questions.
  for (const i of [0, 1, 2]) {
    await page.locator(`#q-${i}`).getByRole('radio').nth(i).click();
  }
  await expect(page.locator('#q-1').getByRole('radio').nth(1)).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByTestId('answered-count')).toContainText('উত্তর ৩/');

  // Mid-exam reload: answers come back from IndexedDB.
  await page.reload();
  await expect(page.getByTestId('exam-room')).toBeVisible();
  await expect(page.getByTestId('answered-count')).toContainText('উত্তর ৩/');
  await expect(page.locator('#q-2').getByRole('radio').nth(2)).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // Keyboard: after answering question 4, "2" switches it to the second option.
  await page.locator('#q-3').getByRole('radio').first().click();
  await expect(page.getByTestId('answered-count')).toContainText('উত্তর ৪/');
  await page.keyboard.press('2');
  await expect(page.locator('#q-3').getByRole('radio').nth(1)).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByTestId('answered-count')).toContainText('উত্তর ৪/');

  await page.locator('aside').getByRole('button', { name: 'জমা দিন' }).click();
  await expect(page.getByRole('dialog')).toContainText('উত্তর দেওয়া ৪টি');
  await page.getByRole('dialog').getByRole('button', { name: 'জমা দিন' }).click();

  await expect(page).toHaveURL(/\/room\/\d+\/submitted/);
  await expect(page.getByRole('heading', { name: 'উত্তরপত্র জমা হয়েছে' })).toBeVisible();
  await expect(page).toHaveURL(/\/results\/\d+$/, { timeout: 60_000 });
  await expect(page.getByTestId('result')).toBeVisible();
  await expect(page.getByText('সঠিক', { exact: true })).toBeVisible();
});
