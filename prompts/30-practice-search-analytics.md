# Prompt 30 — Phase 3: practice, question bank, search, analytics, notifications

Use one prompt per track. Each track reads `CLAUDE.md`, `docs/01-SRS.md` §3.5–3.8 and §3.10–3.11, `docs/06-SCREENS.md` sections F, G, H, J.

---

## Track A (API)
Implement: taxonomy with per-user progress, source exams, `/questions/{id}` with answer locking by premium/quota, public question by slug, bookmarks, wrong-questions (maintained by scoring + practice workers; remove after 2 consecutive correct), question reports, practice sessions (pools `topic:{id}:qids` rebuilt nightly, exclude seen via a Redis bitmap/set per user, difficulty mix), quick-answer endpoint, Meilisearch index setup (searchable: body_text, options_text, explanation_text; filterable: category, node ids, year, status; Bangla-friendly settings) + outbox sync worker + full reindex command, search endpoint with highlights and quota for answers, analytics rollups (`user_topic_stats`, `user_daily_stats`, streaks in Asia/Dhaka days, `questions.times_*`), analytics endpoints, notifications inbox + preferences + FCM sender (topic per category + token sends) + reminder scheduler (15 min, 1 min). Tests + contract tests.

## Track W (Web)
Build F1–F9, G1, H1 (Recharts), J1, J4 notification prefs. Quick practice reveals answer instantly; custom builder 2 steps; question bank read/timed modes; KaTeX rendering of question HTML with DOMPurify. Public SEO pages `/questions/[slug]` and `/papers/...` as server components with schema.org JSON-LD and `generateMetadata`; sitemap.

## Track M (Flutter)
Build F1–F9, G1, H1 (fl_chart), J1, J4. Render question HTML with `flutter_widget_from_html` + `flutter_math_fork` for math; image zoom; recent searches in Hive; FCM setup (Android channel, iOS permission prompt after first exam, foreground handling, deep link routing via go_router).
