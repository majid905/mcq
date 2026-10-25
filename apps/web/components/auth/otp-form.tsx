'use client';

import { AppButton, OtpInput, formatClock, formatInteger } from '@mcq/ui';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { useApi } from '@/components/providers';
import { Link, useRouter } from '@/i18n/navigation';
import { unwrap } from '@/lib/api';
import { blockedUntil, useCountdown, useErrorText } from '@/lib/hooks';
import { isValidPhone } from '@/lib/phone';
import { FormError, FormNotice } from './fields';
import type { OtpPurpose } from './phone-step';

/** B5 OTP verify (FR-AUTH-01/02). Phone and purpose come from the query string. */
export function OtpForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const params = useSearchParams();
  const errorText = useErrorText();

  const phone = params.get('phone') ?? '';
  const purpose: OtpPurpose =
    params.get('purpose') === 'reset_password' ? 'reset_password' : 'register';
  const back = purpose === 'register' ? '/register' : '/forgot';
  const [code, setCode] = useState('');
  const [resendAt, setResendAt] = useState<number | null>(() => {
    const sec = Number(params.get('resend') ?? 60);
    return Date.now() + (Number.isFinite(sec) ? sec : 60) * 1000;
  });
  const resendLeft = useCountdown(resendAt);
  const [blocked, setBlocked] = useState<number | null>(null);
  const blockedLeft = useCountdown(blocked);

  useEffect(() => {
    if (!isValidPhone(phone)) router.replace(back);
  }, [phone, back, router]);

  const verify = useMutation({
    mutationFn: (c: string) =>
      unwrap(api.POST('/auth/otp/verify', { body: { phone, code: c, purpose } })),
    onSuccess: () =>
      router.replace({
        pathname: purpose === 'register' ? '/register/profile' : '/forgot/new',
        query: { phone },
      }),
    onError: () => setCode(''),
  });

  const resend = useMutation({
    mutationFn: () => unwrap(api.POST('/auth/otp/request', { body: { phone, purpose } })),
    onSuccess: (data) => {
      verify.reset();
      setResendAt(Date.now() + (data.resend_after_sec ?? 60) * 1000);
    },
    onError: (e) => setBlocked(blockedUntil(e)),
  });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (code.length === 6) verify.mutate(code);
  };

  const error = verify.isError
    ? errorText(verify.error)
    : resend.isError
      ? blockedLeft > 0
        ? t('rateLimitedFor', { time: formatClock(blockedLeft, locale) })
        : errorText(resend.error)
      : null;
  const shownPhone = phone.replace(/\d/g, (d) => formatInteger(Number(d), locale));

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <p className="text-body text-text-muted">
        {t.rich('otpSentTo', {
          phone: shownPhone,
          b: (chunks) => <strong className="text-text">{chunks}</strong>,
        })}{' '}
        <Link href={back} className="font-semibold text-primary hover:underline">
          {t('changeNumber')}
        </Link>
      </p>
      <OtpInput
        value={code}
        onChange={setCode}
        onComplete={(c) => verify.mutate(c)}
        label={t('otpCode')}
        invalid={verify.isError}
        disabled={verify.isPending}
        autoFocus
      />
      <FormNotice message={resend.isSuccess && !verify.isError ? t('otpResent') : null} />
      <FormError message={error} />
      <AppButton type="submit" fullWidth loading={verify.isPending} disabled={code.length < 6}>
        {t('verify')}
      </AppButton>
      <div className="text-center text-body-sm text-text-muted" aria-live="polite">
        {resendLeft > 0 ? (
          t('resendIn', { time: formatClock(resendLeft, locale) })
        ) : (
          <button
            type="button"
            onClick={() => resend.mutate()}
            disabled={resend.isPending || blockedLeft > 0}
            className="font-semibold text-primary hover:underline disabled:opacity-50"
          >
            {t('resend')}
          </button>
        )}
      </div>
    </form>
  );
}
