# Prompt 40 — Phase 4: payments and admin panel

---

## Step 0 (contract, do first in one session)
Add to `packages/api-contract/openapi.yaml` the remaining admin CRUD paths listed at the end of the paths section (packages, coupons, banners, admins, roles, taxonomy reorder, audit log list, user detail tabs) following existing patterns, run `pnpm contract:gen`, commit. Then start the tracks.

## Track A (API)
Read `docs/01-SRS.md` §3.9 and §3.13, `docs/04-API.md`.
- Billing: packages, coupon validation, checkout with `PaymentGateway` interface and drivers `bkash` (tokenized checkout: grant token, create, execute, query) and `sslcommerz` (init session, IPN, validation API); sandbox config by env. Webhook handler re-validates with the gateway, then in one transaction marks payment paid + creates subscription (unique payment_id) + coupon redemption; idempotent on retries. Trial activation. Quotas + PremiumGuard using `user:{id}:sub` cache. Expiry reminder job.
- Admin: separate admin auth (email/password + TOTP via otplib), RBAC guard by permission strings in `roles`, AuditInterceptor writing before/after, all `/admin/*` endpoints, R2 signed uploads, import pipeline (exceljs for xlsx, csv-parse, mammoth for docx template; normalize Bangla text, content_hash, validate rows, batch insert 1,000, outbox), exam generator from blueprint (exclude questions used in last N exams), monitor endpoint from Redis counters, broadcast job, settings with cache bust.
- Tests: payment idempotency (duplicate IPN), coupon limits, RBAC denial, import of 50,000-row fixture under 5 minutes.

## Track W (Web + Admin)
- Student: I1–I4 plans, checkout redirect, status polling, history; paywall component reused everywhere `PREMIUM_REQUIRED`/`QUOTA_EXHAUSTED` appears.
- Admin app (`apps/admin`): screens L1–L13 from `docs/06-SCREENS.md` with shadcn + TanStack Table (server-side cursor pagination), TipTap editor with image upload + math extension, phone-frame live preview reusing `OptionTile` from `packages/ui`, dnd-kit taxonomy tree, import wizard with progress polling, exam builder tabs, live monitor (refetch 5 s), permission-aware navigation.

## Track M (Flutter)
I1–I4 with `flutter_custom_tabs` / SFSafariViewController for gateway pages and deep-link return (`[scheme]://payment/{id}`); paywall bottom sheet; `IOS_PURCHASES_ENABLED` dart-define to hide purchase UI (FR-PAY-07).
