'use client';

import { AppButton, AppCard, AppTextField, Avatar, ErrorState, Skeleton, cn } from '@mcq/ui';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormError, FormNotice } from '@/components/auth/fields';
import { CategoryIcon } from '@/components/category-icon';
import { DistrictPicker } from '@/components/onboarding/district-step';
import { useRouter } from '@/i18n/navigation';
import { useErrorText } from '@/lib/hooks';
import { type Me, useCategories, useMe, useUpdateMe } from '@/lib/queries';

function EditForm({ me }: { me: Me }) {
  const t = useTranslations('profile');
  const to = useTranslations('onboarding');
  const locale = useLocale();
  const router = useRouter();
  const errorText = useErrorText();
  const update = useUpdateMe();
  const categories = useCategories();
  const [name, setName] = useState(me.name ?? '');
  const [district, setDistrict] = useState<number | null>(me.district_id ?? null);
  const [goals, setGoals] = useState(new Set(me.target_node_ids ?? []));
  const [nameError, setNameError] = useState<string>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setNameError(t('nameTooShort'));
      return;
    }
    setNameError(undefined);
    update.mutate(
      {
        name: name.trim(),
        target_node_ids: [...goals],
        ...(district !== null ? { district_id: district } : {}),
      },
      { onSuccess: () => router.push('/profile') },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <AppCard className="flex items-center gap-4">
        <Avatar name={name} src={me.avatar_url} size="lg" />
        {/* No student upload endpoint yet (contract-change request: avatar upload). */}
        <p className="text-body-sm text-text-muted">{t('avatarSoon')}</p>
      </AppCard>
      <AppTextField
        label={t('name')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={nameError}
        autoComplete="name"
        maxLength={100}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-body-sm font-medium text-text">{t('goals')}</legend>
        {categories.isPending ? (
          <Skeleton className="h-12 rounded-md" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {(categories.data ?? []).map((c) => {
              const on = goals.has(c.id ?? '');
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const next = new Set(goals);
                    if (on) next.delete(c.id ?? '');
                    else next.add(c.id ?? '');
                    setGoals(next);
                  }}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-pill border-[1.5px] px-4 text-body-sm font-medium',
                    on
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-border-strong text-text-muted',
                  )}
                >
                  {on ? <Check aria-hidden size={16} /> : <CategoryIcon icon={c.icon} size={16} />}
                  {locale === 'bn' ? c.name_bn : c.name_en}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>
      <div className="flex flex-col gap-2">
        <span className="text-body-sm font-medium text-text">{to('districtTitle')}</span>
        <DistrictPicker value={district} onChange={setDistrict} />
      </div>
      <FormError message={update.isError ? errorText(update.error) : null} />
      <FormNotice message={update.isSuccess ? t('saved') : null} />
      <div className="flex gap-3">
        <AppButton
          type="button"
          variant="secondary"
          fullWidth
          onClick={() => router.push('/profile')}
        >
          {t('cancel')}
        </AppButton>
        <AppButton type="submit" fullWidth loading={update.isPending} disabled={goals.size === 0}>
          {t('save')}
        </AppButton>
      </div>
    </form>
  );
}

/** J3 Edit profile: name, goals, district (PATCH /me). */
export function ProfileEdit() {
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const me = useMe();
  if (me.isPending) return <Skeleton aria-busy className="h-96 rounded-lg" />;
  if (me.isError) {
    return (
      <ErrorState
        message={errorText(me.error)}
        retryLabel={tc('retry')}
        onRetry={() => void me.refetch()}
      />
    );
  }
  return <EditForm me={me.data} />;
}
