import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { RedisService } from '../../src/redis/redis.service';
import { SUBMIT_STREAM } from '../../src/attempts/attempt-state';
import { createTestApp } from './harness';
import { randomPhone, registerUser } from './helpers';

describe('metrics: GET /metrics', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    await app.get(RateLimitService).reset('');
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves Prometheus text outside /v1, unwrapped, with request timings by route template', async () => {
    const user = await registerUser(app, randomPhone());
    await http()
      .get(`/v1/exams/${user.user.id}`)
      .set('Authorization', `Bearer ${user.access_token}`);
    await http().get('/v1/health');

    const res = await http().get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# TYPE mcq_http_request_duration_seconds histogram');
    // the template, never the concrete id
    expect(res.text).toMatch(/route="\/v1\/exams\/:id"/);
    expect(res.text).not.toContain(`/v1/exams/${user.user.id}"`);
    expect(res.text).toMatch(/route="\/v1\/health"/);
    expect(res.text).toContain('mcq_process_cpu_seconds_total');
    expect(res.text).toMatch(/mcq_database_up 1/);
    expect(res.text).toMatch(/mcq_redis_up 1/);
    expect((await http().get('/v1/metrics')).status).toBe(404);
  });

  it('reports queue backlog and the age of the oldest entry per queue', async () => {
    const redis = app.get(RedisService);
    const text = async () => (await http().get('/metrics')).text;
    const value = (body: string, name: string, queue: string) =>
      Number(new RegExp(`${name}\\{queue="${queue}"\\} ([0-9.e+-]+)`).exec(body)?.[1]);

    // nothing waiting: a fresh stream has no backlog
    await redis.client.del(SUBMIT_STREAM);
    const idle = await text();
    expect(value(idle, 'mcq_queue_backlog', 'submit')).toBe(0);
    expect(value(idle, 'mcq_queue_oldest_age_seconds', 'submit')).toBe(0);

    // an entry nobody consumed for 5 s shows up as backlog and age
    const at = Date.now() - 5000;
    await redis.client.xadd(SUBMIT_STREAM, `${at}-0`, 'attempt_id', '0');
    const busy = await text();
    expect(value(busy, 'mcq_queue_oldest_age_seconds', 'submit')).toBeGreaterThanOrEqual(5);
    await redis.client.del(SUBMIT_STREAM);
  });

  it('asks for the bearer token when METRICS_TOKEN is set', async () => {
    process.env['METRICS_TOKEN'] = 'prometheus-scrape-token';
    const guarded = await createTestApp();
    try {
      const api = () => request(guarded.getHttpServer());
      expect((await api().get('/metrics')).status).toBe(401);
      expect(
        (await api().get('/metrics').set('Authorization', 'Bearer wrong-token-value-1')).status,
      ).toBe(401);
      const ok = await api().get('/metrics').set('Authorization', 'Bearer prometheus-scrape-token');
      expect(ok.status).toBe(200);
    } finally {
      await guarded.close();
      delete process.env['METRICS_TOKEN'];
    }
  });
});
