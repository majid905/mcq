import {
  base32Decode,
  base32Encode,
  newTotpSecret,
  openSecret,
  sealSecret,
  totpCode,
  totpStep,
  verifyTotp,
} from './totp';

// RFC 6238 appendix B, SHA-1 secret "12345678901234567890", 8 digits there; we compare the last 6.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  it('matches the RFC 6238 test vectors', () => {
    expect(totpCode(RFC_SECRET, totpStep(59_000))).toBe('287082');
    expect(totpCode(RFC_SECRET, totpStep(1_111_111_109_000))).toBe('081804');
    expect(totpCode(RFC_SECRET, totpStep(2_000_000_000_000))).toBe('279037');
  });

  it('round-trips base32', () => {
    const raw = Buffer.from('hello world');
    expect(base32Decode(base32Encode(raw)).equals(raw)).toBe(true);
    expect(newTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('accepts one step of drift and returns the step, rejects the rest', () => {
    const at = 1_700_000_000_000;
    const step = totpStep(at);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), at)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), at)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 3), at)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', at)).toBeNull();
  });

  it('seals secrets and detects tampering or a wrong key', () => {
    const sealed = sealSecret(RFC_SECRET, 'app-secret-1');
    expect(sealed).not.toContain(RFC_SECRET);
    expect(openSecret(sealed, 'app-secret-1')).toBe(RFC_SECRET);
    expect(() => openSecret(sealed, 'other-secret')).toThrow();
    expect(sealed).toHaveLength(64);
    expect(() =>
      openSecret(
        sealed.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')),
        'app-secret-1',
      ),
    ).toThrow();
  });
});
