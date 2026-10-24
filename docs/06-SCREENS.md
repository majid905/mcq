# 06 — Screens

Every screen lists: route (Flutter `go_router` path = web path), purpose, layout, data (endpoint), states, requirement IDs. Mobile and web implement the same screen with the same route names. All screens implement **loading (skeleton) / empty / error (retry) / offline** states (NFR-UX-04).

Web adaptation rule: below 768 px web = mobile layout; ≥ 1024 px adds left sidebar navigation and uses 2 columns where noted.

## A. App shell

**Bottom navigation (mobile) / sidebar (web ≥ 1024):** হোম `/home` · পরীক্ষা `/exams` · প্র্যাকটিস `/practice` · অ্যানালিটিক্স `/analytics` · প্রোফাইল `/profile`. Top app bar on Home: avatar (→ profile), greeting, search icon (→ `/search`), bell with unread dot (→ `/notifications`).

Global guards (run at app start via `GET /settings/public`): force update screen (FR-APP-01), maintenance screen (FR-APP-02), offline banner.

## B. Auth & onboarding

| # | Route | Screen | Layout & behaviour | API | FR |
| --- | --- | --- | --- | --- | --- |
| B1 | `/splash` | Splash | Logo on primary bg; load settings + refresh session; route to onboarding/login/home | settings/public, auth/refresh | APP-01 |
| B2 | `/welcome` | Welcome carousel | 3 slides (Live exam, Practice, Rank) with illustration, dots, "শুরু করুন" + "লগইন" | — | — |
| B3 | `/login` | Login | Phone field (+88 prefix fixed), password with show/hide, "পাসওয়ার্ড ভুলে গেছেন?", primary "লগইন", link to register; error inline; lock message with countdown | auth/login | AUTH-03 |
| B4 | `/register` | Phone entry | Phone field, terms checkbox, "OTP পাঠান" | auth/otp/request | AUTH-01 |
| B5 | `/otp` | OTP verify | 6-box OtpInput (SMS autofill Android, `oneTimeCode` iOS/web), resend countdown 60 s, change number link | auth/otp/verify | AUTH-01/02 |
| B6 | `/register/profile` | Name & password | Name, password + strength hint, "অ্যাকাউন্ট তৈরি করুন" | auth/register | AUTH-01 |
| B7 | `/onboarding/goals` | Goal select | Grid of category cards (icon + name + question count), multi-select, "পরবর্তী" | taxonomy, PATCH me | AUTH-08 |
| B8 | `/onboarding/district` | District | Searchable list of 64 districts; skip allowed | PATCH me | AUTH-08 |
| B9 | `/forgot` → `/otp` → `/forgot/new` | Reset password | Same components as register | otp/request, password/reset | AUTH-05 |
| B10 | `/device-limit` | Signed out by other device | Explanation + "এই ডিভাইসে চালু করুন" (self reset) + support contact | me/devices/reset | AUTH-07 |

## C. Home

**C1 `/home`** (FR-HOME-01..03) — data `GET /home`.
1. Greeting row + streak chip (flame icon, accent).
2. **Running exam banner** (if any): live-red edge, "এখন চলছে", remaining time, "অংশ নিন".
3. **Next live exam card**: title, countdown ("২ ঘণ্টা ১৪ মিনিট পর"), meta row, buttons "রিমাইন্ডার" (outline) + "বিস্তারিত".
4. Banner carousel (16:7, radius 16, auto-play 5 s).
5. **Today card**: answered / goal progress bar, accuracy %, "প্র্যাকটিস চালিয়ে যান".
6. **Quick actions** 2×2 grid: প্র্যাকটিস, প্রশ্ন ব্যাংক, সার্চ, বুকমার্ক.
7. Continue practice card (if in-progress attempt).
Web ≥ 1024: 2 columns (left 2/3: exam cards, today; right 1/3: quick actions, banners).

## D. Exams

