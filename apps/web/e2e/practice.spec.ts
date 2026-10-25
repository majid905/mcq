import { type Page, expect, test } from '@playwright/test';
import { MOCK_API } from './helpers';

// Phase 3 screens against the Prism mock examples (the real API does not have them yet).
test.skip(!MOCK_API, 'runs against the Prism mock');

async function login(page: Page, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('মোবাইল নম্বর').fill('01712345678');
  await page.getByLabel('পাসওয়ার্ড', { exact: true }).fill('secret123');
  await page.getByRole('button', { name: 'লগইন', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[/?]/g, '\\$&')}$`));
}

test('practice hub → quick practice reveals answers → summary', async ({ page }) => {
  await login(page, '/practice');
  await expect(page.getByRole('tab', { name: /বিসিএস/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'দুর্বল টপিক' })).toBeVisible();

  // Weak topic → quick practice (mock session has 3 questions, one with KaTeX math).
  await page.getByRole('button', { name: 'এখন প্র্যাকটিস করুন' }).first().click();
  await expect(page).toHaveURL(/\/practice\/session\/91001$/);
  const session = page.getByTestId('quick-session');
  await expect(session).toBeVisible();

  await session.getByRole('radio').nth(1).click();
  await expect(page.getByRole('status').filter({ hasText: 'সঠিক উত্তর!' })).toBeVisible();
  await expect(page.getByTestId('session-progress')).toContainText('১/৩');

  await page.getByRole('button', { name: 'পরের প্রশ্ন' }).click();
  await expect(page.locator('.katex').first()).toBeVisible();

  await page.getByRole('button', { name: 'শেষ করুন' }).click();
  await expect(page).toHaveURL(/\/practice\/session\/91001\/summary$/);
  await expect(page.getByTestId('session-summary')).toBeVisible();
  await expect(page.getByRole('button', { name: 'আবার প্র্যাকটিস' })).toBeVisible();
});

test('custom exam builder: pick topics, settings, start in the exam room', async ({ page }) => {
  await login(page, '/practice/custom');
  await page.getByRole('checkbox', { name: /বিসিএস/ }).check();
  await page.getByRole('button', { name: /পরবর্তী/ }).click();
  await expect(page.getByTestId('custom-summary')).toContainText('৫০টি প্রশ্ন');
  await page.getByRole('radio', { name: 'কঠিন' }).click();
  await page.getByRole('button', { name: 'শুরু করুন' }).click();
  await expect(page).toHaveURL(/\/room\/91001$/);
  await expect(page.getByTestId('exam-room')).toBeVisible();
});

test('search shows highlighted hits and opens a question', async ({ page }) => {
  await login(page, '/search');
  await page.getByLabel('প্রশ্ন খুঁজুন').fill('সংবিধান');
  const results = page.getByTestId('search-results');
  await expect(results.locator('mark').first()).toHaveText('সংবিধানের');
  await results.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/questions\/30001$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('রাষ্ট্রধর্ম');
});

test('analytics renders stats, both charts with table views, subjects weakest first', async ({
  page,
}) => {
  await login(page, '/analytics');
  const view = page.getByTestId('analytics');
  await expect(view.getByText('১,২৪০')).toBeVisible();
  await expect(view.locator('.recharts-bar-rectangle').first()).toBeVisible();
  await expect(view.locator('.recharts-line-curve')).toBeVisible();
  const subjects = view
    .getByRole('heading', { name: 'বিষয়ভিত্তিক নির্ভুলতা' })
    .locator('..')
    .getByRole('link');
  await expect(subjects.first()).toContainText('ইংরেজি');
});

test('notifications: unread dot in the bar, mark all read', async ({ page }) => {
  await login(page, '/notifications');
  await expect(page.getByTestId('unread-dot')).toBeVisible();
  await expect(page.getByTestId('notification')).toHaveCount(3);
  await page.getByRole('button', { name: 'সব পড়া হয়েছে' }).click();
});

test('public question page is server-rendered with schema.org QAPage', async ({
  page,
  request,
}) => {
  const html = await (await request.get('/questions/bangladesh-songbidhan-rashtradharma')).text();
  expect(html).toContain('"@type":"QAPage"');
  expect(html).toContain('রাষ্ট্রধর্ম');
  await page.goto('/questions/bangladesh-songbidhan-rashtradharma');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('রাষ্ট্রধর্ম');
  await expect(page.locator('[data-state="correct"]')).toContainText('অনুচ্ছেদ ২ক');
});
