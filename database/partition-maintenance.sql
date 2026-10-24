-- Run by the scheduler job `partitions:ensure` (daily). Keeps 3 future monthly
-- partitions on `attempts`. The API builds this statement dynamically; example
-- for adding April 2027 when pmax is the catch-all:

ALTER TABLE attempts REORGANIZE PARTITION pmax INTO (
  PARTITION p2027_04 VALUES LESS THAN ('2027-05-01'),
  PARTITION pmax     VALUES LESS THAN (MAXVALUE)
);

-- List partitions and row counts:
SELECT PARTITION_NAME, TABLE_ROWS, DATA_LENGTH/1024/1024 AS data_mb
FROM information_schema.PARTITIONS
WHERE TABLE_SCHEMA = 'mcq' AND TABLE_NAME = 'attempts'
ORDER BY PARTITION_ORDINAL_POSITION;

-- Archive (after 24 months): export the partition, then drop it.
--   mysqldump mcq attempts --where="started_at < '2025-01-01'" > attempts_2024.sql
-- ALTER TABLE attempts DROP PARTITION p2024_12;
