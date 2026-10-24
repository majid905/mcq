# Software Requirements Specification (SRS)
## MCQ Exam Platform — Web, Android & iOS

| Item | Value |
| --- | --- |
| Version | 1.0 |
| Date | 2026-10-24 |
| Status | Draft for build |
| Clients | Flutter app (Android, iOS), Next.js student web, Next.js admin panel |
| Backend | NestJS API, MySQL 8.4, Redis, Meilisearch |

Placeholders: `[App Name]`, `[Domain]` — replace with the final brand before release.

---

## 1. Introduction

### 1.1 Purpose
This SRS defines what the MCQ Exam Platform must do and how well it must do it. It is written to be implemented by Claude Code: every requirement has a stable ID (`FR-…`, `NFR-…`) that tasks, commits and tests refer to.

### 1.2 Scope
The platform helps Bangladeshi students prepare for competitive exams (BCS preliminary, bank, primary teacher, NTRCA, 9th–20th grade govt jobs, university admission, HSC) through:
- **Live exams**: scheduled model tests taken by thousands at the same time with instant results and national merit position.
- **Practice**: subject/chapter/topic practice, previous-year question bank, custom exams.
- **Analytics**: accuracy by topic, weak areas, rank history.
- **Subscriptions**: free tier + paid packages paid via bKash/Nagad/card.
- **Admin**: question bank management (5 lakh+ MCQs), bulk import, exam builder, users, payments, reports.

Out of scope for v1: written/CQ exams with manual grading, live video classes, community forum, AI tutor (listed as future in §9).

### 1.3 Benchmark products
Live MCQ (live BCS model tests, OMR sheet, smart search), Chorcha (quick practice, points, weekly leaderboard), Engineers BCS Care (course routines, PDFs), Smart Sohay Job (job solutions question bank).

### 1.4 Definitions

| Term | Meaning |
| --- | --- |
| MCQ | Multiple-choice question, 4 options (up to 5), exactly one correct |
| Live exam | Exam with fixed start/end time and the same paper for all participants |
| Practice session | Self-paced attempt over chosen topics, instant feedback per question |
| Attempt | One user's sitting of one exam or practice session |
| Taxonomy | Tree of Exam category → Subject → Chapter → Topic |
| Blueprint | Rule set for auto-building a paper (e.g. 35 Bangla, 35 English…) |
| Merit position | Rank among all participants of a live exam |
| Negative marking | Marks deducted per wrong answer (e.g. 0.5) |
| P1 / P2 | P1 = required for launch; P2 = after launch |

### 1.5 References
`docs/02-ARCHITECTURE.md`, `docs/03-DATABASE.md`, `database/schema.sql`, `packages/api-contract/openapi.yaml`, `docs/05-DESIGN-SYSTEM.md`, `docs/06-SCREENS.md`.

---

## 2. Overall description

### 2.1 Product perspective
One backend serves three clients. The API contract (OpenAPI) is shared, so the Flutter app and web app are developed in parallel and behave identically. Web additionally exposes public, SEO-indexed pages (question solutions, previous-year papers) to attract organic traffic.

### 2.2 User classes

| Role | Description | Client |
| --- | --- | --- |
| Guest | Not logged in; can view public pages, packages, sample questions | Web, app |
| Student (free) | Registered; limited live exams and practice per day | Web, app |
| Student (premium) | Active subscription; full access | Web, app |
| Super admin | Everything including admins, roles, settings | Admin |
| Content manager | Questions, taxonomy, exams, imports | Admin |
| Moderator | Reviews questions, handles error reports | Admin |
| Support | Views users, resets devices, views payments | Admin |
| Accountant | Payments, refunds, revenue reports | Admin |

### 2.3 Operating environment
- Android 7.0 (API 24)+, iOS 14+.
- Web: last 2 versions of Chrome, Edge, Firefox, Safari; mobile browsers.
- Network: must work on slow 3G/4G (Bangladesh mobile data) — see NFR-PERF.

### 2.4 Constraints
- Database: MySQL 8.4 LTS (decision fixed).
- Primary language Bangla, secondary English; all UI strings localized.
- Payment gateways: bKash, Nagad (via SSLCommerz or direct), card via SSLCommerz.
- SMS used only for OTP (cost control); everything else via push/in-app.

