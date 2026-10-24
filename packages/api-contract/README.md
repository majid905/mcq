# @mcq/api-contract

OpenAPI contract. `openapi.yaml` is the single source of truth; only Dev A changes it.

**Owner:** Dev A (Majid, @majid905)

## Mock server

```bash
pnpm mock            # http://localhost:4010/v1, returns the Bangla `examples` from the contract
pnpm mock:dynamic    # random data generated from the schemas instead
```

- Base URL for clients: `http://localhost:4010/v1` (same shape as the real API).
- Prism enforces `bearerAuth`: send any `Authorization: Bearer x` header on protected endpoints, otherwise you get `401`.
- Mock OTP code is `123456`; the mock accepts any phone/password.
- Force an error response with the `Prefer` header, e.g. `Prefer: code=425` on `POST /exams/{id}/start` returns the `EXAM_NOT_STARTED` example.
- Examples exist for Auth, Me, Settings, Home, Exams (list + detail) and Taxonomy. Other endpoints return schema-generated data until their examples are added. Dev B can PR better `examples`; Dev A approves.

## Shuffle vectors

`shuffle-vectors.json` holds 10 seeds with the expected order for a fixed paper. The TypeScript implementation (`@mcq/api-client-ts`) passes them; the Dart implementation must too. Regenerate with `pnpm --filter @mcq/api-contract vectors:gen` (script is written from `docs/04-API.md` section 6, independent of the TS code).
