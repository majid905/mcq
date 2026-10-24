import { HttpException } from '@nestjs/common';
import { ERROR_STATUS, type ErrorCode } from './error-codes';

/**
 * Throw this from services/controllers. The filter renders it as
 * `{ "error": { "code", "message", "details" } }` with the status from docs/04-API.md.
 */
export class ApiException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
    readonly customMessage?: string,
  ) {
    super(code, ERROR_STATUS[code]);
  }
}
