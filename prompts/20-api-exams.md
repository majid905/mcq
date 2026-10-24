# Prompt 20 — Track A (API): Phase 2 live exams, attempts, scoring, ranking

---

Read `CLAUDE.md`, `docs/01-SRS.md` §3.3–3.4, `docs/02-ARCHITECTURE.md` §4 and §6, `docs/03-DATABASE.md` §6, `docs/04-API.md` §6–7, and the Exams / Attempts paths in openapi.yaml.

Implement:
- `exams`: list (status computed from times: upcoming, open_soon = start−10 min, running, finished, merit_published), detail with `locked_reason`, reminders.
- Paper build job (scheduler at start−30 min and on publish): paper JSON without answers → Redis `exam:{id}:paper` + upload to R2 at `papers/{id}/v{n}.json`; answer key → `exam:{id}:key`.
- `POST /exams/{id}/start`: premium/quota checks, one ranked attempt per user (Redis SETNX lock + DB check), resume returns saved answers, late join gets `ends_at = exam.end_at`, generate shuffle_seed; `mode=practice` after end (FR-EXAM-11).
- `PUT /attempts/{id}/answers`: write to Redis hash only; reject after `ends_at + grace` with 410.
- `POST /attempts/{id}/submit`: validate, push to Redis Stream `q:submit`, return 202 < 50 ms.
- Scoring worker (BullMQ or stream consumer group): batch 500, score with key, section scores, write attempts with `INSERT … ON DUPLICATE KEY UPDATE`, update leaderboard ZSET (`score*1e7 + (duration-time_taken)`), district ZSET, enqueue stats rollup, ack after commit.
- Scheduler: auto-submit in_progress attempts at end_at + grace; merit publish at result_publish_at (rank, district rank, percentile in batches), cache top-100, notify.
- Endpoints: result (202 while scoring), solutions (403 SOLUTIONS_LOCKED before end), leaderboard (overall/district, my row), me/attempts.
- Partition maintenance job (`database/partition-maintenance.sql`).
- Tests: scoring with negative marks, tie-breaks, idempotent submit, grace window, resume; contract tests; a k6 smoke script `load/live-exam.js` (100 VUs) for now.
