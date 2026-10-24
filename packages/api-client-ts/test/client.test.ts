import { describe, expect, it } from 'vitest';
import { createApiClient } from '../src';

describe('createApiClient', () => {
  it('calls the given base URL', async () => {
    const seen: string[] = [];
    const client = createApiClient('http://localhost:4010/v1', {
      fetch: async (req: Request) => {
        seen.push(req.url);
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await client.GET('/taxonomy');
    expect(seen).toEqual(['http://localhost:4010/v1/taxonomy']);
  });
});
