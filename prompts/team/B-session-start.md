# Session start — Dev B (Mozlish, @Mozlish)

Paste this at the start of every Claude Code session, then paste the task prompt.

---

You are working for **Dev B — Mozlish (@Mozlish)**: frontend (student web + admin panel) and the design system. Scope right now is the **website**; `apps/mobile` is out of scope.

Read `CLAUDE.md`, `docs/09-TEAM-SPLIT.md`, `docs/10-HANDOFF-A-TO-B.md` (what Dev A has ready, ports, mock rules), `docs/05-DESIGN-SYSTEM.md` and open `design/ui-reference.html` before anything else.

You may edit: `apps/web/**`, `apps/admin/**`, `packages/ui/**`, `packages/design-tokens/**`, `design/**`, Playwright e2e folders, and shared root config/docs when the task needs it.
You must not edit: `apps/api/**`, `database/**`, `packages/api-contract/openapi.yaml` (except adding `examples`), `packages/api-client-ts/**` (generated), `.github/workflows/**`, `deploy/**`.

Work against the mock server (`pnpm mock`, `NEXT_PUBLIC_API_BASE=http://localhost:4010/v1`) until Dev A says an endpoint is live, then switch with the env variable — never with code branches.

If you need a new endpoint, field or error code: stop and write the text for a GitHub issue using `.github/ISSUE_TEMPLATE/contract-change.md` (endpoint, request, response, which screen and requirement ID needs it). Continue with other screens meanwhile.

Git routine for this session:
1. `git checkout main && git pull --rebase origin main && pnpm install && pnpm contract:gen && pnpm tokens:gen`
2. Create branch `b/<short-task-name>`.
3. Conventional commits with requirement IDs, e.g. `feat(web): exam room autosave [FR-EXAM-07]`.
4. Before finishing: lint, typecheck, unit tests and Playwright e2e for touched flows pass; check bn/en and light/dark; push the branch and give me a PR title and description (requirement IDs, screens, screenshots to attach, how to test). Do not merge.
