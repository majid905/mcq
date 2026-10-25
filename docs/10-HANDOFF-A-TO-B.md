# 10 — Handoff: Dev A (Majid) to Dev B (Mozlish)

Written for Dev B and Dev B's Claude Code session. Read after `CLAUDE.md`, `docs/09-TEAM-SPLIT.md` and `prompts/team/B-session-start.md`.

Status date: 2026-10-24. Dev A has finished the A-00 skeleton and the whole A-01 foundation. What you need to start `prompts/team/B-01-frontend-foundation.md` is ready.

## 1. Where the code is

Everything Dev A has built is already on `main`. We work **without pull requests**: both developers commit and push straight to `main`.

```bash
git clone https://github.com/majid905/mcq.git && cd mcq
```

Daily routine for both developers (and both Claude Code sessions):

1. `git pull --rebase origin main` before you start and again before every push.
2. Small commits with conventional messages and requirement IDs (`feat(web): ... (FR-AUTH-01)`).
3. Run `pnpm lint && pnpm typecheck && pnpm test` before `git push origin main`.
4. If the push is rejected, `git pull --rebase origin main`, fix any conflict, push again. Never `git push --force` to `main`.
5. Stay in your own folders (see `docs/09-TEAM-SPLIT.md`), so conflicts stay rare.

Dev A built the API through exams list/detail/paper. What is live is listed in section 6.

## 2. One-time setup

1. **Node 22** (the repo pins it: `.nvmrc` = 22, `engines` = `>=22 <23`). On Windows use nvm-windows: `nvm install 22 && nvm use 22`.
2. **pnpm 11** (`packageManager` is pinned): `corepack enable` or `npm i -g pnpm@11.24.0`.
3. `pnpm install`
4. `cp .env.example .env` (the defaults work as they are).
5. Docker is only needed if you want the real API. For frontend work the mock is enough.

pnpm 11 blocks dependency build scripts by default. If `pnpm install` ends with `ERR_PNPM_IGNORED_BUILDS`, add the package under `allowBuilds` in `pnpm-workspace.yaml` (`true` only for packages that really need a native build, e.g. `sharp`). `pnpm-workspace.yaml` is a shared file, so mention the change in your PR.

## 3. Mock server: your backend for now

```bash
pnpm mock        # http://localhost:4010/v1
```

- Same base path as the real API. Set `NEXT_PUBLIC_API_BASE=http://localhost:4010/v1` (already in `.env.example`). Switch to the real API with the env variable only, never with code branches.
- Protected endpoints need any `Authorization: Bearer x` header, otherwise the mock answers `401`.
- Mock OTP code is `123456`. The mock accepts any phone number and password.
- Force an error response with the `Prefer` header, e.g. `Prefer: code=425` on `POST /exams/{id}/start` returns the Bangla `EXAM_NOT_STARTED` error.
- Endpoints with hand-written Bangla examples: auth (login, register, verify), `/me`, `/settings/public`, `/home`, `/exams` (list), `/exams/{id}`, `/taxonomy`, `/health`. Every other endpoint returns schema-generated random data, which is fine for layout but not for copy. You may add `examples` to `packages/api-contract/openapi.yaml` in a PR that Dev A approves; do not change anything else in that file.
- `pnpm mock:dynamic` returns random data for every endpoint.

## 4. Typed API client

```ts
import { createApiClient } from '@mcq/api-client-ts';

const api = createApiClient(process.env.NEXT_PUBLIC_API_BASE!);
const { data, error } = await api.GET('/exams', { params: { query: { status: 'running' } } });
```

- Every response is an envelope: `{ data, meta? }`, errors `{ error: { code, message, details? } }`. Error codes: `docs/04-API.md` section 4.
- IDs are strings. Times are ISO-8601 UTC; display in Asia/Dhaka.
- In Next.js set `transpilePackages: ['@mcq/api-client-ts']`. The package exports TypeScript source.
- `shufflePaper`, `mulberry32` and `fisherYates` are exported for the exam room. They pass the shared test vectors in `packages/api-contract/shuffle-vectors.json`.
- Never edit `packages/api-client-ts/src/generated/`. After the contract changes: `pnpm contract:gen`.

## 5. Ports

| Service | Port |
| --- | --- |
| API (real) | 3000 (matches `servers` in `openapi.yaml`) |
| `apps/web` | **3001** (`next dev -p 3001`) |
| `apps/admin` | **3002** (`next dev -p 3002`) |
| Prism mock | 4010 |
| MySQL / Redis / Meilisearch | 3306 / 6379 / 7700 |

The API allows CORS from `http://localhost:3001` and `:3002` (`CORS_ORIGINS` in `.env`).

## 6. Real API (optional, when you want to test against it)

```bash
pnpm infra:up      # docker compose: mysql, redis, meilisearch
pnpm db:reset      # schema + seed (2,000 Bangla MCQs, 5 exams, 64 districts)
pnpm --filter @mcq/api dev     # http://localhost:3000/v1, Swagger UI at http://localhost:3000/docs
```

**Live on the real API (already on `main`):** `GET /health`, all of `/auth/*` (OTP request/verify, register, login, refresh, logout, password reset), `GET/PATCH/DELETE /me`, `PUT /me/push-token`, `POST /me/devices/reset`, `GET /settings/public`, `GET /home`, `GET /exams`, `GET /exams/{id}`, `PUT/DELETE /exams/{id}/reminder`, `GET /exams/{id}/paper`. Everything else (start/submit, results, practice, search, billing, admin) is still mock-only; Dev A tells you in the daily message when the next group is live.

