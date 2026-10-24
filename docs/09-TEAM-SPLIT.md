# 09 — Team split: website first (2 developers, 2 Claude Code)

Scope of this round: **website only** = NestJS API + MySQL + Next.js student web + Next.js admin panel. The Flutter app (`apps/mobile`) starts after the website is live; the API and contract built now are reused unchanged.

Repository: `https://github.com/majid905/mcq` (default branch `main`).

## 1. Who owns what

The split is by layer, because the project is contract-first: one person builds the backend behind `openapi.yaml`, the other builds both frontends against the mock server. Nobody waits for the other, and the two never edit the same folders.

| | **Dev A — Majid** (`@majid905`) | **Dev B — Mozlish** (`@Mozlish`) |
| --- | --- | --- |
| Role | Backend + data + DevOps, **contract owner** | Frontend + design system |
| Owns folders | `apps/api`, `database/`, `packages/api-contract/`, `packages/api-client-ts/` (generated), `docker-compose.yml`, `deploy/`, `.github/workflows/`, `load/` | `apps/web`, `apps/admin`, `packages/ui`, `packages/design-tokens`, `design/`, `apps/*/e2e` (Playwright) |
| Shared (both may edit, PR review by the other) | root `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `packages/config`, `CLAUDE.md`, `docs/` | same |
| Requirement areas | All FR backend logic, NFR-PERF/SCAL/SEC/DATA, payments, scoring, ranking, imports, search, workers | All screens in `docs/06-SCREENS.md` sections A–L (web), NFR-UX, SEO (FR-WEB), accessibility |
| Existing prompts to use | `10-api-auth`, `20-api-exams`, `30` Track A, `40` Step 0 + Track A, `50` items 1, 2, 4, 5, 6 | `11-web-auth-home`, `21-web-exams`, `30` Track W, `40` Track W, `50` item 3 |

**Contract rule:** only Dev A merges changes to `openapi.yaml`. When Dev B needs a new field or endpoint, Dev B opens an issue with the `contract-change` template; Dev A updates the contract in a small PR within the same day, runs `pnpm contract:gen`, merges, and Dev B pulls. Small additions to `examples` (better mock data) can be PR'd by Dev B and approved by Dev A.

## 2. Timeline (website, ~11 weeks)

| Week | Dev A — Majid (backend) | Dev B — Mozlish (frontend) | Sync point (end of week) |
| --- | --- | --- | --- |
| 1 (day 1) | **A0** monorepo skeleton, push to `main` | waits / reviews docs, installs tools | Skeleton on `main` |
| 1 | **A1** docker-compose, schema + seed, contract tooling + mock, API scaffold, CI | **B1** tokens pipeline, web + admin scaffold, UI kit v1 + gallery | Gallery runs on mock; `pnpm dev` works for both |
| 2–3 | Phase 1 API: auth, OTP, devices, me, settings, home | Phase 1 web: auth screens, onboarding, shell, home, profile, landing | **Checkpoint 1:** web login against real API |
| 4–6 | Phase 2 API: exams, paper build, start/sync/submit, scoring worker, ranking, merit, results | Phase 2 web: exam list/detail, **exam room**, result, solutions, leaderboard, history | **Checkpoint 2:** full live exam on web against real API, 3 browsers |
| 7–8 | Phase 3 API: taxonomy, practice, bookmarks, Meilisearch, analytics workers, notifications | Phase 3 web: practice, custom exam, bank, search, analytics, inbox, SEO pages | Checkpoint 3 |
| 9–10 | Phase 4 API: billing (bKash/SSLCommerz), quotas, **all admin endpoints**, import pipeline, exam generator | Phase 4: plans/checkout + **admin panel L1–L13** | Checkpoint 4: payment sandbox + admin import 50k rows |
| 11 | Load test, security, backups, deploy pipeline, production | Lighthouse/SEO, accessibility, e2e suite, bug fixes | **Website launch** |

If one side finishes a phase early: Dev A takes admin screens L9 (monitor), L10 (users), L11 (billing tables) from Dev B's Phase 4 list; Dev B takes `/admin` contract examples and Playwright API smoke tests. Agree in the weekly sync before switching.

## 3. Day-by-day start

**Day 1 — Dev A only**
1. Create the repo content: copy this spec pack into the repo root, commit `docs: add spec pack`, push to `main`.
2. Run `prompts/team/A-00-bootstrap.md` in Claude Code → monorepo skeleton (workspaces, turbo, empty `apps/*` and `packages/*` with package.json, `.gitignore`, `.editorconfig`, `.nvmrc`, `.env.example`). PR → merge.
3. In GitHub settings: add `@Mozlish` as collaborator (Write), enable branch protection on `main` (PR required, 1 approval, status checks, no force push), enable "Require review from Code Owners".

**Day 2 onward — both, in parallel**
- Dev A: `prompts/team/A-01-backend-foundation.md`, then the A prompts in the table above.
- Dev B: `prompts/team/B-01-frontend-foundation.md`, then the B prompts.
- Every Claude Code session starts with `prompts/team/A-session-start.md` or `B-session-start.md` so Claude knows who it works for and which folders it may touch.

## 4. Git workflow

```
main (protected, always deployable)
 ├── a/auth-otp            ← Dev A feature branches
 ├── a/exam-scoring
 ├── b/web-exam-room       ← Dev B feature branches
 └── a/contract-exam-fields  ← contract PRs (small, fast)
```

| Rule | Detail |
| --- | --- |
| Branch names | `a/<short-name>` (Majid), `b/<short-name>` (Mozlish) |
| Commits | Conventional commits + requirement ID: `feat(api): OTP request limits [FR-AUTH-02]` |
| PR size | One feature/screen per PR, ideally < 600 changed lines (generated code excluded) |
| PR checks | lint, typecheck, unit tests, contract drift, e2e (web PRs) must pass |
| Review | The other developer reviews within 24 h; CODEOWNERS enforces it |
| Merge | Squash merge; delete branch |
| Sync | `git pull --rebase origin main` every morning and before opening a PR; then `pnpm install && pnpm contract:gen && pnpm tokens:gen` |
| Conflicts in shared files | Root `package.json` / lockfile: rebase, re-run `pnpm install`, commit the new lockfile; never hand-merge `pnpm-lock.yaml` |
| Secrets | Only `.env.example` in git; share real keys via a password manager |

## 5. Working together with two Claude Code sessions
- Each developer clones the repo on their own machine and runs Claude Code at the repo root. `CLAUDE.md` is shared, so both Claude sessions follow the same stack and rules.
- The session-start prompt pins the owner and folders. If Claude needs a change outside its folders, it stops and writes the request (for Dev B: a contract-change issue text; for Dev A: a note for Dev B).
- Tick checkboxes in `docs/07-IMPLEMENTATION-PLAN.md` only in your own PRs, only for your track.
- Use GitHub Issues + a Project board (columns: Todo, In progress, In review, Done) with labels `owner:majid`, `owner:mozlish`, `contract-change`, `bug`, `phase-1`…`phase-5`.

## 6. Meetings
- **Daily (10 min, text is fine):** yesterday, today, blockers, contract requests.
- **Weekly sync (30 min, end of week):** run the checkpoint together, switch finished features from mock to real API, agree next week, rebalance if needed.

## 7. Definition of done (every PR)
- Requirement IDs listed in the PR, all acceptance points met.
- Loading / empty / error states (frontend) or contract test (backend) included.
- Works in bn and en, light and dark (frontend).
- Tests pass locally and in CI; no `console.log`, no hardcoded colours or secrets.
