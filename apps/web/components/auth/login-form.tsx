'use client';

import { AppButton, formatClock } from '@mcq/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { useApi } from '@/components/providers';
import { Link, useRouter } from '@/i18n/navigation';
import { unwrap } from '@/lib/api';
import { blockedUntil, useCountdown, useErrorText } from '@/lib/hooks';
import { isValidPhone, normalizePhone } from '@/lib/phone';
import { type Me, queryKeys } from '@/lib/queries';
import { safeNext } from '@/lib/routes';
import { FormError, FormNotice, PasswordField, PhoneField } from './fields';

/** B3 Login (FR-AUTH-03). */
export function LoginForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const errorText = useErrorText();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [phoneError, setPhoneError] = useState<string>();
  const [until, setUntil] = useState<number | null>(null);
  const left = useCountdown(until);

  const login = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/auth/login', {
          // The BFF replaces `device` with this browser's id from an httpOnly cookie.
          body: {
            phone: normalizePhone(phone),
            password,
            device: { device_id: 'bff', platform: 'web' },
          },
        }),
      ) as Promise<{ user?: Me }>,
    onSuccess: ({ user }) => {
      if (user) qc.setQueryData(queryKeys.me, user);
      const next = safeNext(params.get('next'));
      router.replace(user && user.target_node_ids?.length === 0 ? '/onboarding/goals' : next);
    },
    onError: (e) => setUntil(blockedUntil(e)),
  });

  const blocked = left > 0;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidPhone(phone)) {
      setPhoneError(t('phoneInvalid'));
      return;
    }
    setPhoneError(undefined);
    login.mutate();
  };

  const notice = params.get('reset') ? t('resetDone') : null;
  const error = login.isError
    ? blocked
      ? t('lockedFor', { time: formatClock(left, locale) })
      : errorText(login.error)
    : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <FormNotice message={notice} />
      <PhoneField
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={phoneError}
        required
        autoFocus
      />
      <PasswordField
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />
      <div className="-mt-1 text-right">
        <Link href="/forgot" className="text-body-sm font-medium text-primary hover:underline">
          {t('forgot')}
        </Link>
      </div>
      <FormError message={error} />
      <AppButton type="submit" fullWidth loading={login.isPending} disabled={blocked || !password}>
        {t('login')}
      </AppButton>
      <p className="text-center text-body-sm text-text-muted">
        {t('noAccount')}{' '}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          {t('register')}
        </Link>
      </p>
    </form>
  );
}
