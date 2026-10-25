import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s), the profile every authenticator app supports. */
const STEP_SEC = 30;
const DIGITS = 6;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of text.replace(/=+$/, '').toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export const newTotpSecret = (): string => base32Encode(randomBytes(20));

export const totpStep = (atMs: number): number => Math.floor(atMs / 1000 / STEP_SEC);

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 15;
  const bin = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** Returns the matching time step (so the caller can refuse a replay), or null. Accepts +-1 step of clock drift. */
export function verifyTotp(secret: string, code: string, atMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = totpStep(atMs);
  for (const step of [now, now - 1, now + 1]) {
    if (totpCode(secret, step) === code) return step;
  }
  return null;
}

export const otpauthUrl = (secret: string, email: string, issuer: string): string =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}` +
  `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=${DIGITS}&period=${STEP_SEC}`;

/**
 * AES-256-GCM so a leaked database dump does not hand out second factors. The 20 secret bytes are
 * sealed as iv(12) + tag(16) + data(20) = 48 bytes = 64 base64url characters, which is exactly
 * the width of admins.totp_secret VARCHAR(64).
 */
const keyOf = (appSecret: string): Buffer =>
  createHash('sha256').update(`totp-key:${appSecret}`).digest();

export function sealSecret(secret: string, appSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(appSecret), iv);
  const data = Buffer.concat([cipher.update(base32Decode(secret)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

export function openSecret(sealed: string, appSecret: string): string {
  const raw = Buffer.from(sealed, 'base64url');
  if (raw.length < 29) throw new Error('malformed sealed secret');
  const decipher = createDecipheriv('aes-256-gcm', keyOf(appSecret), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return base32Encode(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]));
}
