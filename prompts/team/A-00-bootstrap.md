# A-00 — Repo bootstrap (Dev A, day 1, before Dev B starts)

Run after `A-session-start.md`. Goal: a small, mergeable skeleton so both developers can work in parallel from day 2 without touching the same files.

---

The spec pack is already committed at the repo root. Create branch `a/bootstrap` and build only the skeleton:

1. Root: `package.json` (pnpm, Node 22 engines, scripts placeholders: dev, build, lint, typecheck, test, e2e, mock, contract:gen, tokens:gen, db:reset — each delegating to turbo or a package script; unimplemented ones print "not yet implemented" and exit 0), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `turbo.json`, `.nvmrc` (22), `.editorconfig`, `.gitignore` (node, next, turbo, env, coverage, playwright, flutter), `.env.example`.
2. `packages/config`: shared `tsconfig.base.json` (strict), ESLint flat config, Prettier config.
3. Empty package shells with `package.json` + README stating the owner: `apps/api` (Dev A), `apps/web` (Dev B), `apps/admin` (Dev B), `packages/api-contract` (Dev A, keep existing openapi.yaml), `packages/api-client-ts` (Dev A, generated), `packages/design-tokens` (Dev B), `packages/ui` (Dev B). Do not scaffold Next.js or NestJS yet.
4. Add `.github/CODEOWNERS`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/contract-change.md` if they are not already in the repo (they are in the spec pack).
5. Minimal CI workflow `.github/workflows/ci.yml`: pnpm install, `pnpm lint`, `pnpm typecheck`, `pnpm test` on PRs to main.
6. `pnpm install` must succeed; commit lockfile.

Open the PR `chore: monorepo skeleton`. Tell me the GitHub settings to apply after merge (collaborator, branch protection, code owner review).
