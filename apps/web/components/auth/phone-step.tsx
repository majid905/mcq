'use client';

import { AppButton, AppCheckbox, formatClock } from '@mcq/ui';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useApi } from '@/components/providers';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, unwrap } from '@/lib/api';
import { blockedUntil, useCountdown, useErrorText } from '@/lib/hooks';
import { isValidPhone, normalizePhone } from '@/lib/phone';
import { FormError, PhoneField } from './fields';

export type OtpPurpose = 'register' | 'reset_password';

/** B4 Register phone entry and B9 forgot password: send an OTP, then go to /otp. */
export function PhoneStep({ purpose }: { purpose: OtpPurpose }) {
  const t = useTranslations('auth');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const errorText = useErrorText();
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [phoneError, setPhoneError] = useState<string>();
  const [until, setUntil] = useState<number | null>(null);
  const left = useCountdown(until);

  const send = useMutation({
    mutationFn: (p: string) =>
      unwrap(api.POST('/auth/otp/request', { body: { phone: p, purpose } })),
    onSuccess: (data, p) =>
      router.push({
        pathname: '/otp',
        query: { phone: p, purpose, resend: String(data.resend_after_sec ?? 60) },
      }),
    onError: (e) => setUntil(blockedUntil(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidPhone(phone)) {
      setPhoneError(t('phoneInvalid'));
      return;
    }
    setPhoneError(undefined);
    send.mutate(normalizePhone(phone));
  };

  const phoneExists = send.error instanceof ApiError && send.error.code === 'PHONE_EXISTS';
  const error = send.isError
    ? left > 0
      ? t('rateLimitedFor', { time: formatClock(left, locale) })
      : errorText(send.error)
    : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <PhoneField
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={phoneError}
        helperText={t('otpHelp')}
        required
        autoFocus
      />
      {purpose === 'register' && (
        <AppCheckbox
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          label={t.rich('terms', {
            link: (chunks) => (
              <Link href="/terms" className="font-medium text-primary underline">
                {chunks}
              </Link>
            ),
          })}
        />
      )}
      <FormError message={error} />
      {phoneExists && (
        <Link href="/login" className="text-body-sm font-semibold text-primary hover:underline">
          {t('goToLogin')}
        </Link>
      )}
      <AppButton
        type="submit"
        fullWidth
        loading={send.isPending}
        disabled={(purpose === 'register' && !agreed) || left > 0}
      >
        {t('sendOtp')}
      </AppButton>
      <p className="text-center text-body-sm text-text-muted">
        {purpose === 'register' ? t('haveAccount') : t('rememberPassword')}{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          {t('login')}
        </Link>
      </p>
    </form>
  );
}
