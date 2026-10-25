# @mcq/web

Next.js 15 student web. **Owner:** Dev B (Mozlish, @Mozlish)

```bash
pnpm mock                       # Prism mock on :4010 (repo root)
pnpm --filter @mcq/web dev      # http://localhost:3001  (bn at /, en at /en)
pnpm --filter @mcq/web e2e      # Playwright (starts mock + dev server if not running)
```

- API base: `NEXT_PUBLIC_API_BASE` (default mock `http://localhost:4010/v1`). Switch to the real API with the env variable only. `useApi()` returns the typed `@mcq/api-client-ts` client with `Accept-Language` and `X-Platform: web` set.
- i18n: next-intl, `messages/bn.json` + `en.json` (same keys, checked by `test/messages.test.ts`). Bangla has no URL prefix, English is under `/en`.
- Styling: Tailwind v4 with `@mcq/design-tokens` only (`bg-surface`, `text-text-muted`, `text-question`, ...). The default Tailwind palette is turned off on purpose.
- Theme: system / light / dark via `ThemeToggle` from `@mcq/ui`; stored in `localStorage`, applied before paint.
- Port busy (e.g. 3001 used by another project)? `pnpm exec next dev --port 3011` and `E2E_PORT=3011 pnpm e2e`.
