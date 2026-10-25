'use client';

import { AppTextField, type AppTextFieldProps, cn } from '@mcq/ui';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { passwordStrength } from '@/lib/phone';

type FieldProps = Omit<AppTextFieldProps, 'label'> & { label?: string };

/** Phone with the fixed +88 prefix (docs/06 B3). */
export function PhoneField({ label, ...props }: FieldProps) {
  const t = useTranslations('auth');
  return (
    <AppTextField
      label={label ?? t('phone')}
      leading="+88"
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      placeholder="01XXXXXXXXX"
      maxLength={14}
      {...props}
    />
  );
}

export function PasswordField({
  label,
  showStrength,
  value,
  ...props
}: FieldProps & { showStrength?: boolean }) {
  const t = useTranslations('auth');
  const [visible, setVisible] = useState(false);
  const strength =
    showStrength && typeof value === 'string' && value ? passwordStrength(value) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <AppTextField
        label={label ?? t('password')}
        type={visible ? 'text' : 'password'}
        value={value}
        trailing={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? t('hidePassword') : t('showPassword')}
            aria-pressed={visible}
            className="grid size-10 place-items-center rounded-sm text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            {visible ? (
              <EyeOff size={20} strokeWidth={1.75} />
            ) : (
              <Eye size={20} strokeWidth={1.75} />
            )}
          </button>
        }
        {...props}
      />
      {strength && (
        <div className="flex items-center gap-2" aria-live="polite">
          <div className="flex flex-1 gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-pill',
                  i <= ['weak', 'fair', 'strong'].indexOf(strength)
                    ? strength === 'weak'
                      ? 'bg-danger'
                      : strength === 'fair'
                        ? 'bg-accent'
                        : 'bg-success'
                    : 'bg-surface-muted',
                )}
              />
            ))}
          </div>
          <span className="text-caption text-text-muted">{t(`strength.${strength}`)}</span>
        </div>
      )}
    </div>
  );
}

/** Inline error under a form (role=alert so it is announced). */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-body-sm text-danger">
      {message}
    </p>
  );
}

export function FormNotice({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-md bg-success-soft px-4 py-3 text-body-sm text-success">
      {message}
    </p>
  );
}
