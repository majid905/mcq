// k6 smoke/load test for the live-exam critical path (docs/02 section 4):
//   list -> detail -> start -> answer sync (x2) -> submit -> poll result
// One ranked attempt per user, so each VU is a different student (load/seed-users.mjs).
//
//   node load/seed-users.mjs 100
//   k6 run -e BASE_URL=http://localhost:3000/v1 load/live-exam.js
//   k6 run -e VUS=1000 -e RAMP=60 -e BASE_URL=https://... load/live-exam.js     # bigger run
//
// The exam must be running and free (the seed's "bank-live-test-05" is). Start the worker too
// (`pnpm --filter @mcq/api start:worker`), or results never leave 202 and the result check fails
// on purpose.
import { check, fail, sleep } from 'k6';
import http from 'k6/http';
import { SharedArray } from 'k6/data';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3000/v1';
const VUS = Number(__ENV.VUS || 100);
const RAMP = Number(__ENV.RAMP || 20); // seconds over which the students arrive (start burst)

const tokens = new SharedArray('tokens', () => JSON.parse(open('./tokens.json')));

const startMs = new Trend('exam_start_ms', true);
const syncMs = new Trend('answer_sync_ms', true);
const submitMs = new Trend('submit_ms', true);
const resultWaitS = new Trend('result_wait_s');
const unscored = new Counter('results_not_ready');

export const options = {
  scenarios: {
    live_exam: { executor: 'per-vu-iterations', vus: VUS, iterations: 1, maxDuration: '10m' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    exam_start_ms: ['p(95)<800'],
    answer_sync_ms: ['p(95)<300'],
    // docs/02: the 202 must come back fast. The 50 ms goal is server-side; allow network on top.
    submit_ms: ['p(95)<200'],
    result_wait_s: ['p(95)<60'], // FR-RES-01: result within 60 s of submitting
    results_not_ready: ['count==0'],
  },
};

export function setup() {
  if (tokens.length < VUS) fail(`need ${VUS} tokens, load/tokens.json has ${tokens.length}`);
  const auth = { headers: { Authorization: `Bearer ${tokens[0]}` } };
  const res = http.get(`${BASE}/exams?status=running&type=live&limit=5`, auth);
  const exams = res.json('data') || [];
  const exam = exams.find((e) => !e.is_premium && !e.my_attempt);
  if (!exam) fail('no free running live exam without an attempt; run db:reset or create one');
  return { examId: exam.id };
}

const headers = (token) => ({
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Platform': 'web',
  },
});

export default function (data) {
  const h = headers(tokens[(__VU - 1) % tokens.length]);
  sleep((__VU / VUS) * RAMP); // spread arrivals over RAMP seconds

  http.get(`${BASE}/exams?status=running`, h);
  http.get(`${BASE}/exams/${data.examId}`, h);

  const start = http.post(`${BASE}/exams/${data.examId}/start`, JSON.stringify({}), h);
  startMs.add(start.timings.duration);
  if (!check(start, { 'start 201': (r) => r.status === 201 })) return;
  const attempt = start.json('data');
  const questions = (attempt.paper && attempt.paper.questions) || [];

  // The student answers about two thirds of the questions, picking options at random.
  const pick = () => {
    const answers = {};
    for (const q of questions) {
      if (Math.random() < 0.67) {
        answers[q.id] = q.options[Math.floor(Math.random() * q.options.length)].key;
      }
    }
    return answers;
  };

  for (let i = 0; i < 2; i++) {
    sleep(2 + Math.random() * 3);
    const url = `${BASE}/attempts/${attempt.attempt_id}/answers`;
    const sync = http.put(url, JSON.stringify({ answers: pick() }), h);
    syncMs.add(sync.timings.duration);
    check(sync, { 'sync 200': (r) => r.status === 200 });
  }

  sleep(2 + Math.random() * 3);
  const submit = http.post(
    `${BASE}/attempts/${attempt.attempt_id}/submit`,
    JSON.stringify({ answers: pick(), focus_loss_count: 0 }),
    h,
  );
  submitMs.add(submit.timings.duration);
  check(submit, { 'submit 202': (r) => r.status === 202 });

  // Poll like the client: every 3 s, give up after about a minute.
  const t0 = Date.now();
  for (let i = 0; i < 20; i++) {
    const r = http.get(`${BASE}/attempts/${attempt.attempt_id}/result`, h);
    if (r.status === 200) {
      resultWaitS.add((Date.now() - t0) / 1000);
      check(r, { 'result has score': (x) => typeof x.json('data.score') === 'number' });
      return;
    }
    sleep(3);
  }
  unscored.add(1);
}
