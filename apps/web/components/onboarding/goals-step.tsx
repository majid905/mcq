'use client';

import { AppButton, ErrorState, Skeleton, cn, formatInteger } from '@mcq/ui';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CategoryIcon } from '@/components/category-icon';
import { FormError } from '@/components/auth/fields';
import { useRouter } from '@/i18n/navigation';
import { useErrorText } from '@/lib/hooks';
import { useCategories, useMe, useUpdateMe } from '@/lib/queries';

/** B7 Goal select (FR-AUTH-08): multi-select of root categories, saved as target_node_ids. */
export function GoalsStep() {
  const t = useTranslations('onboarding');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const errorText = useErrorText();
  const categories = useCategories();
  const me = useMe();
  const update = useUpdateMe();
  const [picked, setPicked] = useState<Set<string> | null>(null);
  // Until the user touches the grid, show what the profile already has.
  const selected = picked ?? new Set(me.data?.target_node_ids ?? []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  if (categories.isPending) {
    return (
      <div className="grid grid-cols-2 gap-3" aria-busy>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    );
  }
  if (categories.isError) {
    return (
      <div className="flex flex-col gap-3">
        <ErrorState
          message={errorText(categories.error)}
          retryLabel={tc('retry')}
          onRetry={() => void categories.refetch()}
          retrying={categories.isFetching}
        />
        {/* Never trap a new user here; goals can be set later in the profile. */}
        <AppButton variant="ghost" onClick={() => router.push('/home')}>
          {t('later')}
        </AppButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ul className="grid grid-cols-2 gap-3" aria-label={t('goalsTitle')}>
        {categories.data.map((c) => {
          const on = selected.has(c.id ?? '');
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => c.id && toggle(c.id)}
                className={cn(
                  'relative flex h-full w-full flex-col items-start gap-2 rounded-lg border-[1.5px] p-4 text-left transition-colors duration-(--mcq-duration-fast)',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                  on
                    ? 'border-primary bg-primary-soft'
                    : 'border-border bg-surface hover:border-border-strong',
                )}
              >
                <span className="grid size-10 place-items-center rounded-md bg-primary-soft text-primary">
                  <CategoryIcon icon={c.icon} size={22} />
                </span>
                <span className="text-body font-semibold text-text">
                  {locale === 'bn' ? c.name_bn : c.name_en}
                </span>
                <span className="text-caption text-text-muted">
                  {t('questionCount', { count: c.question_count ?? 0 })}
                </span>
                {on && (
                  <span className="absolute top-3 right-3 grid size-6 place-items-center rounded-pill bg-primary text-on-primary">
                    <Check aria-hidden size={14} strokeWidth={3} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-body-sm text-text-muted" aria-live="polite">
        {t('selectedCount', { count: formatInteger(selected.size, locale) })}
      </p>
      <FormError message={update.isError ? errorText(update.error) : null} />
      <AppButton
        fullWidth
        disabled={selected.size === 0}
        loading={update.isPending}
        onClick={() =>
          update.mutate(
            { target_node_ids: [...selected] },
            { onSuccess: () => router.push('/onboarding/district') },
          )
        }
      >
        {t('next')}
      </AppButton>
    </div>
  );
}
