import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ApiException } from './api-exception';

/** `@Body(new ZodValidationPipe(schema))`. Failures become 400 VALIDATION_FAILED with `details.fields`. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      fields[issue.path.join('.') || '_'] ??= issue.message;
    }
    throw new ApiException('VALIDATION_FAILED', { fields });
  }
}
