# Deploy: https://mcq.ellevix.com

Owner: Dev A. Every push to `main` that passes CI is deployed by `.github/workflows/deploy.yml`.

```
GitHub push to main
  -> CI workflow (lint, typecheck, tests, contract tests)
  -> Deploy workflow: ssh mcqdeploy@server <sha>
       -> /usr/local/sbin/mcq-deploy-entry (root-owned, validates the sha), then `sudo -u mcq`
       -> /srv/mcq/app/deploy/deploy.sh: git checkout, pnpm install, build, systemctl restart
```

## What runs on the server

The server is shared with other sites, so everything is isolated and local-only.

| Part | Where |
| --- | --- |
| API (`mcq-api`) | systemd, `127.0.0.1:3050`, user `mcq` |
| Worker (`mcq-worker`: scoring) and scheduler (`mcq-scheduler`) | systemd, same user |
| MySQL 8.4 | docker, `127.0.0.1:3307`, volume `mcq-prod_mysql-data` |
| Redis 7 (AOF on) | docker, `127.0.0.1:6380` |
| nginx | `/etc/nginx/sites-available/mcq.ellevix.com`, proxies `/v1`, `/docs`, `/openapi.json` |
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