### 2.5 Assumptions
- Question content (5 lakh MCQs) is owned or licensed by the business.
- One account = one person; account sharing is restricted by device binding.

---

## 3. Functional requirements

Priority: **P1** launch, **P2** later. "All" = mobile + web unless stated.

### 3.1 Authentication & account (AUTH)

| ID | Requirement | P |
| --- | --- | --- |
| FR-AUTH-01 | User registers with Bangladeshi mobile number (`01[3-9]XXXXXXXX`), receives a 6-digit OTP by SMS, verifies, then sets name and password. | P1 |
| FR-AUTH-02 | OTP expires in 5 minutes; max 3 OTP requests per phone per hour and 10 per IP per hour; resend enabled after 60 s countdown. | P1 |
| FR-AUTH-03 | Login with phone + password. After 5 failed attempts, lock login for 15 minutes. | P1 |
| FR-AUTH-04 | Sign in with Google (links to existing account by verified phone on first use). | P2 |
| FR-AUTH-05 | Forgot password: OTP to phone, then set new password; all sessions revoked. | P1 |
| FR-AUTH-06 | Sessions use a 15-minute access token + rotating refresh token (30 days). Reuse of an old refresh token revokes the whole session family. | P1 |
| FR-AUTH-07 | Device binding: an account may be active on 1 mobile device + 1 web browser at a time. Logging in on a new device signs out the old one of the same kind; user may self-reset device max 2 times per 30 days, beyond that via support. | P1 |
| FR-AUTH-08 | Onboarding: user selects one or more target exams (BCS, Bank, Primary…) and district; used for home feed and district rank. | P1 |
| FR-AUTH-09 | Profile: edit name, photo, district, target exams, language (bn/en), theme (light/dark/system). | P1 |
| FR-AUTH-10 | Account deletion request from settings (Play Store/App Store requirement); data anonymized within 30 days. | P1 |

### 3.2 Home & discovery (HOME)

| ID | Requirement | P |
| --- | --- | --- |
| FR-HOME-01 | Home shows: next live exam card with countdown and "Join" button (enabled 10 min before start), running exam banner, continue-practice card, today's stats (questions answered, accuracy, streak), quick actions (Practice, Question bank, Search, Analytics). | P1 |
| FR-HOME-02 | Admin-managed banners/announcements carousel (image + deep link). | P1 |
| FR-HOME-03 | Content is filtered by the user's selected target exams. | P1 |

### 3.3 Live exams (EXAM)

| ID | Requirement | P |
| --- | --- | --- |
| FR-EXAM-01 | Exam list with tabs Upcoming / Running / Finished, filter by category; each card shows title, start time, duration, marks, question count, participant count, free/premium badge. | P1 |
| FR-EXAM-02 | Exam detail shows syllabus (subjects & mark distribution), rules, negative marking, start/end time; "Set reminder" schedules a push 15 min and 1 min before start. | P1 |
| FR-EXAM-03 | Premium exams require an active subscription; free users see a paywall with package options. Free users get N free live exams per month (admin setting, default 4). | P1 |
| FR-EXAM-04 | User can start from `start_at` until `end_at − 1 min`. Late joiners get only the remaining time; the attempt always ends at `end_at` (server time). | P1 |
| FR-EXAM-05 | On start, the client downloads the whole paper once (questions + options, no answers). Questions and options may be shuffled per user using a server-provided seed (admin toggle per exam). | P1 |
| FR-EXAM-06 | Exam screen: countdown timer synced to server time, question navigator (answered / unanswered / marked for review), one-question-per-page and all-in-one-scroll (OMR style) modes, mark-for-review, change answer until submit. | P1 |
| FR-EXAM-07 | Answers are saved locally on every tap and synced to the server every 30 s and on app background; a lost connection must never lose answers. | P1 |
| FR-EXAM-08 | Submit with confirmation dialog showing answered/unanswered counts. Auto-submit when the timer reaches zero. Server accepts submissions until `end_at + 60 s` grace; later submissions are rejected but the last synced answers are scored. | P1 |
| FR-EXAM-09 | One attempt per user per live exam. Re-opening after submit shows the result screen. | P1 |
| FR-EXAM-10 | Anti-cheat: block screenshots and screen recording on Android exam screen (FLAG_SECURE), detect app switching and show a warning count in the result (not auto-fail), prevent copy of question text on web. | P1 |
| FR-EXAM-11 | After an exam ends, users who missed it can take it as "practice mode" (not ranked). | P1 |

