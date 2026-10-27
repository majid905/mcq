import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

/** 26-character ULID: 48-bit millisecond time + 80 random bits. Sortable, safe in URLs and gateway fields. */
export function ulid(now = Date.now()): string {
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const rand = randomBytes(16);
  let tail = '';
  for (let i = 0; i < 16; i++) tail += ALPHABET[(rand[i] ?? 0) % 32];
  return time + tail;
}
