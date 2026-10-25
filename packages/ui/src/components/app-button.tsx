import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '../lib/cn';

export const appButtonVariants = cva(
  [
    'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'border-[1.5px] border-transparent font-semibold',
    'transition-colors duration-[var(--mcq-duration-fast)] ease-standard',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
    'disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary-hover',
        secondary: 'border-border-strong bg-transparent text-text hover:bg-surface-muted',
        ghost: 'bg-transparent text-primary hover:bg-primary-soft',
        danger: 'bg-danger text-on-primary hover:opacity-90',
      },
      size: {
        md: 'h-13 px-6 text-body',
        sm: 'h-10 px-4 text-body-sm',
      },
      fullWidth: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', fullWidth: false },
  },
);

export interface AppButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof appButtonVariants> {
  /** Shows a spinner instead of the label and blocks clicks; the label stays for screen readers. */
  loading?: boolean;
  /** Render the child element (e.g. a link) with button styles. */
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function AppButton({
  variant,
  size,
  fullWidth,
  loading = false,
  asChild = false,
  className,
  children,
  type,
  ref,
  ...props
}: AppButtonProps) {
  const classes = cn(appButtonVariants({ variant, size, fullWidth }), className);
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
        {children}
      </span>
      {loading && (
        <LoaderCircle
          aria-hidden
          className="absolute motion-safe:animate-spin"
          size={size === 'sm' ? 18 : 20}
          strokeWidth={1.75}
        />
      )}
    </button>
  );
}
