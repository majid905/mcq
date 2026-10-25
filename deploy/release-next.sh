#!/usr/bin/env bash
# Runs ON THE SERVER as user `mcq`, via /usr/local/sbin/mcq-deploy-entry.
#   release-next.sh <web|admin> <full-git-sha>   < standalone-bundle.tgz
# Unpacks a Next.js standalone bundle (built on the GitHub runner, so the server needs no
# node_modules or build tools for it) into /srv/mcq/<app>/releases/<sha>, flips the `current`
# symlink, restarts the service and rolls back if it does not answer.
set -euo pipefail

NAME="${1:-}"
SHA="${2:-}"
case "$NAME" in
  web) PORT=3051; DIR=apps/web ;;
  admin) PORT=3052; DIR=apps/admin ;;
  *) echo "usage: release-next.sh <web|admin> <sha>"; exit 2 ;;
esac
[[ "$SHA" =~ ^[0-9a-f]{7,40}$ ]] || { echo "bad revision: $SHA"; exit 2; }

BASE=/srv/mcq/$NAME
REL=$BASE/releases/$SHA

# Shared disk: refuse rather than risk filling it.
avail_mb=$(df --output=avail -m / | tail -1 | tr -d ' ')
if [ "$avail_mb" -lt 300 ]; then
  echo "refusing to release: only ${avail_mb} MB free on /"
  exit 1
fi

mkdir -p "$BASE/releases"
rm -rf "$REL.tmp"
mkdir "$REL.tmp"
tar -xz --no-same-owner --no-same-permissions -C "$REL.tmp"
[ -f "$REL.tmp/$DIR/server.js" ] || { echo "bundle has no $DIR/server.js"; rm -rf "$REL.tmp"; exit 1; }
rm -rf "$REL"
mv "$REL.tmp" "$REL"

PREV=$(readlink -f "$BASE/current" 2>/dev/null || true)
ln -sfn "$REL" "$BASE/current.new"
mv -Tf "$BASE/current.new" "$BASE/current"
sudo -n systemctl restart "mcq-$NAME"

ok=0
for _ in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/" || true)
  if [ "$code" != "000" ] && [ "$code" -lt 500 ]; then ok=1; break; fi
  sleep 2
done

if [ "$ok" != 1 ]; then
  echo "mcq-$NAME did not answer (last status $code); rolling back"
  journalctl -u "mcq-$NAME" -n 25 --no-pager || true
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    ln -sfn "$PREV" "$BASE/current.new"
    mv -Tf "$BASE/current.new" "$BASE/current"
    sudo -n systemctl restart "mcq-$NAME"
  fi
  rm -rf "$REL"
  exit 1
fi

# Keep this release and the one before it.
ls -1dt "$BASE"/releases/*/ 2>/dev/null | tail -n +3 | xargs -r rm -rf
echo "released $NAME $SHA (HTTP $code), $(df --output=avail -m / | tail -1 | tr -d ' ') MB free"
