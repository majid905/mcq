'use client';

import { AppButton, AppTextField, EmptyState, cn } from '@mcq/ui';
import { Check, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { FormError } from '@/components/auth/fields';
import { useRouter } from '@/i18n/navigation';
import { DISTRICTS } from '@/lib/districts';
import { useErrorText } from '@/lib/hooks';
import { useMe, useUpdateMe } from '@/lib/queries';

/** Searchable district list, used by B8 onboarding and J3 edit profile. */
export function DistrictPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (id: number) => void;
}) {
  const t = useTranslations('onboarding');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...DISTRICTS].sort((a, b) =>
      locale === 'bn' ? a.bn.localeCompare(b.bn, 'bn') : a.en.localeCompare(b.en, 'en'),
    );
    return q ? sorted.filter((d) => d.bn.includes(q) || d.en.toLowerCase().includes(q)) : sorted;
  }, [query, locale]);

  return (
    <div className="flex flex-col gap-3">
      <AppTextField
        label={t('districtSearch')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        leading={<Search aria-hidden size={18} />}
        type="search"
        placeholder={t('districtPlaceholder')}
      />
      {list.length === 0 ? (
        <EmptyState title={t('districtNone')} />
      ) : (
        <div
          role="radiogroup"
          aria-label={t('districtTitle')}
          className="max-h-90 overflow-y-auto rounded-lg border border-border bg-surface"
        >
          {list.map((d) => {
            const on = d.id === value;
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(d.id)}
                className={cn(
                  'flex min-h-12 w-full items-center justify-between border-b border-border px-4 text-left text-body last:border-b-0',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
                  on
                    ? 'bg-primary-soft font-semibold text-primary'
                    : 'text-text hover:bg-surface-muted',
                )}
              >
                <span>{locale === 'bn' ? d.bn : d.en}</span>
                {on && <Check aria-hidden size={18} strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** B8 District (FR-AUTH-08). Skipping is allowed. */
export function DistrictStep() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const errorText = useErrorText();
  const me = useMe();
  const update = useUpdateMe();
  const [picked, setPicked] = useState<number | null>(null);
  const value = picked ?? me.data?.district_id ?? null;

  return (
    <div className="flex flex-col gap-5">
      <DistrictPicker value={value} onChange={setPicked} />
      <FormError message={update.isError ? errorText(update.error) : null} />
      <div className="flex gap-3">
        <AppButton variant="secondary" fullWidth onClick={() => router.push('/home')}>
          {t('skip')}
        </AppButton>
        <AppButton
          fullWidth
          disabled={value === null}
          loading={update.isPending}
          onClick={() =>
            value !== null &&
            update.mutate({ district_id: value }, { onSuccess: () => router.push('/home') })
          }
        >
          {t('finish')}
        </AppButton>
      </div>
    </div>
  );
}
