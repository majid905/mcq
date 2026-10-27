import type { Request, Response } from 'express';
import { securityHeaders } from './security-headers';

function run(path: string, headers: Record<string, string> = {}) {
  const set: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => (set[k] = v) } as unknown as Response;
  const next = jest.fn();
  securityHeaders({ path, headers, secure: false } as unknown as Request, res, next);
  expect(next).toHaveBeenCalledTimes(1);
  return set;
}

describe('securityHeaders', () => {
  it('sets the baseline headers and a locked-down CSP on API routes', () => {
    const h = run('/v1/health');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Content-Security-Policy']).toContain("default-src 'none'");
    expect(h['Strict-Transport-Security']).toBeUndefined();
  });

  it('adds HSTS only when the request came in over https', () => {
    expect(
      run('/v1/health', { 'x-forwarded-proto': 'https' })['Strict-Transport-Security'],
    ).toContain('max-age=31536000');
  });

  it('leaves the Swagger UI without a CSP so it can render', () => {
    expect(run('/docs')['Content-Security-Policy']).toBeUndefined();
    expect(run('/docs')['X-Content-Type-Options']).toBe('nosniff');
  });
});