| # | Route | Screen | Details | API | FR |
| --- | --- | --- | --- | --- | --- |
| D1 | `/exams` | Exam list | Tabs আসন্ন / চলমান / শেষ; category filter chips (user goals first); infinite list of ExamCard; finished cards show my score or "অনুশীলন হিসেবে দিন" | GET exams | EXAM-01, 11 |
| D2 | `/exams/:id` | Exam detail | Header (title, category, LIVE/countdown), stat row (সময়, প্রশ্ন, নম্বর, নেগেটিভ), syllabus table (subject, questions, marks), rules list, participants, sticky bottom CTA: "রিমাইন্ডার সেট করুন" before open, "পরীক্ষা শুরু করুন" when open, "ফলাফল দেখুন" after attempt; PremiumLock if locked | GET exams/:id, PUT reminder | EXAM-02, 03 |
| D3 | `/exams/:id/instructions` | Pre-exam | Checklist (stable internet for start, answers autosave, auto-submit at time end, no screenshots), language of labels, "আমি প্রস্তুত" → start | POST exams/:id/start | EXAM-04, 05 |
| D4 | `/room/:attemptId` | **Exam room** | See §D4 below | paper_url, PUT answers, POST submit | EXAM-05..10 |
| D5 | `/room/:attemptId/submitted` | Submitted | Check animation, "উত্তরপত্র জমা হয়েছে", polls result every 3 s → auto-navigate to result; if live exam not ended: "মেধাক্রম প্রকাশ হবে রাত ৯:৩৫-এ" | GET attempts/:id/result | RES-01 |

### D4 Exam room (most important screen)
- **Focus mode**: no bottom nav; Android back button opens "পরীক্ষা ছেড়ে যাবেন?" dialog (answers keep syncing; timer keeps running).
- **Top**: TimerBar (sticky) with remaining time, answered count "উত্তর: ৪২/১০০", navigator button (grid icon).
- **Body, mode 1 "একটি করে"** (default mobile): QuestionCard + 4–5 OptionTiles; bottom bar: "আগের", "রিভিউ চিহ্ন" toggle (flag icon), "পরের"; horizontal swipe between questions.
- **Body, mode 2 "OMR / সব একসাথে"** (default web ≥ 1024): scrolling list of all questions grouped by section header; sticky section tabs.
- **Navigator**: bottom sheet (mobile) / right panel 280 px (web); grid per section; legend; "জমা দিন" button inside.
- **Tap option** → select (tap again on the same option to clear, setting allowed per exam); local save immediately (Hive / IndexedDB); background sync every 30 s & on pause.
- **Connection lost**: subtle banner "অফলাইন — উত্তর ফোনে সংরক্ষিত", keeps working; sync resumes automatically.
- **Submit dialog**: counts (উত্তর দেওয়া, বাকি, রিভিউ চিহ্নিত), "জমা দিন" (primary) / "ফিরে যান".
- **Auto-submit** at 00:00 with full-screen "সময় শেষ — জমা দেওয়া হচ্ছে…".
- Android FLAG_SECURE on; app switch increments focus_loss_count and shows toast warning (EXAM-10).
- Web: disable text selection/copy in the room, `beforeunload` warning, keyboard shortcuts 1–5 select option, ←/→ navigate, M mark.

## E. Results

| # | Route | Screen | Details | API | FR |
| --- | --- | --- | --- | --- | --- |
| E1 | `/results/:attemptId` | Result | ScoreRing (score/total), row of StatTiles (সঠিক ✓ success, ভুল ✕ danger, বাদ –, নেগেটিভ), time taken, RankBadge (overall + district + "আপনি ৮২% এর চেয়ে এগিয়ে"), "প্রাথমিক" tag until final; subject breakdown table with mini bars; CTAs "সমাধান দেখুন", "মেধাতালিকা", "শেয়ার" (P2) | GET attempts/:id/result | RES-01..04 |
| E2 | `/results/:attemptId/solutions` | Solutions | Filter segmented: সব / ভুল / বাদ / সঠিক; list of QuestionCards with option states correct/wrong/missed, "আপনার উত্তর" label, explanation panel (expand), bookmark/report | GET attempts/:id/solutions | RES-05 |
| E3 | `/exams/:id/leaderboard` | Leaderboard | Toggle সারাদেশ / জেলা; top-3 podium; list rows (rank, avatar, name, district, score, time); my row pinned at bottom with primary-soft background | GET exams/:id/leaderboard | RES-06 |
| E4 | `/history` | My attempts | List grouped by month, filter by kind | GET me/attempts | — |

## F. Practice & question bank