Real-API notes for the web BFF:
- **Dev OTP is always `123456`** (console SMS driver); no SMS is sent. Any valid Bangladeshi number works (`01[3-9]XXXXXXXX`).
- The API is bearer-only and never sets cookies. Your BFF keeps `access_token` (15 min) and `refresh_token` (30 days) in httpOnly cookies, adds CSRF, and calls `/auth/refresh` when it gets 401. **Refresh tokens rotate on every use and reuse revokes the session**, so the BFF must serialise refreshes per session (one in-flight refresh, other requests wait for it) and always store the new refresh token.
- Send `Accept-Language: bn|en`, `X-Platform: web` and a stable `X-Device-Id`-style `device.device_id` in login/register bodies (one active browser per account: a new browser login signs the old one out with `SESSION_REVOKED`).
- Limits to design the UI around: OTP resend after 60 s (`resend_after_sec`), 3 OTPs per phone per hour, 5 wrong passwords lock login for 15 min (`ACCOUNT_LOCKED`, `details.until`), `429` carries a `Retry-After` header.
- `503 MAINTENANCE` and `426 UPGRADE_REQUIRED` can come from any endpoint; `GET /settings/public` and `GET /health` are always open.
- The seed has one admin (`admin@example.com` / `change-me-admin`, dev only) and no student users: register through the API.

## 7. Files you share with Dev A

You may edit these when the task needs it; the other developer reviews: root `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `packages/config`, `.env.example`, `CLAUDE.md`, `docs/`.

Root scripts that are placeholders today (they print "not yet implemented") and are yours to implement:

- `pnpm dev`: should start web and admin (and may start the mock). Replace the `dev` line in the root `package.json`.
- `pnpm tokens:gen`: delegate to `packages/design-tokens`.
- `pnpm e2e`: Playwright.

`pnpm lint`, `pnpm typecheck`, `pnpm test` already run through turbo. Give your packages `lint`, `typecheck` and `test` scripts and they are picked up automatically; use `@mcq/config` for the ESLint and tsconfig base (see `packages/config/README.md`).

Do not edit: `apps/api`, `database`, `.github/workflows`, `docker-compose.yml`, `deploy`.

## 8. When you need something from the API

Do not edit `openapi.yaml` (except `examples`). Open a GitHub issue with the `contract-change` template (endpoint, request, response, screen, requirement ID). Dev A answers the same day, updates the contract, regenerates the client and tells you to pull. Keep working on other screens meanwhile.

## 9. CI

`.github/workflows/ci.yml` runs on every PR: `pnpm db:reset` (MySQL and Redis services), schema and contract drift checks, `lint`, `typecheck`, `test`, `test:contract`. A frontend PR fails CI if any package's `lint`, `typecheck` or `test` fails, so run `pnpm lint && pnpm typecheck && pnpm test` before pushing. Code style: Prettier config is in `packages/config`; `pnpm format` fixes files. Line endings are LF (`.gitattributes`).

## 10. Paste this into your Claude Code session

> Read `CLAUDE.md`, `docs/09-TEAM-SPLIT.md`, `docs/10-HANDOFF-A-TO-B.md`, then follow `prompts/team/B-session-start.md`. After that run `prompts/team/B-01-frontend-foundation.md`. The contract-tooling PR is ready, so wire `@mcq/api-client-ts` and the mock now instead of stubbing. Use ports 3001 (web) and 3002 (admin). Three PRs in this order: `b/design-tokens`, `b/web-admin-scaffold`, `b/ui-kit`.

## 11. Dev A's next steps (so you can plan)

| When | Dev A delivers | You can then |
| --- | --- | --- |
| Done (on `main`) | Auth (OTP, register, login, refresh), `/me`, `/settings/public`, `/home` | Switch login, onboarding, home from mock to real; Checkpoint 1 |
| Weeks 4-6 | Exams: list, detail, start, sync, submit, scoring, leaderboard, results | Exam room and results on real data; Checkpoint 2 |

## 12. Your pushes go live (staging)

`main` is deployed automatically after CI passes (`deploy/README.md` has the details):

- https://mcq.ellevix.com is `apps/web`, and `/v1` there is the real API (Swagger at `/docs`).
- https://mcq-admin.ellevix.com is `apps/admin` (live as soon as Majid adds the Cloudflare DNS record).
- The builds set `NEXT_PUBLIC_API_BASE=https://mcq.ellevix.com/v1`. Server code in web can use `API_BASE_URL` (set on the server to the local API). Cookies are `Secure` in production, which works because Cloudflare serves HTTPS.
- `/dev/gallery` is hidden in production builds. Heads-up: building with `NEXT_PUBLIC_SHOW_GALLERY=1` fails (`useSearchParams()` needs a Suspense boundary on `/[locale]/dev/gallery`), so the deploy does not set it. Fix the page if you want the gallery on staging.
- **CI must be green.** A red CI means nothing deploys, for you or for Majid, so run `pnpm lint && pnpm typecheck && pnpm test` before every push.
- Deploys use a Linux build with `NEXT_OUTPUT=standalone`. It is opt-in in `next.config.ts`, so a normal local `pnpm build` is unaffected (standalone needs symlinks, which fail on Windows without developer mode). Keep the `standalone` block in both `next.config.ts` files.
- `pnpm tokens:gen` must run before `next build` (CI and the deploy do it). Anything else a build needs, such as a new env variable, has to be added to `.github/workflows/deploy.yml` (Majid owns it, tell him).
- The OTP on this server is always `123456` and the data is placeholder content: it is a preview, not production.
