import { describe, expect, it } from 'vitest';
import { cn } from '../src/lib/cn';

describe('cn', () => {
  it('keeps a token font size next to a token text colour', () => {
    expect(cn('text-question text-text')).toBe('text-question text-text');
  });

  it('lets the last of two conflicting utilities win', () => {
    expect(cn('text-body', 'text-h1')).toBe('text-h1');
    expect(cn('bg-surface', 'bg-primary-soft')).toBe('bg-primary-soft');
    expect(cn('rounded-md', 'rounded-pill')).toBe('rounded-pill');
  });
});
