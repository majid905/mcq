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
