'use client';

import { AppButton, AppTextField, OtpInput } from '@mcq/ui';
import { useMutation } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { useApi } from '@/components/providers';
import { ApiError, unwrap } from '@/lib/api';

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

/** L1 Login + TOTP (FR-ADM-01): the code step appears when the API says it is required. */
export function AdminLogin() {
  const t = useTranslations('login');
  const api = useApi();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);

  const login = useMutation({
    mutationFn: (totp?: string) =>
      unwrap(
        api.POST('/admin/auth/login', {
          body: { email: email.trim(), password, ...(totp ? { totp } : {}) },
        }),
      ),
    onSuccess: () => router.replace(safeNext(params.get('next'))),
    onError: (e) => {
      if (e instanceof ApiError && e.details.totp_required === true) {
        setNeedsCode(true);
        setCode('');
      }
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate(needsCode ? code : undefined);
  };

  const totpPrompt =
    login.error instanceof ApiError && login.error.details.totp_required === true && !code;
  const error =
    login.isError && !totpPrompt
      ? login.error instanceof ApiError && login.error.code === 'ACCOUNT_LOCKED'
        ? t('locked')
        : login.error instanceof ApiError && login.error.status === 401
          ? needsCode
            ? t('wrongCode')
            : t('wrongCredentials')
          : t('generic')
      : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-testid="admin-login">
      {!needsCode ? (
        <>
          <AppTextField
            label={t('email')}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <AppTextField
            label={t('password')}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-body text-text">
            <ShieldCheck aria-hidden size={20} className="text-primary" />
            {t('codePrompt')}
          </p>
          <OtpInput
            label={t('code')}
            value={code}
            onChange={setCode}
            onComplete={(c) => login.mutate(c)}
            autoFocus
          />
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-body-sm text-danger">
          {error}
        </p>
      )}
      <AppButton
        type="submit"
        fullWidth
        loading={login.isPending}
        disabled={needsCode ? code.length < 6 : !email || !password}
      >
        {needsCode ? t('verify') : t('submit')}
      </AppButton>
    </form>
  );
}
