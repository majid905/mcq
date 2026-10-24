import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';
import { repoRoot } from '../common/repo-root';

export function openapiPath(override?: string): string {
  const file = override ?? join(repoRoot(), 'packages', 'api-contract', 'openapi.yaml');
  if (!existsSync(file)) throw new Error(`OpenAPI contract not found at ${file}`);
  return file;
}

export function loadSpec(override?: string): swaggerUi.JsonObject {
  return parse(readFileSync(openapiPath(override), 'utf8')) as swaggerUi.JsonObject;
}

/** Serves Swagger UI at /docs and the raw contract at /openapi.json, straight from openapi.yaml. */
export function mountDocs(app: INestApplication, override?: string): void {
  const spec = loadSpec(override);
  const http = app.getHttpAdapter().getInstance() as import('express').Express;
  http.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'MCQ API' }));
  http.get('/openapi.json', (_req, res) => {
    res.json(spec);
  });
}
