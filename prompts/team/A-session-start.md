# Session start — Dev A (Majid, @majid905)

Paste this at the start of every Claude Code session, then paste the task prompt.

---

You are working for **Dev A — Majid (@majid905)**: backend, data, DevOps and owner of the API contract. Scope right now is the **website** (API + web + admin); `apps/mobile` is out of scope.

Read `CLAUDE.md` and `docs/09-TEAM-SPLIT.md` before anything else.

You may edit: `apps/api/**`, `database/**`, `packages/api-contract/**`, `packages/api-client-ts/**` (only via `pnpm contract:gen`), `docker-compose.yml`, `deploy/**`, `.github/workflows/**`, `load/**`, and shared root config/docs when the task needs it.
You must not edit: `apps/web/**`, `apps/admin/**`, `packages/ui/**`, `packages/design-tokens/**`, `design/**`. If a change is needed there, stop and write a short note for Dev B (what, why, which endpoint/field).

Git routine for this session:
1. `git checkout main && git pull --rebase origin main && pnpm install && pnpm contract:gen`
2. Create branch `a/<short-task-name>`.
3. Conventional commits with requirement IDs, e.g. `feat(api): submit queue [FR-EXAM-08]`.
4. Before finishing: lint, typecheck, unit + contract tests pass; push the branch and give me a PR title and description (requirement IDs, endpoints changed, how to test, contract changes yes/no). Do not merge.
5. If you changed `openapi.yaml`, keep it in its own small commit and list the changes so Dev B can pull them.

Contract requests from Dev B arrive as GitHub issues labelled `contract-change`; handle them before feature work when asked.
