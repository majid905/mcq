# 07 — Implementation plan

Build order is designed so **API, web and mobile progress in parallel**: Phase 0 freezes the contract, tokens and mock server; after that, three tracks run side by side and meet at integration checkpoints. Each phase has a ready-to-paste prompt in `prompts/`.

```
Phase 0  Foundation (contract, tokens, monorepo, DB, mock)      ── 1 week
           │
           ├── Track A: API      ──┐
Phase 1-4  ├── Track W: Web+Admin ─┼── checkpoint after each phase: switch that
           └── Track M: Mobile   ──┘   feature from mock → real API, run e2e
Phase 5  Hardening: load test, security, SEO, store builds      ── 2 weeks
```

How to run tracks in parallel with Claude Code: open **three terminals / three Claude Code sessions** (or git worktrees: `git worktree add ../mcq-api track/api`), one per track, each started with the track prompt. They never edit the same folders: Track A owns `apps/api`, Track W owns `apps/web` + `apps/admin` + `packages/ui`, Track M owns `apps/mobile`. Only the contract owner (you, or Track A on request) edits `openapi.yaml`.

---

## Phase 0 — Foundation (prompt: `prompts/00-foundation.md`)
- [ ] P0-1 Monorepo: pnpm workspaces, Turborepo, `packages/config` (eslint, tsconfig, prettier), root scripts from CLAUDE.md.
- [ ] P0-2 `docker-compose.yml`: mysql 8.4, redis 7 (AOF), meilisearch, prism mock on 4010; `.env.example` files.
- [ ] P0-3 Database: apply `database/schema.sql`; seed script (districts, taxonomy, 2,000 sample Bangla MCQs, packages, admin, 5 exams).
- [ ] P0-4 Contract tooling: `pnpm contract:gen` (openapi-typescript + openapi-fetch; openapi-generator dart-dio), `pnpm mock`, shuffle test vectors.
- [ ] P0-5 Design tokens: `pnpm tokens:gen` → `packages/design-tokens/dist/tokens.css` (+ Tailwind v4 `@theme`) and `apps/mobile/lib/core/theme/tokens.g.dart` (ThemeExtension + light/dark ThemeData); contrast check test.
- [ ] P0-6 Scaffold `apps/api` (NestJS: config, Prisma `db pull`, envelope interceptor, error filter, health check, Pino, Swagger UI from openapi.yaml), `apps/web`, `apps/admin` (Next.js + Tailwind + shadcn + next-intl), `apps/mobile` (Flutter: Riverpod, go_router, dio client, l10n bn/en, fonts bundled, theme from tokens).
- [ ] P0-7 Shared UI kit v1: AppButton, TextField, OptionTile, Card, Chip, Skeleton, EmptyState, ErrorState — in React and Flutter with a gallery page (`/dev/gallery` web, `/dev/gallery` app route in debug).
- [ ] P0-8 CI: GitHub Actions — lint, typecheck, test, contract drift check, Flutter analyze/test.
**Exit:** `pnpm dev` + `pnpm mock` run; web and app show the gallery in light/dark, bn/en.

## Phase 1 — Auth, onboarding, home (prompts `10-api-auth.md`, `11-web-auth-home.md`, `12-mobile-auth-home.md`)
- [ ] A: auth module (OTP via Redis + SMS provider interface with console driver in dev), register, login, refresh rotation, device binding, me, settings/public, home feed.
- [ ] W: login, register, OTP, profile setup, onboarding goals/district, home, app shell, BFF cookie auth.
- [ ] M: splash, welcome, login, register, OTP (SMS autofill), onboarding, home, bottom nav, force-update & maintenance screens, secure token storage + refresh interceptor.
- [ ] Checkpoint 1: web + app logged in against real API; e2e "register → home".

## Phase 2 — Exams, exam room, results (prompts `20-api-exams.md`, `21-web-exams.md`, `22-mobile-exams.md`)
- [ ] A: exams list/detail/reminders, paper build + CDN upload job, start/resume, answer sync to Redis, submit queue, scoring worker, leaderboard sorted sets, merit publish job, auto-submit job, result & solutions endpoints.
- [ ] W: exam list, detail, instructions, exam room (both modes, autosave IndexedDB, keyboard shortcuts), submitted, result, solutions, leaderboard, history.
- [ ] M: same screens; exam room with Hive persistence, FLAG_SECURE, lifecycle sync, offline banner; widget tests for exam room state machine.
- [ ] Checkpoint 2: 3 devices (Android, iOS sim, web) take the same live exam; ranks match; kill the app mid-exam and resume with answers intact.

## Phase 3 — Practice, bank, search, analytics, notifications (prompts `30-*`)
- [ ] A: taxonomy endpoints with progress, practice sessions (pools in Redis), quick-answer endpoint, bookmarks, wrong list, source exams, Meilisearch sync + search, analytics rollup workers, streaks, notifications + FCM sender, reminders scheduler.
- [ ] W & M: practice hub, drill-down, quick practice, custom builder, question bank, bookmarks, wrong list, search, analytics charts, notifications inbox, settings.

## Phase 4 — Payments + Admin (prompts `40-*`)
- [ ] A: packages, coupons, checkout (bKash + SSLCommerz drivers, sandbox), IPN validation, idempotent subscription activation, quotas & PremiumGuard; all admin endpoints with RBAC + audit; import pipeline (xlsx/csv/docx parse → validate → batch insert → outbox); exam generator; monitor endpoint. Add remaining admin CRUD paths to openapi.yaml first.
- [ ] W: plans, checkout, payment status, history; **admin app** L1–L13.
- [ ] M: plans, checkout (Custom Tabs / SFSafariViewController), payment status, paywall component; iOS purchase visibility flag.

## Phase 5 — Hardening & launch (prompt `50-hardening.md`)
- [ ] k6 load test 10,000 VUs on live exam flow; tune MySQL/Redis/Node; fix p95.
- [ ] Security pass (OWASP checklist in `docs/08`), rate limits, WAF rules, secrets audit.
- [ ] SEO: public pages, sitemap, OG images, Core Web Vitals.
- [ ] Observability: Sentry (api/web/app), Prometheus + Grafana dashboards, uptime alerts.
- [ ] Backups (XtraBackup + binlog to R2), restore drill.
- [ ] Store assets, privacy policy, Play Console & App Store submission; production deploy.
