import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiException } from './api-exception';
import { ERROR_MESSAGES, ERROR_STATUS, type ErrorCode, type Locale } from './error-codes';

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> };
}

export function pickLocale(header: string | undefined): Locale {
  return header?.trim().toLowerCase().startsWith('en') ? 'en' : 'bn';
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 429:
      return 'RATE_LIMITED';
    case 503:
      return 'MAINTENANCE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED';
  }
}

/** Turns anything thrown into the error envelope. Unknown errors become 500 INTERNAL_ERROR. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const locale = pickLocale(req.headers['accept-language']);

    let status = 500;
    let code: ErrorCode = 'INTERNAL_ERROR';
    let details: Record<string, unknown> | undefined;
    let message: string | undefined;

    if (exception instanceof ApiException) {
      status = ERROR_STATUS[exception.code];
      code = exception.code;
      details = exception.details;
      message = exception.customMessage;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = codeForStatus(status);
    } else if (isHttpError(exception)) {
      // body-parser and friends (malformed JSON, payload too large)
      status = exception.status;
      code = codeForStatus(status);
    }

    if (status >= 500) {
      this.logger.error(
        { err: exception, requestId: (req as Request & { id?: string }).id },
        `${req.method} ${req.originalUrl} failed`,
      );
    }

    const body: ErrorBody = {
      error: {
        code,
        message: message ?? ERROR_MESSAGES[code][locale],
        ...(details ? { details } : {}),
      },
    };
    res.status(status).json(body);
  }
}

function isHttpError(e: unknown): e is { status: number } {
  return (
    typeof e === 'object' &&
    e !== null &&
    'status' in e &&
    typeof (e as { status: unknown }).status === 'number' &&
    (e as { status: number }).status >= 400 &&
    (e as { status: number }).status < 600
  );
}
