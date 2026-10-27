# Backups and restore

What is backed up, how often, where it goes, and how to prove it works. Scripts: `deploy/backup/`.

## What matters

| Data | Where | Lost if the server dies | Backed up by |
| --- | --- | --- | --- |
| Users, questions, exams, attempts, payments, settings | MySQL | everything | `backup-mysql.sh` (nightly) |
| Live-exam answers in progress, leaderboards, queues | Redis (AOF) | answers of exams running right then; leaderboards are rebuilt from MySQL | not backed up on purpose (AOF `everysec` survives a restart; a dead disk loses at most the running exam) |
| Question images, banners, import files | R2 | n/a (R2 is the store) | R2 versioning/lifecycle, see below |
| Search index | Meilisearch | search only | rebuilt: `pnpm --filter @mcq/api search:reindex` |
| Secrets (`.env`, backup passphrase) | server | the ability to read backups | copy in the password manager, **not** in git |

## Targets

* **RPO** (data you can lose): 24 hours with the nightly dump. To get under that, enable the binary log and ship it (section "Point-in-time recovery"). Do that before the first paid launch.
* **RTO** (time to be back): measure it with the drill. Local measurement on 2026-10-27: a 30 MB database (2,000 questions, 190 users) restored in **39 s** including starting a fresh MySQL container. Re-measure on the real data size; a 5 lakh question bank will take minutes, not seconds.

## Nightly logical backup

`backup-mysql.sh` runs `mysqldump --single-transaction` inside the MySQL container (consistent snapshot, writers are not blocked), compresses, **encrypts with AES-256** (`openssl enc -pbkdf2`, passphrase file), verifies the result decrypts to a valid gzip stream, writes a SHA-256 next to it, uploads both to an R2 bucket, and deletes local copies older than 7 days. It refuses to start with less than 1.5 GB free (the production disk is shared).

Set up once on the server:

```bash
sudo -u mcq install -d -m 700 /srv/mcq/backups
head -c 48 /dev/urandom | base64 | sudo -u mcq tee /srv/mcq/backup.pass >/dev/null && sudo chmod 600 /srv/mcq/backup.pass
sudo cat /srv/mcq/backup.pass        # copy into the password manager NOW
sudo -u mcq cp /srv/mcq/app/deploy/backup/backup.env.example /srv/mcq/backup.env   # fill in R2 values, chmod 600
sudo apt-get install -y awscli       # the R2 upload uses the S3-compatible API
# nightly at 02:17 Dhaka+6 -> pick a quiet hour; never during a live exam
sudo -u mcq crontab -l 2>/dev/null | { cat; echo '17 20 * * *  /srv/mcq/app/deploy/backup/backup-mysql.sh >> /srv/mcq/backup.log 2>&1'; } | sudo -u mcq crontab -
```

The `mcq` user needs permission to run `docker exec` for this (the deploy user deliberately has none): either put the cron job in root's crontab, or add `mcq` to the `docker` group for this job only. R2 key: create a bucket `mcq-backups`, an API token limited to that bucket, and add a lifecycle rule "delete objects older than 35 days". Keep the bucket private and separate from the image bucket.

Alert: set `METRICS_TEXTFILE_DIR` to node_exporter's textfile directory and the `BackupStale` rule fires when no backup succeeded for 36 hours. Without node_exporter, look at `/srv/mcq/backup.log` weekly.

## Restore drill (monthly, and before every big exam)

```bash
deploy/backup/restore-drill.sh latest        # newest local backup
deploy/backup/restore-drill.sh r2-latest     # newest backup in R2: this is the real test, it proves the offsite copy works
```

It starts a throwaway MySQL on `127.0.0.1:3399`, loads the backup, checks that **every table of `database/schema.sql` exists**, prints row counts, newest user and the number of questions with Bangla text (catches an encoding mix-up), prints the elapsed time and removes the container. It never touches the live database. A backup that was never restored is not a backup: write the date and time in the table below after each run.

| Date | Source | Size | Restore time | Result |
| --- | --- | --- | --- | --- |
| 2026-10-27 | local dump of a dev database | 1.1 MB encrypted | 39 s | OK (32 tables, Bangla text intact) |

## Restoring for real (disaster)

1. Stop writers: `sudo systemctl stop mcq-api mcq-worker mcq-scheduler` (and put the status page up if you have one).
2. Get the backup: `aws s3 cp --endpoint-url $R2_ENDPOINT s3://mcq-backups/db-backups/<file> .` plus its `.sha256`; check `sha256sum -c`.
3. Restore into an **empty** database (never over a half-broken one): new volume or `DROP DATABASE mcq; CREATE DATABASE mcq CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:/srv/mcq/backup.pass < db.sql.gz.enc | gunzip \
     | docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mcq-prod-mysql-1 mysql -uroot --default-character-set=utf8mb4 mcq
   ```
4. Start the API, check `GET /v1/health`, reindex search (`search:reindex`), then start worker and scheduler.
5. Redis starts empty or from its AOF. Running attempts that were only in Redis are gone; finished ones are in MySQL. Tell students if an exam was running.
6. Write a short post-mortem: when it broke, what was lost (RPO actually achieved), how long it took (RTO).

## Point-in-time recovery (needed to get RPO under 24 h)

The shared staging box runs MySQL with `--skip-log-bin` to save disk, so only the nightly dump exists there. On the production database host (spec: dedicated server B, NVMe) do the following instead. **These steps are documented but not yet run by us**; rehearse them on staging before relying on them.

1. Enable binary logging in the MySQL command/config: `--log-bin=/var/lib/mysql/binlog --binlog-expire-logs-seconds=1209600 --sync-binlog=1 --binlog-format=ROW`.
2. Hot physical backup with Percona XtraBackup (faster to restore than a dump for hundreds of GB):
   ```bash
   xtrabackup --backup --target-dir=/backup/full-$(date +%F) --user=backup --password-file=...   # weekly, plus incrementals daily
   xtrabackup --prepare --target-dir=/backup/full-YYYY-MM-DD                                       # before restoring
   ```
3. Ship the binlogs off the box every few minutes: `mysqlbinlog --read-from-remote-server --raw --stop-never` or a cron `aws s3 sync /var/lib/mysql/binlog.* s3://mcq-backups/binlog/`.
4. To restore to a moment: restore the last full backup, then replay: `mysqlbinlog --stop-datetime="2026-11-01 14:35:00" binlog.0001* | mysql`.

With this, RPO is the shipping interval (minutes).

## Account deletion and backups

Accounts closed more than 30 days ago are anonymised in the live database by the scheduler. Backups taken before that still contain the personal data until they expire (35 days in R2). That is within the 30-day-plus-retention window we describe in the privacy policy; do not restore an old backup into production without re-running the anonymisation job (it is idempotent and runs hourly).
