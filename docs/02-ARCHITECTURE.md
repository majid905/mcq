# 02 — Architecture

## 1. Big picture

```
 Flutter app (Android/iOS)   Next.js web (student + SEO)   Next.js admin
            \                        |                         /
             \______ generated clients from openapi.yaml _____/
                                     |
                    Cloudflare (DNS, CDN, WAF, rate limit)
                                     |
                         API servers (NestJS, stateless)
            ┌──────────────┬─────────┴─────────┬───────────────┐
         Redis 7       BullMQ workers       MySQL 8.4       Meilisearch
   (cache, exam state,  (scoring, imports,  (source of      (MCQ search)
    ranks, queues)       push, SMS, stats)   truth)
                                     |
          External: R2 storage · FCM push · SMS gateway · bKash/SSLCommerz
```

**Why web and app can be built at the same time:** both consume the same OpenAPI contract through generated clients. During development they point at a Prism mock server generated from the contract, so neither waits for the backend. Shared design tokens (`design/tokens.json`) generate both CSS variables and the Flutter `ThemeData`, so they look the same.

## 2. Deployable units

| Unit | Process | Scales by |
| --- | --- | --- |
| `api` | NestJS HTTP (`main.ts`) | Add instances (stateless) |
| `worker` | Same codebase, `worker.ts` entry, runs BullMQ processors only | Add instances / concurrency |
| `scheduler` | Single instance (`scheduler.ts`): cron jobs (exam open/close, partitions, stats rollups, reminders) | 1 instance, leader lock in Redis |
| `web` | Next.js (node, `output: standalone`) | Instances / CDN |
| `admin` | Next.js | 1 instance |
| `mysql` | MySQL 8.4 | Bigger box → read replica |
| `redis` | Redis 7 with AOF `everysec` | Bigger box |
| `meilisearch` | Meilisearch | Bigger box |

Launch topology: Server A (API + worker + scheduler + Redis + Meilisearch + web + admin in Docker Compose), Server B (MySQL). See `docs/08-QUALITY-SECURITY-DEPLOY.md`.

## 3. API modules (NestJS)

| Module | Responsibility | Main tables / keys |
| --- | --- | --- |
| `auth` | OTP, register, login, refresh, device binding | users, user_devices, refresh_tokens, `otp:*` |
| `users` | Profile, settings, account deletion | users |
| `taxonomy` | Tree read (cached) | taxonomy_nodes |
| `questions` | Read single/listing, bookmarks, reports | questions, question_tags, bookmarks |
| `search` | Meilisearch queries, index sync | Meili index `questions` |
| `exams` | Exam list/detail, paper build & cache | exams, exam_questions, `exam:{id}:paper` |
| `attempts` | Start, sync, submit, result | attempts, `att:{id}:answers`, `q:submit` |
| `leaderboard` | Live ranks & merit lists | `lb:{examId}` sorted set |
| `practice` | Practice sessions, custom exams | attempts (type practice/custom) |
| `analytics` | Stats reads; rollups in workers | user_topic_stats, user_daily_stats |
| `billing` | Packages, checkout, IPN, coupons, subscriptions | packages, payments, subscriptions, coupons |
| `notifications` | Inbox, push tokens, broadcasts | notifications, user_devices |
| `settings` | Public app settings (min version, maintenance, limits) | app_settings (cached) |
| `admin/*` | All admin endpoints, RBAC guard, audit interceptor | admins, roles, audit_logs, import_jobs |
| `storage` | Signed upload URLs for R2 | — |

Cross-cutting: `ResponseEnvelopeInterceptor`, `HttpExceptionFilter` (error codes), `ThrottlerGuard` (Redis store), `JwtAuthGuard`, `PremiumGuard`, `AdminPermissionGuard`, `AuditInterceptor`, request-id middleware, Pino logger.

## 4. Live exam flow (the critical path)

