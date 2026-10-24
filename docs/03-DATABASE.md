# 03 — Database (MySQL 8.4)

`database/schema.sql` is the source of truth. Prisma reads it with `prisma db pull`; do not let Prisma migrations redesign tables. Schema changes = new SQL file in `database/migrations/NNNN_name.sql` + update `schema.sql` + `prisma db pull`.

## 1. Entity map

```
users ─┬─< user_devices ─< refresh_tokens
       ├─< attempts (partitioned, no FK)      >─ exams ─< exam_questions >─ questions
       ├─< user_topic_stats / user_daily_stats / user_streaks
       ├─< bookmarks >─ questions              questions ─< question_tags >─ taxonomy_nodes (tree)
       ├─< user_wrong_questions                questions >─ source_exams >─ taxonomy_nodes
       ├─< question_reports >─ questions
       ├─< payments ─── subscriptions          payments >─ packages, coupons
       └─< notifications, exam_reminders
admins >─ roles ; audit_logs ; import_jobs ; app_settings ; banners ; search_outbox
```

## 2. Key design decisions

| Decision | Reason |
| --- | --- |
| One `taxonomy_nodes` tree (category→subject→chapter→topic) with materialized `path` | Flexible depth; subtree queries via `path LIKE '/1/12/%'` use the index |
| `questions.options` as JSON array of `{key, html}` | Fixed small set; one row read gives the whole question |
| `content_hash` UNIQUE | Blocks exact duplicates during 5 lakh bulk import |
| `attempts.answers` as JSON `{question_id: option}` in ONE row | 1 row per attempt instead of 100 rows → ~1.5 crore rows/year instead of 150 crore |
| `attempts` partitioned monthly on `started_at` | Fast pruning by date, cheap archiving (drop partition) |
| No FKs on `attempts` | MySQL forbids FKs on partitioned tables; integrity in code |
| Aggregates (`user_topic_stats`, `user_daily_stats`, `question.times_*`) | Analytics read in O(1); written by workers after scoring |
| `search_outbox` | Reliable sync to Meilisearch without dual-write bugs |
| IDs BIGINT, exposed as strings | Safe in JS/Dart |
| UTC `DATETIME(3)` | Millisecond ordering for submissions and tie-breaks |

## 3. Index rationale (top queries)

| Query | Index used |
| --- | --- |
| Login by phone | `uq_users_phone` |
| Practice pool: published questions for topic | `question_tags.ix_qt_node` + `questions.ix_q_status_node` (pool cached in Redis) |
| Exam list by category & status | `exams.ix_exam_list` |
| User's attempt history | `attempts.ix_att_user (user_id, started_at)` |
| Merit list fallback (Redis lost) | `attempts.ix_att_exam_score` |
| Has user attempted this exam | `attempts.ix_att_exam_user` |
| Weak topics | `user_topic_stats` PK range on user_id, filter in app |
| Admin question grid | `ix_q_status_node`, `ix_q_updated`, Meilisearch for text |

## 4. Size planning

| Table | Year-1 rows | Approx size |
| --- | --- | --- |
| questions (+tags) | 5 lakh (+15 lakh tags) | 1.5–2.5 GB |
| users | 50,000 | < 100 MB |
| attempts | ~1.5 crore | 15–25 GB |
| user_topic_stats | ≤ 2.5 crore (50k × ≤ 500) | 2–3 GB |
| user_daily_stats | ~50 lakh | < 500 MB |

Estimates for planning, not measured.

## 5. MySQL server config (16 GB DB server)

```ini
[mysqld]
character-set-server = utf8mb4
collation-server     = utf8mb4_unicode_ci
default-time-zone    = '+00:00'
innodb_buffer_pool_size = 10G
innodb_log_file_size    = 1G          # or innodb_redo_log_capacity = 2G
innodb_flush_log_at_trx_commit = 1
innodb_flush_method  = O_DIRECT
max_connections      = 400
slow_query_log       = ON
long_query_time      = 0.5
binlog_expire_logs_seconds = 604800
sql_mode = STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO
```

## 6. Rules for application code

1. Never `SELECT *` on `questions` in lists; pick columns. Never send `correct_option`/`explanation` before allowed.
2. Cursor pagination: `WHERE id < :cursor ORDER BY id DESC LIMIT :n`.
3. Bulk writes in batches of 500–1,000 rows (`INSERT … ON DUPLICATE KEY UPDATE`).
4. Random selection uses Redis pools, never `ORDER BY RAND()`.
5. Transactions only around money (payments → subscriptions) and multi-row admin edits.
6. Every query on `attempts` must include `user_id` or `exam_id`; date-bounded queries include `started_at` for partition pruning.
7. Before inserting a live attempt: `SETNX att:lock:{exam}:{user}` then check `ix_att_exam_user`.

## 7. Seeding
`database/seed/` (Phase 0 task): 64 districts, taxonomy for BCS/Bank/Primary/NTRCA/Admission with subjects, 2,000 sample questions (generated placeholders in Bangla), 3 packages, 1 super admin (`admin@example.com` / from `.env`), 5 exams (past, running, upcoming).
