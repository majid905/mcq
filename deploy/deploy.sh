#!/usr/bin/env bash
# Runs ON THE SERVER as user `mcq`. Called by .github/workflows/deploy.yml over SSH, or by hand:
#   /srv/mcq/app/deploy/deploy.sh [git-sha]
# Idempotent: pulls the commit, installs, builds, restarts. It never touches the database
# contents. Schema changes are applied by hand for now, and so is the docker compose stack
# (mysql, redis): the deploy user has no docker access on purpose. See deploy/README.md.
set -euo pipefail

APP=/srv/mcq/app
export PATH=/opt/node22/bin:/srv/mcq/tools/bin:$PATH
# sanitize-html (question HTML cleaning) is ESM-only; Node loads it with require() from 22.12.
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 12) ? 0 : 1)' \
  || { echo "need Node >= 22.12, found $(node -v)"; exit 1; }
SHA="${1:-origin/main}"
[[ "$SHA" =~ ^([0-9a-f]{7,40}|origin/main)$ ]] || { echo "bad revision: $SHA"; exit 2; }
LOCK=/srv/mcq/deploy.lock

# The disk is shared with other sites: never start a deploy that could fill it.
avail_mb=$(df --output=avail -m / | tail -1 | tr -d ' ')
if [ "$avail_mb" -lt 500 ]; then
  echo "refusing to deploy: only ${avail_mb} MB free on /"
  exit 1
fi

exec 9>"$LOCK"
flock -n 9 || { echo "another deploy is running"; exit 1; }

cd "$APP"
if [ -z "${DEPLOY_REEXEC:-}" ]; then
  echo "==> fetch"
  git fetch --quiet origin main
  git checkout --quiet --force "$SHA"
  # The checkout may have replaced this very script: run the new version for the remaining steps.
  DEPLOY_REEXEC=1 exec "$APP/deploy/deploy.sh" "$SHA"
fi
echo "    at $(git rev-parse --short HEAD): $(git log -1 --format=%s)"

echo "==> install"
CI=true nice -n 10 pnpm install --frozen-lockfile --filter "@mcq/api..." --config.confirmModulesPurge=false

echo "==> build"
# Call the binaries directly: `pnpm run` in pnpm 11 first runs a FULL workspace install (web, admin,
# ...) to verify deps, which does not fit on this shared disk.
(cd apps/api && nice -n 10 node_modules/.bin/prisma generate && nice -n 10 node_modules/.bin/nest build)

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
