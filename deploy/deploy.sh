#!/usr/bin/env bash
# Runs ON THE SERVER as user `mcq`. Called by .github/workflows/deploy.yml over SSH, or by hand:
#   /srv/mcq/app/deploy/deploy.sh [git-sha]
# Idempotent: pulls the commit, installs, builds, restarts. It never touches the database
# contents. Schema changes are applied by hand for now, and so is the docker compose stack
# (mysql, redis): the deploy user has no docker access on purpose. See deploy/README.md.
set -euo pipefail

APP=/srv/mcq/app
export PATH=/opt/node22/bin:/srv/mcq/tools/bin:$PATH
SHA="${1:-origin/main}"
[[ "$SHA" =~ ^([0-9a-f]{7,40}|origin/main)$ ]] || { echo "bad revision: $SHA"; exit 2; }
LOCK=/srv/mcq/deploy.lock

exec 9>"$LOCK"
flock -n 9 || { echo "another deploy is running"; exit 1; }

cd "$APP"
echo "==> fetch"
git fetch --quiet origin main
git checkout --quiet --force "$SHA"
echo "    at $(git rev-parse --short HEAD): $(git log -1 --format=%s)"

echo "==> install"
CI=true nice -n 10 pnpm install --frozen-lockfile --filter "@mcq/api..." --config.confirmModulesPurge=false

echo "==> build"
nice -n 10 pnpm --filter @mcq/api build

echo "==> restart"
sudo -n systemctl restart mcq-api mcq-worker mcq-scheduler

echo "==> health"
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3050/v1/health >/dev/null 2>&1; then
    curl -fsS http://127.0.0.1:3050/v1/health; echo
    echo "deployed $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 2
done
echo "API did not become healthy; recent log:"
journalctl -u mcq-api -n 40 --no-pager || true
exit 1
