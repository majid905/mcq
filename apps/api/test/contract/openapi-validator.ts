import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

interface Spec {
  paths: Record<string, Record<string, { responses?: Record<string, ResponseObject> }>>;
  components?: { responses?: Record<string, ResponseObject> };
}
interface ResponseObject {
  $ref?: string;
  content?: Record<string, { schema?: unknown }>;
}

export interface ContractResult {
  ok: boolean;
  errors: string[];
  /** e.g. "GET /health -> 200" */
  operation: string;
}

const escapePointer = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');

/**
 * Validates real HTTP responses against packages/api-contract/openapi.yaml.
 * OpenAPI 3.1 schemas are JSON Schema 2020-12, so Ajv checks them directly: the whole document is
 * registered as one schema and each response is checked through a pointer into it.
 */
export class ContractValidator {
  private readonly spec: Spec;
  private readonly ajv: Ajv2020;
  private readonly matchers: { key: string; regex: RegExp; params: number }[];

  constructor(
    specPath: string,
    private readonly prefix = '/v1',
  ) {
    this.spec = parse(readFileSync(specPath, 'utf8')) as Spec;
    this.ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(this.ajv);
    this.ajv.addSchema(this.spec, 'openapi');
    this.matchers = Object.keys(this.spec.paths)
      .map((key) => ({
        key,
        regex: new RegExp(
          `^${key.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}/?$`,
        ),
        params: (key.match(/\{/g) ?? []).length,
      }))
      .sort((a, b) => a.params - b.params);
  }

  /** `url` may include the /v1 prefix and a query string. */
  validate(method: string, url: string, status: number, body: unknown): ContractResult {
    const path = (url.split('?')[0] ?? '').replace(new RegExp(`^${this.prefix}`), '') || '/';
    const label = `${method.toUpperCase()} ${path} -> ${status}`;
    const matcher = this.matchers.find((m) => m.regex.test(path));
    if (!matcher)
      return { ok: false, errors: [`path ${path} is not in openapi.yaml`], operation: label };

    const operation = this.spec.paths[matcher.key]?.[method.toLowerCase()];
    if (!operation) {
      return {
        ok: false,
        errors: [`${method} is not defined for ${matcher.key}`],
        operation: label,
      };
    }
    const responses = operation.responses ?? {};
    const documentedKey = String(status) in responses ? String(status) : 'default';
    const response = responses[documentedKey];
    if (!response) {
      return {
        ok: false,
        errors: [`status ${status} is not documented for ${matcher.key}`],
        operation: label,
      };
    }

    const base = response.$ref
      ? response.$ref.replace(/^#\//, '')
      : `paths/${escapePointer(matcher.key)}/${method.toLowerCase()}/responses/${documentedKey}`;
    const resolved = response.$ref ? this.followRef(response.$ref) : response;
    if (!resolved?.content) {
      const empty =
        body === undefined ||
        body === '' ||
        (typeof body === 'object' && body !== null && Object.keys(body).length === 0);
      return {
        ok: empty,
        errors: empty ? [] : ['response has no body in the contract but one was returned'],
        operation: label,
      };
    }
    if (!resolved.content['application/json']?.schema) {
      return {
        ok: false,
        errors: ['contract documents no application/json schema'],
        operation: label,
      };
    }

    const validate = this.ajv.getSchema(`openapi#/${base}/content/application~1json/schema`);
    if (!validate)
      return { ok: false, errors: ['could not compile response schema'], operation: label };
    const ok = validate(body) as boolean;
    return {
      ok,
      errors: ok
        ? []
        : (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`),
      operation: label,
    };
  }

  private followRef(ref: string): ResponseObject | undefined {
    const name = ref.split('/').pop() as string;
    return this.spec.components?.responses?.[name];
  }
}
