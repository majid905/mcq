import { type VariantProps, cva } from 'class-variance-authority';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export const appChipVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2.5 py-0.5 text-caption font-medium',
  {
    variants: {
      variant: {
        soft: 'bg-surface-muted text-text-muted',
        primary: 'bg-primary-soft text-primary',
        accent: 'bg-accent-soft text-accent-text',
        live: 'bg-live-soft text-live',
        success: 'bg-success-soft text-success',
        danger: 'bg-danger-soft text-danger',
      },
    },
    defaultVariants: { variant: 'soft' },
  },
);

export interface AppChipProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof appChipVariants> {
  /** Leading icon (Lucide, 14 px). The `live` variant shows a dot instead when no icon is given. */
  icon?: ReactNode;
}

export function AppChip({ variant, icon, className, children, ...props }: AppChipProps) {
  return (
    <span className={cn(appChipVariants({ variant }), className)} {...props}>
      {icon ??
        (variant === 'live' && <span aria-hidden className="size-1.75 rounded-pill bg-live" />)}
      {children}
    </span>
  );
}