| # | Route | Screen | Details | API | FR |
| --- | --- | --- | --- | --- | --- |
| F1 | `/practice` | Practice hub | Category tabs (user goals); subject cards with progress ring (accuracy) and question count; section "দুর্বল টপিক" (from analytics) ; buttons "কাস্টম পরীক্ষা", "ভুল উত্তরগুলো", "বুকমার্ক" | taxonomy, analytics/topics | PRAC-01 |
| F2 | `/practice/node/:id` | Subject/chapter drill-down | Breadcrumb; list of children with counts & progress; on topic: "কুইক প্র্যাকটিস" (20 প্রশ্ন) and "পরীক্ষা হিসেবে দিন" | taxonomy | PRAC-01 |
| F3 | `/practice/session/:attemptId` | Quick practice | One question at a time; on select immediately reveal correct/wrong with explanation slide-up; "পরের প্রশ্ন"; header progress 7/20 and live accuracy | practice/sessions, /answer | PRAC-02 |
| F4 | `/practice/session/:attemptId/summary` | Session summary | Score, accuracy, time, list of wrong questions, "আবার প্র্যাকটিস", "নতুন টপিক" | attempts/:id/result | PRAC-02 |
| F5 | `/practice/custom` | Custom exam builder | Step 1 select topics (tree with checkboxes, search), Step 2 settings (questions slider 10–200, time picker or untimed, difficulty segmented, exclude seen toggle), summary, "শুরু করুন" → exam room | POST practice/sessions | PRAC-03 |
| F6 | `/bank` | Question bank | Category tabs → list of source exams by year ("৪৫তম বিসিএস প্রিলিমিনারি — ২০২৩", 200 প্রশ্ন); tap → F7 | source-exams | PRAC-04 |
| F7 | `/bank/:sourceExamId` | Paper view | Read mode (questions with answers shown/locked) + "টাইমড পরীক্ষা দিন" | exams/:id/paper or questions | PRAC-04 |
| F8 | `/bookmarks`, `/wrong` | Lists | Question cards with answers; "এগুলো প্র্যাকটিস করুন" | bookmarks, wrong-questions | PRAC-05 |
| F9 | `/questions/:id` | Single question | QuestionCard with answer (or PremiumLock), explanation, related topic link | questions/:id | SRCH-02 |

## G. Search

**G1 `/search`** (FR-SRCH-01..03): autofocus search bar, Bangla/English input, debounce 300 ms; recent searches chips; filters (category, subject, year) in a bottom sheet; results list with `<mark>` highlights; tapping opens F9. Empty: "কিছু পাওয়া যায়নি — অন্য শব্দে চেষ্টা করুন".

## H. Analytics

**H1 `/analytics`** (FR-ANL-01..03): StatTiles grid (মোট উত্তর, নির্ভুলতা, পরীক্ষা, গড় পার্সেন্টাইল, স্ট্রিক); 7-day bar chart (answered vs correct); progress line chart of last 30 exams (percentile); subject accuracy list with horizontal bars (sorted weakest first) → tap to topic list; weak topics card with "এখন প্র্যাকটিস করুন". Web: 2-column grid.

## I. Subscription

| # | Route | Screen | Details | API | FR |
| --- | --- | --- | --- | --- | --- |
| I1 | `/plans` | Packages | Current plan banner; package cards (featured one with accent border + "জনপ্রিয়" tag), price, strike-through, per-month equivalent, features with check icons; trial CTA if available | packages, me | PAY-01, 04 |
| I2 | `/checkout/:packageId` | Checkout | Order summary, coupon field with apply, payment method radio (বিকাশ, নগদ/কার্ড via SSLCommerz) with logos, total, "পেমেন্ট করুন" → gateway (in-app browser / Chrome Custom Tab / web redirect) | coupons/validate, payments/checkout | PAY-02, 03 |
| I3 | `/payment/:paymentId/status` | Payment result | Polls status; success (confetti, "প্রিমিয়াম চালু হয়েছে", expiry date), failed (reason, retry), pending (spinner, "যাচাই করা হচ্ছে") | payments/:id | PAY-02 |
| I4 | `/profile/payments` | History | List of payments with status chips | payments/history | PAY-05 |
iOS: I1–I3 hidden if reader-app model chosen (FR-PAY-07).

## J. Notifications, profile, settings

