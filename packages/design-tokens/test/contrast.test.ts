import { describe, expect, it } from 'vitest';
import { MIN_TEXT_CONTRAST, checkContrast, contrastRatio } from '../src/contrast';
import { loadTokens } from '../src/tokens';

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });
});

describe('design/tokens.json', () => {
  const results = checkContrast(loadTokens());

  it.each(results.map((r) => [`${r.mode}: ${r.fg} on ${r.bg}`, r.ratio] as const))(
    '%s meets 4.5:1',
    (_label, ratio) => {
      expect(ratio).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    },
  );
});
