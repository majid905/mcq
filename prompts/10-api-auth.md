# Prompt 10 — Track A (API): Phase 1 auth, me, settings, home

---

Read `CLAUDE.md`, `docs/01-SRS.md` §3.1–3.2 and §3.14, `docs/04-API.md` §2–5, and the Auth / Me / Settings paths in `packages/api-contract/openapi.yaml`. You own `apps/api` only.

Implement Phase 1 Track A:
- `auth` module: FR-AUTH-01..07. OTP stored in Redis (`otp:{purpose}:{phone}` hashed code, 5 min TTL, 5 verify attempts), SMS via a `SmsProvider` interface with drivers `console` (dev) and `http` (generic Bangladeshi gateway configured by env). Verification token = short JWT (10 min). Passwords Argon2id. Access JWT 15 min, refresh 30 days with rotation families in `refresh_tokens`; reuse → revoke family + `SESSION_REVOKED`. Device binding per FR-AUTH-07 using `user_devices` (one active mobile + one active web). Web cookie mode when `X-Platform: web` (httpOnly cookies, CSRF header).
- Login lockout (FR-AUTH-03) and rate limits from docs/04 §5 with a Redis throttler.
- `me` (GET/PATCH/DELETE), `me/devices/reset` (2 per 30 days), push token.
- `settings/public` (cached), `home` feed (FR-HOME-01..03) — use existing exams/banners tables; return empty arrays where later phases fill data.
- Version check middleware: `X-App-Version` below min → 426 UPGRADE_REQUIRED; maintenance → 503.
- Tests: unit tests for token rotation, device binding, OTP limits; contract tests for every endpoint touched.
Commit per requirement ID. At the end list endpoints that now return real data so web/mobile can switch from mock.
