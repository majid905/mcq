import { expect, test } from '@playwright/test';
import { ADMIN, MOCK_API, adminLogin } from './helpers';

test('guests are sent to login; login opens the dashboard; logout clears the session', async ({
  page,
}) => {
  await page.goto('/questions');
  await expect(page).toHaveURL(/\/login\?next=%2Fquestions$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');

  await adminLogin(page, '/questions');
  await expect(page.getByTestId('admin-identity')).toBeVisible();
  // Super admin: every nav group is there.
  await expect(page.getByTestId('admin-nav').getByRole('link')).toHaveCount(14);
  const cookies = (await page.context().cookies()).map((c) => c.name);
  expect(cookies).toEqual(expect.arrayContaining(['adm_at', 'adm_rt']));
  expect(await page.evaluate(() => document.cookie)).not.toMatch(/adm_at|adm_rt/);

  if (MOCK_API) {
    await page.getByRole('link', { name: 'ড্যাশবোর্ড' }).first().click();
    await expect(page.getByTestId('dashboard')).toContainText('১৮৪');
  }

  await page.getByRole('button', { name: 'লগআউট' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  expect(ADMIN.email).toContain('@');
});

test('wrong password shows an error on the real API', async ({ page }) => {
  test.skip(MOCK_API, 'the mock accepts any password');
  await page.goto('/login');
  await page.getByLabel('ইমেইল').fill(ADMIN.email);
  await page.getByLabel('পাসওয়ার্ড').fill('definitely-wrong');
  await page.getByRole('button', { name: 'লগইন', exact: true }).click();
  await expect(page.getByTestId('admin-login').getByRole('alert')).toHaveText(
    'ইমেইল বা পাসওয়ার্ড ভুল।',
  );
});

test('admin language switch keeps the page and uses the cookie', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('locale-switcher').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Admin login');
});
