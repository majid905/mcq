# 04 — API guide

Contract: `packages/api-contract/openapi.yaml` (OpenAPI 3.1). This doc explains conventions the YAML cannot express.

## 1. Base & versioning
- Base path `/v1`. Breaking changes → `/v2`; additive changes allowed in v1.
- Clients send `Accept-Language: bn|en`, `X-App-Version`, `X-Platform: android|ios|web`, `X-Device-Id`, `X-Request-Id` (UUID).
- Every response includes header `X-Server-Time` (ISO UTC).

## 2. Auth
| Client | Access token | Refresh token |
| --- | --- | --- |
| Flutter | `Authorization: Bearer` (memory) | `flutter_secure_storage`, sent to `/auth/refresh` |
| Web (student) | httpOnly `Secure` `SameSite=Lax` cookie `at` | httpOnly cookie `rt`, path `/v1/auth` |
| Admin | Same as web, cookie names `adm_at` / `adm_rt` | — |

Web uses a Next.js route handler (BFF) at `/api/*` that forwards to the API and manages cookies, so tokens never reach JavaScript. CSRF: double-submit token header `X-CSRF` for cookie-auth mutating requests.

Access JWT claims: `sub` (user id), `dev` (device row id), `prem` (bool), `exp`. Premium is re-checked server-side on premium endpoints (cached 5 min).

## 3. Envelope
```json
{ "data": { }, "meta": { "next_cursor": "12345", "has_more": true } }
```
```json
{ "error": { "code": "EXAM_NOT_STARTED", "message": "পরীক্ষা এখনো শুরু হয়নি", "details": { "starts_at": "2026-11-01T14:00:00.000Z" } } }
```
`message` is localized by `Accept-Language`; clients may also map `code` to their own strings.

## 4. Error codes

| HTTP | code | When |
| --- | --- | --- |
| 400 | VALIDATION_FAILED | DTO validation; `details.fields` |
| 400 | OTP_INVALID / OTP_EXPIRED | Wrong or expired OTP |
| 401 | UNAUTHENTICATED | Missing/expired token |
| 401 | INVALID_CREDENTIALS | Wrong phone/password |
| 401 | SESSION_REVOKED | Refresh reuse or signed out by new device |
| 402 | PREMIUM_REQUIRED | Premium content; `details.package_ids` |
| 402 | QUOTA_EXHAUSTED | Free daily/monthly limit; `details.resets_at` |
| 403 | FORBIDDEN | Admin permission missing |
| 403 | SOLUTIONS_LOCKED | Live exam not ended yet |
| 404 | NOT_FOUND | — |
| 409 | PHONE_EXISTS | Register with existing phone |
| 409 | ALREADY_ATTEMPTED | Second ranked attempt |
| 409 | DUPLICATE_QUESTION | content_hash clash; `details.existing_id` |
| 410 | ATTEMPT_CLOSED | Sync/submit after deadline + grace |
| 422 | COUPON_INVALID | Expired, limit reached, wrong package |
| 422 | EXAM_NOT_PUBLISHABLE | Missing questions etc.; `details.problems` |
| 423 | ACCOUNT_LOCKED | Too many failed logins; `details.until` |
| 425 | EXAM_NOT_STARTED | Start before start_at |
| 426 | UPGRADE_REQUIRED | App below min version |
| 429 | RATE_LIMITED | `Retry-After` header |
| 503 | MAINTENANCE | Maintenance mode |

## 5. Rate limits (Redis, per user/IP)

| Endpoint group | Limit |
| --- | --- |
| `/auth/otp/request` | 3 / phone / hour, 10 / IP / hour |
| `/auth/login` | 10 / IP / min, lock after 5 fails |
| `/search/*` | 30 / user / min |
| `/attempts/*/answers` | 6 / attempt / min |
| default authenticated | 120 / user / min |

## 6. Shuffle algorithm (must be identical in Dart and TypeScript)

Server gives `shuffle_seed` (uint32). Clients reorder questions within each section and options within each question:

```
mulberry32(seed):  // returns function -> float in [0,1)
  a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

fisherYates(list, rnd): for i from len-1 down to 1: j = floor(rnd() * (i+1)); swap(i, j)

order:
  rnd = mulberry32(seed)
  for section in paper.sections: if shuffle_questions: fisherYates(section.question_ids, rnd)
  for q in questions in final order: if shuffle_options: fisherYates(q.options, rnd)
```
Display labels (ক/খ/গ/ঘ in bn, A/B/C/D in en) are by display position; submitted value is always the original `key`. Put shared test vectors in `packages/api-contract/shuffle-vectors.json` (seed → expected order) and test both implementations against it. In Dart use `& 0xFFFFFFFF` masking to emulate `>>> 0` and `Math.imul`.

## 7. Paper JSON
Served from CDN at `paper_url` (`https://cdn.[Domain]/papers/{exam_id}/v{version}.json`, cache 7 days, immutable). Same schema as `Paper`. Clients verify `exam_id` and `version` and fall back to `GET /exams/{id}/paper` on failure.

## 8. Mock server
`pnpm mock` → `prism mock packages/api-contract/openapi.yaml -p 4010 -d`. Add realistic `examples` to schemas as features are built so the mock returns Bangla sample data. Web: `NEXT_PUBLIC_API_BASE=http://localhost:4010/v1`; Flutter: `--dart-define=API_BASE=http://10.0.2.2:4010/v1`.

## 9. Client generation
- TypeScript: `openapi-typescript` (types) + `openapi-fetch` (client) → `packages/api-client-ts`; TanStack Query hooks written in `apps/web/lib/api/hooks/*`.
- Dart: `openapi-generator-cli generate -g dart-dio -i openapi.yaml -o apps/mobile/packages/api_client --additional-properties=pubName=api_client,serializationLibrary=json_serializable`.
- Both run in `pnpm contract:gen`; CI fails if generated code differs from committed code.
