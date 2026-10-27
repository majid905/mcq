# Deploy: https://mcq.ellevix.com

Owner: Dev A. Every push to `main` that passes CI goes live (`.github/workflows/deploy.yml`):

| App | URL | How |
| --- | --- | --- |
| API (`apps/api`) | https://mcq.ellevix.com/v1 (Swagger: /docs) | git checkout on the server, install, build, restart |
| Student web (`apps/web`) | https://mcq.ellevix.com | built on the GitHub runner, shipped as a Next.js standalone bundle |
| Admin (`apps/admin`) | https://mcq-admin.ellevix.com | same (needs the DNS record below) |

```
GitHub push to main
  -> CI workflow (lint, typecheck, tests, contract tests)
  -> Deploy workflow, three independent jobs: api, web, admin
       -> ssh mcqdeploy@server "api <sha>"  |  "web <sha>" < bundle.tgz  |  "admin <sha>" < bundle.tgz
       -> /usr/local/sbin/mcq-deploy-entry (root-owned, validates input), then `sudo -u mcq`
       -> deploy/deploy.sh (api)  or  deploy/release-next.sh (web, admin: unpack, flip symlink,
          health check, roll back on failure, keep 2 releases)
```

The web and admin builds use `NEXT_OUTPUT=standalone` (opt-in in each `next.config.ts`),
and `NEXT_PUBLIC_API_BASE=https://mcq.ellevix.com/v1`. Server-side code reads `API_BASE_URL` from `/srv/mcq/{web,admin}.env`
(`http://127.0.0.1:3050/v1`, straight to the API, bypassing Cloudflare).

## What runs on the server

The server is shared with other sites, so everything is isolated and local-only.

| Part | Where |
| --- | --- |
| API (`mcq-api`) | systemd, `127.0.0.1:3050`, user `mcq` |
| Worker (`mcq-worker`: scoring) and scheduler (`mcq-scheduler`) | systemd, same user |
| Web (`mcq-web`) / admin (`mcq-admin`) | systemd, `localhost:3051` / `3052` (HOSTNAME must be `localhost`: with `127.0.0.1` Next 15 redirect-loops `/`), from `/srv/mcq/{web,admin}/current` (symlink to `releases/<sha>`) |
| MySQL 8.4 | docker, `127.0.0.1:3307`, volume `mcq-prod_mysql-data` |
| Redis 7 (AOF on) | docker, `127.0.0.1:6380` |
| nginx | `/etc/nginx/sites-available/mcq.ellevix.com`, `/v1`, `/docs`, `/openapi.json` go to the API, everything else to web |
| Secrets | `/srv/mcq/.env` (mode 600, owner `mcq`). Never in git. |
| Code | `/srv/mcq/app` (a plain clone of this repo, detached at the deployed sha) |

Cloudflare proxies the hostname; nginx reads the visitor address from `CF-Connecting-IP`, and the API runs with `TRUST_PROXY=1` so per-IP rate limits work.

## GitHub secrets the deploy workflow needs

Settings, Secrets and variables, Actions:

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | server IP (not the hostname: Cloudflare would swallow port 22) |
| `DEPLOY_USER` | `mcqdeploy` |
| `DEPLOY_SSH_KEY` | private key whose public half is in `~mcqdeploy/.ssh/authorized_keys`, forced to `command="/usr/local/sbin/mcq-deploy-entry"` |
| `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 <ip>` |

The key can only run the deploy entry script, with a sha or `origin/main` as its single argument.

## One-time setup for the admin host

1. Cloudflare DNS: `mcq-admin`  A  `4.193.116.31`  (proxied).
2. On the server: `sudo systemctl reload nginx && sudo certbot --nginx -d mcq-admin.ellevix.com --redirect`.

To (re)install the pieces that live outside the repo (as root): copy `deploy/mcq-deploy-entry` to `/usr/local/sbin/`, `deploy/systemd/*.service` to `/etc/systemd/system/`, `deploy/nginx/*.conf` to `/etc/nginx/sites-available/`, and keep `/etc/sudoers.d/mcq` allowing `mcqdeploy` to run `deploy.sh` / `release-next.sh` as `mcq` and `mcq` to restart the five services.

## Manual operations (on the server, as a sudo user)

```bash
sudo systemctl status mcq-api mcq-worker mcq-scheduler
sudo journalctl -u mcq-api -f                  # logs
sudo -u mcq /srv/mcq/app/deploy/deploy.sh      # redeploy origin/main by hand
curl -s http://127.0.0.1:3050/v1/health

# infra (the deploy user has no docker access on purpose)
cd /srv/mcq/app && sudo docker compose --env-file /srv/mcq/.env -f deploy/docker-compose.prod.yml up -d
```

## Database changes

