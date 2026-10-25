# @mcq/admin

Next.js 15 admin panel. **Owner:** Dev B (Mozlish, @Mozlish)

```bash
pnpm mock                        # Prism mock on :4010 (repo root)
pnpm --filter @mcq/admin dev     # http://localhost:3002
pnpm --filter @mcq/admin e2e     # Playwright (starts mock + dev server if not running)
```

- Same stack and tokens as `apps/web` (Tailwind v4 + `@mcq/design-tokens`, `@mcq/ui`, TanStack Query, `@mcq/api-client-ts`).
- i18n: next-intl without URL prefixes (routes follow `docs/02-ARCHITECTURE.md`: `/login`, `/dashboard`, ...). The language is stored in the `NEXT_LOCALE` cookie by the `setLocale` server action; Bangla is the default.
- Not indexed (`robots: noindex`).
- Port busy? `pnpm exec next dev --port 3012` and `E2E_PORT=3012 pnpm e2e`.
