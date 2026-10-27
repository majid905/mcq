# Security review: API (Dev A)

Reviewed 2026-10-27 against the checklist in `docs/08-QUALITY-SECURITY-DEPLOY.md` section 2.
Scope: `apps/api`, `deploy/`, `database/`. The web and admin apps (cookies, CSRF, CSP) belong to Dev B
and are not covered here. Everything marked "tested" has a test in `apps/api/test/contract/` or next to the code.

## Checklist

| Item | Status |
| --- | --- |
| No answers/explanations before they are allowed | Done, tested (paper, start, question, search, practice and result endpoints assert it) |
| Argon2id passwords, hashed OTP, constant-time compares | Done (`@node-rs/argon2`, OTP stored hashed in Redis; signed upload URLs use `timingSafeEqual`) |
| Refresh rotation with reuse detection, logout revokes | Done, tested (`auth.contract.spec.ts`) |
| Web cookies, CSRF, CSP | Dev B (BFF). Not reviewed here |
| Rate limits from `docs/04` section 5 | Done, all five. Added: anonymous traffic 600/min/IP (health and admin excluded), payment return 20/min/payment, checkout 10/min/user, admin 600/min/admin. Tested |
| DTO validation everywhere | Done: every body and query goes through a zod pipe; ids go through `parseId` |
| Admin HTML sanitised server-side | Done: `sanitize-html` allowlist (no scripts, handlers, non-https images). Tested. Upgraded to 2.18.1 for five advisories |
| Admin TOTP | Now mandatory in production (`ADMIN_REQUIRE_TOTP`): a session without TOTP can only call `/admin/me`, TOTP setup and logout. Tested. Secrets sealed with AES-256-GCM, a code works once |
| Admin IP allowlist | Added (`ADMIN_IP_ALLOWLIST`, addresses and IPv4 ranges), covers login too. Tested |
| Admin RBAC on every route, audit log | Done. Every `/admin` controller uses `@AdminApi()` plus a permission; every write is audited. Role changes take effect within 30 s |
| Admin session timeout 8 h | Done (refresh token lives 8 h, access token 15 min) |
| Payments: amount/status only from the gateway | Done: the browser/IPN payload only picks the payment; the amount and invoice are compared with the gateway API's answer. Idempotent settlement, tested |
| Webhook IP/signature checks | Not needed in this design (we re-query the gateway), but see "Open items" for the origin firewall |
| Secrets in env only | Done. Production refuses short JWT secrets (<32), the fake payment driver, console SMS |
| Container images non-root | n/a for the API (systemd unit as user `mcq`); MySQL/Redis use official images |
| Dependency scanning in CI | Added as a non-blocking `pnpm audit` step |
| Account deletion anonymises within 30 days | Done (`AccountJobsService`, hourly in the scheduler). Tested |
| Backups encrypted at rest | Open: backups are not set up yet (Phase 5 item) |

## Fixed in this pass

* `sanitize-html` 2.13 -> 2.18.1 (mutation-XSS and URI-scheme bypasses). 2.18 needs Node >= 22.12 to `require()` its ESM
  dependencies, so `engines`, `deploy.sh` (fails fast with a clear message) and the Jest configs were updated.
* Overrides for `multer` (>= 2.5, DoS; the API accepts no multipart uploads, so it was not reachable) and `uuid` (^11, buffer check).
* Security response headers on every response, `X-Powered-By` removed, HSTS behind TLS, restrictive CSP (not on `/docs`).
* Unauthenticated endpoints (packages, taxonomy, public questions, payment callbacks) now have a per-address limit.
* Payment return endpoint capped per payment, because every call may query the gateway.
* Accept queue 4096 and keep-alive 65 s (above nginx's 60 s idle timeout) so bursts of connections at exam start are not refused.

## Open items

1. **Origin lockdown.** The API trusts `CF-Connecting-IP` from nginx. Anyone who can reach the server directly (not through Cloudflare)
   can fake their address and dodge per-IP limits. Allow only Cloudflare's IP ranges on ports 80/443 at the firewall
   (`ufw`/cloud security group). Ops task, not code.
2. **Dependencies not fixed here.** `postcss` inside `next` (apps/admin; Dev B: upgrade Next.js), `deepmerge-ts` inside Prisma's CLI
   (build-time tooling, never loaded at runtime). Both show up in the CI audit step.
3. **Uploads to R2 cannot enforce a size limit** (a presigned PUT has no `content-length-range`). The import reader refuses files over
   50 MB and images are only ever served with their extension's content type, but the bucket should have a lifecycle rule and a size alarm.
4. **Live payment gateways are untested** (no sandbox credentials yet). The verification code is covered only through the fake driver.
5. **Per-exam error rate** in the monitor endpoint is a constant 0 until the scoring consumer exposes a counter.
6. **Backups** are not set up, so "encrypted backups" cannot be ticked.
