import { expect, test } from '@playwright/test';
import { MOCK_API } from './helpers';

// Mock-only: plan names and prices come from the Prism examples.
test.skip(!MOCK_API, 'runs against the Prism mock');

test('landing: try a question, plans from the API, FAQ', async ({ page }) => {
  await page.goto('/');

  // Try one question: a wrong pick shows both verdicts and the explanation.
  const tryCard = page.locator('#try');
  await tryCard.getByRole('radio', { name: /১০টি/ }).click();
  await expect(tryCard.getByText('এবার হয়নি। সঠিক উত্তর: গ) ১১টি')).toBeVisible();
  await expect(tryCard.getByRole('radio').first()).toBeDisabled();
  await tryCard.getByRole('button', { name: 'আরেকটি প্রশ্ন' }).click();
  await expect(tryCard.getByText("'অগ্নিবীণা' কাব্যগ্রন্থের রচয়িতা কে?")).toBeVisible();
  await tryCard.getByRole('radio', { name: /কাজী নজরুল ইসলাম/ }).click();
  await expect(tryCard.getByText('সঠিক উত্তর — চমৎকার!')).toBeVisible();

  // Pricing: the free card plus the three packages from GET /packages.
  const pricing = page.locator('#pricing');
  await expect(
    pricing.getByRole('listitem').filter({ has: page.getByRole('heading') }),
  ).toHaveCount(4);
  await expect(pricing.getByText('সপ্তাহে ১টি পূর্ণ মডেল টেস্ট')).toBeVisible();
  await expect(pricing.getByText('সবচেয়ে সাশ্রয়ী')).toBeVisible();
  await expect(pricing.getByRole('link', { name: '৬ মাসের প্রিমিয়াম নিন' })).toHaveAttribute(
    'href',
    '/checkout/2',
  );

  // Hero: the countdown ticks and the merit list is marked as sample data.
  await expect(page.getByTestId('live-countdown')).not.toContainText('––');
  await expect(page.getByText('নমুনা তথ্য')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Google Play থেকে নামান' }).first()).toBeVisible();

  // FAQ: one item open at a time, the first starts open.
  const faq = page.locator('#faq');
  const first = faq.getByRole('button', { name: 'ফ্রি টেস্টে কী কী পাব?' });
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  await expect(faq.getByText(/প্রতি সপ্তাহে একটি পূর্ণ ১০০ নম্বরের মডেল টেস্ট/)).toBeVisible();
  await faq.getByRole('button', { name: 'কীভাবে পেমেন্ট করব?' }).click();
  await expect(first).toHaveAttribute('aria-expanded', 'false');
});

test('landing: mobile menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en');
  await page.getByRole('button', { name: 'Open menu' }).click();
  const menu = page.getByRole('navigation', { name: 'Mobile menu' });
  await expect(menu.getByRole('link', { name: 'Log in' })).toBeVisible();
  await menu.getByRole('link', { name: 'Plans' }).click();
  await expect(menu).toHaveCount(0);
  await expect(page).toHaveURL(/\/en#pricing$/);
});
