# Prompt 22 — Track M (Flutter): Phase 2 exams, exam room, results

---

Read `CLAUDE.md`, `docs/06-SCREENS.md` sections D and E (especially D4), `docs/04-API.md` §6–7, and `design/ui-reference.html` (D4 room, navigator sheet, E1 result).

Build D1–D5 and E1–E4 against the mock, then switch to the real API.
- Exam room Riverpod Notifier state machine (idle → loading → running → submitting → submitted), every change persisted to Hive keyed by attempt id; restore after app kill.
- Server time offset; timer from `ends_at` using a monotonic Stopwatch, not device clock changes.
- Paper download via dio with cache; shuffle with `core/utils/shuffle.dart` (must pass shared vectors).
- Sync: every 30 s, on `AppLifecycleState.paused`, before submit; queue retries with connectivity_plus; offline banner.
- One-by-one mode with PageView + swipe; OMR list mode; navigator bottom sheet with legend.
- `FLAG_SECURE` on Android in the room only (platform channel or `flutter_windowmanager`), focus-loss counter on lifecycle, back button confirmation dialog, wakelock during exam.
- Auto-submit at zero; submitted screen polling result; result with animated ring, rank badge, sections; solutions with filters; leaderboard.
- Local notification fallback for reminders (flutter_local_notifications) in addition to FCM.
- Tests: unit tests for the state machine (resume, auto-submit, offline submit retry), widget tests for OptionTile states and the submit dialog, golden test of the room in light/dark.