Deploys never change the database. For now the schema is applied by hand:

- First time only: `pnpm db:reset` (drops and reseeds; refuses non-local hosts).
- Later changes to `database/schema.sql`: write the `ALTER` by hand and run it with `sudo docker exec -i mcq-prod-mysql-1 mysql -uroot -p...`, then `pnpm --filter @mcq/api prisma:pull` and commit the new `schema.prisma`.
- A proper migration flow is a to-do before real users arrive.

## First deploy after Phase 4 and 5 (do this once, in order)

The server still runs the Phase 3 build. The next deploy brings payments, the admin API, uploads, imports, metrics and
the security changes, and they need a few things that deploys do not do for you.

1. **GitHub secrets** (table above). Until they exist every Deploy run fails at its SSH step.
2. **Node version**: `/opt/node22/bin/node -v` must be 22.12 or newer. `sanitize-html` loads ESM packages with `require()`; `deploy.sh` stops with a message if Node is older.
3. **Disk**: `df -h /`. The install adds roughly 100 MB (exceljs, mammoth, sanitize-html, prom-client). The script refuses below 500 MB free; free space first if you are close.
4. **Add to `/srv/mcq/.env`** (mode 600, owner `mcq`):
   ```
   PUBLIC_API_URL=https://mcq.ellevix.com
   WEB_BASE_URL=https://mcq.ellevix.com
   CORS_ORIGINS=https://mcq.ellevix.com,https://mcq-admin.ellevix.com   # the admin browser uploads files straight to the API
   UPLOAD_DIR=/srv/mcq/uploads                                           # used until R2 is configured
   ADMIN_REQUIRE_TOTP=true                                               # admins must set up an authenticator before anything else
   PAYMENT_DRIVER=fake                                                   # no money moves; switch to live with the gateway credentials
   # METRICS_TOKEN=...  only if Prometheus scrapes over a non-loopback address
   ```
   `PAYMENT_DRIVER=fake` is accepted only because the server runs `NODE_ENV=development`; with `NODE_ENV=production` the API refuses to start (see "Staging limits").
5. **Create the upload folder**: `sudo install -d -o mcq -g mcq -m 750 /srv/mcq/uploads`. It is outside `/srv/mcq/app`, so deploys never wipe it.
6. **Install the changed unit and nginx files** (as root), then reload.
   - Worker unit: `cp deploy/systemd/mcq-worker.service /etc/systemd/system/ && systemctl daemon-reload`. It now allows 1.3 GB because imports parse whole spreadsheets.
   - nginx: new rule that allows uploads up to 55 MB on `/v1/admin/uploads/local/` (everything else stays at 2 MB). Certbot has edited the live file, so add the new `location` block from `deploy/nginx/mcq.ellevix.com.conf` by hand instead of overwriting it, then `nginx -t && systemctl reload nginx`.
7. **Deploy**: push to `main` or run `sudo -u mcq /srv/mcq/app/deploy/deploy.sh`. There are no schema changes in this release.
8. **Create the first real admin**:
   ```
   sudo -u mcq bash -c 'cd /srv/mcq/app/apps/api && set -a && . /srv/mcq/.env && set +a && ADMIN_PASSWORD="<at least 10 characters>" node dist/admin/create-admin.js you@example.com "Your Name"'
   ```
   Log in at `POST /v1/admin/auth/login`, then set up TOTP (`/v1/admin/auth/totp/setup`, then `/enable`) before using anything else. The seed's `admin@example.com` only exists if the seed was run on this server; if it does, re-password it with the same command or delete it.
9. **Smoke test**: `curl -s https://mcq.ellevix.com/v1/health`, `/v1/packages`, `/v1/public/sitemap/questions`, and an admin login. On the server: `curl -s http://127.0.0.1:3050/metrics | head` and `systemctl status mcq-worker mcq-scheduler` (both must be active: scoring and imports run in the worker).
10. **Optional, recommended**: backups and monitoring (`docs/BACKUP-RESTORE.md`, `deploy/monitoring/README.md`), and firewall ports 80/443 to Cloudflare's address ranges only.

## Staging limits you must know

- `NODE_ENV=development` and `SMS_DRIVER=console`: the OTP is always `123456` for every phone number. Anyone can register or log in as any number. Fine for a preview with test data, **not** for real users. Switch to `NODE_ENV=production` and `SMS_DRIVER=http` once the SMS gateway exists.
- `PAYMENT_DRIVER=fake`: checkout marks a payment paid without any gateway. Do not hand the staging site to people who might think it takes money.
- No Meilisearch, R2 or CDN yet; search uses MySQL `LIKE`, uploads go to `UPLOAD_DIR` on this disk, and the paper is inlined in `POST /exams/{id}/start`.
- Seed data is placeholder content (2,000 generated MCQs).
