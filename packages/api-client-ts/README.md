# @mcq/api-client-ts

Typed API client built with `openapi-typescript` + `openapi-fetch`.

**Owner:** Dev A (Majid, @majid905). `src/generated/` is generated; never edit it by hand. Run `pnpm contract:gen`.

```ts
import { createApiClient, shufflePaper } from '@mcq/api-client-ts';

const api = createApiClient(process.env.NEXT_PUBLIC_API_BASE!); // e.g. http://localhost:4010/v1
const { data, error } = await api.GET('/exams', { params: { query: { status: 'running' } } });
```

- The package exports TypeScript source. In Next.js add `transpilePackages: ['@mcq/api-client-ts']`.
- `createApiClient(baseUrl, options)` accepts `openapi-fetch` options (`headers`, `credentials`, `fetch`).
- `shufflePaper` / `mulberry32` / `fisherYates` implement the shared shuffle (`docs/04-API.md` section 6) and are tested against `packages/api-contract/shuffle-vectors.json`.
- Dart client: `pnpm contract:gen --dart` (off by default until the mobile phase).
