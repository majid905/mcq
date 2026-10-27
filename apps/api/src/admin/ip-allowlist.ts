/**
 * Optional second wall for the admin API (docs/08 section 2): `ADMIN_IP_ALLOWLIST=203.0.113.4,10.0.0.0/24`.
 * IPv4 addresses and /prefix ranges; an IPv6-mapped IPv4 (::ffff:1.2.3.4) counts as IPv4. Empty list = no restriction.
 */
const toInt = (ip: string): number | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.replace(/^::ffff:/i, ''));
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return (
    (((parts[0] as number) << 24) |
      ((parts[1] as number) << 16) |
      ((parts[2] as number) << 8) |
      (parts[3] as number)) >>>
    0
  );
};

export function ipAllowed(ip: string | undefined, allow: readonly string[]): boolean {
  if (allow.length === 0) return true;
  if (!ip) return false;
  const addr = toInt(ip);
  for (const entry of allow) {
    const [base, bits] = entry.split('/');
    if (!bits) {
      if (ip === entry || (addr !== null && addr === toInt(entry))) return true;
      continue;
    }
    const net = toInt(base ?? '');
    const n = Number(bits);
    if (addr === null || net === null || !Number.isInteger(n) || n < 0 || n > 32) continue;
    const mask = n === 0 ? 0 : (~0 << (32 - n)) >>> 0;
    if ((addr & mask) >>> 0 === (net & mask) >>> 0) return true;
  }
  return false;
}
