# Prompt 00 — Foundation (run once, single session)

Copy everything below the line into Claude Code at the repo root.

---

Read `CLAUDE.md`, then `docs/02-ARCHITECTURE.md`, `docs/03-DATABASE.md`, `docs/04-API.md`, `docs/05-DESIGN-SYSTEM.md` and `docs/07-IMPLEMENTATION-PLAN.md` (Phase 0).

Do Phase 0 tasks P0-1 to P0-8 in order. Before starting, show me a short plan with the folders and packages you will create, then proceed without waiting unless something in the docs conflicts.

Requirements:
1. pnpm workspaces + Turborepo monorepo exactly as in CLAUDE.md "Monorepo layout". Node 22, TypeScript strict.
2. `docker-compose.yml` with mysql:8.4 (utf8mb4, config from docs/03 §5 scaled for local), redis:7 (appendonly yes), getmeili/meilisearch, stoplight/prism mocking `packages/api-contract/openapi.yaml` on port 4010. Provide `.env.example` for root, api, web, admin, mobile (`--dart-define` list).
3. `pnpm db:reset`: drop/create DB, apply `database/schema.sql`, run `prisma db pull` + `prisma generate` in apps/api, then seed (`database/seed/*.ts`): 64 districts (bn+en), taxonomy (BCS, Bank, Primary, NTRCA, Admission → subjects → 2–3 chapters → topics), 2,000 realistic placeholder Bangla MCQs spread over topics, 3 packages, super admin from env, 5 exams (finished, running, 3 upcoming) with papers.
4. `pnpm contract:gen`: openapi-typescript + openapi-fetch → `packages/api-client-ts`; openapi-generator-cli dart-dio → `apps/mobile/packages/api_client`. Create `packages/api-contract/shuffle-vectors.json` (10 seeds) and the mulberry32 + Fisher–Yates implementation in TS (`packages/api-client-ts/src/shuffle.ts`) and Dart (`apps/mobile/lib/core/utils/shuffle.dart`) with tests that both pass the vectors.
5. `pnpm tokens:gen`: script in `packages/design-tokens` reading `design/tokens.json` → `dist/tokens.css` (CSS variables for light + dark via `[data-theme]` and `prefers-color-scheme`), a Tailwind v4 `@theme` file, and `apps/mobile/lib/core/theme/tokens.g.dart` (AppColors light/dark, AppSpace, AppRadius, AppText, a `ThemeExtension<AppTokens>`, and `buildTheme(Brightness)` returning Material 3 ThemeData). Add a test that every text/background pair in the tokens meets 4.5:1.
6. Scaffold apps:
   - `apps/api`: NestJS 11, config module with Zod env validation, Prisma, ResponseEnvelopeInterceptor, HttpExceptionFilter with error codes from docs/04 §4, request-id + Pino, `/v1/health`, serve Swagger UI from openapi.yaml at `/docs`, separate entry points `main.ts`, `worker.ts`, `scheduler.ts`, contract test harness in `test/contract` that validates responses against openapi.yaml.
   - `apps/web` and `apps/admin`: Next.js 15 App Router, Tailwind v4 using tokens, shadcn/ui, next-intl (bn default, en) with `messages/bn.json`/`en.json`, fonts via next/font (Hind Siliguri + Inter), theme toggle, TanStack Query provider, API base from env (defaults to mock).
   - `apps/mobile`: Flutter, Riverpod (generator), go_router, dio with interceptors (envelope unwrap, error mapping to error codes, auth refresh placeholder), flutter_localizations + ARB bn/en (same keys as web messages), bundled Hind Siliguri + Inter fonts, theme from tokens.g.dart, light/dark/system.
7. UI kit v1 in `packages/ui` (React) and `apps/mobile/lib/shared/widgets` (Flutter) with identical names: AppButton, AppTextField, OptionTile (idle/selected/correct/wrong/missed), AppCard, AppChip, Skeleton, EmptyState, ErrorState. Gallery page at `/dev/gallery` on web and a debug-only route on mobile. Match `design/ui-reference.html`.
8. GitHub Actions: install, lint, typecheck, unit tests, `contract:gen` drift check, `flutter analyze` + `flutter test`.

Finish by running all checks, then tell me the commands to start everything and what you could not complete.
