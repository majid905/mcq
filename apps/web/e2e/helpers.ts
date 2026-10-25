import { type Page, expect } from '@playwright/test';

export const MOCK_API = !process.env.E2E_API_BASE;

/** A fresh valid Bangladeshi number, so runs against the real API never hit PHONE_EXISTS. */
export function randomPhone(): string {
  return `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
}

/** Register through the UI (OTP is always 123456 in dev and in the mock) and land on /home. */
export async function registerAndOnboard(page: Page, phone = randomPhone()): Promise<string> {
  await page.goto('/register');
  await page.getByLabel('মোবাইল নম্বর').fill(phone);
  await page.getByLabel(/শর্তাবলি/).check();
  await page.getByRole('button', { name: 'OTP পাঠান' }).click();
  await expect(page).toHaveURL(/\/otp\?/);
  await page.getByLabel('OTP কোড 1').fill('123456');
  await expect(page).toHaveURL(/\/register\/profile/);
  await page.getByLabel('আপনার নাম').fill('পরীক্ষার্থী টেস্ট');
  await page.getByLabel('পাসওয়ার্ড', { exact: true }).fill('secret123');
  await page.getByRole('button', { name: 'অ্যাকাউন্ট তৈরি করুন' }).click();
  await expect(page).toHaveURL(/\/onboarding\/goals$/);
  if (MOCK_API) {
    await page.getByRole('button', { name: /ব্যাংক/ }).click();
    await page.getByRole('button', { name: 'পরবর্তী' }).click();
    await expect(page).toHaveURL(/\/onboarding\/district$/);
    await page.getByRole('button', { name: 'পরে দেব' }).click();
  } else {
    // The real API has no GET /taxonomy yet, so the goals grid cannot load there. Set the goal
    // (seed category "bank" = 2) through the BFF, the same call the grid makes.
    const status = await page.evaluate(async () => {
      const csrf = document.cookie.match(/(?:^|; )csrf=([^;]+)/)?.[1] ?? '';
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-csrf': csrf },
        body: JSON.stringify({ target_node_ids: ['2'] }),
      });
      return res.status;
    });
    expect(status).toBe(200);
    await page.goto('/home');
  }
  await expect(page).toHaveURL(/\/home$/);
  return phone;
}
