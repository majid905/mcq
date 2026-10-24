# Prompt 21 — Track W (Web): Phase 2 exams, exam room, results

---

Read `CLAUDE.md`, `docs/06-SCREENS.md` section D and E (especially D4), `docs/04-API.md` §6–7, and `design/ui-reference.html` (D4, E1).

Build D1–D5 and E1–E4 against the mock, then switch to the real API when Track A reports ready.
- Exam room as a client component with a Zustand store (state machine idle → loading → running → submitting → submitted) persisted to IndexedDB on every change; restore on reload.
- Server time offset from `server_time`; timer from `ends_at`; colour thresholds per design system.
- Paper from `paper_url` with fallback; shuffle using `packages/api-client-ts/src/shuffle.ts`; display labels ক/খ/গ/ঘ (bn) or A–D (en); submit original keys.
- Sync every 30 s, on `visibilitychange`, and before submit; offline banner; retry with backoff.
- Two modes: one-by-one and OMR all-in-one with sticky section tabs; navigator right panel ≥1024 px, sheet below.
- Anti-copy, `beforeunload` guard, focus-loss counter, keyboard shortcuts (1–5, ←/→, M).
- Result page with animated ScoreRing (reduced-motion aware), section table, rank badge, polling while 202.
- Solutions with filters; leaderboard with podium and pinned own row.
- Playwright e2e: start exam → answer → reload mid-exam (answers kept) → submit → result.
