# CLAUDE.md — MCQ Exam Platform

This file is the standing instruction set for Claude Code. Read it fully at the start of every session, then read the doc for the area you are working on (see "Where things are").

## What we are building

A Bangladesh job & admission MCQ preparation platform (BCS, bank, primary, NTRCA, admission), similar in scope to Live MCQ, Chorcha, Engineers BCS Care and Smart Sohay Job.

Three client apps share ONE backend and ONE API contract:

| App | Tech | Users |
| --- | --- | --- |
| `apps/mobile` | Flutter (Android + iOS) | Students |
| `apps/web` | Next.js (App Router) | Students + public SEO pages |
| `apps/admin` | Next.js (App Router) | Admins, content team, moderators |
| `apps/api` | NestJS + Prisma + MySQL 8.4 + Redis | Serves all three |

Scale targets: 5 lakh+ MCQs, 50,000 users at launch (design headroom 5 lakh users), 10,000 concurrent users in one live exam.

## The golden rule: contract first

`packages/api-contract/openapi.yaml` is the single source of truth for every endpoint, request and response.

1. Never add, rename or change an endpoint in code without first changing `openapi.yaml`.
2. After editing the contract, run `pnpm contract:gen` — it regenerates the TypeScript client (`packages/api-client-ts`) and the Dart client (`apps/mobile/packages/api_client`).
3. Web and mobile are built against the **mock server** (`pnpm mock`, Prism on port 4010) until the real API endpoint is ready, so web, mobile and API can be built at the same time.
4. The API has a contract test (`apps/api/test/contract`) that validates real responses against `openapi.yaml`. It must pass in CI.

## Where things are

| Need | Read |
| --- | --- |
| What to build, requirement IDs | `docs/01-SRS.md` |
| System design, modules, live-exam flow | `docs/02-ARCHITECTURE.md` |
| Tables, indexes, partitioning | `docs/03-DATABASE.md` + `database/schema.sql` |
| Endpoints, envelopes, errors | `docs/04-API.md` + `packages/api-contract/openapi.yaml` |
| Colors, type, components, motion | `docs/05-DESIGN-SYSTEM.md` + `design/tokens.json` |
| Every screen, its states and data | `docs/06-SCREENS.md` |
| Visual reference for the look | `design/ui-reference.html` (open in a browser) |
| Build order and phase prompts | `docs/07-IMPLEMENTATION-PLAN.md` + `prompts/` |
| Security, testing, deploy | `docs/08-QUALITY-SECURITY-DEPLOY.md` |
| Dev A → Dev B handoff (what is ready, ports, mock rules) | `docs/10-HANDOFF-A-TO-B.md` |

When a requirement ID (e.g. `FR-EXAM-07`) is referenced in a task, implement exactly that requirement and mention the ID in the commit message.

## Monorepo layout

```
.
├── apps/
│   ├── api/            NestJS
│   ├── web/            Next.js student web
│   ├── admin/          Next.js admin panel
│   └── mobile/         Flutter app (+ packages/api_client generated)
├── packages/
│   ├── api-contract/   openapi.yaml (source of truth)
│   ├── api-client-ts/  generated, never edit by hand
│   ├── design-tokens/  tokens.json → CSS variables + Dart theme
│   ├── ui/             shared React components (web + admin)
│   └── config/         eslint, tsconfig, tailwind presets
├── database/           schema.sql, seed/, partition scripts
├── docs/  design/  prompts/
├── docker-compose.yml  mysql, redis, meilisearch, prism mock
└── turbo.json, pnpm-workspace.yaml
```

Tooling: pnpm workspaces + Turborepo for JS/TS. Flutter lives in `apps/mobile` with its own `pubspec.yaml`; Melos is optional.

## Tech stack (fixed — do not swap without asking)

**API (`apps/api`)**: Node 22 LTS, NestJS 11, TypeScript strict, Prisma ORM (MySQL), MySQL 8.4 LTS (InnoDB, utf8mb4_unicode_ci), Redis 7 (ioredis), BullMQ, Meilisearch, Zod or class-validator DTOs, Pino logger, Jest + Supertest.

**Web & Admin**: Next.js 15 App Router, TypeScript strict, Tailwind CSS v4, shadcn/ui (Radix), TanStack Query, Zustand (exam state only), next-intl (bn default, en), React Hook Form + Zod, Recharts, TipTap + KaTeX (admin editor), TanStack Table (admin grids), Playwright for e2e.

