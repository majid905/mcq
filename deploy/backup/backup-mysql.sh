#!/usr/bin/env bash
# Nightly logical backup of the MCQ database: mysqldump (consistent snapshot, no table locks) ->
# gzip -> AES-256 encryption -> local copy -> Cloudflare R2. Run from cron or a systemd timer as
# the user that may `docker exec` into the MySQL container:
#
#   17 2 * * *  /srv/mcq/app/deploy/backup/backup-mysql.sh >> /srv/mcq/backup.log 2>&1
#
# Configuration comes from /srv/mcq/backup.env (or the file named in BACKUP_ENV), see
# deploy/backup/backup.env.example. Restore with restore-drill.sh; procedure in docs/BACKUP-RESTORE.md.
set -euo pipefail

ENV_FILE="${BACKUP_ENV:-/srv/mcq/backup.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

: "${MYSQL_CONTAINER:=mcq-prod-mysql-1}"
: "${MYSQL_DATABASE:=mcq}"
: "${BACKUP_DIR:=/srv/mcq/backups}"
: "${BACKUP_KEEP_LOCAL_DAYS:=7}"
: "${BACKUP_UPLOAD:=1}"                       # 0 = keep local only (dev, drills)
: "${BACKUP_PASSPHRASE_FILE:?set BACKUP_PASSPHRASE_FILE (file holding the encryption passphrase, mode 600)}"
: "${METRICS_TEXTFILE_DIR:=}"                 # node_exporter textfile collector dir; empty = no metric
: "${MIN_FREE_MB:=1500}"

log() { echo "$(date -u +%FT%TZ) backup: $*"; }
write_metric() {
  [ -n "$METRICS_TEXTFILE_DIR" ] || return 0
  printf '# TYPE mcq_backup_last_success_timestamp_seconds gauge\nmcq_backup_last_success_timestamp_seconds %s\n' "$(date +%s)" \
    > "$METRICS_TEXTFILE_DIR/mcq_backup.prom.$$" && mv "$METRICS_TEXTFILE_DIR/mcq_backup.prom.$$" "$METRICS_TEXTFILE_DIR/mcq_backup.prom"
}

[ -r "$BACKUP_PASSPHRASE_FILE" ] || { log "cannot read $BACKUP_PASSPHRASE_FILE"; exit 1; }
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# The disk is shared with other sites: never start a dump that could fill it.
avail_mb=$(df --output=avail -m "$BACKUP_DIR" | tail -1 | tr -d ' ')
if [ "$avail_mb" -lt "$MIN_FREE_MB" ]; then
  log "refusing to run: only ${avail_mb} MB free in $BACKUP_DIR (need $MIN_FREE_MB)"
  exit 1
fi

stamp=$(date -u +%Y%m%dT%H%M%SZ)
final="$BACKUP_DIR/${MYSQL_DATABASE}-${stamp}.sql.gz.enc"
tmp="$final.partial"
trap 'rm -f "$tmp"' EXIT

log "dumping $MYSQL_DATABASE from container $MYSQL_CONTAINER"
# The root password is read inside the container, so it never appears in a process list on the host.
# --single-transaction + InnoDB = a consistent snapshot without blocking writers.
docker exec "$MYSQL_CONTAINER" sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump --single-transaction --quick --routines --events \
     --triggers --hex-blob --default-character-set=utf8mb4 --set-gtid-purged=OFF -uroot "$1"' _ "$MYSQL_DATABASE" \
  | gzip -6 \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$BACKUP_PASSPHRASE_FILE" \
  > "$tmp"

# pipefail already failed the script on a dump error; this guards against an empty or truncated file.
size=$(stat -c %s "$tmp")
[ "$size" -gt 1024 ] || { log "dump is only $size bytes, discarding"; exit 1; }

# Prove the file decrypts and is a complete gzip stream before trusting it.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$BACKUP_PASSPHRASE_FILE" < "$tmp" | gzip -t
mv "$tmp" "$final"
trap - EXIT
sha256sum "$final" | awk '{print $1}' > "$final.sha256"
log "wrote $final ($size bytes)"

if [ "$BACKUP_UPLOAD" = "1" ]; then
  : "${R2_ENDPOINT:?set R2_ENDPOINT (https://<account>.r2.cloudflarestorage.com)}"
  : "${R2_BUCKET:?set R2_BUCKET}"
  : "${AWS_ACCESS_KEY_ID:?set AWS_ACCESS_KEY_ID (R2 key)}"
  : "${AWS_SECRET_ACCESS_KEY:?set AWS_SECRET_ACCESS_KEY (R2 secret)}"
  export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION=auto
  prefix="${R2_BACKUP_PREFIX:-db-backups}"
  log "uploading to s3://$R2_BUCKET/$prefix/"
  aws s3 cp --endpoint-url "$R2_ENDPOINT" --only-show-errors "$final" "s3://$R2_BUCKET/$prefix/$(basename "$final")"
  aws s3 cp --endpoint-url "$R2_ENDPOINT" --only-show-errors "$final.sha256" "s3://$R2_BUCKET/$prefix/$(basename "$final").sha256"
  # Retention of the remote copies is a bucket lifecycle rule (docs/BACKUP-RESTORE.md), not this script.
fi

# Local retention
find "$BACKUP_DIR" -maxdepth 1 -name "${MYSQL_DATABASE}-*.sql.gz.enc*" -mtime +"$BACKUP_KEEP_LOCAL_DAYS" -delete

write_metric
log "done"