### 3.4 Results & ranking (RES)

| ID | Requirement | P |
| --- | --- | --- |
| FR-RES-01 | Result available within 60 s of the user's submission: score, correct, wrong, skipped, negative marks, time taken, accuracy %. | P1 |
| FR-RES-02 | Provisional merit position shown immediately (live ranking from Redis); final merit published at `end_at + 5 min`. | P1 |
| FR-RES-03 | Ranks: overall, district, and percentile ("You beat 82% of participants"). | P1 |
| FR-RES-04 | Subject-wise breakdown table (marks, accuracy) for the paper. | P1 |
| FR-RES-05 | Solution review: each question with the user's answer, the correct answer, explanation; filter All / Wrong / Skipped / Marked. | P1 |
| FR-RES-06 | Leaderboard: top 100 with name, district, score, time; the user's own row pinned. Ties broken by less time taken, then earlier submission. | P1 |
| FR-RES-07 | Share result card as an image (score, rank, exam name, app branding). | P2 |
| FR-RES-08 | Download result + solutions as PDF watermarked with the user's phone number. | P2 |

### 3.5 Practice (PRAC)

| ID | Requirement | P |
| --- | --- | --- |
| FR-PRAC-01 | Browse taxonomy: category → subject → chapter → topic, with question counts and the user's progress per node. | P1 |
| FR-PRAC-02 | Quick practice: choose a topic, answer questions one at a time with instant correct/wrong feedback and explanation. | P1 |
| FR-PRAC-03 | Custom exam builder: choose topics, number of questions (10–200), duration, difficulty mix, include/exclude already-seen questions; result works like FR-RES-01/05 (no rank). | P1 |
| FR-PRAC-04 | Previous-year question bank: browse by exam (e.g. 45th BCS) and year; practice a full paper as a timed exam. | P1 |
| FR-PRAC-05 | Bookmark any question; "Wrong answers" list built automatically from attempts; both can be practised as a session. | P1 |
| FR-PRAC-06 | Daily free limit for free users (admin setting, default 50 practice questions/day). | P1 |
| FR-PRAC-07 | Offline practice: download a topic set and practise offline; results sync when online. | P2 |

### 3.6 Search (SRCH)

| ID | Requirement | P |
| --- | --- | --- |
| FR-SRCH-01 | Search all published MCQs by any Bangla or English word, typo-tolerant, results in < 300 ms, highlighted matches, filters by category/subject/year. | P1 |
| FR-SRCH-02 | Free users see the question and options; the answer and explanation are premium (or limited per day). | P1 |
| FR-SRCH-03 | Recent searches stored on device; popular searches suggested. | P2 |

### 3.7 Analytics (ANL)

| ID | Requirement | P |
| --- | --- | --- |
| FR-ANL-01 | Dashboard: total questions answered, overall accuracy, exams taken, average rank percentile, current/best streak. | P1 |
| FR-ANL-02 | Accuracy by subject and topic; "weak topics" = topics with ≥ 20 attempts and accuracy < 50%, with a "Practise now" button. | P1 |
| FR-ANL-03 | Progress chart: score and percentile across the last 30 live exams. | P1 |
| FR-ANL-04 | Stats are precomputed by background workers, never calculated on request. | P1 |

### 3.8 Gamification (GAM)

| ID | Requirement | P |
| --- | --- | --- |
| FR-GAM-01 | Daily streak: at least 10 questions answered in a day (Asia/Dhaka) keeps the streak. | P1 |
| FR-GAM-02 | Points for correct answers and exam participation; weekly leaderboard reset every Saturday 00:00 Dhaka time. | P2 |
| FR-GAM-03 | Badges (first exam, 7-day streak, top 10 rank, 1,000 questions…). | P2 |

### 3.9 Subscription & payments (PAY)

