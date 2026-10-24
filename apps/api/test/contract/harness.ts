import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { openapiPath } from '../../src/docs/mount-docs';
import { ContractValidator } from './openapi-validator';

let validator: ContractValidator | undefined;

/** The real app with the same pipeline as main.ts. Call app.close() in afterAll. */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export function getValidator(): ContractValidator {
  validator ??= new ContractValidator(openapiPath());
  return validator;
}

/**
 * Fails the test when the response (status + body) does not match openapi.yaml.
 * Usage: `expectContract(await request(app.getHttpServer()).get('/v1/health'))`.
 */
export function expectContract(res: Response): void {
  // superagent keeps the outgoing request on `res.req`, but @types/supertest does not declare it.
  const { method, path } = (res as unknown as { req: { method: string; path: string } }).req;
  const result = getValidator().validate(method, path, res.status, res.body);
  if (!result.ok) {
    throw new Error(
      `Contract violation: ${result.operation}\n  ${result.errors.join('\n  ')}\n  body: ${JSON.stringify(res.body)}`,
    );
  }
}
