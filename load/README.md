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

## Results so far (2026-10-27, one laptop)

Single API process, single worker, MySQL and Redis in Docker, k6 in Docker, all on one Windows
machine (so the numbers are pessimistic for the API: it shares the CPU with the load generator).
Exam 2 of the seed, 30 questions, 1 ranked attempt per student.

| Students | Arrival | start p95 | answer sync p95 | submit 202 p95 | result wait p95 | failed requests |
| --- | --- | --- | --- | --- | --- | --- |
| 1,000 | 30 s | 546 ms | 184 ms | 175 ms | 5 s | 0 % |
| 3,000 | 120 s | 137 ms | 42 ms | 41 ms | 3.1 s | 0.06 % |
| 3,000 | 30 s | not valid | not valid | not valid | not valid | connection refused |

All thresholds pass for the first two rows. The 3,000-in-30-seconds run (100 new connections per
second) fails before the request reaches the API: Docker Desktop's Windows port relay refuses
connections ("connect: connection refused", API log clean, API process about 80 % idle in a CPU
profile). That says nothing about the API. A 10,000-user run needs a Linux load generator on
another machine; see "Scaling the test" below.

An earlier pair of runs looked much slower (start p95 3.7 s). They ran while a PowerShell CPU sampler
and a `docker pull` were competing for the same laptop; do not run anything else during a test.

### Profiling the API under load

```bash
PROFILE_CPU_SECS=170 node dist/main.js        # writes cpu-<pid>.cpuprofile after 170 s
node load/profile-top.mjs cpu-1234.cpuprofile # top self-time functions
```

At 1,000 students the profile was 80 % idle; the busiest entries were Prisma result parsing and
response serialisation, nothing pathological.

### Scaling the test

* Run k6 from a separate Linux machine (or k6 Cloud), not on the box under test.
* Point it at a staging stack that matches production (nginx in front, 2 API + 2 worker containers).
* Raise file limits on the load generator (`ulimit -n 65536`) and use several k6 instances for
  more than about 5,000 VUs.
* Watch `queue_backlog` in `GET /admin/exams/{id}/monitor` while it runs: the scoring consumer must
  keep up (result wait p95 under 60 s).
