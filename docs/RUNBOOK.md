# Runbook: running the platform, especially on live-exam days

Audience: whoever is on call. Commands assume the staging/production layout in `deploy/README.md`
(systemd units `mcq-api`, `mcq-worker`, `mcq-scheduler`, `mcq-web`, `mcq-admin`; MySQL and Redis in docker).
Alerts are defined in `deploy/monitoring/alerts.yml`, the dashboard is "MCQ platform: overview" in Grafana.

## Where to look first

| Question | Where |
| --- | --- |
| Is it up? | `curl -s https://<host>/v1/health` (database and redis `up`), Grafana top row |
| Is scoring keeping up? | Grafana "Submit backlog" and "Oldest unscored submit"; or admin panel, Exams, Monitor (`queue_backlog`) |
| What is slow? | Grafana "Slowest routes", "Live-exam path p95" |
| What happened to one user? | Admin panel, Users, detail (devices, attempts, payments); audit log for admin actions |
| What did the server log? | `journalctl -u mcq-api -u mcq-worker --since "10 min ago"` (JSON lines, `req_id` ties a request together; the id is also returned in `X-Request-Id`) |

## Live-exam day checklist

**T-24 h**
* Freeze deploys: do not merge to `main` (every push deploys). Tell the other developer.
* Run the restore drill with `r2-latest` if the last one is older than a month.
* Check disk: `df -h /` needs several GB free (the box is shared; the deploy script refuses below 500 MB, the backup below 1.5 GB).
* Confirm the exam in the admin panel: status **scheduled**, paper has all questions, start/end times right. Publishing already dry-runs the paper build; if anything was edited, unpublish and publish again.

**T-2 h**
* Scale for the expected crowd. Rule of thumb from `load/README.md`: one API process handled 3,000 students arriving over 2 minutes comfortably; for 10,000 in a few minutes run at least 2 API processes and 2 workers behind nginx (`upstream` with `keepalive 256`), and raise `worker_connections`.
* Check Redis memory (Grafana "Redis memory" under 50%) and that `maxmemory-policy` is `noeviction`.
* Check the worker is alive: `systemctl status mcq-worker` and the submit backlog is 0.
* Warm up: open the exam as a test student in the app so the paper is cached and the CDN copy exists.
* Turn on monitoring tunnels / open Grafana.

**T-30 min**
* The scheduler builds the paper automatically at T-30. Confirm in the admin Monitor: paper built (a test student can open the exam detail and, after the start time, start it).
* Push notification reminders go out at T-15 and T-1 automatically.

**T-10 min to T+end**
* Watch the dashboard. Healthy: p95 of `/v1/exams/:id/start` under 0.8 s, answer sync under 0.3 s, submit under 0.2 s, backlog near 0, 5xx share 0.
* Do not restart anything unless an alert says so. A restart drops open connections at the worst moment.

**T+end**
* The scheduler auto-submits unfinished attempts shortly after the grace period. Check the backlog drains to 0 and the oldest-unscored age returns to 0.
* About 5 minutes after the end the merit list is published and push notifications go out. Confirm status **merit_published** in the admin panel.

**After**
* Note any alert that fired and what you did, in a short post-mortem. Update the numbers in `load/README.md` if you learned something.

## Alert playbook

| Alert | Likely cause | Do this |
| --- | --- | --- |
| `ScoringLagHigh` / `SubmitQueueDeep` | worker down or too slow | `systemctl status mcq-worker`; restart it (`systemctl restart mcq-worker`): messages are not lost, unacknowledged ones are re-delivered. If it is slow, start a second worker. Results show "being scored" to students meanwhile, nobody loses answers |
| `ApiDown` | process crashed or box out of memory | `systemctl status mcq-api`, `journalctl -u mcq-api -n 100`; restart; check memory (`free -m`) and disk |
| `ApiErrorRateHigh` | database or Redis trouble, bad deploy | look at "Errors by route" in Grafana; check `mcq_database_up` and `mcq_redis_up`; if it began right after a deploy, roll back (below) |
| `ApiLatencyHigh` | CPU saturated, slow query | Grafana CPU and event-loop lag; MySQL `SHOW FULL PROCESSLIST`; add API processes |
| `DatabaseDown` | MySQL container stopped / disk full | `docker ps`, `docker logs mcq-prod-mysql-1`, `df -h`; free disk first (old backups in `/srv/mcq/backups`, journal) |
| `RedisDown` | container stopped | `docker start mcq-prod-redis-1`; AOF restores the data. Running attempts resume from what was synced |
| `RedisMemoryHigh` | stream backlog or many papers | find the cause first (`redis-cli --bigkeys`); with `noeviction`, at 100% writes fail and answers stop syncing. Raise `maxmemory` only if the host has room |
| `PaymentWebhookFailing` | bug or gateway callback malformed | Admin, Payments, filter `pending`; a customer who paid but is not activated is fixed by opening their payment (status poll re-checks the gateway) or by Users, Actions, grant subscription with a reason |
| `ImportStuck` | worker down | restart the worker; the import resumes from the queue |
| `BackupStale` | cron not running / disk full / R2 key expired | run `backup-mysql.sh` by hand and read its output |

## Common operations

**Roll back a bad deploy** (previous commit hash from `git log` / GitHub): `sudo -u mcq /srv/mcq/app/deploy/deploy.sh <good-sha>`. Database schema changes are applied by hand, so a rollback never needs a database rollback unless a schema change went with it.

**Maintenance mode**: Admin panel, Settings, `maintenance` -> `{"enabled": true, "message_bn": "...", "message_en": "..."}`. All student routes answer 503; admin and payment callbacks keep working.

**Force an app upgrade**: Settings, `min_supported_version` (per platform). Older apps get 426 and see the update screen.

**A student cannot log in / says they are logged out**: they signed in on a second device (one active device per student). Admin, Users, Actions, `reset_device`, with a reason.

**A question is wrong during a live exam**: questions inside a scheduled or running exam are locked on purpose (answer key and papers are already built). Options: let the exam finish and fix afterwards; or, if the answer is plainly wrong, cancel/re-issue with support. Do not edit the database by hand.

**Reindex search** (after restoring a backup or if search looks stale): `sudo -u mcq bash -c 'cd /srv/mcq/app/apps/api && set -a && . /srv/mcq/.env && set +a && node dist/search/reindex.js'`.

**Create or reset an admin**: `ADMIN_PASSWORD=... node dist/admin/create-admin.js <email> "<name>" [role]` (same environment as above). The first login must set up TOTP when `ADMIN_REQUIRE_TOTP` is on.

**Make the user list leave you alone**: Admin, Users, Actions, `ban` for abuse; it signs the person out everywhere.

## Capacity facts (from `load/README.md`)

* One API process, one worker, one laptop: 3,000 students over 2 minutes, start p95 137 ms, sync 42 ms, submit 41 ms, results in about 3 s.
* A burst of 3,000 new connections in 30 s could not be tested on the Windows/Docker setup (the relay refused connections before they reached the API). Run the 10,000-user test from a Linux load generator against staging before the first big exam.

## Contacts and access

Fill in before launch: who is on call, how to reach the other developer, Cloudflare/R2/hosting login owner, SMS gateway and bKash/SSLCommerz merchant support numbers.