**Mobile (`apps/mobile`)**: Flutter 3.x stable, Dart 3, Riverpod (riverpod_generator), go_router, dio + generated client, freezed + json_serializable, flutter_secure_storage (tokens), Hive or Isar (offline answer cache), firebase_messaging, flutter_localizations + intl ARB (bn default, en), google_fonts or bundled fonts, flutter_math_fork (KaTeX-like math), fl_chart.

**Infra**: Docker, Cloudflare (DNS/CDN/WAF), Cloudflare R2 for images/PDFs, FCM push, Bangladeshi SMS gateway (OTP only), bKash / SSLCommerz.

## Coding conventions

- TypeScript `strict: true`; no `any` except in generated code.
- API modules follow NestJS module-per-domain: `auth`, `users`, `taxonomy`, `questions`, `search`, `exams`, `attempts`, `leaderboard`, `practice`, `analytics`, `billing`, `notifications`, `reports`, `admin/*`.
- All API responses use the envelope `{ "data": ..., "meta": {...} }`; errors use `{ "error": { "code", "message", "details" } }` with codes listed in `docs/04-API.md`.
- Pagination: cursor-based (`?cursor=&limit=`), never OFFSET on large tables.
- IDs: `BIGINT UNSIGNED` in DB, serialized as **strings** in JSON (Dart/JS number safety).
- Time: store UTC (`DATETIME(3)`), send ISO-8601 with `Z`; clients display Asia/Dhaka.
- Bangla digits: clients format numbers with the active locale (০১২৩ in bn).
- Flutter: feature-first folders `lib/features/<feature>/{data,domain,presentation}`; no business logic in widgets.
- Next.js: server components by default; client components only for interactivity; data via TanStack Query hooks from the generated client.
- Every screen implements four states: loading (skeleton), empty, error (retry), success — see `docs/06-SCREENS.md`.
- Never hardcode colors, font sizes or spacing; use tokens from `packages/design-tokens`.
- Never send `correct_option` or explanations to clients before an exam has ended or a practice question is answered.

## Commands (create these in Phase 0)

```
pnpm dev             # api + web + admin
pnpm mock            # Prism mock server from openapi.yaml on :4010
pnpm contract:gen    # regenerate TS + Dart clients
pnpm tokens:gen      # regenerate CSS vars + Dart theme from tokens.json
pnpm db:reset        # drop, apply database/schema.sql, prisma db pull, seed
pnpm test / pnpm e2e
cd apps/mobile && flutter run --dart-define=API_BASE=http://10.0.2.2:4010
```

## Team & ownership (website phase)

Two developers, each with their own Claude Code session. Full details: `docs/09-TEAM-SPLIT.md`.

| Dev | GitHub | Owns |
| --- | --- | --- |
| A — Majid | @majid905 | `apps/api`, `database/`, `packages/api-contract/`, `packages/api-client-ts/`, `docker-compose.yml`, `deploy/`, `.github/workflows/`, `load/` |
| B — Mozlish | @Mozlish | `apps/web`, `apps/admin`, `packages/ui`, `packages/design-tokens`, `design/`, Playwright e2e |

- Every session starts with `prompts/team/A-session-start.md` or `B-session-start.md`. Only edit files in your owner's folders (plus shared root config/docs when the task requires it).
- Only Dev A changes `openapi.yaml`. Dev B's Claude writes a contract-change request instead of editing it.
- No pull requests: commit small and push straight to `main`. Always `git pull --rebase origin main` first, run lint/typecheck/test before pushing, never force-push `main`. Conventional commits with requirement IDs.
- `apps/mobile` is out of scope until the website is launched.

## Working rules for Claude Code

1. Work one phase task at a time from `docs/07-IMPLEMENTATION-PLAN.md`; tick the checkbox when done.
2. Before coding a feature, list the requirement IDs, endpoints and screens it touches.
3. Write tests with the feature (unit for services, contract test for endpoints, widget test for key Flutter screens).
4. Run lint, typecheck and tests before declaring a task done.
5. If a spec is ambiguous or two docs disagree, stop and ask; do not guess. `openapi.yaml` and `schema.sql` win over prose docs.
6. Keep secrets in `.env` files (see `.env.example`); never commit real keys.
