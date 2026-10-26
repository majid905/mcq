import { type Page, expect, test } from '@playwright/test';
import { MOCK_API } from './helpers';

// Billing screens against the Prism mock examples (packages, coupon, checkout, payment).
test.skip(!MOCK_API, 'runs against the Prism mock');

async function login(page: Page, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('মোবাইল নম্বর').fill('01712345678');
  await page.getByLabel('পাসওয়ার্ড', { exact: true }).fill('secret123');
  await page.getByRole('button', { name: 'লগইন', exact: true }).click();
}

test('guests see packages; buying asks them to log in first', async ({ page }) => {
  await page.goto('/plans');
  await expect(page.getByTestId('plan')).toHaveCount(3);
  await expect(page.getByTestId('plan').nth(1)).toContainText('জনপ্রিয়');
  await expect(page.getByTestId('current-plan')).toHaveCount(0);
  await page.getByRole('link', { name: 'কিনুন' }).nth(1).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout%2F2$/);
});

test('checkout with coupon → gateway → status → history', async ({ page }) => {
  await login(page, '/checkout/2');
  await expect(page.getByTestId('order-summary')).toContainText('৬ মাসের প্রিমিয়াম');
  await expect(page.getByTestId('total')).toHaveText('৳৮৯৯');

  await page.getByLabel('কুপন কোড').fill('bcs90');
  await page.getByRole('button', { name: 'প্রয়োগ করুন' }).click();
  await expect(page.getByTestId('total')).toHaveText('৳৮০৯');

  await page.getByRole('radio', { name: /নগদ \/ কার্ড/ }).click();
  // Stand-in for the gateway: it sends the user back to the status page.
  await page.route('https://sandbox.sslcommerz.com/**', (route) =>
    route.fulfill({
      status: 302,
      headers: {
        location: 'http://localhost:' + (process.env.E2E_PORT ?? '3001') + '/payment/7001/status',
      },
    }),
  );
  const checkout = page.waitForRequest((r) => r.url().endsWith('/api/payments/checkout'));
  await page.getByRole('button', { name: /পেমেন্ট করুন/ }).click();
  const body = (await checkout).postDataJSON() as Record<string, string>;
  expect(body).toMatchObject({
    package_id: '2',
    gateway: 'sslcommerz',
    coupon_code: 'BCS90',
    return_platform: 'web',
  });

  await expect(page).toHaveURL(/\/payment\/7001\/status$/);
  await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'paid');
  await expect(page.getByRole('heading', { name: 'প্রিমিয়াম চালু হয়েছে!' })).toBeVisible();

  await page.goto('/profile/payments');
  await expect(page.getByTestId('payment-row')).toHaveCount(2);
  await expect(page.getByTestId('payment-row').first()).toContainText('সফল');
});

test('any 402 from the API opens the shared paywall', async ({ page }) => {
  await login(page, '/exams/5003/instructions');
  await page.route('**/api/exams/5003/start', (route) =>
    route.fulfill({
      status: 402,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'PREMIUM_REQUIRED',
          message: 'প্রিমিয়াম দরকার',
          details: { package_ids: ['1'] },
        },
      }),
    }),
  );
  await page.getByRole('button', { name: 'আমি প্রস্তুত' }).click();
  const paywall = page.getByTestId('paywall');
  await expect(paywall).toBeVisible();
  await expect(paywall).toContainText('প্রিমিয়াম দরকার');
  await paywall.getByRole('link', { name: 'প্যাকেজ দেখুন' }).click();
  await expect(page).toHaveURL(/\/plans$/);
});
