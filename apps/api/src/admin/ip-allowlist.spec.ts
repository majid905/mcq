import { ipAllowed } from './ip-allowlist';

describe('ipAllowed', () => {
  it('allows everything when the list is empty', () => {
    expect(ipAllowed('8.8.8.8', [])).toBe(true);
    expect(ipAllowed(undefined, [])).toBe(true);
  });

  it('matches exact addresses, ranges and IPv4-mapped IPv6', () => {
    const allow = ['203.0.113.4', '10.1.0.0/16'];
    expect(ipAllowed('203.0.113.4', allow)).toBe(true);
    expect(ipAllowed('::ffff:203.0.113.4', allow)).toBe(true);
    expect(ipAllowed('10.1.200.9', allow)).toBe(true);
    expect(ipAllowed('10.2.0.1', allow)).toBe(false);
    expect(ipAllowed('203.0.113.5', allow)).toBe(false);
  });

  it('refuses a missing or malformed address and ignores bad entries', () => {
    expect(ipAllowed(undefined, ['10.0.0.0/8'])).toBe(false);
    expect(ipAllowed('not-an-ip', ['10.0.0.0/8'])).toBe(false);
    expect(ipAllowed('10.0.0.1', ['nonsense', '10.0.0.0/99', '10.0.0.0/8'])).toBe(true);
    expect(ipAllowed('1.2.3.4', ['0.0.0.0/0'])).toBe(true);
  });
});
