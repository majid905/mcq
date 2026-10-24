import { parseEnv } from './env';

const valid = {
  DATABASE_URL: 'mysql://u:p@127.0.0.1:3306/mcq',
  REDIS_URL: 'redis://127.0.0.1:6379',
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const cfg = parseEnv(valid);
    expect(cfg).toMatchObject({ NODE_ENV: 'development', API_PORT: 3000, LOG_LEVEL: 'info' });
    expect(cfg.CORS_ORIGINS).toEqual(['http://localhost:3001', 'http://localhost:3002']);
  });

  it('coerces the port and splits CORS origins', () => {
    const cfg = parseEnv({
      ...valid,
      API_PORT: '8080',
      CORS_ORIGINS: ' https://a.com , https://b.com,',
    });
    expect(cfg.API_PORT).toBe(8080);
    expect(cfg.CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });

  it('lists every problem at once', () => {
    expect(() => parseEnv({ DATABASE_URL: 'postgres://x', API_PORT: 'abc' })).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL|REDIS_URL[\s\S]*DATABASE_URL/,
    );
  });
});
