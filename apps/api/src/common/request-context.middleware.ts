import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RequestWithId = Request & { id: string };

/**
 * Reuses the client's X-Request-Id when it is a UUID, otherwise generates one.
 * Echoes it back and adds X-Server-Time (docs/04-API.md section 1) to every response, errors included.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && UUID.test(incoming) ? incoming : randomUUID();
  (req as RequestWithId).id = id;
  res.setHeader('X-Request-Id', id);
  res.setHeader('X-Server-Time', new Date().toISOString());
  next();
}