| ID | Requirement | P |
| --- | --- | --- |
| FR-PAY-01 | Packages page: list of packages (e.g. 1 month, 6 months, 12 months; per category or all-access) with price, discount and features. | P1 |
| FR-PAY-02 | Checkout via bKash / Nagad / card (SSLCommerz or direct bKash tokenized checkout). Subscription activates only after server-side payment validation (IPN / validate API), never on client redirect alone. | P1 |
| FR-PAY-03 | Coupon codes: percentage or fixed, usage limit, per-user limit, validity dates, package restriction. | P1 |
| FR-PAY-04 | Free trial: new users get N days premium (admin setting, default 7), once per phone number. | P1 |
| FR-PAY-05 | Payment history and active subscription with expiry date in profile; expiry reminders by push 3 days and 1 day before. | P1 |
| FR-PAY-06 | Idempotent payment handling: duplicate IPNs or retries must never create double subscriptions (unique gateway transaction id). | P1 |
| FR-PAY-07 | iOS: if Apple requires in-app purchase for digital content, the iOS app hides purchase UI and shows "Manage your plan on [Domain]" (reader-app model) — decision before iOS submission. | P1 |

### 3.10 Notifications (NOTI)

| ID | Requirement | P |
| --- | --- | --- |
| FR-NOTI-01 | Push notifications via FCM: exam reminders, result published, subscription expiry, admin broadcasts (by category/segment). | P1 |
| FR-NOTI-02 | In-app notification inbox with read/unread state. | P1 |
| FR-NOTI-03 | User can toggle notification types in settings. | P1 |

### 3.11 Question error reporting (REP)

| ID | Requirement | P |
| --- | --- | --- |
| FR-REP-01 | User can report a question (wrong answer, typo, wrong explanation, other + text). | P1 |
| FR-REP-02 | Moderators resolve reports in admin; user gets a notification when their report is accepted. | P1 |

### 3.12 Public web & SEO (WEB)

| ID | Requirement | P |
| --- | --- | --- |
| FR-WEB-01 | Public landing page, packages page, about, contact, privacy policy, terms, refund policy. | P1 |
| FR-WEB-02 | Server-rendered SEO pages for previous-year papers and individual solved questions (`/questions/{slug}`), with schema.org `Quiz`/`Question` markup, sitemap.xml, Open Graph images. | P1 |
| FR-WEB-03 | App download links (Play Store / App Store) and smart app banner. | P1 |
| FR-WEB-04 | Web student area has the same features as the app (exam, practice, results, analytics, payment). | P1 |

### 3.13 Admin panel (ADM)

| ID | Requirement | P |
| --- | --- | --- |
| FR-ADM-01 | Admin login with email + password + TOTP 2FA; optional IP allowlist; separate admin accounts from student accounts. | P1 |
| FR-ADM-02 | Role-based access control with the roles in §2.2; permissions checked on every admin endpoint. | P1 |
| FR-ADM-03 | Dashboard: today's signups, active users (DAU/MAU), revenue (today/month), upcoming exams, open reports, server queue health. | P1 |
| FR-ADM-04 | Question list: data table with filters (taxonomy, status, difficulty, source exam/year, created by), full-text search, bulk actions (publish, archive, re-tag). | P1 |
| FR-ADM-05 | Question editor: rich text (bold, italic, underline, sub/superscript, tables), images (uploaded to R2), math via KaTeX, 4–5 options, correct option, explanation, difficulty (1–5), tags (multiple taxonomy nodes), source exam & year. Live preview as it appears in the app. | P1 |
| FR-ADM-06 | Duplicate detection: normalized text hash blocks exact duplicates; near-duplicates (similarity > 90% via search) shown as a warning. | P1 |
| FR-ADM-07 | Bulk import from Excel/CSV (and Word with a fixed template): upload → column mapping → preview with validation errors per row → import as background job → report (imported, skipped duplicates, failed rows downloadable). Must handle 50,000 rows per file. | P1 |
| FR-ADM-08 | Review workflow: Draft → In review → Published → Archived; content managers create, moderators approve; every change logged with before/after (audit). | P1 |
| FR-ADM-09 | Taxonomy manager: drag-and-drop tree, Bangla + English names, slug, ordering, question counts. | P1 |
| FR-ADM-10 | Exam builder: manual pick (search & add questions) or auto-generate from a blueprint (count per taxonomy node + difficulty mix, excluding questions used in the last N exams); set schedule, duration, marks per question, negative marks, free/premium, shuffle on/off, result publish time. | P1 |
| FR-ADM-11 | Live exam monitor: participants joined, submitted, active now, queue backlog, error rate — refreshed every 5 s. | P1 |
| FR-ADM-12 | Users: search by phone/name, view profile, subscriptions, attempts, devices; actions: reset device, ban/unban, grant subscription manually (with reason). | P1 |
| FR-ADM-13 | Payments: list, filter, view gateway response, mark refund; packages and coupons CRUD. | P1 |
| FR-ADM-14 | Reports queue (FR-REP), notifications broadcast composer, banners manager, app settings (free limits, trial days, maintenance mode, minimum app version to force update). | P1 |
| FR-ADM-15 | Export: CSV of users, payments, exam results (background job, emailed/downloaded link). | P2 |

