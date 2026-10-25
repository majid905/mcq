import { type InputHTMLAttributes, type Ref, useId } from 'react';
import { cn } from '../lib/cn';

export interface AppTextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  /** One line of help under the field. Hidden while `error` is shown. */
  helperText?: string;
  /** Error message; marks the field invalid and is announced to screen readers. */
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

/** 52 px input with the label above and helper or error text below. */
export function AppTextField({
  label,
  helperText,
  error,
  id,
  className,
  ref,
  ...props
}: AppTextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const message = error ?? helperText;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-body-sm font-medium text-text">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(
          'h-13 w-full rounded-md border-[1.5px] border-border-strong bg-surface px-4 text-body text-text',
          'placeholder:text-text-subtle',
          'transition-colors duration-[var(--mcq-duration-fast)]',
          'focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
          'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted',
          error && 'border-danger focus-visible:border-danger',
        )}
        {...props}
      />
      {message && (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          className={cn('text-body-sm', error ? 'text-danger' : 'text-text-muted')}
        >
          {message}
        </p>
      )}
    </div>
  );
}
