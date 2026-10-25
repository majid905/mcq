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
| Web (`mcq-web`) / admin (`mcq-admin`) | systemd, `127.0.0.1:3051` / `3052`, from `/srv/mcq/{web,admin}/current` (symlink to `releases/<sha>`) |
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

## Staging limits you must know

- `NODE_ENV=development` and `SMS_DRIVER=console`: the OTP is always `123456` for every phone number. Anyone can register or log in as any number. Fine for a preview with test data, **not** for real users. Switch to `NODE_ENV=production` and `SMS_DRIVER=http` once the SMS gateway exists.
- No Meilisearch, R2 or CDN yet; the paper is inlined in `POST /exams/{id}/start`.
- Seed data is placeholder content (2,000 generated MCQs).
