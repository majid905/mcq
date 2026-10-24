# @mcq/api

NestJS 11 API with three entry points: `main` (HTTP), `worker` (BullMQ processors) and `scheduler` (recurring jobs, run exactly one).

**Owner:** Dev A (Majid, @majid905)

```bash
cp .env.example .env && pnpm infra:up && pnpm db:reset   # once (repo root)
pnpm --filter @mcq/api dev            # http://localhost:3000/v1, Swagger UI at /docs
pnpm --filter @mcq/api dev:worker
pnpm --filter @mcq/api dev:scheduler
pnpm --filter @mcq/api test           # unit, no infra needed
pnpm test:contract                    # boots the real app; needs MySQL + Redis
```

## Conventions built in

- **Envelope:** `ResponseEnvelopeInterceptor` wraps results as `{ data }`; return `new Page(items, { next_cursor, has_more })` for lists.
- **Errors:** throw `new ApiException('EXAM_NOT_STARTED', { starts_at })`. `HttpExceptionFilter` renders `{ error: { code, message, details } }` with the status and bn/en message from `common/error-codes.ts` (codes from `docs/04-API.md` section 4). Unknown errors become `500 INTERNAL_ERROR`.
- **Validation:** `@Body(new ZodValidationPipe(schema))`, failures give `400 VALIDATION_FAILED` with `details.fields`.
- **Headers:** every response carries `X-Request-Id` (client UUID is reused) and `X-Server-Time`.
- **Config:** `src/config/env.ts` validates the environment with Zod at startup. Real env vars beat `.env` files.
- **Logging:** Pino (`nestjs-pino`), JSON in production, pretty in development, auth headers redacted.
- **DB:** Prisma models are introspected from `database/schema.sql` (`pnpm db:reset` runs `prisma db pull`); never edit `prisma/schema.prisma` by hand.

## Contract tests

`test/contract` boots the real app with the same pipeline as `main.ts` and checks every response against `packages/api-contract/openapi.yaml` (Ajv, JSON Schema 2020-12):

```ts
expectContract(await request(app.getHttpServer()).get('/v1/health'));
```

Add one `expectContract` call per endpoint you build. A response that is not in the contract (path, method, status or body shape) fails the test.

## Auth (FR-AUTH-01..03, 05..07)

- **Bearer only.** The API never sets cookies. The Next.js BFF stores `access_token` / `refresh_token` in httpOnly cookies and adds CSRF itself (docs/04-API.md section 2).
- **Everything is protected** by the global `JwtAuthGuard` unless the handler has `@Public()`. Use `@CurrentUser()` for `{ userId, deviceRowId, premium }`. The guard also applies the default 120 requests / user / minute limit.
- **OTP:** Redis, HMAC-hashed, 5 min TTL, 5 verify attempts, 60 s resend cooldown, 3 per phone and 10 per IP per hour. With `SMS_DRIVER=console` (dev) the code is always `123456`; production refuses that driver at startup. `SMS_DRIVER=http` posts to `SMS_HTTP_URL` (adapt `sms/http-sms.provider.ts` to the chosen gateway).
- **Sessions:** access JWT 15 min; refresh token opaque, 30 days, stored as sha256 and rotated on every use. Reusing a rotated or revoked token revokes the whole family and returns `SESSION_REVOKED`.
- **Devices:** one active mobile and one active web device per account. A new login signs out the old one of the same kind (its access token is cut off within one Redis lookup via `dev:revoked:<id>`). `POST /me/devices/reset` signs out the other devices, 2 per 30 days, then 429.
- **Lockout:** 5 wrong passwords lock the account for 15 minutes (`ACCOUNT_LOCKED`, `details.until`). Unknown phone and wrong password answer identically.

## Me, settings, home, gate (FR-AUTH-08..10, FR-HOME-01..03)

- `GET/PATCH/DELETE /me`, `PUT /me/push-token`, `POST /me/devices/reset`. `DELETE /me` closes the account and revokes all sessions now; the 30-day anonymisation job comes with the scheduler work.
- `GET /settings/public` reads `app_settings` (Redis cache, 60 s; call `SettingsService.invalidate()` after admin edits).
- `GET /home` returns running exams, the next exam, banners, continue-practice and today's stats, filtered by the user's target exams. Exam status on cards is derived from the clock (`exams/exam-card.ts`), so it is right before the scheduler flips the DB status.
- `AppGateGuard` (runs before auth): maintenance mode returns `503 MAINTENANCE`; `X-Platform: android|ios` with an `X-App-Version` below `min_supported_version` returns `426 UPGRADE_REQUIRED`. Web and header-less requests are not version-gated. Exempt a route with `@SkipGate()` (health, public settings).
