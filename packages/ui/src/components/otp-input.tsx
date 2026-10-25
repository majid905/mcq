'use client';

import { type ClipboardEvent, type KeyboardEvent, useRef } from 'react';
import { cn } from '../lib/cn';

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once all digits are filled. */
  onComplete?: (value: string) => void;
  length?: number;
  /** Accessible name for the group, e.g. "OTP কোড". Each box gets "<label> <n>". */
  label: string;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * Six one-digit boxes (docs/05 OtpInput). The first box has autocomplete="one-time-code" so
 * browsers and iOS can fill the SMS code; pasting a full code fills every box.
 * Accepts Bangla digits too (০-৯) and stores ASCII.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  label,
  invalid,
  disabled,
  autoFocus,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const toAscii = (s: string) =>
    s.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6)).replace(/\D/g, '');

  const commit = (next: string) => {
    const clean = next.slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  };

  const focus = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  const setAt = (i: number, input: string) => {
    const typed = toAscii(input);
    if (!typed) return;
    if (typed.length > 1) {
      // Autofill or a fast typist: spread from this box.
      commit((value.slice(0, i) + typed).slice(0, length));
      focus(i + typed.length);
      return;
    }
    const chars = digits.slice();
    chars[i] = typed;
    commit(chars.join('').slice(0, length));
    focus(i + 1);
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const chars = digits.slice();
      if (chars[i]) chars[i] = '';
      else if (i > 0) {
        chars[i - 1] = '';
        focus(i - 1);
      }
      onChange(chars.join('').replace(/\s+$/, ''));
    } else if (e.key === 'ArrowLeft') focus(i - 1);
    else if (e.key === 'ArrowRight') focus(i + 1);
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = toAscii(e.clipboardData.getData('text'));
    if (!pasted) return;
    e.preventDefault();
    commit(pasted);
    focus(pasted.length);
  };

  return (
    <div role="group" aria-label={label} className="flex justify-between gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={i === 0 ? length : 1}
          aria-label={`${label} ${i + 1}`}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            'h-14 w-full min-w-0 max-w-14 rounded-md border-[1.5px] border-border-strong bg-surface text-center text-h2 font-semibold tabular-nums text-text',
            'focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
            'disabled:bg-surface-muted',
            invalid && 'border-danger',
          )}
        />
      ))}
    </div>
  );
}