```
T-30min  scheduler: build paper JSON (questions+options, NO answers) → Redis exam:{id}:paper
         + answer key → Redis exam:{id}:key ; upload paper to R2/CDN (versioned URL)
T-10min  "Join" enabled in clients (exam status = open_soon)
T 0      POST /exams/{id}/start → creates attempt row (status=in_progress),
         returns attempt_id, server_time, ends_at, paper_url, shuffle_seed
         client downloads paper once from CDN
during   client saves answers locally on every tap
         PUT /attempts/{id}/answers every 30 s (Redis HSET att:{id}:answers, no MySQL)
submit   POST /attempts/{id}/submit → validate window → LPUSH to Redis stream q:submit
         → 202 {status:"received"} in < 50 ms
worker   consume q:submit in batches of 500 → score with exam:{id}:key
         → ZADD lb:{examId} composite score → bulk INSERT/UPDATE attempts
         → set attempt status=scored → push "result ready"
T end    scheduler: auto-submit all in_progress attempts using last synced answers
T+5min   publish final merit: read ZREVRANGE → write rank, district_rank, percentile
         to attempts in batches → cache top-100 → notify participants
```

Rules:
- Server time is authority: every response carries `server_time`; clients compute offset.
- Composite leaderboard score: `score * 1e7 + (duration_limit_sec - time_taken_sec)` so ties go to faster.
- Paper JSON is the same for everyone; shuffling is done on device using `shuffle_seed` (deterministic PRNG, same algorithm in Dart and TS — see `docs/04-API.md` §6). Answers are always submitted as `{question_id: option_key}`, so shuffling never affects scoring.
- Redis queue durability: Redis AOF on; worker acks only after MySQL commit.

## 5. Practice flow
`POST /practice/sessions` picks question IDs from a Redis set `topic:{id}:qids` (pre-shuffled pool, refreshed nightly), creates an attempt with `question_ids` JSON, returns questions. For quick practice the client calls `POST /practice/sessions/{id}/answer` per question and receives correct option + explanation immediately.

## 6. Caching

| Key | Content | TTL / invalidation |
| --- | --- | --- |
| `tax:tree:v{n}` | Full taxonomy tree | Bump version on admin change |
| `exam:{id}:paper` / `:key` | Paper and answer key | Until exam end + 7 days |
| `exam:list:{cat}:{status}` | List page | 60 s |
| `settings:public` | App settings | On admin change |
| `user:{id}:sub` | Active subscription summary | 5 min / on payment |
| `lb:{examId}` | Sorted set ranks | Exam end + 30 days |
| `topic:{id}:qids` | Shuffled published question IDs | Nightly rebuild |

HTTP caching: public GET endpoints send `Cache-Control` so Cloudflare caches them (taxonomy, exam list, public question pages).

## 7. Search
Meilisearch index `questions` (id, body_text, options_text, explanation_text, taxonomy ids, category, year, difficulty, status). Synced by worker on question publish/update/archive (outbox table `search_outbox` → worker). Full reindex command for disaster recovery.

## 8. Clients

### Flutter (`apps/mobile`)
```
lib/
  main.dart, app.dart (MaterialApp.router, theme, l10n)
  core/  api/ (dio, interceptors: auth refresh, envelope unwrap, error map)
         theme/ (generated from tokens) l10n/ router/ storage/ utils/
  features/
    auth/ onboarding/ home/ exams/ exam_room/ results/ practice/
    question_bank/ search/ bookmarks/ analytics/ subscription/
    notifications/ profile/ settings/
      each: data/ (repository using generated client)
            domain/ (models, use-cases)
            presentation/ (screens, widgets, riverpod providers)
  shared/widgets/ (design-system widgets: AppButton, OptionTile, TimerBar…)
```
State: Riverpod; exam room state machine (`idle → loading → running → submitting → submitted`) persisted to Hive every change.

### Next.js web (`apps/web`)
```
app/[locale]/(public)/        landing, packages, questions/[slug], papers/[exam]/[year]
app/[locale]/(auth)/          login, register, otp, forgot
app/[locale]/(student)/       home, exams, exam/[id]/room, results/[attemptId],
                              practice, bank, search, bookmarks, analytics, plans, profile
components/ (from packages/ui + app specific)  lib/api (generated client + query hooks)
```
Exam room is a client component with Zustand store persisted to IndexedDB.

### Next.js admin (`apps/admin`)
`app/(auth)/login`, `app/(panel)/dashboard|questions|questions/[id]|imports|taxonomy|exams|exams/[id]/builder|exams/[id]/monitor|users|payments|packages|coupons|reports|notifications|banners|admins|settings`.

## 9. Environments

| Env | Purpose | Data |
| --- | --- | --- |
| local | Docker Compose: mysql, redis, meilisearch, prism | Seed (2,000 questions) |
| staging | Same as prod, smaller box | Anonymized copy |
| production | Live | Real |

Config via environment variables (`.env.example` in each app). Feature flags in `app_settings`.
