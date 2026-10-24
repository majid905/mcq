# Prompt 50 — Phase 5: hardening and launch

---

Read `CLAUDE.md`, `docs/01-SRS.md` §4 and §8, `docs/08-QUALITY-SECURITY-DEPLOY.md`.

1. Load test: extend `load/live-exam.js` (k6) to 10,000 VUs — login, start, fetch paper, 4 syncs, submit, poll result. Run against staging; report p50/p95/p99 per step, errors, MySQL/Redis CPU. Fix bottlenecks until NFR-PERF-01 and NFR-SCAL-04 pass.
2. Security: go through the checklist in docs/08 §2, write findings and fixes; add rate-limit and auth tests; run `npm audit`, `flutter pub outdated`, dependency fixes.
3. SEO and performance: Lighthouse on landing, a paper page and a question page; meet NFR-PERF-05; sitemap index for 5 lakh questions (split files of 50,000).
4. Observability: Sentry in api/web/admin/mobile with release tags; Prometheus metrics (HTTP latency, queue depth, scoring lag) and Grafana dashboard JSON; alerts.
5. Backups: XtraBackup + binlog shipping scripts, restore drill doc.
6. Production: `deploy/` folder with docker-compose.prod.yml, Caddy or Nginx config, GitHub Actions deploy workflow, `.env` templates, runbook (`docs/RUNBOOK.md`) for live exam days.
7. Mobile release: app icons, splash, signing config, Fastlane lanes, Play Store + App Store metadata in bn/en, privacy manifest (iOS), data safety form answers.
