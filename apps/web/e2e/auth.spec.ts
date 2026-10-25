import { type Page, expect, test } from '@playwright/test';
import { MOCK_API } from './helpers';

// Mock-only: fixed phone numbers and mock data.
test.skip(!MOCK_API, 'runs against the Prism mock');

// Runs against the Prism mock: any phone/password works and the OTP is always 123456.
const PHONE = '01712345678';

async function cookieNames(page: Page) {
  return (await page.context().cookies()).map((c) => c.name);
}

test('guests are sent to login with a return path', async ({ page }) => {
  await page.goto('/home');
  await expect(page).toHaveURL(/\/login\?next=%2Fhome$/);
});

test('register → OTP → profile → goals → district → home', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('মোবাইল নম্বর').fill(PHONE);
  const send = page.getByRole('button', { name: 'OTP পাঠান' });
  await expect(send).toBeDisabled();
  await page.getByLabel(/শর্তাবলি/).check();
  await send.click();

  await expect(page).toHaveURL(/\/otp\?/);
  await expect(page.getByText('০১৭১২৩৪৫৬৭৮')).toBeVisible();
  await page.getByLabel('OTP কোড 1').fill('123456');

  await expect(page).toHaveURL(/\/register\/profile/);
  await page.getByLabel('আপনার নাম').fill('রাফি আহমেদ');
  await page.getByLabel('পাসওয়ার্ড', { exact: true }).fill('secret123');
  await page.getByRole('button', { name: 'অ্যাকাউন্ট তৈরি করুন' }).click();

  await expect(page).toHaveURL(/\/onboarding\/goals$/);
  // Tokens live in httpOnly cookies and never in the page.
  expect(await cookieNames(page)).toEqual(expect.arrayContaining(['at', 'rt']));
  expect(await page.evaluate(() => document.cookie)).not.toMatch(/\bat=|\brt=/);

  await page.getByRole('button', { name: /প্রাইমারি/ }).click();
  await page.getByRole('button', { name: 'পরবর্তী' }).click();

  await expect(page).toHaveURL(/\/onboarding\/district$/);
  await page.getByLabel('জেলা খুঁজুন').fill('ঢাকা');
  await page.getByRole('radio', { name: 'ঢাকা' }).click();
  await page.getByRole('button', { name: 'শুরু করুন' }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId('next-exam')).toBeVisible();
  await expect(page.getByTestId('today')).toBeVisible();
});

test('login, then log out from the profile', async ({ page }) => {
  await page.goto('/login?next=/profile');
  await page.getByLabel('মোবাইল নম্বর').fill(PHONE);
  await page.getByLabel('পাসওয়ার্ড', { exact: true }).fill('secret123');
  await page.getByRole('button', { name: 'লগইন', exact: true }).click();

  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByTestId('plan-card')).toBeVisible();
  await page.getByRole('button', { name: 'লগআউট' }).click();

  await expect(page).toHaveURL(/\/login$/);
  expect(await cookieNames(page)).not.toContain('rt');
  await page.goto('/home');
  await expect(page).toHaveURL(/\/login\?next=/);
});

test('mutations without the CSRF header are rejected by the BFF', async ({ page, request }) => {
  await page.goto('/');
  const res = await request.post('/api/auth/login', {
    data: { phone: PHONE, password: 'x', device: { device_id: 'x', platform: 'web' } },
  });
  expect(res.status()).toBe(403);
});
