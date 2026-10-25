import { describe, expect, it } from 'vitest';
import bn from '../messages/bn.json';
import en from '../messages/en.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function placeholders(messages: object): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const walk = (obj: object, prefix: string) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v !== null && typeof v === 'object') walk(v, `${prefix}${k}.`);
      else out[`${prefix}${k}`] = [...String(v).matchAll(/\{(\w+)/g)].map((m) => m[1]!).sort();
    }
  };
  walk(messages, '');
  return out;
}

describe('messages', () => {
  it('bn and en have the same keys', () => {
    expect(keys(en).sort()).toEqual(keys(bn).sort());
  });

  it('bn and en use the same placeholders', () => {
    expect(placeholders(en)).toEqual(placeholders(bn));
  });

  it('has no empty strings', () => {
    for (const value of [...Object.values(placeholders(bn))]) expect(value).toBeDefined();
    const empty = (m: object) =>
      keys(m).filter(
        (k) => k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], m) === '',
      );
    expect(empty(bn)).toEqual([]);
    expect(empty(en)).toEqual([]);
  });
});
