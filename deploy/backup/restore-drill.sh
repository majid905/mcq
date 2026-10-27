#!/usr/bin/env bash
# Restore drill: proves a backup can really be restored, and measures how long it takes.
# It loads the backup into a THROWAWAY MySQL container (never the live one), compares the result with
# the expected schema, prints row counts and the elapsed time, then removes the container.
#
#   restore-drill.sh /srv/mcq/backups/mcq-20261027T021700Z.sql.gz.enc
#   restore-drill.sh latest                   # newest file in BACKUP_DIR
#   restore-drill.sh r2-latest                # newest object in the R2 bucket (needs R2_* and AWS_* variables)
#
# Run it monthly and before any big exam; record the time in docs/BACKUP-RESTORE.md.
set -euo pipefail

ENV_FILE="${BACKUP_ENV:-/srv/mcq/backup.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
: "${BACKUP_DIR:=/srv/mcq/backups}"
: "${MYSQL_DATABASE:=mcq}"
: "${BACKUP_PASSPHRASE_FILE:?set BACKUP_PASSPHRASE_FILE}"
: "${MYSQL_IMAGE:=mysql:8.4}"
: "${DRILL_PORT:=3399}"
SCHEMA_SQL="${SCHEMA_SQL:-$(dirname "$0")/../../database/schema.sql}"

log() { echo "$(date -u +%FT%TZ) drill: $*"; }
src="${1:?usage: restore-drill.sh <backup file | latest | r2-latest>}"

work=$(mktemp -d)
name="mcq-restore-drill-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

case "$src" in
  latest)
    src=$(ls -1t "$BACKUP_DIR"/${MYSQL_DATABASE}-*.sql.gz.enc 2>/dev/null | head -1)
    [ -n "$src" ] || { log "no backups in $BACKUP_DIR"; exit 1; } ;;
  r2-latest)
    : "${R2_ENDPOINT:?}" "${R2_BUCKET:?}" "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}"
    export AWS_DEFAULT_REGION=auto
    prefix="${R2_BACKUP_PREFIX:-db-backups}"
    key=$(aws s3 ls --endpoint-url "$R2_ENDPOINT" "s3://$R2_BUCKET/$prefix/" | awk '/\.sql\.gz\.enc$/ {print $4}' | sort | tail -1)
    [ -n "$key" ] || { log "no backups in s3://$R2_BUCKET/$prefix/"; exit 1; }
    aws s3 cp --endpoint-url "$R2_ENDPOINT" --only-show-errors "s3://$R2_BUCKET/$prefix/$key" "$work/$key"
    aws s3 cp --endpoint-url "$R2_ENDPOINT" --only-show-errors "s3://$R2_BUCKET/$prefix/$key.sha256" "$work/$key.sha256" || true
    src="$work/$key" ;;
esac
[ -f "$src" ] || { log "no such file: $src"; exit 1; }

if [ -f "$src.sha256" ]; then
  [ "$(sha256sum "$src" | awk '{print $1}')" = "$(cat "$src.sha256")" ] || { log "CHECKSUM MISMATCH for $src"; exit 1; }
  log "checksum ok"
fi

started=$(date +%s)
pw=$(head -c 24 /dev/urandom | base64 | tr -d '/+=')
log "starting throwaway $MYSQL_IMAGE on 127.0.0.1:$DRILL_PORT"
docker run -d --name "$name" -e MYSQL_ROOT_PASSWORD="$pw" -e MYSQL_DATABASE="$MYSQL_DATABASE" \
  -p "127.0.0.1:$DRILL_PORT:3306" "$MYSQL_IMAGE" \
  --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --skip-log-bin >/dev/null
ping() { docker exec -e MYSQL_PWD="$pw" "$name" mysqladmin ping -h127.0.0.1 -uroot --silent 2>/dev/null; }
for _ in $(seq 1 90); do
  ping && break
  sleep 2
done
ping || { log "throwaway MySQL did not start"; exit 1; }

log "decrypting and loading $(basename "$src")"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$BACKUP_PASSPHRASE_FILE" < "$src" \
  | gunzip \
  | docker exec -i -e MYSQL_PWD="$pw" "$name" mysql -uroot --default-character-set=utf8mb4 "$MYSQL_DATABASE"
elapsed=$(( $(date +%s) - started ))

q() { docker exec -e MYSQL_PWD="$pw" "$name" mysql -N -B -uroot "$MYSQL_DATABASE" -e "$1" 2>/dev/null; }

# 1) every table of schema.sql exists in the restored copy
expected=$(grep -oiE '^CREATE TABLE +[a-z_0-9]+' "$SCHEMA_SQL" | awk '{print tolower($3)}' | sort -u)
have=$(q "SHOW TABLES" | tr 'A-Z' 'a-z' | sort -u)
missing=$(comm -23 <(echo "$expected") <(echo "$have") || true)
if [ -n "$missing" ]; then log "MISSING TABLES: $(echo $missing)"; exit 1; fi
log "all $(echo "$expected" | wc -l) tables from schema.sql are present"

# 2) the data is there
for t in users questions exams payments subscriptions; do
  printf '  %-15s %s rows\n' "$t" "$(q "SELECT COUNT(*) FROM $t")"
done
latest=$(q "SELECT MAX(created_at) FROM users")
log "newest user in the backup: ${latest:-none}"

# 3) Bangla text survived the round trip: multi-byte characters are still multi-byte (mojibake would
#    turn them into several single-byte ones, and the count of such questions would drop to 0)
bn=$(q "SELECT COUNT(*) FROM questions WHERE CHAR_LENGTH(body_text) < LENGTH(body_text)" || echo "?")
log "questions with non-ASCII (Bangla) text: $bn"

log "RESTORE OK in ${elapsed}s (this is your restore time for a database of this size)"
