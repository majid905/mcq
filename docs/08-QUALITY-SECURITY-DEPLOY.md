# 08 — Quality, security, deployment

## 1. Testing strategy

| Layer | Tool | What | Gate |
| --- | --- | --- | --- |
| API unit | Jest | Services: auth, scoring, ranking, billing, import | ≥ 70% lines on services |
| API contract | Jest + openapi validator | Every endpoint response matches openapi.yaml | 100% endpoints |
| API integration | Testcontainers (MySQL, Redis) | Live exam flow, payment IPN idempotency | Required |
| Web e2e | Playwright | Register, live exam (with reload), practice, checkout (sandbox), admin import | Required on main |
| Mobile | flutter_test, golden tests, integration_test | Exam room state machine, OptionTile, auth, result | Required |
| Shared | Shuffle vectors | TS and Dart produce identical orders | Required |
| Load | k6 | 10,000 VUs live exam | Before launch and before big exams |
| Accessibility | axe (web), Flutter semantics checks | AA contrast, labels | Before release |

## 2. Security checklist
- [ ] Answers/explanations never in responses before allowed (test asserts on paper & question endpoints).
- [ ] Argon2id passwords; OTP hashed in Redis; constant-time comparisons.
- [ ] Refresh rotation with reuse detection; logout revokes family.
- [ ] Web tokens only in httpOnly Secure cookies; CSRF header on mutations; strict CSP on web/admin.
- [ ] Rate limits per docs/04 §5; Cloudflare WAF managed rules + bot fight on `/auth/*`.
- [ ] Input validation on every DTO; HTML from admin sanitized server-side (allowlist) and client-side (DOMPurify / html sanitizer).
- [ ] Admin: TOTP required, optional IP allowlist, RBAC on every route, audit log, session timeout 8 h.
- [ ] Payments: amount and status only from gateway validation API; webhook IP/signature checks; unique transaction ids.
- [ ] Secrets in env / secret manager; no keys in the Flutter binary except public ones (Firebase config).
- [ ] Mobile: secure storage, certificate pinning optional (P2), FLAG_SECURE in exam, root/jailbreak detection warning only.
- [ ] Dependency scanning in CI; container images run as non-root.
- [ ] Data: account deletion job anonymizes within 30 days; backups encrypted at rest (R2 SSE).

## 3. Deployment (launch)

```
Cloudflare (DNS, proxy, WAF, cache)
   ├─ [Domain]          → Server A : web (Next.js)
   ├─ admin.[Domain]    → Server A : admin (Next.js, Cloudflare Access optional)
   ├─ api.[Domain]      → Server A : api ×2 containers (Caddy/Nginx load balance)
   └─ cdn.[Domain]      → Cloudflare R2 (papers, images)

Server A (8 vCPU / 16 GB): caddy, api×2, worker×2, scheduler, web, admin, redis, meilisearch
Server B (4 vCPU dedicated / 16 GB / NVMe): MySQL 8.4 (private network only)
Staging (2–4 vCPU): everything in one compose
```
Scale steps: more `api`/`worker` containers or a Server C for API → move Redis to its own box → MySQL read replica for analytics/admin reads.

Deploy: GitHub Actions builds images (api, web, admin) → pushes to GHCR → SSH deploy with `docker compose pull && up -d` (zero-downtime via two api containers, rolling). DB migrations run as a one-off job before rollout. Never deploy within 2 hours of a scheduled live exam (deploy freeze check in the workflow reads upcoming exams).

Mobile: Fastlane lanes `beta` (Play internal / TestFlight) and `release`; version from git tag; `min_supported_version` updated in admin settings after rollout.

## 4. Monitoring & alerts

| Signal | Alert when |
| --- | --- |
| API p95 latency | > 500 ms for 5 min |
| 5xx rate | > 1% for 5 min |
| Submit queue depth / scoring lag | > 2,000 items or > 60 s |
| MySQL CPU / connections | > 80% / > 300 |
| Redis memory | > 75% |
| Payment webhook failures | any 5xx |
| Uptime (api, web) | down 2 min |

## 5. Live exam day runbook (summary)
T-24 h freeze deploys · T-2 h scale api/workers, warm caches · T-30 min verify paper built and on CDN · T-10 min watch monitor screen · T+end check queue drained, auto-submit done · T+5 min merit published, notifications sent · post-mortem notes if any alert fired.