### 3.14 App platform requirements (APP)

| ID | Requirement | P |
| --- | --- | --- |
| FR-APP-01 | Force update: if app version < `min_supported_version` from settings, show blocking update screen. | P1 |
| FR-APP-02 | Maintenance mode screen driven by API settings. | P1 |
| FR-APP-03 | Deep links / universal links for exams, results and questions (`https://[Domain]/exam/{id}` opens the app if installed). | P1 |
| FR-APP-04 | Crash reporting (Firebase Crashlytics / Sentry) and analytics events for key funnels. | P1 |

---

## 4. Non-functional requirements

### 4.1 Performance (NFR-PERF)

| ID | Requirement |
| --- | --- |
| NFR-PERF-01 | API p95 latency < 300 ms for read endpoints and < 300 ms for exam submit at 10,000 concurrent users. |
| NFR-PERF-02 | Exam paper (100 MCQs) loads in < 3 s on a 3G connection (paper JSON ≤ 150 KB gzipped, cached at CDN). |
| NFR-PERF-03 | Search results < 300 ms p95 over 20 lakh questions. |
| NFR-PERF-04 | App cold start < 3 s on a mid-range Android (e.g. 4 GB RAM); APK size < 30 MB. |
| NFR-PERF-05 | Web Core Web Vitals on public pages: LCP < 2.5 s, CLS < 0.1, INP < 200 ms. |

### 4.2 Scalability & availability (NFR-SCAL)

| ID | Requirement |
| --- | --- |
| NFR-SCAL-01 | Support 5 lakh questions and 50,000 users at launch; design headroom 20 lakh questions, 5 lakh users, 50,000 concurrent exam takers without schema changes. |
| NFR-SCAL-02 | API stateless; horizontal scaling by adding API instances behind a load balancer. |
| NFR-SCAL-03 | 99.5% monthly uptime; 99.9% during scheduled live exam windows. |
| NFR-SCAL-04 | Zero lost answer sheets: every accepted submission is durable in Redis (AOF) until written to MySQL. |

### 4.3 Security (NFR-SEC)

| ID | Requirement |
| --- | --- |
| NFR-SEC-01 | HTTPS everywhere (TLS 1.2+); HSTS on web. |
| NFR-SEC-02 | Passwords hashed with Argon2id (or bcrypt cost 12). |
| NFR-SEC-03 | Correct answers and explanations never leave the server before allowed (FR-EXAM-05). |
| NFR-SEC-04 | Rate limiting on auth, OTP, search and submit endpoints; Cloudflare WAF rules. |
| NFR-SEC-05 | OWASP Top 10 and OWASP MASVS-L1 for mobile; tokens stored in Keychain/Keystore (flutter_secure_storage), never in plain prefs or localStorage (web uses httpOnly cookies). |
| NFR-SEC-06 | Admin actions audited (who, what, when, before/after). |
| NFR-SEC-07 | Personal data handled per Bangladesh's data protection rules in force at launch; privacy policy published. |

### 4.4 Usability & accessibility (NFR-UX)

