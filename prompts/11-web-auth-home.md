# Prompt 11 — Track W (Web): Phase 1 auth, onboarding, home, shell

---

Read `CLAUDE.md`, `docs/05-DESIGN-SYSTEM.md`, `docs/06-SCREENS.md` sections A, B, C, J and K (landing only), and look at `design/ui-reference.html` (screen C1). You own `apps/web` and `packages/ui`.

Build against the mock server (`NEXT_PUBLIC_API_BASE=http://localhost:4010/v1`) using the generated client in `packages/api-client-ts`.
- BFF route handlers in `app/api/[...path]/route.ts` that forward to the API, set/clear httpOnly cookies on login/refresh/logout, add CSRF token, and transparently refresh on 401.
- Screens B1–B10 (web equivalents), C1 Home, app shell (top bar, sidebar ≥1024 px, bottom nav <768 px), J2 Profile, J3 Edit, J4 Settings (language, theme, notifications), public landing `/`.
- Route groups and middleware: `(public)`, `(auth)`, `(student)` with auth redirect; force-update not needed on web, maintenance page yes.
- Every screen: skeleton, empty, error with retry; bn/en strings in messages files (same keys as Flutter ARB).
- Playwright e2e: register → OTP (mock code 123456) → goals → home.
Match the reference look exactly (tokens only, no hardcoded colours). Report which mock responses needed better examples in openapi.yaml so I can add them.
