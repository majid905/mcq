import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppButton } from '../src/components/app-button';
import { AppTextField } from '../src/components/app-text-field';
import { ErrorState } from '../src/components/error-state';
import { OptionTile } from '../src/components/option-tile';
import { QuestionNavigator } from '../src/components/question-navigator';
import { TimerBar, timerTone } from '../src/components/timer-bar';
import { formatClock, formatInteger } from '../src/lib/format';

afterEach(cleanup);

describe('AppButton', () => {
  it('defaults to type=button and keeps the label for screen readers while loading', () => {
    render(<AppButton loading>জমা দিন</AppButton>);
    const button = screen.getByRole('button', { name: 'জমা দিন' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('renders the child element with asChild', () => {
    render(
      <AppButton asChild variant="secondary">
        <a href="/exams">পরীক্ষা</a>
      </AppButton>,
    );
    expect(screen.getByRole('link', { name: 'পরীক্ষা' }).className).toContain(
      'border-border-strong',
    );
  });
});

describe('AppTextField', () => {
  it('links label and error message and marks the input invalid', () => {
    render(<AppTextField label="মোবাইল নম্বর" helperText="১১ সংখ্যা" error="সঠিক নম্বর দিন" />);
    const input = screen.getByLabelText('মোবাইল নম্বর');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const message = document.getElementById(input.getAttribute('aria-describedby')!);
    expect(message?.textContent).toBe('সঠিক নম্বর দিন');
    expect(screen.queryByText('১১ সংখ্যা')).toBeNull();
  });
});

describe('OptionTile', () => {
  it('is a radio when selectable', () => {
    const onSelect = vi.fn();
    render(
      <OptionTile label="খ" state="selected" onSelect={onSelect}>
        অনুচ্ছেদ ২ক
      </OptionTile>,
    );
    const radio = screen.getByRole('radio');
    expect(radio.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(radio);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('shows status with an icon and screen reader text, not colour alone', () => {
    render(
      <OptionTile label="ক" state="wrong" statusLabel="ভুল উত্তর">
        অনুচ্ছেদ ২
      </OptionTile>,
    );
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText('ভুল উত্তর').className).toContain('sr-only');
    expect(document.querySelector('[data-state="wrong"] svg')).not.toBeNull();
  });
});

describe('format', () => {
  it('uses Bangla digits for bn', () => {
    expect(formatInteger(142, 'bn')).toBe('১৪২');
    expect(formatClock(292, 'bn')).toBe('০৪:৫২');
    expect(formatClock(292, 'en')).toBe('04:52');
    expect(formatClock(3725, 'en')).toBe('1:02:05');
    expect(formatClock(-3, 'en')).toBe('00:00');
  });
});

describe('TimerBar', () => {
  it('turns accent at 5 minutes and live at 1 minute', () => {
    expect(timerTone(301)).toBe('normal');
    expect(timerTone(300)).toBe('warning');
    expect(timerTone(60)).toBe('critical');
  });

  it('renders the clock in the locale digits', () => {
    render(<TimerBar remainingSec={45} totalSec={3600} label="বাকি সময়" locale="bn" />);
    const timer = screen.getByRole('timer');
    expect(timer.textContent).toBe('০০:৪৫');
    expect(timer.className).toContain('text-live');
  });
});

describe('QuestionNavigator', () => {
  const labels = {
    answered: 'উত্তর দেওয়া হয়েছে',
    unanswered: 'বাকি',
    marked: 'রিভিউ',
    cell: 'প্রশ্ন {number}, {status}',
    current: 'বর্তমান প্রশ্ন',
  };

  it('names every cell for screen readers and marks the current one', () => {
    const onSelect = vi.fn();
    render(
      <QuestionNavigator
        items={[
          { number: 12, status: 'answered' },
          { number: 13, status: 'marked' },
        ]}
        currentNumber={13}
        labels={labels}
        locale="bn"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole('button', { name: 'প্রশ্ন ১২, উত্তর দেওয়া হয়েছে' })).toBeTruthy();
    const current = screen.getByRole('button', { name: 'প্রশ্ন ১৩, রিভিউ, বর্তমান প্রশ্ন' });
    expect(current.getAttribute('aria-current')).toBe('step');
    fireEvent.click(current);
    expect(onSelect).toHaveBeenCalledWith(13);
  });
});

describe('ErrorState', () => {
  it('announces the message and retries', () => {
    const onRetry = vi.fn();
    render(
      <ErrorState message="সার্ভারে সমস্যা" retryLabel="আবার চেষ্টা করুন" onRetry={onRetry} />,
    );
    expect(screen.getByRole('alert').textContent).toContain('সার্ভারে সমস্যা');
    fireEvent.click(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
