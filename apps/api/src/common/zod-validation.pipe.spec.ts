import { z } from 'zod';
import { ApiException } from './api-exception';
import { ZodValidationPipe } from './zod-validation.pipe';

const pipe = new ZodValidationPipe(
  z.object({ phone: z.string().regex(/^01[3-9][0-9]{8}$/), age: z.number().int() }),
);

describe('ZodValidationPipe', () => {
  it('returns parsed data', () => {
    expect(pipe.transform({ phone: '01712345678', age: 20 })).toEqual({
      phone: '01712345678',
      age: 20,
    });
  });

  it('throws VALIDATION_FAILED with per-field details', () => {
    try {
      pipe.transform({ phone: '123', age: 'x' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiException);
      const ex = e as ApiException;
      expect(ex.code).toBe('VALIDATION_FAILED');
      expect(Object.keys((ex.details as { fields: object }).fields).sort()).toEqual([
        'age',
        'phone',
      ]);
    }
  });
});
