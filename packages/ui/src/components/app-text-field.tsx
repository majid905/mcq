import { type InputHTMLAttributes, type ReactNode, type Ref, useId } from 'react';
import { cn } from '../lib/cn';

export interface AppTextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  /** One line of help under the field. Hidden while `error` is shown. */
  helperText?: string;
  /** Error message; marks the field invalid and is announced to screen readers. */
  error?: string;
  /** Fixed text or icon inside the field before the value, e.g. "+88". */
  leading?: ReactNode;
  /** Control inside the field after the value, e.g. a show/hide password button. */
  trailing?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

/** 52 px input with the label above and helper or error text below. */
export function AppTextField({
  label,
  helperText,
  error,
  id,
  className,
  leading,
  trailing,
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
      <div
        className={cn(
          'flex h-13 w-full items-center rounded-md border-[1.5px] border-border-strong bg-surface text-body text-text',
          'transition-colors duration-(--mcq-duration-fast)',
          'focus-within:border-primary focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus-ring',
          'has-[input:disabled]:bg-surface-muted has-[input:disabled]:text-text-muted',
          error && 'border-danger focus-within:border-danger',
        )}
      >
        {leading && (
          <span className="flex h-full items-center border-r border-border pl-4 pr-3 text-text-muted">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={cn(
            'h-full min-w-0 flex-1 rounded-md bg-transparent px-4 outline-none',
            'placeholder:text-text-subtle disabled:cursor-not-allowed',
          )}
          {...props}
        />
        {trailing && <span className="flex h-full items-center pr-1.5">{trailing}</span>}
      </div>
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
