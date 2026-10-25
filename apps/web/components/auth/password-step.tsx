'use client';

import { AppButton, AppTextField } from '@mcq/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useApi } from '@/components/providers';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, expectOk, unwrap } from '@/lib/api';
import { useErrorText } from '@/lib/hooks';
import { type Me, queryKeys } from '@/lib/queries';
import { FormError, PasswordField } from './fields';

// The BFF fills these from httpOnly cookies (OTP verification token, browser device id).
const FROM_BFF = {
  verification_token: 'bff',
  device: { device_id: 'bff', platform: 'web' as const },
};

function useStartOverLink(error: unknown, href: '/register' | '/forgot') {
  const t = useTranslations('auth');
  const expired =
    error instanceof ApiError && (error.status === 400 || error.code === 'OTP_EXPIRED');
  return expired ? (
    <Link href={href} className="text-body-sm font-semibold text-primary hover:underline">
      {t('startOver')}
    </Link>
  ) : null;
}

/** B6 Name and password (FR-AUTH-01). */
export function RegisterProfileForm() {
  const t = useTranslations('auth');
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const errorText = useErrorText();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState<string>();

  const register = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/auth/register', { body: { ...FROM_BFF, name: name.trim(), password } }),
      ) as Promise<{ user?: Me }>,
    onSuccess: ({ user }) => {
      if (user) qc.setQueryData(queryKeys.me, user);
      router.replace('/onboarding/goals');
    },
  });
  const startOver = useStartOverLink(register.error, '/register');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setNameError(t('nameTooShort'));
      return;
    }
    setNameError(undefined);
    register.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <AppTextField
        label={t('name')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={nameError}
        autoComplete="name"
        maxLength={100}
        required
        autoFocus
      />
      <PasswordField
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        helperText={t('passwordRule')}
        minLength={8}
        maxLength={64}
        showStrength
        required
      />
      <FormError message={register.isError ? errorText(register.error) : null} />
      {startOver}
      <AppButton
        type="submit"
        fullWidth
        loading={register.isPending}
        disabled={password.length < 8}
      >
        {t('createAccount')}
      </AppButton>
    </form>
  );
}

/** B9 New password after OTP (FR-AUTH-05). */
export function NewPasswordForm() {
  const t = useTranslations('auth');
  const api = useApi();
  const router = useRouter();
  const errorText = useErrorText();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);

  const reset = useMutation({
    mutationFn: () =>
      expectOk(
        api.POST('/auth/password/reset', {
          body: { verification_token: FROM_BFF.verification_token, password },
        }),
      ),
    onSuccess: () => router.replace({ pathname: '/login', query: { reset: '1' } }),
  });
  const startOver = useStartOverLink(reset.error, '/forgot');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    reset.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <PasswordField
        label={t('newPassword')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        helperText={t('passwordRule')}
        showStrength
        required
        autoFocus
      />
      <PasswordField
        label={t('confirmPassword')}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        error={mismatch ? t('passwordMismatch') : undefined}
        required
      />
      <FormError message={reset.isError ? errorText(reset.error) : null} />
      {startOver}
      <AppButton type="submit" fullWidth loading={reset.isPending} disabled={password.length < 8}>
        {t('savePassword')}
      </AppButton>
    </form>
  );
}
