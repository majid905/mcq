import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from '../src/theme/theme-toggle';

const labels = { system: 'System', light: 'Light', dark: 'Dark' };

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  afterEach(cleanup);

  it('cycles system -> light -> dark -> system', () => {
    render(<ThemeToggle labels={labels} />);
    const button = screen.getByTestId('theme-toggle');
    expect(button.getAttribute('aria-label')).toBe('System');

    act(() => fireEvent.click(button));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(button.getAttribute('aria-label')).toBe('Light');

    act(() => fireEvent.click(button));
    expect(document.documentElement.dataset.theme).toBe('dark');

    act(() => fireEvent.click(button));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(button.getAttribute('aria-label')).toBe('System');
  });
});
