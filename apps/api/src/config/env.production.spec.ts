import { parseEnv } from './env';

const base = {
  DATABASE_URL: 'mysql://u:p@127.0.0.1:3306/mcq',
  REDIS_URL: 'redis://127.0.0.1:6379',
  JWT_ACCESS_SECRET: 'unit-test-secret-0123456789',
};

describe('parseEnv production safety', () => {
  const prod = {
    ...base,
    NODE_ENV: 'production',
    SMS_DRIVER: 'http',
    SMS_HTTP_URL: 'https://sms.example/api',
    PAYMENT_DRIVER: 'live',
    SSLCOMMERZ_STORE_ID: 'id',
    SSLCOMMERZ_STORE_PASSWORD: 'pw',
    BKASH_APP_KEY: 'k',
    BKASH_APP_SECRET: 's',
    BKASH_USERNAME: 'u',
    BKASH_PASSWORD: 'p',
  };
  const strong = { JWT_ACCESS_SECRET: 'x'.repeat(40) };

  it('accepts a complete production configuration', () => {
    expect(() => parseEnv({ ...prod, ...strong })).not.toThrow();
  });

  it('refuses a short JWT secret, the fake payment driver and a half-configured R2', () => {
    expect(() => parseEnv({ ...prod, JWT_ACCESS_SECRET: 'x'.repeat(20) })).toThrow(/at least 32/);
    expect(() => parseEnv({ ...prod, ...strong, PAYMENT_DRIVER: 'fake' })).toThrow(/fake/);
    expect(() => parseEnv({ ...prod, ...strong, R2_ACCOUNT_ID: 'a' })).toThrow(/all four or none/);
  });

  it('needs live gateway credentials when the live driver is chosen', () => {
    const withoutBkash: Record<string, string> = { ...prod };
    delete withoutBkash['BKASH_APP_KEY'];
    expect(() => parseEnv({ ...withoutBkash, ...strong })).toThrow(/BKASH_APP_KEY/);
  });

  it('reads the admin IP allowlist as a list', () => {
    expect(
      parseEnv({ ...base, ADMIN_IP_ALLOWLIST: ' 1.2.3.4 , 10.0.0.0/8 ' }).ADMIN_IP_ALLOWLIST,
    ).toEqual(['1.2.3.4', '10.0.0.0/8']);
    expect(parseEnv(base).ADMIN_IP_ALLOWLIST).toEqual([]);
  });
});