| ID | Requirement |
| --- | --- |
| NFR-UX-01 | Bangla first: all strings localized (bn, en); Bangla digits in bn locale; Bangla fonts render correctly on all platforms. |
| NFR-UX-02 | Touch targets ≥ 48 dp; text contrast ≥ WCAG AA (4.5:1). |
| NFR-UX-03 | Light and dark themes; respects system font scaling up to 130% without layout breaking. |
| NFR-UX-04 | Every list/screen has loading skeleton, empty, error-with-retry and offline states. |
| NFR-UX-05 | Web and app look and behave the same (shared design tokens, same flows). |

### 4.5 Maintainability (NFR-MNT)

| ID | Requirement |
| --- | --- |
| NFR-MNT-01 | Contract-first API (OpenAPI 3.1); clients generated, never hand-written. |
| NFR-MNT-02 | Unit test coverage ≥ 70% on API services; contract tests on all endpoints; e2e for the live exam flow on web and app. |
| NFR-MNT-03 | CI (GitHub Actions): lint, typecheck, tests, build for every PR. |
| NFR-MNT-04 | Structured JSON logs, request IDs, metrics (Prometheus) and error tracking (Sentry). |

### 4.6 Data & backup (NFR-DATA)

| ID | Requirement |
| --- | --- |
| NFR-DATA-01 | Daily full MySQL backup + binlog shipping to R2 (point-in-time restore, RPO ≤ 15 min, RTO ≤ 2 h). |
| NFR-DATA-02 | Attempts retained online for 24 months, then archived. |
| NFR-DATA-03 | Monthly restore drill on staging. |

---

## 5. External interfaces

| Interface | Provider | Use |
| --- | --- | --- |
| SMS | Bangladeshi SMS gateway (e.g. Alpha SMS / BulkSMSBD), HTTP API | OTP only |
| Payment | bKash tokenized checkout, SSLCommerz (bKash/Nagad/cards) | Subscriptions |
| Push | Firebase Cloud Messaging | Reminders, results, broadcasts |
| Storage | Cloudflare R2 (S3 API) | Question images, PDFs, imports |
| Search | Meilisearch (self-hosted) | Smart search |
| Email (optional) | Amazon SES / Resend | Admin reports, receipts |
| Crash/analytics | Firebase Crashlytics + Analytics, Sentry | Monitoring |

---

## 6. Key use cases

**UC-01 Take a live exam** — Student opens exam card → Join (enabled 10 min before) → reads instructions → paper downloads → answers (autosave + sync) → submits or auto-submits → sees score + provisional rank → final merit after publish.

**UC-02 Quick practice** — Student picks topic → answers one by one with instant feedback → session summary → wrong answers added to revision list.

**UC-03 Buy a package** — Student taps a premium item → paywall → selects package → applies coupon → pays with bKash → gateway IPN validated → subscription active → premium unlocked on all devices.

**UC-04 Import questions** — Content manager uploads Excel → maps columns → reviews preview errors → starts import → background job → report; questions land in Draft/In review.

**UC-05 Schedule a live exam** — Content manager creates exam → applies blueprint → reviews paper → sets time, marks, negative marks → publishes; students get a push notification.

---

## 7. Data requirements (summary)
Full schema in `database/schema.sql`. Core entities: users, user_devices, refresh_tokens, taxonomy_nodes, questions, question_tags, exams, exam_questions, attempts (monthly partitioned), user_topic_stats, user_daily_stats, bookmarks, user_wrong_questions, packages, subscriptions, payments, coupons, notifications, question_reports, banners, admins, roles, audit_logs, app_settings, import_jobs.

---

## 8. Acceptance criteria for launch
1. All P1 requirements implemented on web and app with passing tests.
2. Load test: 10,000 virtual users complete the live exam flow with submit p95 < 300 ms and 0 lost submissions.
3. 5 lakh questions imported, searchable, and tagged.
4. Payment flow verified end-to-end in gateway sandbox and with one real transaction per gateway.
5. Play Store and App Store builds approved; web deployed with SSL and CDN.

## 9. Future scope (not v1)
AI explanation assistant, written (CQ) exams with teacher grading, live classes, community discussion, institution/coaching-center white-label accounts, offline exam packs.
