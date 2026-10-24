# @mcq/database

`schema.sql` is the source of truth for the DB. This package resets and seeds it.

**Owner:** Dev A (Majid, @majid905)

```bash
cp .env.example .env     # once
pnpm infra:up            # docker compose: mysql 8.4, redis 7 (AOF), meilisearch
pnpm db:reset            # drop DB, apply schema.sql, seed
pnpm --filter @mcq/database run seed   # seed only (fails if already seeded)
```

`pnpm db:reset` refuses to run when `NODE_ENV=production` or the host is not local, unless `--force` is passed. The database name must be `mcq` because `schema.sql` is bound to it.

## What is seeded

| Data     | Detail                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| Districts | 64, bn + en, Dhaka = id 1                                                                                     |
| Taxonomy | 5 categories (BCS=1, Bank, Primary, NTRCA, Admission) > 25 subjects > chapters > 108 topics                    |
| Questions | 2,000 published Bangla MCQs spread evenly over topics: generated math, ~60 real facts, rest numbered placeholders |
| Other    | 10 source exams, 3 packages, 2 banners, super admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (Argon2id) |
| Exams    | 5 live exams with 30-question papers: 1 finished, 1 running, 3 upcoming (times are relative to seed time)      |

Seed is deterministic (fixed PRNG seed); exam times are relative to when you run it.

When `apps/api/prisma` exists, `db:reset` also runs `prisma db pull` and `prisma generate`.
