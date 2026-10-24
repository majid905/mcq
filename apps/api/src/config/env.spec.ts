import { parseEnv } from './env';

const valid = {
  DATABASE_URL: 'mysql://u:p@127.0.0.1:3306/mcq',
  REDIS_URL: 'redis://127.0.0.1:6379',
  JWT_ACCESS_SECRET: 'unit-test-secret-0123456789',
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const cfg = parseEnv(valid);
    expect(cfg).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 3000,
      LOG_LEVEL: 'info',
      SMS_DRIVER: 'console',
    });
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
      /DATABASE_URL[\s\S]*REDIS_URL[\s\S]*JWT_ACCESS_SECRET|API_PORT[\s\S]*DATABASE_URL/,
    );
  });

  it('rejects a short JWT secret', () => {
    expect(() => parseEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('http SMS driver needs a URL', () => {
    expect(() => parseEnv({ ...valid, SMS_DRIVER: 'http' })).toThrow(/SMS_HTTP_URL/);
    expect(
      parseEnv({ ...valid, SMS_DRIVER: 'http', SMS_HTTP_URL: 'https://sms.example.com/send' }),
    ).toMatchObject({ SMS_DRIVER: 'http' });
  });

  it('forbids the console SMS driver in production', () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/SMS_DRIVER/);
  });
});
