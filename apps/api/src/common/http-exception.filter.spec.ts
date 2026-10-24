import { type ArgumentsHost, Logger, NotFoundException } from '@nestjs/common';
import { ApiException } from './api-exception';
import { HttpExceptionFilter, pickLocale } from './http-exception.filter';

function run(exception: unknown, acceptLanguage?: string) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { 'accept-language': acceptLanguage },
        method: 'GET',
        originalUrl: '/x',
      }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return { status: status.mock.calls[0]?.[0] as number, body: json.mock.calls[0]?.[0] as unknown };
}

describe('HttpExceptionFilter', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('renders ApiException with status from the code table, details and Bangla message', () => {
    const { status, body } = run(
      new ApiException('EXAM_NOT_STARTED', { starts_at: '2026-11-01T14:00:00.000Z' }),
    );
    expect(status).toBe(425);
    expect(body).toEqual({
      error: {
        code: 'EXAM_NOT_STARTED',
        message: 'পরীক্ষা এখনো শুরু হয়নি',
        details: { starts_at: '2026-11-01T14:00:00.000Z' },
      },
    });
  });

  it('localizes to English and honours a custom message', () => {
    expect(run(new ApiException('RATE_LIMITED'), 'en-US,en;q=0.9').body).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests, try again shortly' },
    });
    expect(run(new ApiException('COUPON_INVALID', undefined, 'custom')).body).toEqual({
      error: { code: 'COUPON_INVALID', message: 'custom' },
    });
  });

  it('maps Nest HttpException by status', () => {
    const { status, body } = run(new NotFoundException());
    expect(status).toBe(404);
    expect(body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('maps http-errors from body parsers (malformed JSON) to 400 VALIDATION_FAILED', () => {
    const { status, body } = run(Object.assign(new SyntaxError('bad json'), { status: 400 }));
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('hides internals of unknown errors behind 500 INTERNAL_ERROR', () => {
    const { status, body } = run(new Error('db password is hunter2'));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(body).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });

  it('defaults to bn', () => {
    expect(pickLocale(undefined)).toBe('bn');
    expect(pickLocale('bn')).toBe('bn');
    expect(pickLocale('en')).toBe('en');
  });
});
