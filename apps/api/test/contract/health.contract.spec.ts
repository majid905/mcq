import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, expectContract } from './harness';

describe('contract: platform behaviour', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/health matches the contract and reports dependencies up', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ok', checks: { database: 'up', redis: 'up' } });
    expectContract(res);
  });

  it('sets X-Request-Id and X-Server-Time, and reuses a client UUID', async () => {
    const id = '3f2b8c1e-9d4a-4b7e-8a61-2c5d7e9f0a11';
    const res = await request(app.getHttpServer()).get('/v1/health').set('X-Request-Id', id);
    expect(res.headers['x-request-id']).toBe(id);
    expect(new Date(res.headers['x-server-time'] as string).toISOString()).toBe(
      res.headers['x-server-time'],
    );

    const generated = await request(app.getHttpServer())
      .get('/v1/health')
      .set('X-Request-Id', 'not-a-uuid');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('unknown route returns the error envelope, localized by Accept-Language', async () => {
    const bn = await request(app.getHttpServer()).get('/v1/does-not-exist');
    expect(bn.status).toBe(404);
    expect(bn.body.error).toEqual({ code: 'NOT_FOUND', message: 'খুঁজে পাওয়া যায়নি' });

    const en = await request(app.getHttpServer())
      .get('/v1/does-not-exist')
      .set('Accept-Language', 'en');
    expect(en.body.error).toEqual({ code: 'NOT_FOUND', message: 'Not found' });
  });

  it('serves Swagger UI at /docs and the contract at /openapi.json', async () => {
    const docs = await request(app.getHttpServer()).get('/docs/').redirects(1);
    expect(docs.status).toBe(200);
    expect(docs.text).toContain('swagger-ui');

    const spec = await request(app.getHttpServer()).get('/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');
    expect(spec.body.paths['/health']).toBeDefined();
  });
});
