# MCQ Exam Platform — Spec Pack for Claude Code

Everything Claude Code needs to build the platform (Flutter Android/iOS app, Next.js student web, Next.js admin, NestJS API on MySQL) with web and mobile developed **at the same time**.

## What's inside

| File | Purpose |
| --- | --- |
| `CLAUDE.md` | Standing instructions Claude Code reads every session (stack, rules, folder map) |
| `docs/01-SRS.md` | Requirements with IDs (FR-…, NFR-…) — English |
| `docs/01-SRS_bn.md` | Same SRS in Bangla (for you and your team) |
| `docs/02-ARCHITECTURE.md` | System design, modules, live-exam flow, caching |
| `docs/03-DATABASE.md` + `database/schema.sql` | MySQL 8.4 design and full DDL (partitioned attempts) |
| `docs/04-API.md` + `packages/api-contract/openapi.yaml` | API conventions + OpenAPI 3.1 contract shared by web and app |
| `docs/05-DESIGN-SYSTEM.md` + `design/tokens.json` | "Calm focus" design system, tokens for both platforms |
| `design/ui-reference.html` | Open in a browser: visual target for key screens (light/dark) |
| `docs/06-SCREENS.md` | Every screen: route, layout, data, states, requirement IDs |
| `docs/07-IMPLEMENTATION-PLAN.md` | Phases and parallel tracks with checkboxes |
| `docs/08-QUALITY-SECURITY-DEPLOY.md` | Tests, security checklist, deployment, monitoring |
| `docs/09-TEAM-SPLIT.md` (+ `_bn`) | Website work split between Majid (backend) and Mozlish (frontend), git workflow |
| `prompts/` | Copy-paste prompts for each phase and track; `prompts/team/` for the two-developer setup |
| `.github/` | CODEOWNERS, PR template, contract-change issue template |

## How to use

**Two developers?** Follow `docs/09-TEAM-SPLIT.md` instead of the steps below.

1. Create an empty git repo and copy **all** these files into its root (keep the folder structure).
2. Replace `[App Name]` and `[Domain]` placeholders (search the repo).
3. Open Claude Code at the repo root and paste `prompts/00-foundation.md`. Wait until Phase 0 exits cleanly (`pnpm dev`, `pnpm mock`, gallery pages on web and app).
4. For each later phase, open **three** Claude Code sessions (or git worktrees) and paste the matching API, web and mobile prompts (`10/11/12`, `20/21/22`, then `30`, `40` sections per track). Web and mobile build against the mock server while the API is built.
5. At each checkpoint, switch the finished feature from mock to the real API and run the e2e tests.
6. Finish with `prompts/50-hardening.md`.

## Rules that keep web and app in sync
- Change the API only through `openapi.yaml`, then `pnpm contract:gen`.
- Change colours/spacing/fonts only in `design/tokens.json`, then `pnpm tokens:gen`.
- Same screen routes, same string keys (ARB ↔ next-intl JSON), same component names.

## Decisions already fixed
MySQL 8.4 · NestJS + Prisma · Redis + BullMQ · Meilisearch · Next.js 15 · Flutter + Riverpod · Cloudflare + R2 · FCM · bKash/SSLCommerz · Bangla default, English second.
