# Load tests (k6)

Owner: Dev A. `live-exam.js` replays the live-exam critical path (list, detail, start, two answer
syncs, submit, poll result) with one student per virtual user.

```bash
# 1. API + worker running against a seeded DB with a running free exam (pnpm db:reset gives one)
pnpm --filter @mcq/api start & pnpm --filter @mcq/api start:worker &

# 2. one token per VU (writes load/tokens.json, valid 1 hour)
node load/seed-users.mjs 100

# 3. smoke: 100 VUs arriving over 20 s
k6 run -e BASE_URL=http://localhost:3000/v1 load/live-exam.js

# bigger: 1000 students over a minute
node load/seed-users.mjs 1000
k6 run -e VUS=1000 -e RAMP=60 load/live-exam.js

# cleanup (deletes users with phone 0199xxxxxxx and their attempts)
node load/seed-users.mjs --cleanup
```

A VU can only start the exam once, so re-running needs a fresh exam or `--cleanup` first.
Thresholds (in the script) follow the spec: exam start p95 < 800 ms, submit 202 p95 < 200 ms,
result within 60 s, under 1 % failed requests.

Do not point this at a database with real users: `seed-users.mjs` writes users directly and its
`--cleanup` deletes everything in the 0199 phone range. Not for use against the staging server
at mcq.ellevix.com (shared box, 2 vCPU).
