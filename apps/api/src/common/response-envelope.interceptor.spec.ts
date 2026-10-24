import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { Page } from './page';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

function run(body: unknown, statusCode = 200) {
  const ctx = {
    switchToHttp: () => ({ getResponse: () => ({ statusCode }) }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of(body) };
  return lastValueFrom(new ResponseEnvelopeInterceptor().intercept(ctx, next));
}

describe('ResponseEnvelopeInterceptor', () => {
  it('wraps a body as { data }', async () => {
    await expect(run({ a: 1 })).resolves.toEqual({ data: { a: 1 } });
    await expect(run([1, 2])).resolves.toEqual({ data: [1, 2] });
    await expect(run(false)).resolves.toEqual({ data: false });
  });

  it('turns a Page into { data, meta }', async () => {
    const page = new Page(['x'], { next_cursor: '9', has_more: true });
    await expect(run(page)).resolves.toEqual({
      data: ['x'],
      meta: { next_cursor: '9', has_more: true },
    });
  });

  it('leaves 204 and empty responses alone', async () => {
    await expect(run(undefined, 204)).resolves.toBeUndefined();
    await expect(run('ignored', 204)).resolves.toBe('ignored');
  });
});
