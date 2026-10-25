import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, applyThemePreference, readThemePreference } from '../src/theme/theme';

describe('theme preference', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('defaults to system with no data-theme', () => {
    expect(readThemePreference()).toBe('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('stores light/dark on <html> and in storage, system clears both', () => {
    applyThemePreference('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readThemePreference()).toBe('dark');

    applyThemePreference('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
