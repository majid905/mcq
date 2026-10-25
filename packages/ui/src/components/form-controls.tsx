'use client';

import { Check } from 'lucide-react';
import { type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { cn } from '../lib/cn';

export interface AppCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

/** Native checkbox (keyboard and form behaviour for free) with a token-styled box. */
export function AppCheckbox({ label, className, id, ...props }: AppCheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label htmlFor={inputId} className={cn('flex cursor-pointer items-start gap-3', className)}>
      <span className="relative mt-0.5 grid size-5 flex-none place-items-center">
        <input
          id={inputId}
          type="checkbox"
          className={cn(
            'peer size-5 cursor-pointer appearance-none rounded-sm border-[1.5px] border-border-strong bg-surface',
            'checked:border-primary checked:bg-primary',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
          )}
          {...props}
        />
        <Check
          aria-hidden
          size={14}
          strokeWidth={3}
          className="pointer-events-none absolute text-on-primary opacity-0 peer-checked:opacity-100"
        />
      </span>
      <span className="text-body-sm text-text">{label}</span>
    </label>
  );
}

export interface AppSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** On/off row for settings. `role="switch"`, label on the left, track on the right. */
export function AppSwitch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: AppSwitchProps) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center justify-between gap-4">
      <div>
        <div id={`${id}-label`} className="text-body text-text">
          {label}
        </div>
        {description && <div className="text-body-sm text-text-muted">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative h-7 w-12 flex-none rounded-pill transition-colors duration-(--mcq-duration-fast)',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
          'disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-border-strong',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-1 left-1 size-5 rounded-pill bg-surface shadow-sm transition-transform duration-(--mcq-duration-fast)',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  label: string;
  className?: string;
}

/** Small single-choice control (language, theme). A radiogroup of buttons. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-md border border-border bg-surface-muted p-1', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onValueChange(o.value)}
          className={cn(
            'h-9 min-w-20 rounded-sm px-3 text-body-sm font-medium transition-colors duration-(--mcq-duration-fast)',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
            o.value === value
              ? 'bg-surface text-primary shadow-sm'
              : 'text-text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
