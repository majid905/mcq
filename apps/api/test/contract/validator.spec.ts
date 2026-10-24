import { getValidator } from './harness';

// Self-test of the harness: it must reject bad responses, or the contract tests prove nothing.
describe('ContractValidator', () => {
  const v = getValidator();
  const ok = {
    data: {
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
      server_time: '2026-10-24T05:30:00.000Z',
    },
  };

  it('accepts a valid body, with or without the /v1 prefix and query', () => {
    expect(v.validate('GET', '/v1/health', 200, ok).ok).toBe(true);
    expect(v.validate('GET', '/health?x=1', 200, ok).ok).toBe(true);
  });

  it('rejects a wrong enum value', () => {
    const bad = { data: { ...ok.data, status: 'fine' } };
    const r = v.validate('GET', '/v1/health', 200, bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain('/data/status');
  });

  it('rejects a missing envelope', () => {
    expect(v.validate('GET', '/v1/health', 200, ok.data).ok).toBe(false);
  });

  it('rejects an undocumented path and an undocumented status', () => {
    expect(v.validate('GET', '/v1/nope', 200, {}).ok).toBe(false);
    expect(v.validate('GET', '/v1/health', 418, {}).ok).toBe(false);
  });

  it('matches path templates and shared $ref responses', () => {
    const err = { error: { code: 'NOT_FOUND', message: 'x' } };
    expect(v.validate('GET', '/v1/exams/5003/leaderboard', 200, { data: {} }).errors).toEqual([]);
    expect(v.validate('PUT', '/v1/exams/5003/reminder', 409, err).ok).toBe(false); // 409 not documented
    expect(v.validate('POST', '/v1/auth/otp/request', 429, err).ok).toBe(true);
    expect(v.validate('POST', '/v1/auth/otp/request', 429, { nope: 1 }).ok).toBe(false);
  });
});
