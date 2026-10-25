import { describe, expect, it } from 'vitest';
import { buildCss, buildTailwindTheme } from '../src/css';
import { buildDart, dartColor } from '../src/dart';
import { entries, kebab, loadTokens } from '../src/tokens';

const tokens = loadTokens();

describe('kebab', () => {
  it('converts camelCase token names', () => {
    expect(kebab('surfaceMuted')).toBe('surface-muted');
    expect(kebab('h1')).toBe('h1');
    expect(kebab('maxReadingWeb')).toBe('max-reading-web');
  });
});

describe('buildCss', () => {
  const css = buildCss(tokens);

  it('defines every colour for light, OS dark and forced dark', () => {
    for (const [name, value] of entries(tokens.color.light)) {
      expect(css).toContain(`--mcq-color-${kebab(name)}: ${value};`);
    }
    const [osDark, forcedDark] = css
      .split('@media (prefers-color-scheme: dark)')[1]!
      .split(':root[data-theme="dark"]');
    for (const [name, value] of entries(tokens.color.dark)) {
      expect(osDark).toContain(`--mcq-color-${kebab(name)}: ${value};`);
      expect(forcedDark).toContain(`--mcq-color-${kebab(name)}: ${value};`);
    }
    expect(css).toContain(':root:not([data-theme="light"])');
    expect(css).toContain(':root[data-theme="dark"]');
  });

  it('maps option states onto colour variables', () => {
    expect(css).toContain('--mcq-option-selected-bg: var(--mcq-color-primary-soft);');
    expect(css).toContain('--mcq-option-missed-badge-text: var(--mcq-color-success);');
  });

  it('skips $comment keys', () => {
    expect(css).not.toContain('$');
  });
});

describe('buildTailwindTheme', () => {
  const theme = buildTailwindTheme(tokens);

  it('exposes colours, sizes and radii as utilities and resets Tailwind defaults', () => {
    expect(theme).toContain('@theme inline {');
    expect(theme).toContain('--color-*: initial;');
    expect(theme).toContain('--color-primary: var(--mcq-color-primary);');
    expect(theme).toContain('--text-question: var(--mcq-font-size-question);');
    expect(theme).toContain('--text-question--line-height: var(--mcq-line-height-relaxed);');
    expect(theme).toContain('--radius-md: var(--mcq-radius-md);');
    expect(theme).toContain('--breakpoint-lg: 1024px;');
  });
});

describe('buildDart', () => {
  const dart = buildDart(tokens);

  it('converts colours', () => {
    expect(dartColor('#0f766e')).toBe('Color(0xFF0F766E)');
    expect(dartColor('rgba(20,32,27,0.48)')).toBe('Color.fromRGBO(20, 32, 27, 0.48)');
    expect(() => dartColor('red')).toThrow();
  });

  it('emits AppColors for both modes, AppTokens and buildTheme', () => {
    expect(dart).toContain('static const light = AppColors(');
    expect(dart).toContain('static const dark = AppColors(');
    expect(dart).toContain('primary: Color(0xFF0F766E),');
    expect(dart).toContain('primary: Color(0xFF2DBDAE),');
    expect(dart).toContain('class AppTokens extends ThemeExtension<AppTokens>');
    expect(dart).toContain('ThemeData buildTheme(Brightness brightness)');
    expect(dart).toContain('static const double s4 = 16.0;');
  });
});
