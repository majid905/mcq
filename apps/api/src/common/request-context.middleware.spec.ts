import type { Request, Response } from 'express';
import { requestContext, type RequestWithId } from './request-context.middleware';

function run(headers: Record<string, string> = {}) {
  const set: Record<string, string> = {};
  const req = { headers } as unknown as Request;
  const res = { setHeader: (k: string, v: string) => (set[k] = v) } as unknown as Response;
  const next = jest.fn();
  requestContext(req, res, next);
  return { req: req as RequestWithId, set, next };
}

describe('requestContext', () => {
  it('generates a UUID and server time, then continues', () => {
    const { req, set, next } = run();
    expect(req.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(set['X-Request-Id']).toBe(req.id);
    expect(new Date(set['X-Server-Time'] as string).getTime()).not.toBeNaN();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reuses a valid client UUID and ignores junk', () => {
    const id = '3f2b8c1e-9d4a-4b7e-8a61-2c5d7e9f0a11';
    expect(run({ 'x-request-id': id }).req.id).toBe(id);
    expect(run({ 'x-request-id': 'abc<script>' }).req.id).not.toBe('abc<script>');
  });
});
