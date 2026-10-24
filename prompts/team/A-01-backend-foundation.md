# A-01 — Backend foundation (Dev A, week 1)

Run after `A-session-start.md`. This is the Dev A half of `prompts/00-foundation.md`. Split into 3 PRs: `a/infra-db`, `a/contract-tooling`, `a/api-scaffold`.

---

Read `prompts/00-foundation.md` and do only items 2, 3, 4 and the `apps/api` part of 6, plus 8 (CI) — skip tokens, UI kit, web/admin and mobile (Dev B owns those; mobile is out of scope for now).

PR 1 `a/infra-db`:
- `docker-compose.yml`: mysql 8.4, redis 7 (AOF), meilisearch, prism mock on 4010.
- `pnpm db:reset` + seed scripts in `database/seed/` exactly as item 3 describes.

PR 2 `a/contract-tooling` (merge this first — Dev B depends on it):
- `pnpm mock` (Prism) and `pnpm contract:gen` producing `packages/api-client-ts` (openapi-typescript + openapi-fetch, exported `createApiClient(baseUrl)`), skip the Dart generator for now but leave the script ready behind a flag.
- Add realistic Bangla `examples` to Auth, Me, Settings, Home, Exams and Taxonomy schemas so the mock returns believable data. Mock OTP code is `123456`.
- `shuffle.ts` + `shuffle-vectors.json` with tests.
- Tell Dev B in the PR description: "mock + client ready, run `pnpm mock`".

PR 3 `a/api-scaffold`:
- NestJS app as item 6 describes (config, Prisma db pull, envelope, error filter, request id, Pino, health, Swagger UI at /docs, main/worker/scheduler entry points, contract test harness).
- CI: extend `.github/workflows/ci.yml` with MySQL + Redis services for API tests and the contract drift check.

After all three merge, continue with `prompts/10-api-auth.md`.