| # | Route | Screen | Details | API |
| --- | --- | --- | --- | --- |
| J1 | `/notifications` | Inbox | Grouped Today/Earlier; unread dot; tap → deep link; "সব পড়া হয়েছে" | notifications |
| J2 | `/profile` | Profile | Avatar, name, phone, district, plan card (crown, expiry, "রিনিউ"), menu: আমার পরীক্ষা, পেমেন্ট, বুকমার্ক, সেটিংস, সাহায্য, লগআউট | me |
| J3 | `/profile/edit` | Edit profile | Name, avatar upload, district, goals | PATCH me |
| J4 | `/settings` | Settings | Language (বাংলা/English), theme (সিস্টেম/লাইট/ডার্ক), exam mode default, notification toggles, devices (reset), privacy, terms, delete account, app version | notifications/preferences, me |

## K. Public web only (SEO, server-rendered)

| Route | Page | Notes |
| --- | --- | --- |
| `/` | Landing | Hero ("বিসিএস প্রস্তুতি, লাইভ পরীক্ষায়"), next live exam strip, features, stats, testimonials (real only), packages preview, app download, FAQ |
| `/plans` | Packages | Same data as I1 |
| `/papers/:category/:sourceSlug` | Previous-year paper | All questions with answers (or first 20 + login wall), schema.org Quiz |
| `/questions/:slug` | Single question | Question, options, answer, explanation, related questions, schema.org Question; CTA "এমন আরও প্রশ্ন প্র্যাকটিস করুন" |
| `/about`, `/contact`, `/privacy`, `/terms`, `/refund` | Static | Required for gateways and stores |

## L. Admin panel (web only)

| # | Route | Screen | Details | FR |
| --- | --- | --- | --- | --- |
| L1 | `/login` | Login + TOTP | Email, password, 6-digit code step | ADM-01 |
| L2 | `/dashboard` | Dashboard | KPI tiles (signups, DAU, revenue today/month, active subs, open reports), revenue 30-day chart, upcoming exams table, queue health | ADM-03 |
| L3 | `/questions` | Question grid | Left filter panel (taxonomy tree, status, difficulty, source, creator); search box (Meilisearch); table columns: ID, question (2-line clamp), topic, status chip, difficulty, correct %, updated; row checkbox → bulk bar (Publish, Archive, Send to review, Add/Remove tag); "+ নতুন প্রশ্ন", "Import" | ADM-04 |
| L4 | `/questions/new`, `/questions/:id` | Editor | Two columns: left form (TipTap rich editor with image upload & math button, 4–5 option editors each with radio for correct, explanation editor, difficulty 1–5, taxonomy multi-select with primary, source exam/year, premium toggle, status), right live preview in a phone frame using the same OptionTile styles; duplicate warning banner; audit history tab | ADM-05, 06, 08 |
| L5 | `/imports` + `/imports/:id` | Import wizard | Steps: 1 Upload (drag-drop xlsx/csv/docx, template download) → 2 Map columns (auto-detected) → 3 Validate (counts + error table, download error CSV) → 4 Import (progress bar, live counts) → 5 Report | ADM-07 |
| L6 | `/taxonomy` | Taxonomy tree | Drag-drop tree (dnd-kit), inline add/rename, side panel with bn/en names, slug, icon, counts | ADM-09 |
| L7 | `/exams` | Exam list | Table with status chips, filters, duplicate exam action | ADM-10 |
| L8 | `/exams/:id/builder` | Exam builder | Tabs: Details (title, category, schedule pickers with Dhaka time display, duration, marks, negative, premium, shuffle) · Blueprint (rows: topic picker, count, difficulty mix; "Generate") · Paper (ordered list with drag reorder, replace question, search-and-add drawer, section headers) · Review & publish (validation checklist) | ADM-10 |
| L9 | `/exams/:id/monitor` | Live monitor | Big numbers (joined, active, submitted, scored, backlog), line chart per minute, error rate; refresh 5 s | ADM-11 |
| L10 | `/users`, `/users/:id` | Users | Search; detail tabs: Profile, Subscription, Attempts, Devices, Payments; action buttons with reason modal | ADM-12 |
| L11 | `/payments`, `/packages`, `/coupons` | Billing | Tables + forms; payment detail drawer with gateway JSON | ADM-13 |
| L12 | `/reports` | Reports queue | Split view: list left, question + report detail right with "Accept & edit question" / "Reject" | ADM-14, REP-02 |
| L13 | `/notifications`, `/banners`, `/settings`, `/admins` | Ops | Broadcast composer with segment + preview; banner manager; settings form (limits, trial, min version, maintenance); admins & roles | ADM-14, 02 |
