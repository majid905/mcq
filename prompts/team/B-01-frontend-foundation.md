# B-01 — Frontend foundation (Dev B, week 1)

Run after `B-session-start.md`, once the skeleton PR (`A-00`) is merged. This is the Dev B half of `prompts/00-foundation.md`. Split into 3 PRs: `b/design-tokens`, `b/web-admin-scaffold`, `b/ui-kit`.

---

Read `prompts/00-foundation.md` and do only items 5, the `apps/web` + `apps/admin` part of 6, and the React part of 7. Skip everything Flutter (out of scope for now) — but keep the Dart output of `tokens:gen` working so the mobile phase can use it later.

PR 1 `b/design-tokens`:
- `pnpm tokens:gen` in `packages/design-tokens`: `design/tokens.json` → `dist/tokens.css` (light + dark via `[data-theme]` and `prefers-color-scheme`), Tailwind v4 `@theme` preset, and `apps/mobile/lib/core/theme/tokens.g.dart` (generated file only).
- Contrast test (every text/background pair ≥ 4.5:1).

PR 2 `b/web-admin-scaffold`:
- `apps/web` and `apps/admin`: Next.js 15 App Router, TypeScript strict, Tailwind v4 with tokens, shadcn/ui, next-intl (bn default, en) with `messages/bn.json` / `en.json`, next/font Hind Siliguri + Inter, theme toggle, TanStack Query provider, API base from `NEXT_PUBLIC_API_BASE` (default mock `http://localhost:4010/v1`) using `packages/api-client-ts`. Dev A's contract-tooling PR is ready (see `docs/10-HANDOFF-A-TO-B.md`): wire `@mcq/api-client-ts` and `pnpm mock` now, no stub. Run web on port 3001 and admin on 3002; the API owns 3000.
- Playwright set up in both apps with one smoke test.

PR 3 `b/ui-kit`:
- `packages/ui`: AppButton, AppTextField, OptionTile (idle/selected/correct/wrong/missed), AppCard, AppChip, Skeleton, EmptyState, ErrorState, TimerBar, QuestionNavigator (static for now) — tokens only, matching `design/ui-reference.html`.
- `/dev/gallery` page in web and admin showing every component in light/dark and bn/en.

After all three merge, continue with `prompts/11-web-auth-home.md`.
